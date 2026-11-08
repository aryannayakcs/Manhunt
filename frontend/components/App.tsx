'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameProvider, useGame } from '@/lib/game';
import type { GameState } from '@/lib/protocol';
import { End } from './End';
import { Character, Home } from './Entry';
import { Lobby } from './Lobby';
import { ChaserView, JailedView, RoleReveal, RunnerView, SpectatorView } from './Play';

export default function App() {
  return <GameProvider><Shell /></GameProvider>;
}

function Shell() {
  const g = useGame();
  const { state: s, profile } = g;
  const [editing, setEditing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div id="root" />;

  const inGame = !!s && s.phase !== 'lobby' && s.phase !== 'ended';
  const hostPad = s?.you.isHost && inGame ? '54px' : '0px';

  return (
    <div id="root" style={{ ['--hostpad' as string]: hostPad }}>
      {!s && (g.kicked
        ? <Kicked onClose={g.clearKicked} />
        : (editing || !profile) ? <Character canBack={!!profile} onDone={() => setEditing(false)} /> : <Home onCharacter={() => setEditing(true)} />)}
      {s && s.phase === 'lobby' && <LobbyWithProfile s={s} />}
      {s && inGame && <Game s={s} />}
      {s && s.phase === 'ended' && <End s={s} />}

      <Overlays s={s} />
    </div>
  );
}

function LobbyWithProfile({ s }: { s: GameState }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <Character canBack onDone={() => setEditing(false)} />;
  return <Lobby s={s} onEditProfile={() => setEditing(true)} />;
}

export function Game({ s, showReveal = true }: { s: GameState; showReveal?: boolean }) {
  const { geo, ready, makeReady } = useGame();
  const phase = s.phase === 'paused' ? s.pausedFrom ?? 'active' : s.phase;
  const headStart = phase === 'headstart';
  const [reveal, setReveal] = useState(false);
  const seen = useRef<string | null>(null);
  const key = `${s.code}:${s.settings.durationMin}:${s.players.length}`;

  // Show the role reveal once per game, right after it starts.
  useEffect(() => {
    if (showReveal && seen.current === null && (phase === 'headstart' || phase === 'active')) {
      seen.current = key;
      setReveal(true);
    }
  }, [phase, key, showReveal]);
  useEffect(() => { if (phase === 'lobby') seen.current = null; }, [phase]);

  const hideReveal = useCallback(() => setReveal(false), []);
  const me = s.you;
  let view;
  if (me.status === 'jailed') view = <JailedView s={s} />;
  else if (me.status === 'out') view = <SpectatorView s={s} />;
  else if (me.role === 'chaser') view = <ChaserView s={s} headStart={headStart} />;
  else view = <RunnerView s={s} headStart={headStart} />;

  return (
    <>
      {view}
      {reveal && <RoleReveal role={me.role} headStartSec={s.timers.headStartLeftSec} onDone={hideReveal} />}
      {s.phase === 'paused' && <Paused s={s} />}
      {me.isHost && <HostMenu s={s} />}
      {!ready && (
        <button className="sysbar" style={{ pointerEvents: 'auto', bottom: 'auto', top: 'calc(env(safe-area-inset-top) + 66px)', zIndex: 66 }} onClick={() => void makeReady()}>
          <div className="banner warn" style={{ justifyContent: 'center' }}>🔈 Tap to turn sound &amp; keep-awake back on</div>
        </button>
      )}
      {geo === 'denied' && <div className="sysbar"><div className="banner danger">📍 Location is off. Turn it on or the game can&apos;t track you.</div></div>}
    </>
  );
}

export function Paused({ s }: { s: GameState }) {
  const { send } = useGame();
  return (
    <div className="take dark" style={{ zIndex: 48 }}>
      <div className="big">Paused</div>
      <p className="mut">Game paused by host</p>
      {s.you.isHost && <button className="btn runner xl" onClick={() => send({ type: 'resume' })}>Resume</button>}
    </div>
  );
}

export function HostMenu({ s, initialOpen = false }: { s: GameState; initialOpen?: boolean }) {
  const { send } = useGame();
  const [open, setOpen] = useState(initialOpen);
  const paused = s.phase === 'paused';
  return (
    <>
      <button className="menu-btn" style={{ zIndex: 49 }} aria-label="Host menu" onClick={() => setOpen(true)}>⋯</button>
      {open && (
        <div className="sheet" style={{ zIndex: 52 }}>
          <div className="disp" style={{ fontSize: 34 }}>Host controls</div>
          <button className="btn" onClick={() => { send({ type: paused ? 'resume' : 'pause' }); setOpen(false); }}>{paused ? 'Resume' : 'Pause'}</button>
          <button className="btn danger" onClick={() => { if (confirm('End the game for everyone?')) { send({ type: 'end_game' }); setOpen(false); } }}>End game</button>
          {s.players.filter((p) => p.id !== s.you.id).map((p) => (
            <button key={p.id} className="player" onClick={() => { if (confirm(`Kick ${p.name}?`)) send({ type: 'kick', playerId: p.id }); }}>
              <b className="grow">{p.name}</b><span className="tag o">Kick</span>
            </button>
          ))}
          <button className="btn ghost" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </>
  );
}

export function Kicked({ onClose }: { onClose: () => void }) {
  return (
    <div className="scr"><div className="grow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
      <div className="disp" style={{ fontSize: 56, color: 'var(--danger)' }}>You were kicked</div><p className="mut">The host removed you from the game.</p></div>
    <button className="btn" onClick={onClose}>OK</button></div>
  );
}

export function Overlays({ s }: { s: GameState | null }) {
  const { toasts, flash, conn, geo, accuracy, clearFlash, replaced, ping } = useGame();
  const dismiss = useCallback(() => clearFlash(), [clearFlash]);
  const playing = !!s && s.phase !== 'lobby' && s.phase !== 'ended';
  return (
    <>
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
      {ping && <div key={ping.id} className={`ping ${ping.level}`} aria-hidden />}
      {flash?.kind === 'chasers' && (
        <div className="sysbar" style={{ top: 'calc(env(safe-area-inset-top) + 66px)', bottom: 'auto', zIndex: 66 }}>
          <div className="banner reveal" role="alert">{flash.text}</div>
        </div>
      )}
      {flash && flash.kind !== 'revealed' && flash.kind !== 'chasers' && (
        <div className={`take ${flash.kind === 'jailbreak' ? 'runner' : flash.kind === 'infected' ? 'chaser' : 'red'}`} style={{ zIndex: 70 }} onClick={dismiss} role="button">
          <div className="big" style={{ fontSize: 56 }}>{flash.text}</div>
        </div>
      )}
      {flash?.kind === 'revealed' && <div className="sysbar" style={{ top: 70, bottom: 'auto', zIndex: 65 }}><div className="banner danger" style={{ justifyContent: 'center' }}>📡 {flash.text}</div></div>}
      {replaced && (
        <div className="take dark" style={{ zIndex: 80 }}>
          <div className="big" style={{ fontSize: 44 }}>Open somewhere else</div>
          <p className="mut">You opened this game in another tab or window, so this one stopped. Use only one at a time.</p>
          <button className="btn runner" onClick={() => location.reload()}>Use this tab instead</button>
        </div>
      )}
      <div className="sysbar">
        {conn !== 'open' && s && !replaced && <div className="banner warn">📶 Reconnecting…</div>}
        {playing && geo === 'weak' && <div className="banner warn">GPS weak{accuracy ? ` (±${Math.round(accuracy)} m)` : ''}</div>}
      </div>
    </>
  );
}
