'use client';
// Every screen of the app with sample data, side by side. Open /gallery.
// Screens are the real components, so design changes show up here immediately.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { GameCtx, type Ctx } from '@/lib/game';
import { CHASER_HINTS, at, chaserMap, ctx, everyone, game, results, teammates } from '@/lib/mock';
import type { GameState } from '@/lib/protocol';
import { Game, HostMenu, Kicked, Overlays } from './App';
import { End } from './End';
import { Character, Home } from './Entry';
import { Lobby, LockTips } from './Lobby';
import { ChaserView, RoleReveal } from './Play';

interface Shot { title: string; desc: string; s?: GameState | null; c?: Partial<Ctx>; host?: boolean; render: (s: GameState) => ReactNode }
interface Section { id: string; title: string; shots: Shot[] }

const t = (id: number, text: string, kind: 'info' | 'warn' | 'danger' = 'info') => ({ id, text, kind });
const inGame = (s: GameState) => <><Game s={s} showReveal={false} /><Overlays s={s} /></>;
const chaser = { me: { role: 'chaser' as const, isHost: false } };
const runner = { me: { role: 'runner' as const, isHost: false } };

const SECTIONS: Section[] = [
  {
    id: 'start', title: 'Getting in',
    shots: [
      { title: 'Make your character', desc: 'First time opening the app. Saved on the phone, so it only appears once.', c: { profile: null }, render: () => <Character canBack={false} onDone={() => {}} /> },
      { title: 'Home', desc: 'Create a game, or type a 4-letter code to join one.', render: () => <Home onCharacter={() => {}} /> },
      { title: 'Opened a join link', desc: 'Someone shared yoursite/join/KRBX, so the code is already filled in.', c: { pendingCode: 'KRBX' }, render: () => <Home onCharacter={() => {}} /> },
      { title: 'Server waking up', desc: 'The free server sleeps when unused. Shows for up to a minute on the first visit.', c: { conn: 'connecting', waking: true }, render: () => <Home onCharacter={() => {}} /> },
      { title: 'Wrong code', desc: 'The code typed doesn’t match any game.', c: { error: 'No game with code ZQXW.' }, render: () => <Home onCharacter={() => {}} /> },
    ],
  },
  {
    id: 'lobby', title: 'Lobby & setup',
    shots: [
      { title: 'Lobby: host, new game', desc: 'Right after Create game. The host still needs to tap I’m ready and draw the zone.', c: { ready: false }, s: game({ phase: 'lobby', settings: { zone: { center: null, radiusM: 200 } } }), render: (s) => <><Lobby s={s} /><Overlays s={s} /></> },
      { title: 'Lobby: host picks chasers', desc: 'Ready, zone drawn, “Host picks” on: tap players to switch chaser/runner.', s: game({ phase: 'lobby', settings: { chasers: { count: 2, selection: 'host' } }, others: { ava: { role: 'chaser' }, cleo: { role: 'chaser' } } }), render: (s) => <Lobby s={s} /> },
      { title: 'Lobby: a friend’s view', desc: 'Everyone who isn’t the host waits here.', s: game({ phase: 'lobby', me: { isHost: false }, others: { ava: { isHost: true } } }), render: (s) => <Lobby s={s} /> },
      { title: 'Lock your phone into the game', desc: 'From the lobby button. Guided Access (iPhone) / App pinning (Android) stop the phone from leaving the game or locking.', s: game({ phase: 'lobby' }), render: (s) => <><Lobby s={s} /><LockTips onClose={() => {}} /></> },
      { title: 'Settings', desc: 'Host only. Every rule of the game. Scroll inside the phone to see all of it (shown here with the staged zone, auto-catch and timed reveals on).', s: game({ phase: 'lobby', settings: { shrinkingZone: { enabled: true, style: 'stages', startAfterMin: 5, finalRadiusM: 80, stages: 3, intervalMin: 4, shrinkSec: 60 }, catching: { radiusM: 15, autoAcceptSec: 15, auto: true, autoRadiusM: 5, autoHoldSec: 2 }, locationUpdates: { mode: 'interval', intervalSec: 60, showSec: 20 }, visibility: { runnersSeeChasers: true, chaserUpdates: 'interval', chaserIntervalSec: 60, chaserShowSec: 15, chasersSeeChasers: true, runnersSeeRunners: true } } }), render: (s) => <Lobby s={s} initialView="settings" /> },
      { title: 'Draw the play zone', desc: 'Host taps the map or drags the handle. With jailbreak on, there’s a jail pin too.', s: game({ phase: 'lobby' }), render: (s) => <Lobby s={s} initialView="zone" /> },
    ],
  },
  {
    id: 'begin', title: 'Game start',
    shots: [
      { title: 'Role reveal: chaser', desc: 'Shown to everyone the moment the host taps Start.', s: game({ phase: 'headstart', ...chaser }), render: (s) => <>{inGame(s)}<RoleReveal role="chaser" headStartSec={142} onDone={() => {}} /></> },
      { title: 'Role reveal: runner', desc: 'Same moment, runner version.', s: game({ phase: 'headstart', ...runner }), render: (s) => <>{inGame(s)}<RoleReveal role="runner" headStartSec={142} onDone={() => {}} /></> },
      { title: 'Chaser: head start', desc: 'Chasers see nothing but a countdown while runners hide.', s: game({ phase: 'headstart', ...chaser }), render: inGame },
      { title: 'Runner: head start', desc: 'Runners see their own view plus the countdown.', s: game({ phase: 'headstart', ...runner }), render: inGame },
    ],
  },
  {
    id: 'chaser', title: 'Chaser',
    shots: [
      { title: 'Chaser map', desc: 'Every runner has a name tag: fuzzy circles (they\u2019re somewhere inside), or an exact dot when Eli left the zone. Triangles are other chasers. The strip under the map lists everyone you\u2019re hunting.', s: game({ ...chaser, map: chaserMap() }), render: inGame },
      { title: 'Final countdown', desc: 'Last few minutes: red timer, faster updates.', s: game({ ...chaser, map: chaserMap(), timers: { gameLeftSec: 151, nextUpdateInSec: 12, finalCountdownActive: true } }), render: inGame },
      { title: 'Live locations', desc: 'When the host sets updates to “Live”: exact dots that move in real time.', s: game({ ...chaser, settings: { locationUpdates: { mode: 'live', intervalSec: 120, showSec: 0 } }, map: { ...chaserMap(), runners: CHASER_HINTS.map((r) => ({ ...r, radiusM: 0, exact: true, reason: 'live' as const, ageSec: 1 })) } }), render: inGame },
      { title: 'Who did you catch?', desc: 'After tapping Catch. Sorted by who was last seen closest.', s: game({ ...chaser, map: chaserMap() }), render: (s) => <ChaserView s={s} headStart={false} initialPick /> },
      { title: 'Auto-catch on', desc: 'Setting: get within the catch distance (default 5 m / 16 ft) for 2 s and the runner is caught automatically. No tag or confirmation needed.', c: { toasts: [t(1, 'You caught Ben! (auto-catch)', 'danger')] }, s: game({ ...chaser, map: chaserMap(), settings: { catching: { radiusM: 15, autoAcceptSec: 15, auto: true, autoRadiusM: 5, autoHoldSec: 2 } } }), render: inGame },
      { title: 'Waiting for confirmation', desc: 'The runner has to confirm on their phone. Counts automatically after 15 s.', s: game({ ...chaser, map: chaserMap(), pendingCatch: { catchId: 'c1', chaserId: 'me', runnerId: 'ben', autoAcceptInSec: 11 } }), render: inGame },
      { title: 'A runner\u2019s phone went dark', desc: 'Dev locked his phone (or closed Safari). After 30 s with no location, chasers see his last spot, tagged PHONE OFF.', c: { toasts: [t(1, 'Dev\u2019s phone went dark. Last spot revealed!', 'danger')] }, s: game({ ...chaser, others: { dev: { gpsLost: true } }, map: { ...chaserMap(), runners: CHASER_HINTS.map((r) => (r.playerId === 'dev' ? { ...r, radiusM: 0, exact: true, reason: 'signal_lost' as const, ageSec: 1 } : r)) } }), render: inGame },
      { title: 'Alerts (toasts)', desc: 'Short messages at the top, e.g. a catch from too far away or new locations.', c: { toasts: [t(1, 'Locations updated'), t(2, 'Too far (42 m). Get closer', 'warn'), t(3, 'Cleo caught Ben!', 'danger')] }, s: game({ ...chaser, map: chaserMap() }), render: inGame },
    ],
  },
  {
    id: 'runner', title: 'Runner',
    shots: [
      { title: 'Runner map: all quiet', desc: '“What runners see: Map”. You, your teammates (Dev is in jail), the zone and the jail. Screen is dimmed so it doesn’t give away your hiding spot.', s: game({ ...runner, map: { teammates: teammates() } }), render: inGame },
      { title: 'Runner map: chasers revealed', desc: 'Setting \u201cRunners see chasers\u201d (every 1 min, shown for 15 s): runners get a snapshot of every chaser, then it disappears. \u201cChasers\u201d in the top bar counts down to the next one.', s: game({ ...runner, settings: { visibility: { runnersSeeChasers: true, chaserUpdates: 'interval', chaserIntervalSec: 60, chaserShowSec: 15, chasersSeeChasers: true, runnersSeeRunners: true } }, you: { heartbeat: 1 }, timers: { chaserRevealInSec: 52 }, map: { chasers: [{ playerId: 'ava', ...at(25, -20), accuracy: 6, ageSec: 8 }, { playerId: 'cleo', ...at(-100, -80), accuracy: 6, ageSec: 8 }] } }), render: inGame },
      { title: 'Chasers revealed (alert)', desc: 'Every time runners get the chasers\u2019 locations: a siren sound, a voice line, a vibration, a screen flash and this banner, so everyone knows to look.', c: { flash: { id: 1, kind: 'chasers', text: '📡 CHASERS REVEALED · look at your map now (15 s)' }, ping: { id: 1, level: 'big' } }, s: game({ ...runner, settings: { visibility: { runnersSeeChasers: true, chaserUpdates: 'interval', chaserIntervalSec: 60, chaserShowSec: 15, chasersSeeChasers: true, runnersSeeRunners: true } }, timers: { chaserRevealInSec: 60 }, map: { teammates: teammates(), chasers: [{ playerId: 'ava', ...at(25, -20), accuracy: 6, ageSec: 0 }, { playerId: 'cleo', ...at(-100, -80), accuracy: 6, ageSec: 0 }] } }), render: inGame },
      { title: 'Runner map: chaser close', desc: 'Heartbeat warning: red pulsing edges and a heartbeat sound. Gets faster as chasers get closer.', s: game({ ...runner, you: { heartbeat: 2 } }), render: inGame },
      { title: '\u201cNothing\u201d view: chaser very near', desc: 'Runners are never told where a chaser is, only how close. The warning pulses faster as they get nearer.', s: game({ ...runner, settings: { runnerView: 'none' }, you: { heartbeat: 3 } }), render: inGame },
      { title: '“Nothing” view: chaser nearby', desc: '“What runners see: Nothing”. Just the timer and the danger warning.', s: game({ ...runner, settings: { runnerView: 'none' }, you: { heartbeat: 1 } }), render: inGame },
      { title: 'Your location was sent', desc: 'Flashes every time chasers get an update about you.', c: { flash: { id: 1, kind: 'revealed', text: 'Your location was just sent to the chasers' } }, s: game({ ...runner }), render: inGame },
      { title: 'Back after locking the phone', desc: 'A runner whose phone was locked for 30+ s is told chasers saw their last spot.', c: { flash: { id: 1, kind: 'revealed', text: 'Your phone stopped sharing your location, so chasers saw your last spot. Keep this screen open!' } }, s: game({ ...runner }), render: inGame },
      { title: 'Catch request', desc: 'A chaser says they tagged you. Confirm or dispute.', s: game({ ...runner, you: { heartbeat: 3 }, pendingCatch: { catchId: 'c1', chaserId: 'ava', runnerId: 'me', autoAcceptInSec: 12 } }), render: inGame },
      { title: 'Left the zone', desc: 'After 3 s outside, chasers see you. After 15 s, you\u2019re out (both adjustable).', s: game({ ...runner, you: { inZone: false, outOfZoneRevealInSec: 2, outOfZoneOutInSec: 14 } }), render: inGame },
      { title: 'Revealed for leaving', desc: 'Chasers see your exact location until you return, and you\u2019re out if the countdown hits 0.', s: game({ ...runner, you: { inZone: false, revealedForLeavingZone: true, outOfZoneOutInSec: 9 } }), render: inGame },
      { title: 'Freeing your team', desc: 'Jailbreak mode: stand in the jail for 5 s to free everyone in it.', s: game({ ...runner, you: { jailbreakProgressSec: 3 } }), render: inGame },
      { title: 'Immune after jailbreak', desc: 'Freed runners can’t be caught for a few seconds.', s: game({ ...runner, me: { role: 'runner', isHost: false, immuneSec: 8 } }), render: inGame },
      { title: 'Zone: waiting for the next shrink', desc: 'Staged zone (setting): it holds still between shrinks. The bar counts down to the next one; the dashed circle is the next size.', s: game({ ...runner, settings: { shrinkingZone: { enabled: true, style: 'stages', startAfterMin: 5, finalRadiusM: 80, stages: 3, intervalMin: 4, shrinkSec: 60 } }, zone: { radiusM: 160, nextRadiusM: 120, nextShrinkInSec: 95, stage: 2, stages: 3 } }), render: inGame },
      { title: 'Zone: shrinking now', desc: 'During a shrink the bar flashes and the circle closes in to the dashed line over the time you set.', c: { toasts: [t(1, 'The zone is shrinking! (2 of 3)', 'warn')] }, s: game({ ...chaser, map: chaserMap(), settings: { shrinkingZone: { enabled: true, style: 'stages', startAfterMin: 5, finalRadiusM: 80, stages: 3, intervalMin: 4, shrinkSec: 60 } }, zone: { radiusM: 140, shrinking: true, nextRadiusM: 120, nextShrinkInSec: 0, stage: 2, stages: 3 } }), render: inGame },
    ],
  },
  {
    id: 'caught', title: 'Caught',
    shots: [
      { title: 'You were caught', desc: 'Full-screen flash for a few seconds.', c: { flash: { id: 1, kind: 'caught', text: 'You were caught' } }, s: game({ ...runner }), render: inGame },
      { title: 'In jail', desc: 'Jailbreak mode: walk to the jail and wait for a teammate.', s: game({ me: { role: 'runner', status: 'jailed', isHost: false }, you: { status: 'jailed', heartbeat: null }, others: { ben: { status: 'jailed' } } }), render: inGame },
      { title: 'JAILBREAK!', desc: 'A teammate freed you.', c: { flash: { id: 1, kind: 'jailbreak', text: 'JAILBREAK! Dev freed you' } }, s: game({ ...runner }), render: inGame },
      { title: 'Infected', desc: 'Infection mode: caught runners become chasers.', c: { flash: { id: 1, kind: 'infected', text: 'You’re infected! You’re a chaser now' } }, s: game({ ...chaser, map: chaserMap() }), render: inGame },
      { title: 'Spectating', desc: 'Out (or joined mid-game): watch everyone live.', s: game({ me: { role: 'runner', status: 'out', isHost: false }, you: { status: 'out', heartbeat: null }, map: { runners: CHASER_HINTS, chasers: [], everyone: everyone() } }), render: inGame },
    ],
  },
  {
    id: 'host', title: 'Host & connection',
    shots: [
      { title: 'Host controls', desc: 'The ⋯ button (top right, host only): pause, end the game, kick someone.', host: true, s: game({ me: { role: 'chaser', isHost: true }, map: chaserMap() }), render: (s) => <><ChaserView s={s} headStart={false} /><HostMenu s={s} initialOpen /></> },
      { title: 'Paused', desc: 'Everyone sees this while the host has paused. Timers stop.', host: true, s: game({ phase: 'paused', pausedFrom: 'active', me: { role: 'chaser', isHost: true }, map: chaserMap() }), render: inGame },
      { title: 'Reconnecting / weak GPS', desc: 'Signal dropped (rejoins automatically) and GPS is inaccurate.', c: { conn: 'closed', geo: 'weak', accuracy: 42 }, s: game({ ...runner }), render: inGame },
      { title: 'Sound off after a reload', desc: 'Phones block sound and keep-awake after a page reload until you tap.', c: { ready: false }, s: game({ ...runner }), render: inGame },
      { title: 'Location blocked', desc: 'The player denied location permission.', c: { geo: 'denied' }, s: game({ ...runner }), render: inGame },
      { title: 'Opened in another tab', desc: 'The same player opened the game in a second tab or window. The old one steps aside instead of fighting for the connection.', c: { replaced: true, conn: 'closed' }, s: game({ ...runner }), render: inGame },
      { title: 'Kicked', desc: 'The host removed you.', render: () => <Kicked onClose={() => {}} /> },
    ],
  },
  {
    id: 'end', title: 'End of game',
    shots: [
      { title: 'Runners win', desc: 'Time ran out with a runner still free. Awards, route replay (drag the slider), stats, share card.', s: game({ phase: 'ended', results: results('runners', 'time_up') }), render: (s) => <End s={s} /> },
      { title: 'Chasers win', desc: 'Everyone was caught.', s: game({ phase: 'ended', me: { isHost: false }, results: results('chasers', 'all_caught') }), render: (s) => <End s={s} /> },
    ],
  },
];

const ALL = SECTIONS.flatMap((x) => x.shots);
const numberOf = (shot: Shot) => ALL.indexOf(shot) + 1;

/** Only mounts a screen while it's near the viewport (each map uses graphics memory). */
function Phone({ shot, n, eager }: { shot: Shot; n: number; eager: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setVis] = useState(false);
  const vis = eager || seen;
  useEffect(() => {
    if (eager) return;
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting), { rootMargin: '500px 0px' });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [eager]);
  const s = shot.s ?? null;
  return (
    <figure className="g-item" id={`screen-${n}`}>
      <figcaption><span className="g-n">#{n}</span> {shot.title}</figcaption>
      <div ref={ref} className="g-phone" style={{ '--hostpad': shot.host ? '54px' : '0px' } as CSSProperties}>
        {vis && <GameCtx.Provider value={ctx({ state: s, ...shot.c })}>{shot.render(s as GameState)}</GameCtx.Provider>}
      </div>
      <p className="g-desc">{shot.desc}</p>
    </figure>
  );
}

export default function Gallery() {
  // ?only=16,21 shows just those screens (handy for sharing one screen).
  const [only, setOnly] = useState<Set<number> | null>(null);
  useEffect(() => {
    const v = new URLSearchParams(location.search).get('only');
    if (v) setOnly(new Set(v.split(',').map(Number).filter(Boolean)));
  }, []);
  let n = 0;
  return (
    <div className="g">
      <style>{CSS}</style>
      <header className="g-head">
        <div className="disp" style={{ fontSize: 44 }}>Manhunt · every screen</div>
        <p className="mut">All {SECTIONS.reduce((a, x) => a + x.shots.length, 0)} screens with sample data. Buttons don&apos;t do anything here. To change a screen, refer to it by its number (e.g. &ldquo;#23: make the arrow bigger&rdquo;).</p>
        <nav className="g-nav">{SECTIONS.map((x) => <a key={x.id} href={`#${x.id}`}>{x.title}</a>)}</nav>
      </header>
      {SECTIONS.map((sec) => (
        <section key={sec.id} id={sec.id} className="g-sec" hidden={!!only && !sec.shots.some((x) => only.has(numberOf(x)))}>
          <h2 className="disp">{sec.title}</h2>
          <div className="g-grid">{sec.shots.map((shot) => { n += 1; return only && !only.has(n) ? null : <Phone key={n} shot={shot} n={n} eager={!!only} />; })}</div>
        </section>
      ))}
    </div>
  );
}

const CSS = `
html,body{height:auto;overscroll-behavior:auto}
body{background:#0a0a0b}
.g{padding:24px 20px 80px;max-width:1700px;margin:0 auto}
.g-head{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}
.g-nav{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;padding:10px 0;background:#0a0a0b}
.g-nav a{color:var(--tx);text-decoration:none;background:var(--s2);border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-weight:600;font-size:14px}
.g-sec{margin-top:36px;scroll-margin-top:60px}
.g-sec h2{font-size:32px;margin-bottom:14px;color:var(--tx2)}
.g-grid{display:flex;flex-wrap:wrap;gap:36px 28px}
.g-item{margin:0;width:375px;display:flex;flex-direction:column;gap:8px}
.g-item figcaption{font-weight:700;font-size:15px}
.g-n{font:800 15px var(--mono);color:var(--runner)}
.g-phone{position:relative;width:375px;height:812px;overflow:hidden;border-radius:38px;border:8px solid #1b1d1f;background:#000;box-shadow:0 20px 50px #0009}
.g-desc{font-size:13px;color:var(--tx2);margin:0}
@media (max-width:420px){.g{padding:16px 8px}.g-item{width:100%}.g-phone{zoom:.88;margin:0 auto}}
`;
