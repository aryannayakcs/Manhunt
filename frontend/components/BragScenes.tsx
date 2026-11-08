'use client';
// Animated scenes for the launch video: the real screens driven by sample data as a function of time.
// Open /brag-scenes?scene=pings, then call window.__setT(seconds) to show any moment. Dev tool only.
import { useEffect, useState, type ReactNode } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { GameCtx, type Ctx } from '@/lib/game';
import { CENTER, at, ctx, game } from '@/lib/mock';
import type { GameState, LatLng, LiveMarker, RunnerMarker } from '@/lib/protocol';
import { fmtTime } from '@/lib/util';
import { Game, Overlays } from './App';
import Map, { type Line, type Mk } from './Map';

const cl = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - Math.pow(1 - cl(x), 3);
const easeInOut = (x: number) => { const v = cl(x); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
type P = [number, number];
const pos = (from: P, to: P, x: number) => at(lerp(from[0], to[0], cl(x)), lerp(from[1], to[1], cl(x)));
const live = (id: string, p: LatLng): LiveMarker => ({ playerId: id, lat: p.lat, lng: p.lng, accuracy: 6 });
const hint = (id: string, p: LatLng, radiusM: number, ageSec: number, reason: RunnerMarker['reason'] = 'scheduled', exact = false): RunnerMarker =>
  ({ playerId: id, lat: p.lat, lng: p.lng, radiusM, exact, reason, ageSec });
const inGame = (s: GameState) => <><Game s={s} showReveal={false} /><Overlays s={s} /></>;
const chaser = { role: 'chaser' as const, isHost: false };
const runner = { role: 'runner' as const, isHost: false };
const toast = (text: string, kind: 'info' | 'warn' | 'danger' = 'info') => [{ id: 1, text, kind }];

interface Frame { s: GameState | null; c?: Partial<Ctx>; render: (s: GameState) => ReactNode }
interface Scene { dur: number; frame: (t: number) => Frame; cam?: (t: number) => { center: LatLng; zoom: number } }

// ---- end-of-game replay: everyone wandering, crossing paths ----
const ROSTER = [
  { id: 'me', name: 'Shaurya', color: '#1fe3b4', chaser: false }, { id: 'ava', name: 'Ava', color: '#ff5a2c', chaser: true },
  { id: 'ben', name: 'Ben', color: '#5aa9ff', chaser: false }, { id: 'cleo', name: 'Cleo', color: '#ffd23f', chaser: true },
  { id: 'dev', name: 'Dev', color: '#b57bff', chaser: false }, { id: 'eli', name: 'Eli', color: '#9be15d', chaser: false },
];
const routePos = (i: number, tt: number): P => {
  const k = i + 1;
  const n = 120 * Math.sin(tt / (90 + 9 * k) + k * 1.3) + 45 * Math.sin(tt / (27 + 4 * k) + k * 2.1) + 15 * Math.sin(tt / 9 + k);
  const e = 120 * Math.cos(tt / (80 + 11 * k) + k * 0.7) + 45 * Math.cos(tt / (23 + 5 * k) + k) + 15 * Math.cos(tt / 11 + k * 3);
  return [n, e];
};
const REPLAY_LEN = 1200, TRAIL = 210;

export const SCENES: Record<string, Scene> = {
  // 1. hook: the runner's danger warning escalating
  heartbeat: {
    dur: 2.5,
    frame: (t) => ({ s: game({ me: runner, settings: { runnerView: 'none' }, you: { heartbeat: t < 1.0 ? 1 : t < 1.75 ? 2 : 3 } }), render: inGame }),
  },
  // 2. chaser map: chasers moving, a location update lands and the fuzzy circles grow in
  pings: {
    dur: 3,
    frame: (t) => {
      const u = t - 0.5, landed = u >= 0, g = ease(u / 0.45), m = t / 3;
      const eli = hint('eli', pos([232, 72], [214, 60], m), 0, 0, 'out_of_zone', true);
      const runners = landed
        ? [hint('ben', at(88, -55), 60 * g, Math.floor(u)), hint('dev', at(-58, 86), 60 * g, Math.floor(u)), eli]
        : [hint('ben', at(150, -15), 60, 118 + Math.floor(t)), hint('dev', at(5, 150), 60, 118 + Math.floor(t)), eli];
      return {
        s: game({ me: chaser, you: { location: live('me', pos([-150, -30], [-92, 8], m)) }, map: { runners, chasers: [live('me', pos([-150, -30], [-92, 8], m)), live('ava', pos([112, -172], [72, -118], m)), live('cleo', pos([-75, 152], [-42, 108], m))] },
          timers: { nextUpdateInSec: landed ? 120 - Math.floor(u) : 1 } }),
        c: landed ? { toasts: toast('Runner locations updated'), ping: u < 0.9 ? { id: 1, level: 'mid' } : null } : {},
        render: inGame,
      };
    },
  },
  // 3. runner map: teammates moving, then chasers get revealed
  revealed: {
    dur: 2.5,
    frame: (t) => {
      const u = t - 0.5, on = u >= 0, m = t / 2.5;
      return {
        s: game({
          me: runner,
          settings: { visibility: { runnersSeeChasers: true, chaserUpdates: 'interval', chaserIntervalSec: 60, chaserShowSec: 15, chasersSeeChasers: true, runnersSeeRunners: true } },
          others: { dev: { status: 'jailed' } },
          you: { heartbeat: on ? 1 : 0, location: live('me', pos([-42, 28], [-30, 52], m)) },
          timers: { chaserRevealInSec: on ? 60 - Math.floor(u) : 1 },
          map: {
            teammates: [{ ...live('ben', pos([98, -66], [80, -36], m)), status: 'free' }, { ...live('dev', at(6, -5)), status: 'jailed' }, { ...live('eli', pos([150, 125], [128, 98], m)), status: 'free' }],
            chasers: on ? [{ ...live('ava', at(40, -95)), ageSec: Math.floor(u) }, { ...live('cleo', at(-110, -60)), ageSec: Math.floor(u) }] : [],
          },
        }),
        c: on ? { flash: { id: 1, kind: 'chasers', text: '📡 CHASERS REVEALED · look at your map now (15 s)' }, ping: u < 0.9 ? { id: 1, level: 'big' } : null } : {},
        render: inGame,
      };
    },
  },
  // 4a. the zone closing in, on the chaser's map
  zone: {
    dur: 3,
    frame: (t) => {
      const u = t - 0.5, on = u >= 0, m = t / 3, r = on ? lerp(200, 140, easeInOut(u / 2.3)) : 200;
      return {
        s: game({
          me: chaser,
          settings: { shrinkingZone: { enabled: true, style: 'stages', startAfterMin: 5, finalRadiusM: 80, stages: 3, intervalMin: 4, shrinkSec: 60 } },
          zone: { radiusM: Math.round(r), shrinking: on, nextRadiusM: 140, nextShrinkInSec: on ? 0 : 1, stage: 2, stages: 3 },
          you: { location: live('me', pos([-120, -20], [-88, 2], m)) },
          map: {
            runners: [hint('ben', at(70, -40), 60, 20 + Math.floor(t)), hint('dev', at(-40, 80), 60, 20 + Math.floor(t)), hint('eli', pos([182, 92], [166, 84], m), 0, 0, 'out_of_zone', true)],
            chasers: [live('me', pos([-120, -20], [-88, 2], m)), live('ava', pos([62, -150], [50, -108], m)), live('cleo', pos([-92, 128], [-62, 98], m))],
          },
        }),
        c: on ? { toasts: toast('The zone is shrinking! (2 of 3)', 'warn') } : {},
        render: inGame,
      };
    },
  },
  // 4b. a runner outside the zone, counting down (real time: 1 s per second)
  outzone: {
    dur: 3,
    frame: (t) => {
      const revealed = t >= 2;
      return {
        s: game({ me: runner, you: { inZone: false, outOfZoneRevealInSec: revealed ? null : t < 1 ? 2 : 1, revealedForLeavingZone: revealed, outOfZoneOutInSec: 14 - Math.floor(t) } }),
        c: revealed && t < 2.9 ? { ping: { id: 1, level: 'big' } } : {},
        render: inGame,
      };
    },
  },
  // 5. auto-catch: a chaser runs down a fleeing runner
  autocatch: {
    dur: 2.5,
    frame: (t) => {
      const CATCH = 1.5;
      const caught = t >= CATCH;
      const benPath = (x: number): P => [lerp(20, 60, x), lerp(30, 72, x)]; // Ben sprinting away
      const ben = at(...benPath(Math.min(t, CATCH) / 2.2));
      const catchSpot = benPath(CATCH / 2.2);
      const me = caught ? at(...catchSpot) : pos([-45, -25], catchSpot, easeInOut(t / CATCH));
      return {
        s: game({
          me: chaser,
          settings: { locationUpdates: { mode: 'live', intervalSec: 120, showSec: 0 }, catching: { radiusM: 15, autoAcceptSec: 15, auto: true, autoRadiusM: 5, autoHoldSec: 2 } },
          others: caught ? { ben: { status: 'out' } } : {},
          you: { location: live('me', me) },
          map: {
            runners: caught ? [hint('dev', at(-80, 120), 0, 0, 'live', true)] : [hint('ben', ben, 0, 0, 'live', true), hint('dev', at(-80, 120), 0, 0, 'live', true)],
            chasers: [live('me', me), live('cleo', pos([-120, -100], [-100, -75], t / 2.5))],
          },
        }),
        c: caught ? { toasts: toast('You caught Ben! (auto-catch)', 'danger'), ping: t < 2.4 ? { id: 1, level: 'big' } : null } : {},
        render: inGame,
      };
    },
    cam: (t) => ({ center: pos([-5, 10], [38, 52], easeInOut(t / 1.6)), zoom: lerp(16.75, 17.25, easeInOut(t / 2.5)) }),
  },
  // 6. jailbreak: walk into jail, the ring fills, everyone's free
  jailbreak: {
    dur: 2.5,
    frame: (t) => {
      const prog = t >= 0.5 && t < 1.5 ? Math.min(5, 1 + Math.floor((t - 0.5) / 0.2)) : null;
      const freed = t >= 1.5;
      return {
        s: game({
          me: runner,
          others: { dev: { status: freed ? 'free' : 'jailed' } },
          you: { location: live('me', pos([-78, 48], [-4, 3], ease(t / 0.5))), jailbreakProgressSec: prog, heartbeat: 1 },
          map: { teammates: [{ ...live('dev', at(7, -6)), status: freed ? 'free' : 'jailed' }, { ...live('ben', pos([90, -70], [80, -50], t / 2.5)), status: 'free' }] },
        }),
        c: freed ? { flash: { id: 1, kind: 'jailbreak', text: 'JAILBREAK! You freed Dev' }, ping: t < 2.4 ? { id: 1, level: 'big' } : null } : {},
        render: inGame,
      };
    },
    cam: () => ({ center: at(-10, 10), zoom: 17.1 }),
  },
  // 7. end-of-game replay: everyone's route drawing across the map
  replay: {
    dur: 4,
    frame: (t) => ({ s: null, render: () => <Replay rt={REPLAY_LEN * cl(t / 4)} /> }),
    cam: (t) => ({ center: at(0, 0), zoom: lerp(16.2, 16.5, easeInOut(t / 4)) }),
  },
};

function Replay({ rt }: { rt: number }) {
  const lines: Line[] = []; const markers: Mk[] = [];
  ROSTER.forEach((p, i) => {
    const coords: [number, number][] = [];
    for (let tt = Math.max(0, rt - TRAIL); tt <= rt; tt += 4) { const [n, e] = routePos(i, tt); const ll = at(n, e); coords.push([ll.lng, ll.lat]); }
    if (coords.length > 1) lines.push({ id: p.id, color: p.color, coords });
    const [n, e] = routePos(i, rt); const ll = at(n, e);
    markers.push({ id: p.id, lat: ll.lat, lng: ll.lng, color: p.color, kind: p.chaser ? 'tri' : 'dot', label: p.name });
  });
  return (
    <div className="scr" style={{ gap: 10 }}>
      <div className="top">
        <span className="pill" style={{ fontSize: 20 }}><small>Replay</small>{fmtTime(rt)} / 20:00</span>
        <span className="pill" style={{ color: 'var(--runner)' }}>Runners win!</span>
      </div>
      <Map zone={{ center: CENTER, radiusM: 200 }} lines={lines} markers={markers} fit />
    </div>
  );
}

export default function BragScenes() {
  const [t, setT] = useState(0);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(new URLSearchParams(location.search).get('scene'));
    (window as unknown as { __setT: (v: number) => Promise<void> }).__setT = (v) =>
      new Promise((res) => { setT(v); setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => res())), 0); });
  }, []);
  const scene = name ? SCENES[name] : null;
  // camera moves for zoomed-in scenes; the recorder also calls __applyCam() after every frame
  useEffect(() => {
    const apply = () => {
      const cam = scene?.cam?.(t);
      const maps = (window as unknown as { __maps?: MLMap[] }).__maps;
      if (cam && maps?.length) maps[maps.length - 1].jumpTo({ center: [cam.center.lng, cam.center.lat], zoom: cam.zoom });
    };
    (window as unknown as { __applyCam: () => void }).__applyCam = apply;
    apply();
  }, [t, scene]);
  if (!scene) return <div style={{ color: '#fff', padding: 20 }}>Pick ?scene= {Object.keys(SCENES).join(', ')}</div>;
  const f = scene.frame(t);
  return (
    <div style={{ position: 'relative', width: 375, height: 812, overflow: 'hidden', background: '#000' }}>
      <GameCtx.Provider value={ctx({ state: f.s, ...f.c })}>{f.render(f.s as GameState)}</GameCtx.Provider>
    </div>
  );
}
