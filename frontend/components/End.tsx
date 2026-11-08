'use client';
import { useMemo, useState } from 'react';
import { useGame } from '@/lib/game';
import type { GameState, Results } from '@/lib/protocol';
import { fmtTime } from '@/lib/util';
import Map, { type Line, type Mk } from './Map';

const WIN = { runners: ['Runners win!', 'var(--runner)'], chasers: ['Chasers win!', 'var(--chaser)'], none: ['Game ended', 'var(--tx)'] } as const;
const WHY = { all_caught: 'Everyone was caught', time_up: "Time's up", host_ended: 'Host ended the game' } as const;

function posAt(route: Results['players'][number]['route'], t: number): [number, number] | null {
  if (!route.length || t < route[0][2]) return route.length ? null : null;
  let prev = route[0];
  for (const pt of route) {
    if (pt[2] > t) { const k = (t - prev[2]) / Math.max(1, pt[2] - prev[2]); return [prev[0] + (pt[0] - prev[0]) * k, prev[1] + (pt[1] - prev[1]) * k]; }
    prev = pt;
  }
  return [prev[0], prev[1]];
}

export function End({ s }: { s: GameState }) {
  const { send, leave } = useGame();
  const r = s.results;
  const maxT = useMemo(() => (r ? Math.max(1, ...r.players.flatMap((p) => p.route.map((x) => x[2])), r.chaseDurationSec) : 1), [r]);
  const [t, setT] = useState(0);
  if (!r) return <div className="scr"><div className="disp" style={{ fontSize: 44 }}>Game over</div><button className="btn ghost" onClick={leave}>Leave</button></div>;

  const [title, color] = WIN[r.winner];
  const name = (id: string) => r.players.find((p) => p.playerId === id);
  const lines: Line[] = r.players.map((p) => ({ id: p.playerId, color: p.color, coords: p.route.filter((x) => x[2] <= t).map((x) => [x[1], x[0]] as [number, number]) })).filter((l) => l.coords.length > 1);
  const markers: Mk[] = r.players.flatMap((p) => { const pos = posAt(p.route, t); return pos ? [{ id: p.playerId, lat: pos[0], lng: pos[1], color: p.color, label: p.name }] : []; });
  const mapZone = s.zone.center ? { center: s.zone.center, radiusM: s.settings.zone.radiusM } : null;

  const share = async () => {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = '#8a979c'; g.font = '700 36px sans-serif'; g.fillText('MANHUNT · ' + s.code, 70, 110);
    g.fillStyle = r.winner === 'runners' ? '#1fe3b4' : r.winner === 'chasers' ? '#ff5a2c' : '#e9eef0';
    g.font = '800 150px sans-serif'; g.fillText(title.toUpperCase(), 70, 300, 940);
    g.fillStyle = '#8a979c'; g.font = '600 40px sans-serif'; g.fillText(WHY[r.reason] + ' · ' + fmtTime(r.chaseDurationSec), 70, 370);
    r.awards.slice(0, 4).forEach((a, i) => {
      const y = 480 + i * 170;
      g.fillStyle = '#14181a'; g.fillRect(70, y, 940, 140);
      g.fillStyle = '#8a979c'; g.font = '700 30px sans-serif'; g.fillText(a.title.toUpperCase(), 100, y + 52);
      g.fillStyle = '#e9eef0'; g.font = '800 48px monospace'; g.fillText(`${name(a.playerId)?.name ?? '?'} · ${a.value}`, 100, y + 108, 880);
    });
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'manhunt.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Manhunt' }); return; }
    } catch { return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'manhunt.png'; a.click();
  };

  return (
    <div className="scr scroll">
      <div className="center"><div className="lbl">{WHY[r.reason]}</div><div className="disp" style={{ fontSize: 68, color }}>{title}</div></div>

      <div className="row wrap">
        {r.awards.map((a) => (
          <div key={a.id} className="award"><span className="lbl">{a.title}</span><b>{a.value}</b><span>{name(a.playerId)?.name}</span></div>
        ))}
      </div>

      <div className="lbl">Route replay</div>
      <div style={{ height: 240, display: 'flex', flex: 'none' }}><Map zone={mapZone} jail={s.jail} lines={lines} markers={markers} fit /></div>
      <div style={{ position: 'relative', flex: 'none' }}>
        <input type="range" min={0} max={Math.round(maxT)} value={t} onChange={(e) => setT(Number(e.target.value))} aria-label="Replay time" />
        {r.timeline.filter((e) => /caught|jailbreak|infect/.test(e.event)).map((e, i) => (
          <i key={i} title={e.event} style={{ position: 'absolute', top: 30, left: `calc(14px + ${(e.atSec / maxT) * 100}% * (1 - 28 / 100))`, width: 4, height: 10, background: /jailbreak/.test(e.event) ? 'var(--warn)' : 'var(--danger)', borderRadius: 2 }} />
        ))}
      </div>
      <div className="hint">{fmtTime(t)} / {fmtTime(maxT)} · red = catch, amber = jailbreak</div>

      <div className="card">
        {r.players.map((p) => (
          <div className="setrow" key={p.playerId}>
            <span><b style={{ color: p.color }}>●</b> {p.name}</span>
            <span className="mut" style={{ fontSize: 12, textAlign: 'right' }}>
              {p.startRole}{p.startRole !== p.endRole ? ` → ${p.endRole}` : ''}
              {p.survivedSec != null && ` · ${fmtTime(p.survivedSec)}`}
              {p.catches > 0 && ` · ${p.catches} catch${p.catches > 1 ? 'es' : ''}`}
              {` · ${(p.distanceM / 1000).toFixed(2)} km`}
              {p.closestCallM != null && ` · ${p.closestCallM.toFixed(1)} m`}
            </span>
          </div>
        ))}
      </div>

      <button className="btn" onClick={() => void share()}>Share card</button>
      {s.you.isHost && <button className="btn runner" onClick={() => send({ type: 'rematch' })}>Play again</button>}
      <button className="btn ghost" onClick={leave}>Leave</button>
    </div>
  );
}
