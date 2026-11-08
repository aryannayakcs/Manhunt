/**
 * Bot simulator: fake players that walk around so you can test from your desk.
 *
 *   Join an existing lobby:   npm run bots -- --code ABCD --count 5
 *   Create + run a test game: npm run bots -- --create --count 6 --start --fast
 *
 * Options:
 *   --url ws://localhost:8080/ws   server address (use wss://... for a deployed server)
 *   --code ABCD                    join this lobby
 *   --create                       the first bot creates a game and becomes host
 *   --lat 40.7829 --lng -73.9654   zone center when creating (default: Central Park)
 *   --count 6                      number of bots
 *   --start                        host bot starts the game once everyone has joined
 *   --fast                         short test settings (20 s head start, 3 min game, 15 s updates)
 *   --mode out|infection|jail      what happens when caught
 *   --stats                        measure lag: update rate, longest gap, round-trip time, message size
 *   --settings '{"catching":{"auto":true}}'   extra settings (JSON) applied when creating
 */
import { WebSocket } from 'ws';
import { offsetPoint, distanceM, bearingDeg } from '../src/geo.ts';
import type { GameState, ServerMessage } from '../src/protocol.ts';

const args = process.argv.slice(2);
const opt = (name: string, def?: string) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const flag = (name: string) => args.includes(`--${name}`);

const URL = opt('url', 'ws://localhost:8080/ws')!;
const COUNT = Number(opt('count', '5'));
const CREATE = flag('create');
const START = flag('start');
const FAST = flag('fast');
const MODE = opt('mode', 'out');
const STATS = flag('stats');
const EXTRA = JSON.parse(opt('settings', '{}')!) as Record<string, unknown>;
/** Lag measurements across all bots (only during the chase). */
const stats = { states: 0, bytes: 0, maxGapMs: 0, gaps: [] as number[], rtts: [] as number[] };
const CENTER = { lat: Number(opt('lat', '40.7829')), lng: Number(opt('lng', '-73.9654')) };
let code = opt('code')?.toUpperCase();

if (!CREATE && !code) { console.error('Pass --code ABCD to join a lobby, or --create to make one.'); process.exit(1); }

const NAMES = ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jade', 'Kai', 'Lux'];
const COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6'];

class Bot {
  ws!: WebSocket;
  id = '';
  state: GameState | null = null;
  lastStateAt = 0;
  pingSentAt = 0;
  pos = offsetPoint(CENTER, Math.random() * 120, Math.random() * 360);
  heading = Math.random() * 360;
  name: string;
  index: number;
  constructor(index: number) { this.index = index; this.name = `${NAMES[index % NAMES.length]}-bot`; }

  connect(first: Record<string, unknown>) {
    return new Promise<void>((resolve) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', () => this.send(first));
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as ServerMessage;
        if (msg.type === 'joined') { this.id = msg.playerId; code = msg.code; resolve(); }
        else if (msg.type === 'state') {
          const now = Date.now();
          if (STATS && msg.state.phase === 'active' && this.state?.phase === 'active') {
            const gap = now - this.lastStateAt;
            stats.states++; stats.bytes += raw.toString().length; stats.gaps.push(gap);
            if (gap > stats.maxGapMs) stats.maxGapMs = gap;
          }
          this.lastStateAt = now;
          this.state = msg.state;
        }
        else if (msg.type === 'pong' && this.pingSentAt) { stats.rtts.push(Date.now() - this.pingSentAt); this.pingSentAt = 0; }
        else if (msg.type === 'error') console.log(`  [${this.name}] error ${msg.code}: ${msg.message}`);
        else if (msg.type === 'event') this.onEvent(msg.event, msg.data ?? {});
      });
      this.ws.on('close', () => console.log(`  [${this.name}] disconnected`));
    });
  }

  send(m: Record<string, unknown>) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  onEvent(event: string, data: Record<string, unknown>) {
    if (event === 'catch_request' && data.runnerId === this.id) {
      // Runners usually accept; sometimes dispute to exercise that path.
      setTimeout(() => this.send({ type: 'catch_response', catchId: data.catchId, accept: Math.random() > 0.15 }), 1500);
    }
    if (this.index === 0) {
      const who = (id: unknown) => this.state?.players.find(p => p.id === id)?.name ?? id;
      const detail = data.runnerId ? `${who(data.chaserId)} -> ${who(data.runnerId)}` : data.playerId ? String(who(data.playerId)) : JSON.stringify(data);
      console.log(`event: ${event} ${detail}`);
    }
  }

  /** Move about 1.4 m/s (walking), 3 m/s if a chaser is chasing a marker. */
  step() {
    const s = this.state;
    if (!s || (s.phase !== 'headstart' && s.phase !== 'active' && s.phase !== 'lobby')) return;
    const me = s.you;
    const center = s.zone.center ?? CENTER;
    let speed = 1.4;
    if (me.role === 'chaser' && s.phase === 'active' && s.map.runners.length) {
      const target = s.map.runners.reduce((a, b) => (distanceM(this.pos, a) < distanceM(this.pos, b) ? a : b));
      this.heading = bearingDeg(this.pos, target);
      speed = 3;
      // Bots "spot" a runner when the marker is close and try to catch them.
      if (distanceM(this.pos, target) < 25 && Math.random() < 0.3) this.send({ type: 'catch', runnerId: target.playerId });
    } else if (me.role === 'chaser' && s.phase === 'headstart') {
      speed = 0; // chasers wait during the head start
    } else {
      this.heading += (Math.random() - 0.5) * 40;
      // Stay inside the zone: turn back toward the center when near the edge.
      if (distanceM(this.pos, center) > s.zone.radiusM * 0.8) this.heading = bearingDeg(this.pos, center) + (Math.random() - 0.5) * 30;
    }
    if (me.status !== 'free') speed = 0;
    this.pos = offsetPoint(this.pos, speed, this.heading);
    this.send({ type: 'location', lat: this.pos.lat, lng: this.pos.lng, accuracy: 5 + Math.random() * 8 });
  }
}

const bots: Bot[] = [];
for (let i = 0; i < COUNT; i++) {
  const b = new Bot(i);
  const profile = { name: b.name, color: COLORS[i % COLORS.length] };
  if (i === 0 && CREATE) await b.connect({ type: 'create_game', ...profile });
  else await b.connect({ type: 'join_game', code, ...profile });
  bots.push(b);
}
console.log(`${COUNT} bots in game ${code}`);

const host = bots[0];
if (CREATE) {
  host.send({
    type: 'update_settings',
    settings: {
      zone: { center: CENTER, radiusM: 150 },
      chasers: { count: Math.max(1, Math.round(COUNT / 4)) },
      caughtMode: MODE,
      ...(FAST ? {
        headStart: { enabled: true, seconds: 20 },
        durationMin: 3,
        locationUpdates: { mode: 'interval', intervalSec: 15 },
        finalCountdown: { enabled: true, lastMin: 1, intervalSec: 5 },
        catching: { radiusM: 25, autoAcceptSec: 5 },
      } : {}),
      ...EXTRA,
    },
  });
  if (START) setTimeout(() => host.send({ type: 'start_game' }), 1000);
}

setInterval(() => bots.forEach(b => b.step()), 1000);
if (STATS) setInterval(() => bots.forEach(b => { b.pingSentAt = Date.now(); b.send({ type: 'ping' }); }), 3000);

function printStats() {
  if (!STATS || !stats.states) return;
  const sorted = [...stats.gaps].sort((a, b) => a - b);
  const rt = [...stats.rtts].sort((a, b) => a - b);
  const pct = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  console.log(`\nLAG REPORT (${COUNT} players, chase phase)`);
  console.log(`  updates received:      ${stats.states} (avg gap ${Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)} ms, 99th pct ${pct(sorted, 0.99)} ms, worst ${stats.maxGapMs} ms; server sends 1/s)`);
  console.log(`  round trip to server:  median ${pct(rt, 0.5)} ms, 95th pct ${pct(rt, 0.95)} ms, worst ${rt[rt.length - 1]} ms`);
  console.log(`  update size:           ${Math.round(stats.bytes / stats.states / 1024 * 10) / 10} KB each (~${Math.round(stats.bytes / stats.states / 1024 * 10) / 10} KB/s per phone)`);
}

// Print a one-line status every 10 seconds and exit when the game ends.
let printedResults = false;
setInterval(() => {
  const s = host.state;
  if (!s) return;
  const runners = s.players.filter(p => p.role === 'runner' && p.status === 'free').length;
  const t = s.timers;
  console.log(`[${s.phase}] runners free: ${runners}/${s.players.length}  head start: ${t.headStartLeftSec ?? '-'}s  game left: ${t.gameLeftSec ?? '-'}s  next update: ${t.nextUpdateInSec ?? '-'}s  zone: ${s.zone.radiusM}m`);
  if (s.phase === 'ended' && s.results && !printedResults) {
    printedResults = true;
    console.log(`\nGAME OVER: ${s.results.winner} win (${s.results.reason})`);
    for (const a of s.results.awards) console.log(`  ${a.title}: ${s.players.find(p => p.id === a.playerId)?.name} (${a.value})`);
    printStats();
    if (CREATE) setTimeout(() => process.exit(0), 500);
  }
}, 10_000);
