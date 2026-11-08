'use client';
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { PublicPlayer } from '@/lib/protocol';

export const Avatar = ({ p, size = '', crown }: { p: Pick<PublicPlayer, 'color' | 'avatar' | 'name'>; size?: '' | 'sm' | 'lg'; crown?: boolean }) => (
  <div className={`av ${size}`} style={{ '--c': p.color } as CSSProperties} aria-label={p.name}>
    {p.avatar || p.name[0]?.toUpperCase()}
    {crown && <span className="crown">👑</span>}
  </div>
);

export const Tag = ({ p }: { p: Pick<PublicPlayer, 'role' | 'status'> }) =>
  p.status === 'jailed' ? <span className="tag j">Jailed</span>
    : p.status === 'out' ? <span className="tag o">Out</span>
    : p.role === 'chaser' ? <span className="tag c">Chaser</span>
    : <span className="tag r">Runner</span>;

export const Switch = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
  <button role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} onClick={() => set(!on)} />
);

export const Seg = <T extends string>({ value, opts, set }: { value: T; opts: [T, string][]; set: (v: T) => void }) => (
  <div className="seg" role="radiogroup">
    {opts.map(([v, l]) => <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => set(v)}>{l}</button>)}
  </div>
);

export const Stepper = ({ value, min, max, set }: { value: number; min: number; max: number; set: (v: number) => void }) => (
  <div className="step">
    <button aria-label="less" onClick={() => set(Math.max(min, value - 1))}>−</button>
    <span>{value}</span>
    <button aria-label="more" onClick={() => set(Math.min(max, value + 1))}>+</button>
  </div>
);

export const Row = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div className="setrow"><span>{label}</span>{children}</div>
);

export function Slider({ label, value, min, max, step = 1, fmt, set, disabled }: {
  label: string; value: number; min: number; max: number; step?: number; fmt?: (v: number) => string; set: (v: number) => void; disabled?: boolean;
}) {
  const [local, setLocal] = useState<number | null>(null);
  const shown = local ?? value;
  const commit = () => { if (local != null) { set(local); setLocal(null); } };
  return (
    <div style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <div className="setrow" style={{ minHeight: 40 }}><span>{label}</span><span className="v">{fmt ? fmt(shown) : shown}</span></div>
      <input type="range" min={min} max={max} step={step} value={shown} aria-label={label}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={commit} onTouchEnd={commit} onKeyUp={commit} onBlur={commit} />
    </div>
  );
}

export const Ring = ({ value, max, text, color = 'var(--runner)' }: { value: number; max: number; text: string; color?: string }) => (
  <div className="ring" style={{ background: `conic-gradient(${color} ${Math.min(1, value / Math.max(1, max)) * 360}deg, var(--s3) 0)` }}><b>{text}</b></div>
);

export const Code = ({ code }: { code: string }) => (
  <div className="code big" aria-label={`Join code ${code}`}>{code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
);
