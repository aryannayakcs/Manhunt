'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useGame } from '@/lib/game';
import type { GameState, LatLng } from '@/lib/protocol';
import { fmtTime } from '@/lib/util';
import Map from './Map';
import { Avatar, Code, Row, Seg, Slider, Stepper, Switch, Tag } from './ui';

type View = 'main' | 'settings' | 'zone';

export function Lobby({ s }: { s: GameState }) {
  const { send, leave, ready, makeReady, geo, accuracy, error, clearError, profile } = useGame();
  const [view, setView] = useState<View>('main');
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
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
      <div className="top"><span className="lbl">Join code</span>{host && <span className="pill"><small>Host</small>You</span>}</div>
      <Code code={s.code} />
      <div className="row">
        <button className="btn sm ghost" style={{ minHeight: 48, fontSize: 15 }} onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
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

      {s.zone.center ? <div style={{ height: 150, display: 'flex', flex: 'none' }}><Map zone={s.zone} finalRadiusM={s.zone.finalRadiusM} jail={s.jail} fit follow={null} markers={me(s)} /></div>
        : <div className="card center mut">{host ? 'No play zone yet' : 'Host is setting up the play zone…'}</div>}

      <div className="row mut wrap" style={{ fontSize: 13, justifyContent: 'space-between' }}>
        <span>⏱ {st.durationMin} min</span>
        <span>🏃 {st.headStart.enabled ? fmtTime(st.headStart.seconds) : 'No head start'}</span>
        <span>🎯 {st.runnerView === 'map' ? 'Map' : st.runnerView === 'compass' ? 'Compass' : 'Blind'}</span>
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
          <div className="row"><button className="btn sm" style={{ width: '40%' }} onClick={() => setView('settings')}>Settings</button><button className="btn sm" style={{ width: '60%' }} onClick={() => setView('zone')}>Draw zone</button></div>
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

function ReadyCard({ onReady }: { onReady: () => Promise<void> }) {
  return (
    <div className="card" style={{ flex: 'none' }}>
      <div className="disp" style={{ fontSize: 28, marginBottom: 6 }}>Get ready</div>
      <p className="mut" style={{ fontSize: 13, marginBottom: 10 }}>One tap turns on location (so the game can referee), sound, keep-awake and compass.</p>
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
        <Seg value={st.runnerView} opts={[['map', 'Map'], ['compass', 'Compass'], ['none', 'Nothing']]} set={(v) => up({ runnerView: v })} />
        <div className="card"><Row label="Heartbeat warning"><Switch on={st.heartbeat.enabled} set={(v) => up({ heartbeat: { enabled: v } })} /></Row></div>

        <div className="lbl">Play zone</div>
        <div className="card">
          <Row label="Zone"><button className="pill" onClick={openZone}>{st.zone.center ? `${st.zone.radiusM} m · edit` : 'Draw'}</button></Row>
          <Row label="Shrinking zone"><Switch on={st.shrinkingZone.enabled} set={(v) => up({ shrinkingZone: { enabled: v } })} /></Row>
          {st.shrinkingZone.enabled && (
            <>
              <Slider label="Starts after" value={st.shrinkingZone.startAfterMin} min={0} max={180} fmt={min} set={(v) => up({ shrinkingZone: { startAfterMin: v } })} />
              <Slider label="Final size" value={Math.min(st.shrinkingZone.finalRadiusM, st.zone.radiusM)} min={10} max={Math.max(20, st.zone.radiusM)} fmt={(v) => `${v} m`} set={(v) => up({ shrinkingZone: { finalRadiusM: v } })} />
            </>
          )}
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
function ZoneEditor({ s, back }: { s: GameState; back: () => void }) {
  const { send, error, clearError } = useGame();
  const st = s.settings;
  const [mode, setMode] = useState<'zone' | 'jail'>('zone');
  const [radius, setRadius] = useState(st.zone.radiusM);
  const [center, setCenter] = useState<LatLng | null>(st.zone.center);
  const [jail, setJail] = useState<LatLng | null>(st.jail.location);
  const host = s.you.isHost;
  const jailOn = st.caughtMode === 'jail';

  const gps = () => navigator.geolocation?.getCurrentPosition((p) => { const c = { lat: p.coords.latitude, lng: p.coords.longitude }; setCenter(c); }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
  useEffect(() => { if (!center && s.you.location) setCenter({ lat: s.you.location.lat, lng: s.you.location.lng }); }, [center, s.you.location]);

  const pick = (p: LatLng) => { if (!host) return; if (mode === 'zone') setCenter(p); else setJail(p); };
  const save = () => {
    if (host && center) send({ type: 'update_settings', settings: { zone: { center, radiusM: radius }, ...(jailOn && jail ? { jail: { location: jail } } : {}) } });
    back();
  };

  return (
    <div className="scr">
      <div className="top"><span className="disp" style={{ fontSize: 30 }}>Play zone</span><span className="pill">{radius} m</span></div>
      {!host && <div className="banner info">Only the host can edit the zone</div>}
      <Map zone={center ? { center, radiusM: radius } : null} finalRadiusM={st.shrinkingZone.enabled ? Math.min(st.shrinkingZone.finalRadiusM, radius) : null}
        jail={jailOn ? { location: jail ?? center ?? { lat: 0, lng: 0 }, radiusM: st.jail.radiusM } : null}
        fit={!!center} draggable={mode === 'zone' ? center : jail} onPick={pick} markers={me(s)} />
      <div className="mut hint">{mode === 'zone' ? 'Tap the map or drag the handle to place the zone' : 'Tap the map to drop the jail pin'}</div>
      <Slider label="Radius" value={radius} min={20} max={2000} step={10} fmt={(v) => `${v} m`} set={setRadius} disabled={!host} />
      {error && <div className="banner danger" onClick={clearError}>{error}</div>}
      <div className="row">
        <button className="btn sm" onClick={gps}>📍 My location</button>
        {jailOn && <button className="btn sm" onClick={() => setMode(mode === 'zone' ? 'jail' : 'zone')}>{mode === 'zone' ? '⛓ Jail pin' : '◎ Zone'}</button>}
      </div>
      <button className="btn runner" disabled={!center && host} onClick={save}>{host ? 'Save zone' : 'Back'}</button>
    </div>
  );
}
