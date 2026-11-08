// Sample data for the screen gallery (/gallery). Not used by the real game.
import type { Ctx } from './game';
import type { GameState, LatLng, LiveMarker, Phase, PublicPlayer, Results, RunnerMarker, Settings } from './protocol';

export const CENTER: LatLng = { lat: 40.7829, lng: -73.9654 };
/** A point `north` / `east` meters from the zone center. */
export const at = (north: number, east: number): LatLng => ({
  lat: CENTER.lat + north / 111320,
  lng: CENTER.lng + east / (111320 * Math.cos((CENTER.lat * Math.PI) / 180)),
});

export const SETTINGS: Settings = {
  chasers: { count: 2, selection: 'random' },
  durationMin: 20,
  headStart: { enabled: true, seconds: 180 },
  locationUpdates: { mode: 'interval', intervalSec: 120, showSec: 0 },
  fuzzy: { enabled: true, radiusM: 60 },
  finalCountdown: { enabled: true, lastMin: 3, intervalSec: 30 },
  heartbeat: { enabled: true, distancesM: [80, 50, 25] },
  zone: { center: CENTER, radiusM: 200 },
  shrinkingZone: { enabled: false, style: 'stages', startAfterMin: 5, finalRadiusM: 80, stages: 3, intervalMin: 4, shrinkSec: 60 },
  caughtMode: 'jail',
  jail: { location: null, radiusM: 15, holdSec: 5, immunitySec: 10 },
  runnerView: 'map',
  announcements: true,
  visibility: { runnersSeeChasers: false, chaserUpdates: 'interval', chaserIntervalSec: 60, chaserShowSec: 15, chasersSeeChasers: true },
  antiCamping: { enabled: false, afterMin: 6 },
  outOfZone: { graceSec: 15 },
  catching: { radiusM: 15, autoAcceptSec: 15, auto: false, autoRadiusM: 5, autoHoldSec: 2 },
};

const pl = (id: string, name: string, avatar: string, color: string, role: PublicPlayer['role']): PublicPlayer =>
  ({ id, name, avatar, color, role, status: 'free', isHost: false, connected: true, immuneSec: 0, gpsLost: false });

const ROSTER: PublicPlayer[] = [
  pl('ava', 'Ava', '🦉', '#ff5a2c', 'chaser'),
  pl('ben', 'Ben', '🐺', '#5aa9ff', 'runner'),
  pl('cleo', 'Cleo', '🐙', '#ffd23f', 'chaser'),
  pl('dev', 'Dev', '🦈', '#b57bff', 'runner'),
  pl('eli', 'Eli', '🐸', '#9be15d', 'runner'),
];
export const ME_PROFILE = { name: 'Shaurya', color: '#1fe3b4', avatar: '🦊' };

const live = (playerId: string, p: LatLng): LiveMarker => ({ playerId, lat: p.lat, lng: p.lng, accuracy: 6 });
const POS: Record<string, LatLng> = {
  me: at(-40, 30), ava: at(25, -20), ben: at(95, -60), cleo: at(-100, -80), dev: at(-70, 110), eli: at(150, 120),
};

/** What chasers see: Ben and Dev as fuzzy circles, Eli exact because he left the zone. */
export const CHASER_HINTS: RunnerMarker[] = [
  { playerId: 'ben', ...at(70, -40), radiusM: 60, exact: false, reason: 'scheduled', ageSec: 34 },
  { playerId: 'dev', ...at(-40, 80), radiusM: 60, exact: false, reason: 'scheduled', ageSec: 34 },
  { playerId: 'eli', ...at(225, 60), radiusM: 0, exact: true, reason: 'out_of_zone', ageSec: 2 },
];

export interface GameOpts {
  phase?: Phase;
  pausedFrom?: Phase | null;
  me?: Partial<PublicPlayer>;
  others?: Record<string, Partial<PublicPlayer>>;
  settings?: Partial<Settings>;
  you?: Partial<GameState['you']>;
  timers?: Partial<GameState['timers']>;
  map?: Partial<GameState['map']>;
  zone?: Partial<GameState['zone']>;
  pendingCatch?: GameState['pendingCatch'];
  results?: Results | null;
  playerCount?: number;
}

/** Build a complete game state for one screen. */
export function game(o: GameOpts = {}): GameState {
  const settings: Settings = { ...SETTINGS, ...o.settings };
  const me: PublicPlayer = { ...pl('me', ME_PROFILE.name, ME_PROFILE.avatar, ME_PROFILE.color, 'runner'), isHost: true, ...o.me };
  const others = ROSTER.slice(0, (o.playerCount ?? 6) - 1).map((p) => ({ ...p, ...o.others?.[p.id] }));
  const players = [me, ...others];
  const phase = o.phase ?? 'active';
  const playing = phase !== 'lobby' && phase !== 'ended';
  return {
    code: 'KRBX',
    phase,
    pausedFrom: o.pausedFrom ?? null,
    settings,
    players,
    you: {
      id: me.id, role: me.role, status: me.status, isHost: me.isHost,
      location: live('me', POS.me),
      inZone: playing ? true : null, outOfZoneRevealInSec: null, revealedForLeavingZone: false,
      heartbeat: playing && me.role === 'runner' && settings.heartbeat.enabled ? 0 : null,
      jailbreakProgressSec: null,
      ...o.you,
    },
    zone: {
      center: settings.zone.center, radiusM: settings.zone.radiusM,
      finalRadiusM: settings.shrinkingZone.enabled ? settings.shrinkingZone.finalRadiusM : null, shrinking: false,
      nextRadiusM: null, nextShrinkInSec: null, stage: null, stages: null, ...o.zone,
    },
    jail: settings.caughtMode === 'jail' && settings.zone.center ? { location: settings.jail.location ?? settings.zone.center, radiusM: settings.jail.radiusM } : null,
    timers: {
      headStartLeftSec: phase === 'headstart' ? 142 : null,
      gameLeftSec: playing ? 14 * 60 + 27 : null,
      nextUpdateInSec: phase === 'active' && settings.locationUpdates.mode === 'interval' ? 72 : null,
      chaserRevealInSec: null,
      finalCountdownActive: false,
      ...o.timers,
    },
    map: { runners: [], chasers: [], everyone: [], ...o.map },
    pendingCatch: o.pendingCatch ?? null,
    results: o.results ?? null,
  };
}

export const chaserMap = (): Partial<GameState['map']> => ({
  runners: CHASER_HINTS,
  chasers: [live('me', at(0, 0)), live('ava', POS.ava), live('cleo', POS.cleo)],
});
export const everyone = (): LiveMarker[] => Object.entries(POS).map(([id, p]) => live(id, p));

/** End-of-game results with wandering routes for the replay. */
export function results(winner: Results['winner'], reason: Results['reason']): Results {
  const all = [{ ...pl('me', ME_PROFILE.name, ME_PROFILE.avatar, ME_PROFILE.color, 'runner') }, ...ROSTER];
  const dur = 20 * 60;
  const route = (seed: number): Array<[number, number, number]> =>
    Array.from({ length: 81 }, (_, i) => {
      const t = i * 15, a = seed * 1.7 + t / 140, r = 40 + 110 * Math.abs(Math.sin(seed + t / 300));
      const p = at(r * Math.cos(a), r * Math.sin(a * 1.3));
      return [p.lat, p.lng, t];
    });
  return {
    winner, reason, chaseDurationSec: dur,
    players: all.map((p, i) => ({
      playerId: p.id, name: p.name, color: p.color, startRole: p.role, endRole: p.role,
      endStatus: p.role === 'runner' && winner === 'chasers' ? 'jailed' : 'free',
      survivedSec: p.role === 'runner' ? [dur, 612, 845, 1080][i % 4] : null,
      catches: p.role === 'chaser' ? [3, 1][i % 2] : 0,
      distanceM: 900 + i * 260, closestCallM: p.role === 'runner' ? [4, 11, 7, 19][i % 4] : null,
      route: route(i + 1),
    })),
    awards: [
      { id: 'longest_survivor', title: 'Longest Survivor', playerId: 'me', value: '20:00' },
      { id: 'top_chaser', title: 'Top Chaser', playerId: 'ava', value: '3 catches' },
      { id: 'closest_call', title: 'Closest Call', playerId: 'me', value: '4 m' },
      { id: 'marathon', title: 'Marathon', playerId: 'eli', value: '2.20 km' },
    ],
    timeline: [
      { atSec: 180, event: 'head_start_over' },
      { atSec: 432, event: 'player_caught', playerId: 'ben', otherId: 'ava' },
      { atSec: 655, event: 'jailbreak', playerId: 'dev' },
      { atSec: 811, event: 'player_caught', playerId: 'dev', otherId: 'cleo' },
    ],
  };
}

const noop = () => {};
/** A fake game connection: buttons do nothing, everything is "online". */
export function ctx(o: Partial<Ctx> = {}): Ctx {
  return {
    conn: 'open', waking: false, state: null, profile: ME_PROFILE, setProfile: noop, send: noop,
    createGame: noop, joinGame: noop, leave: noop, error: null, clearError: noop, toasts: [], flash: null,
    clearFlash: noop, geo: 'ok', accuracy: 6, ready: true, makeReady: async () => {},
    kicked: false, clearKicked: noop, pendingCode: null, notify: noop, replaced: false, ...o,
  };
}
