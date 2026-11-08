'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { useGame } from '@/lib/game';
import type { GameState, PublicPlayer } from '@/lib/protocol';
import { sfx } from '@/lib/sound';
import { distM, fmtAge, fmtTime } from '@/lib/util';
import Map, { type Circle, type Mk } from './Map';
import { Avatar, Ring } from './ui';

const byId = (s: GameState, id: string) => s.players.find((p) => p.id === id);
const youMk = (s: GameState, color: string): Mk[] => (s.you.location ? [{ id: 'you', lat: s.you.location.lat, lng: s.you.location.lng, color, kind: 'you' }] : []);
/** Chasers the server lets this player see (other chasers, or everyone when runners may see chasers). */
const chaserMks = (s: GameState): Mk[] => s.map.chasers.filter((c) => c.playerId !== s.you.id).map((c) => {
  const p = byId(s, c.playerId);
  return { id: `c-${c.playerId}`, lat: c.lat, lng: c.lng, color: p?.color ?? '#ff5a2c', kind: 'tri', label: p?.name };
});
const freeRunners = (s: GameState) => s.players.filter((p) => p.role === 'runner' && p.status === 'free');

export function RoleReveal({ role, headStartSec, onDone }: { role: 'chaser' | 'runner'; headStartSec: number | null; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 4500); return () => clearTimeout(t); }, [onDone]);
  const c = role === 'chaser';
  return (
    <div className={`take ${c ? 'chaser' : 'runner'}`} onClick={onDone} role="button">
      <div className="lbl" style={{ color: c ? 'var(--chaser)' : 'var(--runner)' }}>You are a</div>
      <div className="big" style={{ color: c ? 'var(--chaser)' : 'var(--runner)', fontSize: 92 }}>{c ? 'Chaser' : 'Runner'}</div>
      <p>{c ? 'Stay at the start. Close your eyes.' : 'Run and hide!'}{headStartSec != null && <><br /><b>{c ? 'Release' : 'Chasers released'} in {fmtTime(headStartSec)}</b></>}</p>
      <p className="hint">Tap to continue</p>
    </div>
  );
}

/* ---------------- Chaser ---------------- */
export function ChaserView({ s, headStart, initialPick = false }: { s: GameState; headStart: boolean; initialPick?: boolean }) {
  const { send } = useGame();
  const [pick, setPick] = useState(initialPick);
  const t = s.timers;
  const pc = s.pendingCatch && s.pendingCatch.chaserId === s.you.id ? s.pendingCatch : null;
  useEffect(() => { if (pc) setPick(false); }, [pc]);

  if (headStart) {
    return (
      <div className="scr chaser" style={{ background: '#000' }}>
        <div className="grow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
          <div className="lbl center" style={{ color: 'var(--chaser)' }}>Chasers released in</div>
          <div className="timer" style={{ color: 'var(--chaser)', fontSize: 110 }}>{fmtTime(t.headStartLeftSec)}</div>
          <div className="disp center" style={{ fontSize: 36 }}>Don&apos;t peek.</div>
        </div>
      </div>
    );
  }

  const markers: Mk[] = [...youMk(s, 'var(--chaser)')];
  const circles: Circle[] = [];
  markers.push(...chaserMks(s));
  for (const r of s.map.runners) {
    const p = byId(s, r.playerId); const color = p?.color ?? '#1fe3b4';
    const op = Math.max(0.3, 1 - r.ageSec / 300);
    const flag = r.reason === 'out_of_zone' ? 'LEFT ZONE' : r.reason === 'signal_lost' ? '📵 PHONE OFF' : null;
    if (r.exact) markers.push({ id: `rx-${r.playerId}`, lat: r.lat, lng: r.lng, color, kind: 'dot', label: p?.name, sub: flag ?? fmtAge(r.ageSec), subBad: !!flag, opacity: flag ? 1 : op });
    else {
      circles.push({ id: r.playerId, lat: r.lat, lng: r.lng, radiusM: r.radiusM, color, opacity: op });
      markers.push({ id: `rf-${r.playerId}`, lat: r.lat, lng: r.lng, color, kind: 'label', label: p?.name, sub: fmtAge(r.ageSec), opacity: op });
    }
  }
  // Sort catch candidates by how close their last revealed location is to me.
  const here = s.you.location;
  const lastSeen = (id: string) => { const r = s.map.runners.find((x) => x.playerId === id); return r && here ? Math.max(0, distM(here, r) - r.radiusM) : null; };
  const free = freeRunners(s).map((p) => ({ p, d: lastSeen(p.id) })).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  const total = s.players.filter((p) => p.role === 'runner' || p.status !== 'free').length;
  const target = pc ? byId(s, pc.runnerId) : null;

  return (
    <div className="scr chaser" style={{ gap: 10 }}>
      <div className="top">
        <div className={`pill ${t.finalCountdownActive ? 'pulse' : ''}`} style={{ fontSize: 22, color: t.finalCountdownActive ? 'var(--danger)' : undefined }}>{fmtTime(t.gameLeftSec)}</div>
        <div className="pill"><small>Next</small>{t.nextUpdateInSec != null ? fmtTime(t.nextUpdateInSec) : s.settings.locationUpdates.mode === 'live' ? 'LIVE' : '—'}</div>
        <div className="pill"><small>Free</small>{free.length}/{Math.max(total, free.length)}</div>
      </div>
      {t.finalCountdownActive && <div className="banner danger">⚠ Final countdown. Updates are faster.</div>}
      <ZoneBar s={s} />
      <Map zone={s.zone} finalRadiusM={s.zone.nextRadiusM} jail={s.jail} markers={markers} circles={circles} fit />
      <HuntList s={s} />
      {pc && <div className="card center" style={{ flex: 'none' }}><div className="lbl">Waiting for {target?.name} to confirm…</div><div className="timer sm">auto in {pc.autoAcceptInSec} s</div></div>}
      <button className="btn chaser" style={{ minHeight: 68, fontSize: 28 }} disabled={!!pc || free.length === 0} onClick={() => setPick(true)}>Catch</button>
      {pick && (
        <div className="sheet">
          <div className="disp" style={{ fontSize: 36 }}>Who did you catch?</div>
          {free.map(({ p, d }) => (
            <button key={p.id} className="player" style={{ minHeight: 72 }} disabled={p.immuneSec > 0} onClick={() => { send({ type: 'catch', runnerId: p.id }); setPick(false); }}>
              <Avatar p={p} /><b className="grow" style={{ fontSize: 20 }}>{p.name}</b>
              {p.immuneSec > 0 ? <span className="badge">🛡 {p.immuneSec}s</span> : d != null && <span className="mut" style={{ fontSize: 13 }}>~{Math.round(d)} m</span>}
            </button>
          ))}
          <p className="hint">Tap who you tagged. They confirm on their phone.</p>
          <button className="btn ghost" onClick={() => setPick(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
/** Shrinking zone: countdown to the next shrink, or "shrinking now". Dashed circle on the map = next size. */
function ZoneBar({ s }: { s: GameState }) {
  const z = s.zone;
  if (!s.settings.shrinkingZone.enabled || z.nextRadiusM == null || z.nextShrinkInSec == null) return null;
  const stage = z.stage && z.stages ? ` · ${z.stage}/${z.stages}` : '';
  return (
    <div className={`zonebar ${z.shrinking ? 'on' : ''}`}>
      {z.shrinking ? `◎ Zone shrinking to ${fmtM(z.nextRadiusM)}${stage}` : `◎ Zone shrinks to ${fmtM(z.nextRadiusM)} in ${fmtTime(z.nextShrinkInSec)}${stage}`}
    </div>
  );
}

/** Everyone the chaser is hunting, with when each was last seen. */
function HuntList({ s }: { s: GameState }) {
  const list = freeRunners(s);
  if (!list.length) return null;
  return (
    <div className="strip" aria-label="Runners still free">
      {list.map((p) => {
        const r = s.map.runners.find((x) => x.playerId === p.id);
        const st = p.gpsLost ? '📵 phone off' : r?.reason === 'out_of_zone' ? 'left zone' : r ? fmtAge(r.ageSec) : 'not seen yet';
        return (
          <span key={p.id} className="chip" style={{ '--c': p.color } as CSSProperties}>
            <Avatar p={p} size="sm" /><b>{p.name}</b><small className={p.gpsLost || r?.reason === 'out_of_zone' ? 'bad' : ''}>{st}</small>
          </span>
        );
      })}
    </div>
  );
}

/* ---------------- Runner ---------------- */
const DANGER = ['All quiet', 'A chaser is nearby', 'A chaser is close', 'A chaser is very, very near'];
/** Pulsing danger warning. Says how close, never where. */
function Danger({ level, big = false }: { level: number; big?: boolean }) {
  return (
    <>
      <div className="heart">{[1, 2, 3].map((i) => <i key={i} className={level >= i ? `on${i}` : ''} />)}</div>
      <div className={`alert l${level}`} style={{ fontSize: big ? (level === 3 ? 58 : 46) : 28 }} role="status">{DANGER[level]}</div>
      {big && level === 3 && <p className="center mut">Stay hidden. Don&apos;t move.</p>}
    </>
  );
}
function useHeartbeat(level: number) {
  useEffect(() => {
    if (!level) return;
    const ms = [0, 1400, 900, 500][level];
    sfx.beat();
    const id = setInterval(() => sfx.beat(), ms);
    return () => clearInterval(id);
  }, [level]);
}

export function RunnerView({ s, headStart }: { s: GameState; headStart: boolean }) {
  const { send } = useGame();
  const y = s.you; const t = s.timers;
  const hb = s.settings.heartbeat.enabled ? y.heartbeat ?? 0 : 0;
  useHeartbeat(headStart ? 0 : hb);
  const level = headStart ? 0 : hb;
  const view = s.settings.runnerView;
  const me = byId(s, y.id);
  const pc = s.pendingCatch && s.pendingCatch.runnerId === y.id ? s.pendingCatch : null;
  const chaser = pc ? byId(s, pc.chaserId) : null;
  const free = freeRunners(s).length;

  return (
    <div className="scr runner dim" style={{ gap: 10 }}>
      {level > 0 && <div className={`vig l${level}`} />}
      <div className="top">
        <div className="timer sm" style={{ color: 'var(--runner)' }}>{headStart ? fmtTime(t.headStartLeftSec) : fmtTime(t.gameLeftSec)}</div>
        <div className="row">
          {me && me.immuneSec > 0 && <span className="badge">🛡 Immune {Math.ceil(me.immuneSec)} s</span>}
          <span className="pill"><small>Free</small>{free}</span>
        </div>
      </div>
      {headStart && <div className="banner info" style={{ justifyContent: 'center' }}>Run and hide! Chasers released in {fmtTime(t.headStartLeftSec)}</div>}

      <ZoneBar s={s} />
      {view === 'map' && <Map zone={s.zone} finalRadiusM={s.zone.nextRadiusM} jail={s.jail} markers={[...youMk(s, 'var(--runner)'), ...chaserMks(s)]} dim fit follow={null} />}
      {view === 'none' ? (
        <div className="grow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
          <Danger level={level} big />
        </div>
      ) : <Danger level={level} />}
      <p className="hint">Keep this screen open · lower your brightness</p>

      {y.jailbreakProgressSec != null && y.jailbreakProgressSec > 0 && s.jail && (
        <div className="take dark" style={{ background: '#000c' }}>
          <Ring value={y.jailbreakProgressSec} max={s.settings.jail.holdSec} text={`${Math.floor(y.jailbreakProgressSec)}/${s.settings.jail.holdSec}`} />
          <div className="disp" style={{ fontSize: 36 }}>Freeing your team…</div>
        </div>
      )}

      {y.inZone === false && !pc && (
        <div className="take red">
          {y.revealedForLeavingZone
            ? <div className="big" style={{ color: '#fff', fontSize: 66 }}>Chasers can see you!</div>
            : <><div className="big" style={{ color: 'var(--danger)', fontSize: 76 }}>Get back in!</div><div className="timer red pulse">{y.outOfZoneRevealInSec ?? 0} s</div><p>Chasers see you in {y.outOfZoneRevealInSec ?? 0} s</p></>}
          <p className="hint">Return inside the play zone</p>
        </div>
      )}

      {pc && (
        <div className="take chaser" style={{ zIndex: 50 }}>
          <div className="lbl">Catch request</div>
          <div className="big" style={{ fontSize: 54 }}>{chaser?.name ?? 'A chaser'} says<br />they caught you</div>
          <div className="timer sm">auto-yes in {pc.autoAcceptInSec} s</div>
          <div className="grow" />
          <button className="btn runner xl" onClick={() => send({ type: 'catch_response', catchId: pc.catchId, accept: true })}>Yes, caught</button>
          <button className="btn danger xl" onClick={() => send({ type: 'catch_response', catchId: pc.catchId, accept: false })}>No, they didn&apos;t</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Jailed ---------------- */
export function JailedView({ s }: { s: GameState }) {
  const mates = s.players.filter((p) => p.role === 'runner' && p.id !== s.you.id);
  return (
    <div className="scr runner dim" style={{ gap: 10, ['--accent' as string]: 'var(--warn)' }}>
      <div className="disp" style={{ fontSize: 44, color: 'var(--warn)' }}>You&apos;re in jail</div>
      <p className="mut">Walk to the jail and wait for a teammate to free you.</p>
      {s.jail && s.you.location && <div className="banner warn" style={{ justifyContent: 'center' }}>⛓ Jail is {Math.round(distM(s.you.location, s.jail.location))} m away</div>}
      <ZoneBar s={s} />
      <Map zone={s.zone} finalRadiusM={s.zone.nextRadiusM} jail={s.jail} markers={[...youMk(s, 'var(--runner)'), ...chaserMks(s)]} dim fit />
      <div className="row wrap" style={{ flex: 'none' }}>
        {mates.map((p) => <div key={p.id} className="player" style={{ width: 'auto', minHeight: 44, padding: '4px 10px' }}><Avatar p={p} size="sm" /><span>{p.name}</span><Tag2 p={p} /></div>)}
      </div>
      <div className="timer sm center" style={{ flex: 'none' }}>{fmtTime(s.timers.gameLeftSec)}</div>
    </div>
  );
}
const Tag2 = ({ p }: { p: PublicPlayer }) => <span className={`tag ${p.status === 'free' ? 'r' : p.status === 'jailed' ? 'j' : 'o'}`}>{p.status}</span>;

/* ---------------- Spectator ---------------- */
export function SpectatorView({ s }: { s: GameState }) {
  const markers: Mk[] = [];
  for (const m of s.map.everyone) {
    const p = byId(s, m.playerId);
    markers.push({ id: `e-${m.playerId}`, lat: m.lat, lng: m.lng, color: p?.color ?? '#fff', kind: p?.role === 'chaser' ? 'tri' : 'dot', label: p?.name });
  }
  const circles: Circle[] = [];
  for (const r of s.map.runners) { const p = byId(s, r.playerId); if (!r.exact) circles.push({ id: r.playerId, lat: r.lat, lng: r.lng, radiusM: r.radiusM, color: p?.color ?? '#1fe3b4', opacity: Math.max(0.3, 1 - r.ageSec / 300) }); }
  const free = freeRunners(s);
  return (
    <div className="scr" style={{ gap: 10 }}>
      <div className="top"><span className="tag o">Spectating</span><div className="pill" style={{ fontSize: 20 }}>{fmtTime(s.timers.gameLeftSec)}</div></div>
      <Map zone={s.zone} finalRadiusM={s.zone.nextRadiusM} jail={s.jail} markers={markers} circles={circles} fit />
      <div className="row wrap" style={{ flex: 'none' }}>
        <span className="lbl">Still free:</span>
        {free.length === 0 ? <span className="mut">nobody</span> : free.map((p) => <span key={p.id} className="pill">{p.avatar} {p.name}</span>)}
      </div>
    </div>
  );
}
