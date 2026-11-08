'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useGame } from '@/lib/game';
import type { GameState, LatLng } from '@/lib/protocol';
import { distM, fmtTime } from '@/lib/util';
import Map from './Map';
import { Avatar, Code, Row, Seg, Slider, Stepper, Switch, Tag } from './ui';

export type View = 'main' | 'settings' | 'zone';

export function Lobby({ s, onEditProfile, initialView = 'main' }: { s: GameState; onEditProfile?: () => void; initialView?: View }) {
  const { send, leave, ready, makeReady, geo, accuracy, error, clearError, profile, notify } = useGame();
  const [view, setView] = useState<View>(initialView);
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [tips, setTips] = useState(false);
  const host = s.you.isHost;
  const link = typeof location !== 'undefined' ? `${location.origin}/join/${s.code}` : '';
  const manual = s.settings.chasers.selection === 'host';

  useEffect(() => { if (showQr && !qr) QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#000', light: '#fff' } }).then(setQr).catch(() => {}); }, [showQr, qr, link]);

  if (view === 'settings') return <Settings s={s} back={() => setView('main')} openZone={() => setView('zone')} />;
  if (view === 'zone') return <ZoneEditor s={s} back={() => setView('main')} />;

  const nPlayers = s.players.length;
  const startBlock = !s.zone.center ? 'Draw the play zone first' : nPlayers < 2 ? 'Need at least 2 players' : null;
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: 'Manhunt', text: `Join my game: ${s.code}`, url: link }); else await navigator.clipboard.writeText(link); } catch {}
  };
  const st = s.settings;

  return (
    <div className="scr scroll">
      <div className="top"><span className="lbl">Join code</span><span className="row">{host && <span className="pill"><small>Host</small>You</span>}{onEditProfile && profile && <button className="pill" aria-label="Edit character" onClick={onEditProfile}>{profile.avatar} Edit</button>}</span></div>
      <Code code={s.code} />
      <div className="row">
        <button className="btn sm ghost" style={{ minHeight: 48, fontSize: 15 }} onClick={() => { navigator.clipboard?.writeText(link).then(() => notify('Link copied'), () => notify(link)); }}>Copy link</button>
        <button className="btn sm ghost" style={{ minHeight: 48, fontSize: 15 }} onClick={share}>Share</button>
        <button className="btn sm ghost" style={{ minHeight: 48, fontSize: 15 }} onClick={() => setShowQr((v) => !v)}>QR</button>
      </div>
      {showQr && qr && <div className="center"><img src={qr} alt="QR code to join" width={200} height={200} style={{ borderRadius: 12 }} /></div>}

      {!ready ? <ReadyCard onReady={makeReady} /> : (
        <>
          {geo === 'denied' && <div className="banner danger">📍 Location is off. Enable it in your browser's site settings.</div>}
          {geo === 'weak' && <div className="banner warn">GPS weak{accuracy ? ` (±${Math.round(accuracy)} m)` : ''}. Move to open sky.</div>}
          <div className="hint">✅ Ready · keep this screen open and turn brightness down</div>
        </>
      )}
      <button className="btn sm ghost" style={{ minHeight: 48, fontSize: 15 }} onClick={() => setTips(true)}>🔒 Lock your phone into the game</button>
      {tips && <LockTips onClose={() => setTips(false)} />}

      {s.zone.center ? <div style={{ height: 150, display: 'flex', flex: 'none' }}><Map zone={s.zone} finalRadiusM={s.zone.nextRadiusM} jail={s.jail} fit follow={null} markers={me(s)} /></div>
        : <div className="card center mut">{host ? 'No play zone yet' : 'Host is setting up the play zone…'}</div>}

      <div className="row mut wrap" style={{ fontSize: 13, justifyContent: 'space-between' }}>
        <span>⏱ {st.durationMin} min</span>
        <span>🏃 {st.headStart.enabled ? fmtTime(st.headStart.seconds) : 'No head start'}</span>
        <span>🎯 {st.runnerView === 'map' ? 'Map' : 'Blind'}</span>
        <span>⛓ {st.caughtMode === 'jail' ? 'Jail' : st.caughtMode === 'infection' ? 'Infection' : 'Out'}</span>
      </div>

      <div className="lbl">Players · {nPlayers}</div>
      {s.players.map((p) => {
        const canPick = host && manual;
        const Wrapper = host ? 'button' : 'div';
        return (
          <Wrapper key={p.id} className={`player ${p.connected ? '' : 'off'}`}
            onClick={host ? () => (canPick ? send({ type: 'set_role', playerId: p.id, role: p.role === 'chaser' ? 'runner' : 'chaser' }) : undefined) : undefined}>
            <Avatar p={p} crown={p.isHost} />
            <b className="grow">{p.name}{p.id === s.you.id ? ' (you)' : ''}</b>
            {!p.connected && <span className="tag o">Offline</span>}
            {manual && <Tag p={{ role: p.role, status: 'free' }} />}
            {host && p.id !== s.you.id && <PlayerMenu id={p.id} name={p.name} />}
          </Wrapper>
        );
      })}
      <p className="hint">{manual ? (host ? 'Tap a player to toggle chaser / runner' : 'Host is picking chasers') : 'Chasers will be picked randomly'}</p>

      {error && <div className="banner danger" onClick={clearError}>{error}</div>}
      <div className="grow" />
      {host ? (
        <>
          <div className="row"><button className="btn sm" onClick={() => setView('settings')}>Settings</button><button className="btn sm" style={{ flexGrow: 1.4 }} onClick={() => setView('zone')}>{s.zone.center ? 'Edit zone' : 'Draw zone'}</button></div>
          <button className="btn runner" disabled={!!startBlock} onClick={() => send({ type: 'start_game' })}>Start game</button>
          {startBlock && <p className="hint">{startBlock}</p>}
        </>
      ) : (
        <>
          <div className="card center"><span className="pulse">Waiting for host to start…</span></div>
          <p className="hint">Signed in as {profile?.name}</p>
        </>
      )}
      <button className="btn ghost" onClick={leave}>Leave</button>
    </div>
  );
}

function me(s: GameState) {
  const l = s.you.location; if (!l) return [];
  return [{ id: 'you', lat: l.lat, lng: l.lng, color: 'var(--runner)', kind: 'you' as const }];
}

function PlayerMenu({ id, name }: { id: string; name: string }) {
  const { send } = useGame();
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <span role="button" aria-label={`Options for ${name}`} style={{ padding: '10px 6px', fontSize: 20 }} onClick={() => setOpen((o) => !o)}>⋯</span>
      {open && (
        <span style={{ position: 'absolute', right: 0, top: 36, zIndex: 10, background: 'var(--s3)', borderRadius: 14, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, width: 150, border: '1px solid var(--line)' }}>
          <span role="button" className="btn sm" style={{ fontSize: 15 }} onClick={() => { send({ type: 'transfer_host', playerId: id }); setOpen(false); }}>Make host</span>
          <span role="button" className="btn sm danger" style={{ fontSize: 15 }} onClick={() => { if (confirm(`Kick ${name}?`)) send({ type: 'kick', playerId: id }); setOpen(false); }}>Kick</span>
        </span>
      )}
    </span>
  );
}

/** How to stop the phone from leaving the game: Guided Access (iPhone) / App pinning (Android). */
export function LockTips({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet" style={{ zIndex: 60, justifyContent: 'flex-start', overflowY: 'auto' }}>
      <div className="disp" style={{ fontSize: 34 }}>Keep your phone in the game</div>
      <p className="mut" style={{ fontSize: 14 }}>A website can&apos;t share your location while your phone is locked or Safari is closed. If a runner&apos;s phone goes dark for 30 seconds, chasers see their last spot. Lock the game on screen so it can&apos;t happen by accident:</p>
      <div className="card tips">
        <b>iPhone: Guided Access</b>
        <ol>
          <li>Settings → Accessibility → <b>Guided Access</b> → turn it on.</li>
          <li>On that screen, set <b>Display Auto-Lock</b> to <b>Never</b>.</li>
          <li>Back here, <b>triple-click the side button</b>, tap <b>Options</b>, turn off <b>Side Button</b>, then tap <b>Start</b>. The first time, it asks you to set a passcode.</li>
          <li>After the game: triple-click the side button again to exit.</li>
        </ol>
      </div>
      <div className="card tips">
        <b>Android: App pinning</b>
        <ol>
          <li>Settings → search <b>&ldquo;pin&rdquo;</b> → turn on <b>App pinning</b> (the name varies by phone).</li>
          <li>Open recent apps, tap the Chrome icon above this game, tap <b>Pin</b>.</li>
          <li>After the game: hold Back + Overview, or swipe up and hold, to unpin.</li>
        </ol>
      </div>
      <p className="hint">Also turn brightness down, and bring a battery pack for long games.</p>
      <button className="btn runner" onClick={onClose}>Got it</button>
    </div>
  );
}

function ReadyCard({ onReady }: { onReady: () => Promise<void> }) {
  return (
    <div className="card" style={{ flex: 'none' }}>
      <div className="disp" style={{ fontSize: 28, marginBottom: 6 }}>Get ready</div>
      <p className="mut" style={{ fontSize: 13, marginBottom: 10 }}>One tap turns on location (so the game can referee), sound and keep-screen-on.</p>
      <button className="btn runner" style={{ minHeight: 72, fontSize: 28 }} onClick={() => void onReady()}>I&apos;m ready</button>
    </div>
  );
}

/* ---------------- Settings ---------------- */
function Settings({ s, back, openZone }: { s: GameState; back: () => void; openZone: () => void }) {
  const { send, error, clearError } = useGame();
  const st = s.settings;
  const host = s.you.isHost;
  const up = (p: Record<string, unknown>) => host && send({ type: 'update_settings', settings: p });
  const dis = !host;
  const [adv, setAdv] = useState(false);
  const min = (v: number) => `${v} min`;
  const sec = (v: number) => (v >= 60 ? fmtTime(v) : `${v} s`);
  const steps = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

  return (
    <div className="scr scroll" style={dis ? { pointerEvents: 'auto' } : undefined}>
      <div className="top"><span className="disp" style={{ fontSize: 36 }}>Settings</span><button className="pill" onClick={back}>Done</button></div>
      {dis && <div className="banner info">Only the host can change settings</div>}
      {error && <div className="banner danger" onClick={clearError}>{error}</div>}
      <fieldset disabled={dis} style={{ border: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14, opacity: dis ? 0.7 : 1 }}>
        <div className="lbl">Players</div>
        <div className="card">
          <Row label="Chasers"><Stepper value={st.chasers.count} min={1} max={Math.max(1, s.players.length - 1)} set={(v) => up({ chasers: { count: v } })} /></Row>
          <Seg value={st.chasers.selection} opts={[['random', 'Random'], ['host', 'Host picks']]} set={(v) => up({ chasers: { selection: v } })} />
        </div>

        <div className="lbl">Time</div>
        <div className="card">
          <Row label="Duration"><span className="v">{min(st.durationMin)}</span></Row>
          <div className="seg wrap" style={{ flexWrap: 'wrap' }}>
            {steps.map((m) => <button key={m} className={st.durationMin === m ? 'on' : ''} style={{ flex: '1 0 18%' }} onClick={() => up({ durationMin: m })}>{m >= 60 ? `${m / 60}h` : `${m}m`}</button>)}
          </div>
          <Row label="Head start"><Switch on={st.headStart.enabled} set={(v) => up({ headStart: { enabled: v } })} /></Row>
          {st.headStart.enabled && <Slider label="Length" value={st.headStart.seconds} min={10} max={1800} step={10} fmt={sec} set={(v) => up({ headStart: { seconds: v } })} />}
        </div>

        <div className="lbl">Location updates (what chasers see)</div>
        <div className="card">
          <Seg value={st.locationUpdates.mode} opts={[['interval', 'Every X'], ['live', 'Live'], ['off', 'Off']]} set={(v) => up({ locationUpdates: { mode: v } })} />
          {st.locationUpdates.mode === 'interval' && <Slider label="Update every" value={st.locationUpdates.intervalSec} min={10} max={1800} step={10} fmt={sec} set={(v) => up({ locationUpdates: { intervalSec: v } })} />}
          {st.locationUpdates.mode === 'interval' && (
            <>
              <Row label="Fuzzy updates"><Switch on={st.fuzzy.enabled} set={(v) => up({ fuzzy: { enabled: v } })} /></Row>
              {st.fuzzy.enabled && <Slider label="Circle size" value={st.fuzzy.radiusM} min={10} max={500} step={10} fmt={(v) => `${v} m`} set={(v) => up({ fuzzy: { radiusM: v } })} />}
            </>
          )}
          <Row label="Final countdown"><Switch on={st.finalCountdown.enabled} set={(v) => up({ finalCountdown: { enabled: v } })} /></Row>
          {st.finalCountdown.enabled && (
            <>
              <Slider label="Starts with" value={st.finalCountdown.lastMin} min={1} max={60} fmt={(v) => `${v} min left`} set={(v) => up({ finalCountdown: { lastMin: v } })} />
              <Slider label="Updates every" value={st.finalCountdown.intervalSec} min={5} max={600} step={5} fmt={sec} set={(v) => up({ finalCountdown: { intervalSec: v } })} />
            </>
          )}
          <Row label="Anti-camping"><Switch on={st.antiCamping.enabled} set={(v) => up({ antiCamping: { enabled: v } })} /></Row>
          {st.antiCamping.enabled && <Slider label="If nobody caught for" value={st.antiCamping.afterMin} min={1} max={60} fmt={min} set={(v) => up({ antiCamping: { afterMin: v } })} />}
        </div>

        <div className="lbl">Runners see</div>
        <Seg value={st.runnerView} opts={[['map', 'Their map'], ['none', 'Nothing']]} set={(v) => up({ runnerView: v })} />
        <div className="card"><Row label="Heartbeat warning"><Switch on={st.heartbeat.enabled} set={(v) => up({ heartbeat: { enabled: v } })} /></Row></div>

        <div className="lbl">Who can see chasers</div>
        <div className="card">
          <Row label={<span>Runners see chasers<br /><small className="mut">Live, on the runner&apos;s map{st.runnerView === 'none' ? ' (needs “Their map”)' : ''}</small></span>}>
            <Switch on={st.visibility.runnersSeeChasers} set={(v) => up({ visibility: { runnersSeeChasers: v }, ...(v && st.runnerView === 'none' ? { runnerView: 'map' } : {}) })} />
          </Row>
          <Row label={<span>Chasers see each other<br /><small className="mut">Teammates on the chaser map</small></span>}>
            <Switch on={st.visibility.chasersSeeChasers} set={(v) => up({ visibility: { chasersSeeChasers: v } })} />
          </Row>
        </div>

        <div className="lbl">Play zone</div>
        <div className="card">
          <Row label="Zone"><button className="pill" onClick={openZone}>{st.zone.center ? `${st.zone.radiusM} m · edit` : 'Draw'}</button></Row>
          <Row label="Shrinking zone"><Switch on={st.shrinkingZone.enabled} set={(v) => up({ shrinkingZone: { enabled: v } })} /></Row>
          {st.shrinkingZone.enabled && (() => {
            const sz = st.shrinkingZone;
            const times = sz.style === 'stages' ? Array.from({ length: sz.stages }, (_, i) => sz.startAfterMin + i * sz.intervalMin) : [];
            const late = times.filter((x) => x >= st.durationMin).length;
            return (
              <>
                <Seg value={sz.style} opts={[['stages', 'In stages'], ['smooth', 'Continuously']]} set={(v) => up({ shrinkingZone: { style: v } })} />
                <Slider label={sz.style === 'stages' ? 'First shrink at' : 'Starts shrinking at'} value={Math.min(sz.startAfterMin, st.durationMin)} min={0} max={st.durationMin} fmt={(v) => `${v} min`} set={(v) => up({ shrinkingZone: { startAfterMin: v } })} />
                {sz.style === 'stages' && (
                  <>
                    <Row label="Number of shrinks"><Stepper value={sz.stages} min={1} max={10} set={(v) => up({ shrinkingZone: { stages: v } })} /></Row>
                    <Slider label="Time between shrinks" value={sz.intervalMin} min={1} max={60} fmt={min} set={(v) => up({ shrinkingZone: { intervalMin: v } })} />
                    <Slider label="Each shrink takes" value={Math.min(sz.shrinkSec, sz.intervalMin * 60)} min={10} max={Math.min(600, sz.intervalMin * 60)} step={10} fmt={sec} set={(v) => up({ shrinkingZone: { shrinkSec: v } })} />
                  </>
                )}
                <Slider label="Final size" value={Math.min(sz.finalRadiusM, st.zone.radiusM)} min={10} max={Math.max(20, st.zone.radiusM)} fmt={(v) => `${v} m`} set={(v) => up({ shrinkingZone: { finalRadiusM: v } })} />
                <p className="hint" style={{ textAlign: 'left', paddingBottom: 6 }}>
                  {sz.style === 'stages'
                    ? `Holds still, then shrinks at ${times.map((x) => `${x}`).join(', ')} min into a ${st.durationMin}-min game, ending at ${Math.min(sz.finalRadiusM, st.zone.radiusM)} m.`
                    : `Shrinks steadily from ${sz.startAfterMin} min until the end of the game.`}
                  {late > 0 && <b style={{ color: 'var(--warn)' }}> {late} shrink{late > 1 ? 's' : ''} would come after the game ends.</b>}
                </p>
              </>
            );
          })()}
        </div>

        <div className="lbl">When a runner is caught</div>
        <div className="card">
          <Row label="Infection (becomes chaser)"><Switch on={st.caughtMode === 'infection'} set={(v) => up({ caughtMode: v ? 'infection' : 'out' })} /></Row>
          <Row label="Jailbreak"><Switch on={st.caughtMode === 'jail'} set={(v) => up({ caughtMode: v ? 'jail' : 'out' })} /></Row>
          {st.caughtMode === 'jail' && (
            <>
              <Row label="Jail location"><button className="pill" onClick={openZone}>{st.jail.location ? 'Custom pin' : 'Zone center'}</button></Row>
              <Slider label="Jail size" value={st.jail.radiusM} min={5} max={100} fmt={(v) => `${v} m`} set={(v) => up({ jail: { radiusM: v } })} />
              <Slider label="Seconds to free" value={st.jail.holdSec} min={1} max={60} fmt={(v) => `${v} s`} set={(v) => up({ jail: { holdSec: v } })} />
              <Slider label="Immunity after" value={st.jail.immunitySec} min={0} max={120} fmt={(v) => `${v} s`} set={(v) => up({ jail: { immunitySec: v } })} />
            </>
          )}
        </div>

        <div className="card"><Row label="Sounds & announcements"><Switch on={st.announcements} set={(v) => up({ announcements: v })} /></Row></div>

        <button className="card setrow" type="button" onClick={() => setAdv((a) => !a)}><span>Advanced {adv ? '▴' : '▾'}</span><span className="mut">Catch distance, grace…</span></button>
        {adv && (
          <div className="card">
            <Slider label="Catch distance" value={st.catching.radiusM} min={5} max={100} fmt={(v) => `${v} m`} set={(v) => up({ catching: { radiusM: v } })} />
            <Slider label="Auto-confirm catch after" value={st.catching.autoAcceptSec} min={5} max={120} fmt={(v) => `${v} s`} set={(v) => up({ catching: { autoAcceptSec: v } })} />
            <Slider label="Out-of-zone grace" value={st.outOfZone.graceSec} min={0} max={300} fmt={(v) => `${v} s`} set={(v) => up({ outOfZone: { graceSec: v } })} />
            {(['Far', 'Close', 'Very close'] as const).map((l, i) => (
              <Slider key={l} label={`Heartbeat: ${l}`} value={st.heartbeat.distancesM[i]} min={5} max={200} fmt={(v) => `${v} m`}
                set={(v) => { const d = [...st.heartbeat.distancesM] as [number, number, number]; d[i] = v; up({ heartbeat: { distancesM: d } }); }} />
            ))}
          </div>
        )}
      </fieldset>
      <button className="btn runner" onClick={back}>Done</button>
    </div>
  );
}

/* ---------------- Zone editor ---------------- */
interface Place { name: string; detail: string; lat: number; lng: number }
const eastOf = (c: LatLng, m: number): LatLng => ({ lat: c.lat, lng: c.lng + m / (111320 * Math.cos((c.lat * Math.PI) / 180)) });

function ZoneEditor({ s, back }: { s: GameState; back: () => void }) {
  const { send, error, clearError } = useGame();
  const st = s.settings;
  const [mode, setMode] = useState<'zone' | 'jail'>('zone');
  const [radius, setRadius] = useState(st.zone.radiusM);
  const [center, setCenter] = useState<LatLng | null>(st.zone.center);
  const [jail, setJail] = useState<LatLng | null>(st.jail.location);
  const [focus, setFocus] = useState<{ p: LatLng; key: number } | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const host = s.you.isHost;
  const jailOn = st.caughtMode === 'jail';

  const moveTo = (c: LatLng) => { setCenter(c); setFocus({ p: c, key: Date.now() }); };
  const gps = () => navigator.geolocation?.getCurrentPosition((p) => moveTo({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { enableHighAccuracy: true, timeout: 8000 });
  // First time only: start the zone where you are. You can move it anywhere after.
  useEffect(() => { if (!center && s.you.location) setCenter({ lat: s.you.location.lat, lng: s.you.location.lng }); }, [center, s.you.location]);
  useEffect(() => { if (!st.zone.center && host) gps(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Place search (OpenStreetMap). Runs only when you press Search, never while typing.
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      const near = center ? `&viewbox=${center.lng - 1},${center.lat + 1},${center.lng + 1},${center.lat - 1}` : '';
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6${near}&q=${encodeURIComponent(q.trim())}`);
      const j = (await r.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      setResults(j.map((x) => { const [name, ...rest] = x.display_name.split(', '); return { name, detail: rest.slice(0, 3).join(', '), lat: Number(x.lat), lng: Number(x.lon) }; }));
    } catch { setResults([]); } finally { setSearching(false); }
  };

  const pick = (p: LatLng) => { if (!host) return; setResults(null); if (mode === 'zone') setCenter(p); else setJail(p); };
  const resize = (p: LatLng) => { if (center) setRadius(Math.min(20000, Math.max(20, Math.round(distM(center, p) / 5) * 5))); };
  const save = () => {
    if (host && center) send({ type: 'update_settings', settings: { zone: { center, radiusM: radius }, ...(jailOn && jail ? { jail: { location: jail } } : {}) } });
    back();
  };
  const you = s.you.location;
  const youInside = !!(you && center && distM(you, center) <= radius);

  return (
    <div className="scr">
      <div className="top"><span className="disp" style={{ fontSize: 30 }}>Play zone</span><span className="pill">{radius >= 1000 ? `${(radius / 1000).toFixed(2)} km` : `${radius} m`}</span></div>
      {!host && <div className="banner info">Only the host can edit the zone</div>}
      {host && (
        <form className="search" onSubmit={search}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a park, school, street…" aria-label="Search for a place" enterKeyHint="search" />
          <button className="btn sm" style={{ width: 'auto', padding: '0 16px', minHeight: 50 }} disabled={searching}>{searching ? '…' : 'Search'}</button>
          {results && (
            <div className="results">
              {results.length === 0 ? <span className="mut" style={{ padding: 10 }}>No places found</span> : results.map((r, i) => (
                <button type="button" key={i} onClick={() => { moveTo({ lat: r.lat, lng: r.lng }); setResults(null); setQ(r.name); }}>{r.name}<small>{r.detail}</small></button>
              ))}
            </div>
          )}
        </form>
      )}
      <Map zone={center ? { center, radiusM: radius } : null} finalRadiusM={st.shrinkingZone.enabled ? Math.min(st.shrinkingZone.finalRadiusM, radius) : null}
        jail={jailOn ? { location: jail ?? center ?? { lat: 0, lng: 0 }, radiusM: st.jail.radiusM } : null}
        fit={!!center} focus={focus} draggable={mode === 'zone' ? center : jail} onPick={pick}
        radiusHandle={host && mode === 'zone' && center ? eastOf(center, radius) : null} onRadiusDrag={resize} markers={me(s)} />
      <div className="mut hint">{mode === 'zone'
        ? <>Tap <b>anywhere</b> to move the zone. It doesn&apos;t have to be around you. Drag the ring on the edge to resize.{you && center && !youInside && <><br />You&apos;re currently outside the zone. That&apos;s fine if you&apos;re walking there.</>}</>
        : 'Tap the map to drop the jail pin.'}</div>
      <Slider label="Size" value={Math.min(radius, Math.max(3000, radius))} min={20} max={Math.max(3000, radius)} step={10} fmt={(v) => (v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${v} m`)} set={setRadius} disabled={!host} />
      {error && <div className="banner danger" onClick={clearError}>{error}</div>}
      <div className="row">
        <button className="btn sm" onClick={gps}>📍 Center on me</button>
        {jailOn && <button className="btn sm" onClick={() => setMode(mode === 'zone' ? 'jail' : 'zone')}>{mode === 'zone' ? '⛓ Place jail' : '◎ Edit zone'}</button>}
      </div>
      <button className="btn runner" disabled={!center && host} onClick={save}>{host ? 'Save zone' : 'Back'}</button>
    </div>
  );
}
