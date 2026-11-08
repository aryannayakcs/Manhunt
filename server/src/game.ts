import { randomBytes } from 'node:crypto';
import { distanceM, fuzzCenter } from './geo.ts';
import type {
  ClientMessage, EventName, GameState, LiveMarker, Phase, Results, Role, RunnerMarker, ServerMessage, Status,
} from './protocol.ts';
import { applySettingsPatch, DEFAULT_SETTINGS, type LatLng, type Settings } from './settings.ts';

export const MAX_PLAYERS = 50;
const FRESH_MS = 30_000; // a location older than this is "stale"
/** A runner whose phone sends nothing for this long (locked, Safari closed, no signal) gets revealed. */
const SIGNAL_LOST_MS = 30_000;
const ROUTE_SAMPLE_MS = 5_000;

interface Loc { lat: number; lng: number; accuracy: number; at: number }

interface Player {
  id: string;
  token: string;
  name: string;
  color: string;
  avatar?: string;
  role: Role;
  startRole: Role;
  status: Status;
  connected: boolean;
  loc: Loc | null;
  // per-game stats/state (reset at start)
  route: Array<[number, number, number]>;
  lastRouteAt: number;
  distanceM: number;
  distAnchor: LatLng | null;
  catches: number;
  closestCallM: number | null;
  caughtAtChaseMs: number | null;
  inZone: boolean | null;
  outOfZoneSince: number | null; // game ms
  revealedOut: boolean;
  signalLost: boolean;
  immuneUntil: number; // game ms
  jailHoldSince: number | null; // game ms
}

interface Reveal { lat: number; lng: number; radiusM: number; exact: boolean; reason: RunnerMarker['reason']; at: number }
interface Pending { id: string; chaserId: string; runnerId: string; expiresAt: number /* game ms */ }

export class GameError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export type Sender = (playerId: string, msg: ServerMessage) => void;

export interface GameOptions {
  now?: () => number;
  rand?: () => number;
}

const newId = (prefix: string) => prefix + randomBytes(5).toString('hex');

export class Game {
  readonly code: string;
  hostId = '';
  settings: Settings = structuredClone(DEFAULT_SETTINGS);
  phase: Phase = 'lobby';
  pausedFrom: Phase | null = null;
  players = new Map<string, Player>();
  lastActivity: number;

  private send: Sender;
  private now: () => number;
  private rand: () => number;

  // game clock (real ms); elapsed game time = now - startedAt - pausedTotal
  private startedAt = 0;
  private pausedTotal = 0;
  private pausedAt: number | null = null;
  private endedElapsed: number | null = null;

  private nextRevealAt: number | null = null;
  private lastCatchAt = 0;
  private reveals = new Map<string, Reveal>();
  private pending = new Map<string, Pending>();
  private flags = { finalCountdown: false, shrinking: false, antiCamping: false, warned5: false, warned1: false };
  private timeline: Results['timeline'] = [];
  private results: Results | null = null;

  constructor(code: string, send: Sender, opts: GameOptions = {}) {
    this.code = code;
    this.send = send;
    this.now = opts.now ?? Date.now;
    this.rand = opts.rand ?? Math.random;
    this.lastActivity = this.now();
  }

  // ---------------- players ----------------

  addPlayer(profile: { name: string; color: string; avatar?: string }): Player {
    if (this.players.size >= MAX_PLAYERS) throw new GameError('game_full', 'This game is full.');
    const midGame = this.phase !== 'lobby' && this.phase !== 'ended';
    const p: Player = {
      id: newId('p_'), token: randomBytes(16).toString('hex'),
      name: profile.name, color: profile.color, avatar: profile.avatar,
      role: 'runner', startRole: 'runner',
      // Joining mid-game = spectator until the next round.
      status: midGame ? 'out' : 'free',
      connected: true, loc: null,
      ...freshStats(),
    };
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    this.emit('player_joined', { playerId: p.id, name: p.name });
    this.broadcastState();
    return p;
  }

  /** Returns the player if the token matches. */
  authenticate(playerId: string, token: string): Player {
    const p = this.players.get(playerId);
    if (!p || p.token !== token) throw new GameError('bad_rejoin', 'Could not rejoin that game.');
    return p;
  }

  setConnected(playerId: string, connected: boolean) {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.broadcastState();
  }

  removePlayer(playerId: string, kicked = false) {
    const p = this.players.get(playerId);
    if (!p) return;
    this.players.delete(playerId);
    this.reveals.delete(playerId);
    for (const pc of this.pending.values()) if (pc.chaserId === playerId || pc.runnerId === playerId) this.pending.delete(pc.id);
    this.emit(kicked ? 'player_kicked' : 'player_left', { playerId, name: p.name });
    if (this.hostId === playerId) {
      const next = [...this.players.values()].sort((a, b) => Number(b.connected) - Number(a.connected))[0];
      this.hostId = next?.id ?? '';
      if (next) this.emit('host_changed', { playerId: next.id });
    }
    if (this.inPlay()) this.checkWin();
    this.broadcastState();
  }

  get isEmpty() { return this.players.size === 0; }
  get connectedCount() { let n = 0; for (const p of this.players.values()) if (p.connected) n++; return n; }

  // ---------------- messages ----------------

  handle(playerId: string, msg: ClientMessage) {
    const p = this.players.get(playerId);
    if (!p) throw new GameError('not_in_game', 'You are not in this game.');
    this.lastActivity = this.now();
    switch (msg.type) {
      case 'update_profile':
        if (msg.name !== undefined) p.name = msg.name;
        if (msg.color !== undefined) p.color = msg.color;
        if (msg.avatar !== undefined) p.avatar = msg.avatar;
        return this.broadcastState();
      case 'location': return this.onLocation(p, msg);
      case 'catch': return this.onCatch(p, msg.runnerId);
      case 'catch_response': return this.onCatchResponse(p, msg.catchId, msg.accept);
    }

    // Host-only below
    if (p.id !== this.hostId) throw new GameError('not_host', 'Only the host can do that.');
    switch (msg.type) {
      case 'update_settings': {
        this.requirePhase('lobby');
        const r = applySettingsPatch(this.settings, msg.settings);
        if (!r.ok) throw new GameError('bad_settings', r.error);
        this.settings = r.settings;
        return this.broadcastState();
      }
      case 'set_role': {
        this.requirePhase('lobby');
        const target = this.players.get(msg.playerId);
        if (!target) throw new GameError('no_player', 'No such player.');
        target.role = msg.role;
        return this.broadcastState();
      }
      case 'kick': {
        if (msg.playerId === p.id) throw new GameError('bad_kick', "You can't kick yourself.");
        if (!this.players.has(msg.playerId)) throw new GameError('no_player', 'No such player.');
        this.send(msg.playerId, { type: 'kicked' });
        return this.removePlayer(msg.playerId, true);
      }
      case 'transfer_host': {
        if (!this.players.has(msg.playerId)) throw new GameError('no_player', 'No such player.');
        this.hostId = msg.playerId;
        this.emit('host_changed', { playerId: msg.playerId });
        return this.broadcastState();
      }
      case 'start_game': return this.start();
      case 'pause': return this.pause();
      case 'resume': return this.resume();
      case 'end_game':
        if (!this.inPlay() && this.phase !== 'paused') throw new GameError('bad_phase', 'No game running.');
        return this.end('none', 'host_ended');
      case 'rematch': return this.rematch();
    }
  }

  // ---------------- clock helpers ----------------

  /** Milliseconds of game time since start (pauses excluded). */
  elapsed(): number {
    if (this.phase === 'lobby') return 0;
    if (this.endedElapsed !== null) return this.endedElapsed;
    return (this.pausedAt ?? this.now()) - this.startedAt - this.pausedTotal;
  }
  private get headStartMs() { return this.settings.headStart.enabled ? this.settings.headStart.seconds * 1000 : 0; }
  private get durationMs() { return this.settings.durationMin * 60_000; }
  private get endAt() { return this.headStartMs + this.durationMs; }
  private chaseElapsed() { return Math.max(0, this.elapsed() - this.headStartMs); }
  private effectivePhase(): Phase { return this.phase === 'paused' ? this.pausedFrom! : this.phase; }
  private inPlay() { return this.phase === 'headstart' || this.phase === 'active'; }
  private requirePhase(...phases: Phase[]) {
    if (!phases.includes(this.phase)) throw new GameError('bad_phase', `Can't do that right now (${this.phase}).`);
  }

  zoneRadius(): number {
    const { zone, shrinkingZone: sz } = this.settings;
    const ph = this.effectivePhase();
    if (!sz.enabled || (ph !== 'active' && ph !== 'ended')) return zone.radiusM;
    const startMs = sz.startAfterMin * 60_000;
    if (startMs >= this.durationMs) return zone.radiusM;
    const frac = Math.min(1, Math.max(0, (this.chaseElapsed() - startMs) / (this.durationMs - startMs)));
    return zone.radiusM + (sz.finalRadiusM - zone.radiusM) * frac;
  }

  private jailLocation(): LatLng | null {
    if (this.settings.caughtMode !== 'jail') return null;
    return this.settings.jail.location ?? this.settings.zone.center;
  }

  private finalCountdownActive(): boolean {
    const fc = this.settings.finalCountdown;
    return fc.enabled && this.effectivePhase() === 'active' && this.endAt - this.elapsed() <= fc.lastMin * 60_000;
  }

  private revealIntervalMs(): number {
    return (this.finalCountdownActive() ? this.settings.finalCountdown.intervalSec : this.settings.locationUpdates.intervalSec) * 1000;
  }

  private isFresh(l: Loc | null): l is Loc { return !!l && this.now() - l.at <= FRESH_MS; }

  // ---------------- lifecycle ----------------

  private start() {
    this.requirePhase('lobby');
    const s = this.settings;
    if (!s.zone.center) throw new GameError('no_zone', 'Draw the play zone on the map first.');
    const all = [...this.players.values()];
    if (all.length < 2) throw new GameError('not_enough_players', 'You need at least 2 players.');

    if (s.chasers.selection === 'random') {
      const count = Math.min(s.chasers.count, all.length - 1);
      const shuffled = [...all];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled.forEach((p, i) => { p.role = i < count ? 'chaser' : 'runner'; });
    } else {
      const chasers = all.filter(p => p.role === 'chaser').length;
      if (chasers === 0) throw new GameError('no_chasers', 'Pick at least one chaser.');
      if (chasers === all.length) throw new GameError('no_runners', 'Leave at least one runner.');
    }

    for (const p of all) {
      p.startRole = p.role;
      p.status = 'free';
      Object.assign(p, freshStats());
    }
    this.reveals.clear();
    this.pending.clear();
    this.timeline = [];
    this.results = null;
    this.flags = { finalCountdown: false, shrinking: false, antiCamping: false, warned5: false, warned1: false };
    this.startedAt = this.now();
    this.pausedTotal = 0;
    this.pausedAt = null;
    this.endedElapsed = null;
    this.nextRevealAt = null;

    this.phase = this.headStartMs > 0 ? 'headstart' : 'active';
    this.log('game_started');
    this.emit('game_started', {
      chaserIds: all.filter(p => p.role === 'chaser').map(p => p.id),
      headStartSec: this.headStartMs / 1000,
    });
    if (this.phase === 'active') this.onChaseStart();
    this.broadcastState();
  }

  private onChaseStart() {
    const e = this.elapsed();
    this.lastCatchAt = e;
    this.nextRevealAt = this.settings.locationUpdates.mode === 'interval' ? e + this.revealIntervalMs() : null;
  }

  private pause() {
    this.requirePhase('headstart', 'active');
    this.pausedFrom = this.phase;
    this.pausedAt = this.now();
    this.phase = 'paused';
    this.emit('paused');
    this.broadcastState();
  }

  private resume() {
    this.requirePhase('paused');
    this.pausedTotal += this.now() - this.pausedAt!;
    this.pausedAt = null;
    this.phase = this.pausedFrom!;
    this.pausedFrom = null;
    this.emit('resumed');
    this.broadcastState();
  }

  private end(winner: Results['winner'], reason: Results['reason']) {
    if (this.phase === 'paused') this.resume();
    this.endedElapsed = this.elapsed();
    this.phase = 'ended';
    this.pending.clear();
    this.log('game_over');
    this.results = this.buildResults(winner, reason);
    this.emit('game_over', { winner, reason });
    this.broadcastState();
  }

  private rematch() {
    this.requirePhase('ended');
    this.phase = 'lobby';
    this.endedElapsed = null;
    this.results = null;
    this.reveals.clear();
    for (const p of this.players.values()) {
      p.status = 'free';
      p.role = this.settings.chasers.selection === 'host' ? p.startRole : 'runner';
    }
    this.emit('back_to_lobby');
    this.broadcastState();
  }

  private checkWin() {
    if (!this.inPlay()) return;
    const runnersLeft = [...this.players.values()].some(p => p.role === 'runner' && p.status === 'free');
    if (!runnersLeft) this.end('chasers', 'all_caught');
  }

  // ---------------- tick (call once per second) ----------------

  tick() {
    if (!this.inPlay()) return;
    let e = this.elapsed();

    if (this.phase === 'headstart' && e >= this.headStartMs) {
      this.phase = 'active';
      this.onChaseStart();
      this.log('head_start_over');
      this.emit('head_start_over');
    }

    this.checkZones(e);
    if (this.phase === 'active') this.checkSignal();

    if (this.phase === 'active') {
      this.announcements(e);
      this.doReveals(e);
      this.checkJailbreak(e);
      this.trackClosestCalls();
      for (const pc of this.pending.values()) if (e >= pc.expiresAt) this.applyCatch(pc);
      if (this.inPlay() && this.elapsed() >= this.endAt) {
        const anyFree = [...this.players.values()].some(p => p.role === 'runner' && p.status === 'free');
        this.end(anyFree ? 'runners' : 'chasers', 'time_up');
        return;
      }
    }
    this.broadcastState();
  }

  private announcements(e: number) {
    const left = this.endAt - e;
    const sz = this.settings.shrinkingZone;
    if (sz.enabled && !this.flags.shrinking && this.chaseElapsed() >= sz.startAfterMin * 60_000 && sz.startAfterMin * 60_000 < this.durationMs) {
      this.flags.shrinking = true;
      this.emit('zone_shrinking', { finalRadiusM: sz.finalRadiusM });
    }
    if (this.finalCountdownActive() && !this.flags.finalCountdown) {
      this.flags.finalCountdown = true;
      this.emit('final_countdown', { minutesLeft: this.settings.finalCountdown.lastMin });
      if (this.nextRevealAt !== null) this.nextRevealAt = Math.min(this.nextRevealAt, e + this.revealIntervalMs());
    }
    if (!this.flags.warned5 && left <= 5 * 60_000 && this.durationMs > 5 * 60_000) {
      this.flags.warned5 = true;
      this.emit('time_warning', { minutesLeft: 5 });
    }
    if (!this.flags.warned1 && left <= 60_000 && this.durationMs > 60_000) {
      this.flags.warned1 = true;
      this.emit('time_warning', { minutesLeft: 1 });
    }
  }

  private checkZones(e: number) {
    const center = this.settings.zone.center;
    if (!center) return;
    const radius = this.zoneRadius();
    for (const p of this.players.values()) {
      if (p.status !== 'free' || !p.loc) continue;
      const inside = distanceM(p.loc, center) <= radius + Math.min(p.loc.accuracy, 30);
      if (p.inZone !== false && !inside) {
        p.outOfZoneSince = e;
        this.emit('out_of_zone', {}, [p.id]);
      } else if (p.inZone === false && inside) {
        p.outOfZoneSince = null;
        if (p.revealedOut) this.reveals.delete(p.id);
        p.revealedOut = false;
        this.emit('back_in_zone', {}, [p.id]);
      }
      p.inZone = inside;
      if (!inside && p.role === 'runner' && this.phase === 'active' && !p.revealedOut
        && e - (p.outOfZoneSince ?? e) >= this.settings.outOfZone.graceSec * 1000) {
        p.revealedOut = true;
        this.emit('revealed_for_leaving_zone', { playerId: p.id }, [p.id, ...this.ids(q => q.role === 'chaser')]);
      }
    }
  }

  /** Locking the phone or closing Safari stops location updates. That must not be a way to hide. */
  private checkSignal() {
    const now = this.now();
    for (const p of this.players.values()) {
      if (p.role !== 'runner' || p.status !== 'free' || !p.loc || p.signalLost) continue;
      if (now - p.loc.at > SIGNAL_LOST_MS) {
        p.signalLost = true;
        this.log('signal_lost', p.id);
        this.emit('signal_lost', { playerId: p.id }, this.ids(q => q.role === 'chaser' || q.status === 'out' || q.id === this.hostId));
      }
    }
  }

  private doReveals(e: number) {
    const runners = [...this.players.values()].filter(p => p.role === 'runner' && p.status === 'free' && p.loc);
    // Penalty: runners outside the zone are shown exactly, continuously.
    for (const p of runners) {
      if (p.revealedOut) this.reveal(p, true, 'out_of_zone', e);
      else if (p.signalLost) this.reveal(p, true, 'signal_lost', e); // last known spot
    }
    const hidden = (p: Player) => p.revealedOut || p.signalLost;

    const mode = this.settings.locationUpdates.mode;
    if (mode === 'live') {
      for (const p of runners) if (!hidden(p)) this.reveal(p, true, 'live', e);
      return;
    }
    if (mode !== 'interval' || this.nextRevealAt === null || e < this.nextRevealAt) return;

    const ac = this.settings.antiCamping;
    const camping = ac.enabled && e - this.lastCatchAt >= ac.afterMin * 60_000;
    if (camping && !this.flags.antiCamping) {
      this.flags.antiCamping = true;
      this.emit('anti_camping');
    }
    const exact = camping || !this.settings.fuzzy.enabled;
    for (const p of runners) if (!hidden(p)) this.reveal(p, exact, camping ? 'anti_camping' : 'scheduled', e);
    this.nextRevealAt = e + this.revealIntervalMs();
    this.emit('locations_updated', { exact }, this.ids(q => q.role === 'chaser' || q.status === 'out'));
    this.emit('you_were_revealed', { exact }, runners.map(p => p.id));
  }

  private reveal(p: Player, exact: boolean, reason: Reveal['reason'], e: number) {
    const loc = p.loc!;
    const r = this.settings.fuzzy.radiusM;
    const c = exact ? loc : fuzzCenter(loc, r, this.rand);
    this.reveals.set(p.id, { lat: c.lat, lng: c.lng, radiusM: exact ? 0 : r, exact, reason, at: e });
  }

  private checkJailbreak(e: number) {
    const jail = this.jailLocation();
    if (!jail) return;
    const jailed = [...this.players.values()].filter(p => p.status === 'jailed');
    for (const p of this.players.values()) {
      if (p.role !== 'runner' || p.status !== 'free' || !this.isFresh(p.loc) || jailed.length === 0) { p.jailHoldSince = null; continue; }
      const inJail = distanceM(p.loc, jail) <= this.settings.jail.radiusM + Math.min(p.loc.accuracy, 15);
      if (!inJail) { p.jailHoldSince = null; continue; }
      p.jailHoldSince ??= e;
      if (e - p.jailHoldSince >= this.settings.jail.holdSec * 1000) {
        for (const j of jailed) { j.status = 'free'; j.immuneUntil = e + this.settings.jail.immunitySec * 1000; }
        for (const q of this.players.values()) q.jailHoldSince = null;
        this.log('jailbreak', p.id);
        this.emit('jailbreak', { byId: p.id, freedIds: jailed.map(j => j.id) });
        return;
      }
    }
  }

  private trackClosestCalls() {
    const chasers = [...this.players.values()].filter(p => p.role === 'chaser' && this.isFresh(p.loc));
    for (const r of this.players.values()) {
      if (r.role !== 'runner' || r.status !== 'free' || !this.isFresh(r.loc)) continue;
      for (const c of chasers) {
        const d = distanceM(r.loc, c.loc!);
        if (r.closestCallM === null || d < r.closestCallM) r.closestCallM = d;
      }
    }
  }

  // ---------------- location & catching ----------------

  private onLocation(p: Player, m: { lat: number; lng: number; accuracy: number }) {
    const now = this.now();
    // Distance walked: measure from an anchor point and only count once you've moved 8+ m from it.
    // Comparing each 1-second update would throw away every real walking step as "jitter".
    if (this.inPlay() && p.status === 'free' && m.accuracy <= 30) {
      if (!p.distAnchor) p.distAnchor = { lat: m.lat, lng: m.lng };
      else {
        const step = distanceM(p.distAnchor, m);
        if (step >= 8) {
          if (step <= 300) p.distanceM += step; // ignore teleport glitches
          p.distAnchor = { lat: m.lat, lng: m.lng };
        }
      }
    }
    p.loc = { lat: m.lat, lng: m.lng, accuracy: m.accuracy, at: now };
    if (p.signalLost) {
      p.signalLost = false;
      if (!p.revealedOut) this.reveals.delete(p.id); // back online: hide them again
    }
    if (this.inPlay() && now - p.lastRouteAt >= ROUTE_SAMPLE_MS) {
      p.lastRouteAt = now;
      p.route.push([round6(m.lat), round6(m.lng), Math.round(this.elapsed() / 1000)]);
    }
  }

  private onCatch(chaser: Player, runnerId: string) {
    if (this.phase === 'headstart') throw new GameError('head_start', "Head start isn't over yet.");
    this.requirePhase('active');
    if (chaser.role !== 'chaser') throw new GameError('not_chaser', 'Only chasers can catch.');
    const runner = this.players.get(runnerId);
    if (!runner || runner.role !== 'runner' || runner.status !== 'free') throw new GameError('bad_target', "That player can't be caught.");
    const e = this.elapsed();
    if (runner.immuneUntil > e) throw new GameError('immune', 'They were just freed from jail and are immune for a few seconds.');
    if ([...this.pending.values()].some(pc => pc.runnerId === runnerId)) throw new GameError('already_pending', 'That catch is already waiting for confirmation.');

    if (this.isFresh(chaser.loc) && this.isFresh(runner.loc)) {
      const d = distanceM(chaser.loc, runner.loc);
      const allowed = this.settings.catching.radiusM + Math.min(chaser.loc.accuracy + runner.loc.accuracy, 30);
      if (d > allowed) {
        this.emit('catch_rejected', { runnerId, distanceM: Math.round(d) }, [chaser.id]);
        throw new GameError('too_far', `Too far away (${Math.round(d)} m). Get closer.`);
      }
    }
    const pc: Pending = { id: newId('c_'), chaserId: chaser.id, runnerId, expiresAt: e + this.settings.catching.autoAcceptSec * 1000 };
    this.pending.set(pc.id, pc);
    this.emit('catch_request', { catchId: pc.id, chaserId: chaser.id, runnerId }, [runnerId, chaser.id]);
    this.broadcastState();
  }

  private onCatchResponse(p: Player, catchId: string, accept: boolean) {
    const pc = this.pending.get(catchId);
    if (!pc || pc.runnerId !== p.id) throw new GameError('no_catch', 'That catch is no longer pending.');
    if (accept) this.applyCatch(pc);
    else {
      this.pending.delete(pc.id);
      this.emit('catch_disputed', { catchId, chaserId: pc.chaserId, runnerId: pc.runnerId }, [pc.chaserId, pc.runnerId, this.hostId]);
      this.broadcastState();
    }
  }

  private applyCatch(pc: Pending) {
    this.pending.delete(pc.id);
    const runner = this.players.get(pc.runnerId);
    const chaser = this.players.get(pc.chaserId);
    if (!runner || runner.status !== 'free' || runner.role !== 'runner' || this.phase !== 'active') return;
    const e = this.elapsed();
    if (chaser) chaser.catches++;
    runner.caughtAtChaseMs ??= this.chaseElapsed();
    runner.jailHoldSince = null;
    runner.revealedOut = false;
    runner.signalLost = false;
    this.reveals.delete(runner.id);
    this.lastCatchAt = e;
    this.flags.antiCamping = false;
    this.log('player_caught', runner.id, pc.chaserId);

    const mode = this.settings.caughtMode;
    if (mode === 'infection') runner.role = 'chaser';
    else runner.status = mode === 'jail' ? 'jailed' : 'out';
    this.emit('player_caught', { runnerId: runner.id, chaserId: pc.chaserId, mode });
    if (mode === 'infection') this.emit('player_infected', { playerId: runner.id });
    if (mode === 'jail') this.emit('player_jailed', { playerId: runner.id });
    this.checkWin();
    this.broadcastState();
  }

  // ---------------- output ----------------

  private ids(pred: (p: Player) => boolean) { return [...this.players.values()].filter(pred).map(p => p.id); }

  private emit(event: EventName, data?: Record<string, unknown>, to?: string[]) {
    for (const id of new Set(to ?? this.players.keys())) {
      if (this.players.has(id)) this.send(id, { type: 'event', event, data });
    }
  }

  private log(event: string, playerId?: string, otherId?: string) {
    this.timeline.push({ atSec: Math.round(this.elapsed() / 1000), event, playerId, otherId });
  }

  broadcastState() {
    for (const p of this.players.values()) if (p.connected) this.send(p.id, { type: 'state', state: this.stateFor(p.id) });
  }

  stateFor(viewerId: string): GameState {
    const me = this.players.get(viewerId)!;
    const e = this.elapsed();
    const ph = this.effectivePhase();
    const playing = ph === 'headstart' || ph === 'active';
    const ended = this.phase === 'ended';
    const spectator = ended || (playing && me.status === 'out');
    const chaserView = playing && me.role === 'chaser';
    const runnerFree = playing && me.role === 'runner' && me.status === 'free';
    const live = (p: Player): LiveMarker | null =>
      p.loc ? { playerId: p.id, lat: p.loc.lat, lng: p.loc.lng, accuracy: Math.round(p.loc.accuracy) } : null;

    // Nearest chaser, for the heartbeat warning. Only the distance level is sent, never a direction.
    let nearest: { d: number } | null = null;
    if (runnerFree && ph === 'active' && this.isFresh(me.loc)) {
      for (const c of this.players.values()) {
        if (c.role !== 'chaser' || !this.isFresh(c.loc)) continue;
        const d = distanceM(me.loc, c.loc);
        if (!nearest || d < nearest.d) nearest = { d };
      }
    }
    let heartbeat: number | null = null;
    if (runnerFree && this.settings.heartbeat.enabled) {
      const [far, mid, near] = this.settings.heartbeat.distancesM;
      const d = nearest?.d ?? Infinity;
      heartbeat = d <= near ? 3 : d <= mid ? 2 : d <= far ? 1 : 0;
    }

    const runners: RunnerMarker[] = [];
    if (chaserView || spectator) {
      for (const [id, r] of this.reveals) {
        const p = this.players.get(id);
        if (!p || p.role !== 'runner' || p.status !== 'free') continue;
        runners.push({ playerId: id, lat: r.lat, lng: r.lng, radiusM: r.radiusM, exact: r.exact, reason: r.reason, ageSec: Math.round((e - r.at) / 1000) });
      }
    }
    const all = [...this.players.values()];
    const jail = this.jailLocation();
    const pc = [...this.pending.values()].find(x => x.runnerId === me.id || x.chaserId === me.id);
    const sz = this.settings.shrinkingZone;

    return {
      code: this.code,
      phase: this.phase,
      pausedFrom: this.pausedFrom,
      settings: this.settings,
      players: all.map(p => ({
        id: p.id, name: p.name, color: p.color, avatar: p.avatar, role: p.role, status: p.status,
        isHost: p.id === this.hostId, connected: p.connected,
        immuneSec: playing ? Math.max(0, Math.ceil((p.immuneUntil - e) / 1000)) : 0,
        gpsLost: playing && (!p.loc || this.now() - p.loc.at > SIGNAL_LOST_MS),
      })),
      you: {
        id: me.id, role: me.role, status: me.status, isHost: me.id === this.hostId,
        location: live(me),
        inZone: playing ? me.inZone : null,
        outOfZoneRevealInSec: runnerFree && me.inZone === false && !me.revealedOut && me.outOfZoneSince !== null
          ? Math.max(0, Math.ceil((me.outOfZoneSince + this.settings.outOfZone.graceSec * 1000 - e) / 1000)) : null,
        revealedForLeavingZone: runnerFree && me.revealedOut,
        heartbeat,
        jailbreakProgressSec: me.jailHoldSince !== null ? Math.floor((e - me.jailHoldSince) / 1000) : null,
      },
      zone: {
        center: this.settings.zone.center,
        radiusM: Math.round(this.zoneRadius()),
        finalRadiusM: sz.enabled ? sz.finalRadiusM : null,
        shrinking: sz.enabled && ph === 'active' && this.chaseElapsed() >= sz.startAfterMin * 60_000 && !ended,
      },
      jail: jail ? { location: jail, radiusM: this.settings.jail.radiusM } : null,
      timers: {
        headStartLeftSec: ph === 'headstart' ? Math.max(0, Math.ceil((this.headStartMs - e) / 1000)) : null,
        gameLeftSec: playing ? Math.max(0, Math.ceil((this.endAt - Math.max(e, this.headStartMs)) / 1000)) : null,
        nextUpdateInSec: ph === 'active' && this.nextRevealAt !== null ? Math.max(0, Math.ceil((this.nextRevealAt - e) / 1000)) : null,
        finalCountdownActive: this.finalCountdownActive(),
      },
      map: {
        runners,
        chasers: all.filter(p => p.role === 'chaser' && (
          spectator
          || (chaserView && (p.id === me.id || this.settings.visibility.chasersSeeChasers))
          || (playing && me.role === 'runner' && me.status !== 'out' && this.settings.runnerView === 'map' && this.settings.visibility.runnersSeeChasers)
        )).map(live).filter(x => x !== null),
        everyone: spectator ? all.map(live).filter(x => x !== null) : [],
      },
      pendingCatch: pc ? {
        catchId: pc.id, chaserId: pc.chaserId, runnerId: pc.runnerId,
        autoAcceptInSec: Math.max(0, Math.ceil((pc.expiresAt - e) / 1000)),
      } : null,
      results: this.results,
    };
  }

  private buildResults(winner: Results['winner'], reason: Results['reason']): Results {
    const chaseMs = this.chaseElapsed();
    const players = [...this.players.values()].map(p => ({
      playerId: p.id, name: p.name, color: p.color,
      startRole: p.startRole, endRole: p.role, endStatus: p.status,
      survivedSec: p.startRole === 'runner' ? Math.round((p.caughtAtChaseMs ?? chaseMs) / 1000) : null,
      catches: p.catches,
      distanceM: Math.round(p.distanceM),
      closestCallM: p.closestCallM === null ? null : Math.round(p.closestCallM),
      route: p.route,
    }));
    const awards: Results['awards'] = [];
    const best = <T>(list: T[], score: (x: T) => number | null, higher = true) => {
      let top: T | null = null; let topScore = 0;
      for (const x of list) {
        const s = score(x);
        if (s === null) continue;
        if (top === null || (higher ? s > topScore : s < topScore)) { top = x; topScore = s; }
      }
      return top;
    };
    const runners = players.filter(p => p.startRole === 'runner');
    const survivor = best(runners, p => p.survivedSec);
    if (survivor) awards.push({ id: 'longest_survivor', title: 'Longest Survivor', playerId: survivor.playerId, value: fmtTime(survivor.survivedSec!) });
    const hunter = best(players, p => (p.catches > 0 ? p.catches : null));
    if (hunter) awards.push({ id: 'top_chaser', title: 'Top Chaser', playerId: hunter.playerId, value: `${hunter.catches} catch${hunter.catches === 1 ? '' : 'es'}` });
    const close = best(runners, p => p.closestCallM, false);
    if (close) awards.push({ id: 'closest_call', title: 'Closest Call', playerId: close.playerId, value: `${close.closestCallM} m` });
    const marathon = best(players, p => (p.distanceM > 0 ? p.distanceM : null));
    if (marathon) awards.push({ id: 'marathon', title: 'Marathon', playerId: marathon.playerId, value: `${(marathon.distanceM / 1000).toFixed(2)} km` });

    return { winner, reason, chaseDurationSec: Math.round(chaseMs / 1000), players, awards, timeline: this.timeline };
  }
}

function freshStats() {
  return {
    route: [] as Array<[number, number, number]>, lastRouteAt: 0, distanceM: 0, distAnchor: null, catches: 0,
    closestCallM: null, caughtAtChaseMs: null, inZone: null, outOfZoneSince: null,
    revealedOut: false, signalLost: false, immuneUntil: 0, jailHoldSince: null,
  };
}
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
