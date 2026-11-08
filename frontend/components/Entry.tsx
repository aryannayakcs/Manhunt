'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useGame } from '@/lib/game';
import { AVATARS, COLORS } from '@/lib/protocol';
import { Avatar } from './ui';

const LETTERS = /[A-HJ-NP-Z]/g; // no I or O

export function Home({ onCharacter }: { onCharacter: () => void }) {
  const { profile, createGame, joinGame, error, clearError, conn, waking, pendingCode } = useGame();
  const [code, setCode] = useState('');
  const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { if (pendingCode) setCode(pendingCode); }, [pendingCode]);
  const online = conn === 'open';
  const ok = code.length === 4 && online;

  return (
    <div className="scr">
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
        <div className="lbl" style={{ color: 'var(--chaser)' }}>● Real-life tag. After dark.</div>
        <div className="disp" style={{ fontSize: 96 }}>Man<br />hunt</div>
        <p className="mut" style={{ maxWidth: 260 }}>Hide. Hunt. Your phone is the referee.</p>
      </div>

      {profile && (
        <button className="player" onClick={onCharacter} aria-label="Edit character">
          <Avatar p={profile} /><b className="grow">{profile.name}</b><span className="mut" style={{ fontSize: 12 }}>Edit</span>
        </button>
      )}
      {waking && conn !== 'open' && <div className="banner warn">⏳ Waking up the server… up to a minute on first connect</div>}
      {conn === 'closed' && !waking && <div className="banner warn">📶 Connecting…</div>}
      {error && <div className="banner danger" onClick={clearError}>{error}</div>}

      <div className="lbl center">Join with a code</div>
      <div className="code" onClick={() => inp.current?.focus()}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i === code.length ? 'on' : ''} style={!code[i] ? { color: 'var(--tx3)' } : undefined}>{code[i] ?? '_'}</span>
        ))}
        <input ref={inp} value={code} maxLength={4} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} aria-label="Game code"
          onChange={(e) => { clearError(); setCode((e.target.value.toUpperCase().match(LETTERS) ?? []).join('').slice(0, 4)); }} />
      </div>
      <button className="btn runner" disabled={!ok} onClick={() => (profile ? joinGame(code) : onCharacter())}>Join game</button>
      <button className="btn" disabled={!online} onClick={() => (profile ? createGame() : onCharacter())}>Create game</button>
    </div>
  );
}

export function Character({ onDone, canBack }: { onDone: () => void; canBack: boolean }) {
  const { profile, setProfile } = useGame();
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState(profile?.color ?? COLORS[2]);
  const [avatar, setAvatar] = useState(profile?.avatar ?? AVATARS[0]);
  return (
    <div className="scr scroll">
      <div className="disp" style={{ fontSize: 40 }}>Who are you?</div>
      <div className="center"><Avatar p={{ name: name || '?', color, avatar }} size="lg" /></div>
      <input className="textin" placeholder="Your name" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
      <div className="lbl">Color</div>
      <div className="swatches">
        {COLORS.map((c) => <button key={c} aria-label={`color ${c}`} className={c === color ? 'on' : ''} style={{ '--c': c } as CSSProperties} onClick={() => setColor(c)} />)}
      </div>
      <div className="lbl">Avatar</div>
      <div className="avs">
        {AVATARS.map((a) => <button key={a} className={a === avatar ? 'on' : ''} onClick={() => setAvatar(a)}>{a}</button>)}
      </div>
      <div className="grow" />
      <button className="btn runner" disabled={!name.trim()} onClick={() => { setProfile({ name: name.trim(), color, avatar }); onDone(); }}>Continue</button>
      {canBack && <button className="btn ghost" onClick={onDone}>Cancel</button>}
    </div>
  );
}
