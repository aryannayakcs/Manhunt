'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ClientMessage, EventName, GameState, ServerMessage } from './protocol';
import { lsDel, lsGet, lsSet } from './util';
import { buzz, sfx, setSoundEnabled, speak, unlockAudio } from './sound';

export interface Profile { name: string; color: string; avatar: string }
interface Session { code: string; playerId: string; token: string }
export interface Toast { id: number; text: string; kind: 'info' | 'warn' | 'danger' }
export interface Flash { id: number; kind: 'revealed' | 'chasers' | 'jailbreak' | 'caught' | 'infected' | 'go' | 'zone_out' | 'back'; text: string }
/** A short screen-edge flash + vibration for any game event; level = how important. */
export interface Ping { id: number; level: 'big' | 'mid' | 'low' }
export type Geo = 'idle' | 'ok' | 'weak' | 'denied';

export interface Ctx {
  conn: 'connecting' | 'open' | 'closed';
  waking: boolean;
  state: GameState | null;
  profile: Profile | null;
  setProfile: (p: Profile) => void;
  send: (m: ClientMessage) => void;
  createGame: () => void;
  joinGame: (code: string) => void;
  leave: () => void;
  error: string | null;
  clearError: () => void;
  toasts: Toast[];
  flash: Flash | null;
  clearFlash: () => void;
  geo: Geo;
  accuracy: number | null;
  ready: boolean;
  makeReady: () => Promise<void>;
  kicked: boolean;
  clearKicked: () => void;
  pendingCode: string | null;
  notify: (text: string, kind?: Toast['kind']) => void;
  /** This tab was replaced by the same player opening the game somewhere else. */
  replaced: boolean;
  ping: Ping | null;
}

export const GameCtx = createContext<Ctx>(null as unknown as Ctx);
export const useGame = () => useContext(GameCtx);

function serverUrl(): string {
  // ?server=wss://... overrides the server (remembered on this phone) — handy for testing.
  try {
    const q = new URLSearchParams(location.search).get('server');
    if (q === 'default') localStorage.removeItem('serverUrl');
    else if (q && /^wss?:\/\//.test(q)) localStorage.setItem('serverUrl', q);
    const saved = localStorage.getItem('serverUrl');
    if (saved) return saved;
  } catch {}
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:8080/ws`;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [conn, setConn] = useState<Ctx['conn']>('connecting');
  const [waking, setWaking] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [profile, setProfileS] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [geo, setGeo] = useState<Geo>('idle');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [kicked, setKicked] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const [pingState, setPing] = useState<Ping | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const idc = useRef(1);
  const watchId = useRef<number | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const lastSent = useRef(0);
  const wantRejoin = useRef(true);

  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { setError(null); }, [state?.phase]);
  useEffect(() => { setSoundEnabled(state?.settings.announcements ?? true); }, [state?.settings.announcements]);

  useEffect(() => {
    const p = lsGet<Profile>('profile');
    if (p) { setProfileS(p); profileRef.current = p; }
    sessionRef.current = lsGet<Session>('session');
  }, []);

  const setProfile = useCallback((p: Profile) => {
    setProfileS(p); profileRef.current = p; lsSet('profile', p);
    if (stateRef.current) ws.current?.send(JSON.stringify({ type: 'update_profile', ...p }));
  }, []);

  const send = useCallback((m: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m));
  }, []);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = idc.current++;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const doFlash = useCallback((kind: Flash['kind'], text: string, ms = 3000) => {
    const id = idc.current++;
    setFlash({ id, kind, text });
    setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), ms);
  }, []);

  const PATTERN = { big: [300, 100, 300, 100, 300], mid: [180, 80, 180], low: [60] } as const;
  const ping = useCallback((level: Ping['level']) => {
    const id = idc.current++;
    setPing({ id, level });
    buzz([...PATTERN[level]]);
    setTimeout(() => setPing((p) => (p?.id === id ? null : p)), 900);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (id: unknown) => (id === stateRef.current?.you.id ? 'you' : stateRef.current?.players.find((p) => p.id === id)?.name ?? 'Someone');
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  const onEvent = useCallback((ev: EventName, d: Record<string, unknown> = {}) => {
    const st = stateRef.current;
    const me = st?.you;
    const say = (t: string) => speak(t);
    switch (ev) {
      case 'player_joined': ping('low'); toast(`${d.name ?? nameOf(d.playerId)} joined`); break;
      case 'player_left': ping('low'); toast(`${d.name ?? nameOf(d.playerId)} left`); break;
      case 'player_kicked': ping('low'); toast(`${d.name ?? nameOf(d.playerId)} was kicked`, 'warn'); break;
      case 'host_changed': ping('low'); toast(cap(`${nameOf(d.playerId)} ${d.playerId === me?.id ? 'are' : 'is'} now the host`)); break;
      // Roles are in the event itself; the state with new roles arrives right after.
      case 'game_started': sfx.go(); ping('big'); say((d.chaserIds as string[] | undefined)?.includes(me?.id ?? '') ? "You're a chaser" : "You're a runner. Go!"); break;
      case 'head_start_over': sfx.go(); ping('big'); toast('Ready or not, here they come!', 'warn'); say('Ready or not, here they come!'); break;
      case 'paused': sfx.blip(); ping('mid'); toast('Game paused', 'warn'); say('Game paused'); break;
      case 'resumed': sfx.blip(); ping('mid'); toast('Game resumed'); say('Game resumed'); break;
      case 'locations_updated': sfx.ping(); ping('mid'); toast(d.exact ? 'Exact locations updated' : 'Runner locations updated'); break;
      case 'chasers_revealed': {
        // The runners' "look at your phone now" moment.
        const showSec = Number(d.showSec) || 0;
        sfx.reveal(); ping('big'); say('Chasers revealed');
        doFlash('chasers', `📡 CHASERS REVEALED · look at your map now${showSec ? ` (${showSec} s)` : ''}`, Math.min(15000, Math.max(4000, showSec * 1000)));
        break;
      }
      case 'you_were_revealed': sfx.alarm(); ping('mid'); doFlash('revealed', 'Your location was just sent to the chasers', 2500); break;
      case 'final_countdown': sfx.alarm(); ping('mid'); toast('Final countdown! Updates are faster', 'danger'); say('Final countdown'); break;
      case 'zone_shrinking': sfx.alarm(); ping('mid'); toast(d.stages ? `The zone is shrinking! (${d.stage} of ${d.stages})` : 'The zone is shrinking!', 'warn'); say('The zone is shrinking'); break;
      case 'anti_camping': sfx.ping(); ping('mid'); toast("Nobody's been caught. Exact locations next!", 'danger'); say('Exact locations next'); break;
      case 'time_warning': sfx.ping(); ping('mid'); toast(`${d.minutesLeft} minute${d.minutesLeft === 1 ? '' : 's'} left`, 'warn'); say(`${d.minutesLeft} minute${d.minutesLeft === 1 ? '' : 's'} left`); break;
      case 'out_of_zone': sfx.alarm(); ping('big'); say('Get back in the zone'); break;
      case 'back_in_zone': sfx.clear(); ping('low'); toast('Back in the zone'); break;
      case 'signal_lost': sfx.ping(); ping('mid'); toast(cap(`${nameOf(d.playerId)}'s phone went dark. Last spot revealed!`), 'danger'); break;
      case 'revealed_for_leaving_zone': sfx.ping(); ping('mid'); toast(cap(`${nameOf(d.playerId)} left the zone. Location revealed!`), 'danger'); break;
      case 'eliminated_by_zone':
        if (d.playerId === me?.id) { sfx.out(); ping('big'); say("You're out"); doFlash('caught', 'You stayed out of the zone too long. You\u2019re out!', 4000); }
        else { sfx.catch(); ping('mid'); toast(cap(`${nameOf(d.playerId)} stayed out of the zone too long. Out!`), 'danger'); }
        break;
      case 'catch_request': if (d.runnerId === me?.id) { sfx.alarm(); ping('big'); } break;
      case 'catch_disputed': sfx.blip(); ping('low'); toast(cap(`${nameOf(d.runnerId)} disputed the catch`), 'warn'); break;
      case 'catch_rejected': sfx.blip(); ping('low'); toast(`Too far (${Math.round(Number(d.distanceM))} m). Get closer`, 'warn'); break;
      case 'player_caught':
        sfx.catch(); ping(d.runnerId === me?.id || d.chaserId === me?.id ? 'big' : 'mid');
        toast(cap(`${nameOf(d.chaserId)} caught ${nameOf(d.runnerId)}!${d.auto ? ' (auto-catch)' : ''}`), 'danger');
        say(d.runnerId === me?.id ? "You've been caught" : `${nameOf(d.runnerId)} was caught`);
        if (d.runnerId === me?.id) doFlash('caught', 'You were caught');
        break;
      case 'player_infected': ping(d.playerId === me?.id ? 'big' : 'mid'); toast(d.playerId === me?.id ? "You're infected!" : `${nameOf(d.playerId)} is infected!`, 'danger'); if (d.playerId === me?.id) doFlash('infected', "You're infected! You're a chaser now", 3500); break;
      case 'player_jailed': ping('low'); toast(d.playerId === me?.id ? "You're in jail" : `${nameOf(d.playerId)} is in jail`, 'warn'); break;
      case 'jailbreak': sfx.fanfare(); ping('big'); say('Jailbreak!'); doFlash('jailbreak', `JAILBREAK! ${cap(nameOf(d.byId))} freed ${(d.freedIds as string[] | undefined)?.includes(me?.id ?? '') ? 'you' : (d.freedIds as unknown[] | undefined)?.length ?? 0}`, 3500); break;
      case 'game_over': sfx.fanfare(); ping('big'); say(d.winner === 'runners' ? 'Runners win' : d.winner === 'chasers' ? 'Chasers win' : 'Game over'); break;
      default: break;
    }
  }, [toast, doFlash, ping]);

  // ----- WebSocket with auto-reconnect -----
  useEffect(() => {
    let closed = false; let timer: ReturnType<typeof setTimeout> | undefined; let wakeTimer: ReturnType<typeof setTimeout> | undefined; let pinger: ReturnType<typeof setInterval> | undefined;
    const connect = () => {
      setConn('connecting');
      wakeTimer = setTimeout(() => setWaking(true), 4000);
      const sock = new WebSocket(serverUrl());
      ws.current = sock;
      sock.onopen = () => {
        clearTimeout(wakeTimer); setWaking(false); setConn('open');
        const s = sessionRef.current;
        if (s && wantRejoin.current) sock.send(JSON.stringify({ type: 'rejoin', ...s }));
        pinger = setInterval(() => sock.readyState === 1 && sock.send('{"type":"ping"}'), 25000);
      };
      sock.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as ServerMessage;
        switch (msg.type) {
          case 'joined':
            sessionRef.current = { code: msg.code, playerId: msg.playerId, token: msg.token }; lsSet('session', sessionRef.current);
            wantRejoin.current = true; // a dropped connection should put us back in this game
            break;
          case 'state': stateRef.current = msg.state; setState(msg.state); break;
          case 'event': onEvent(msg.event, msg.data); break;
          case 'error':
            if (msg.code === 'no_game' || msg.code === 'bad_rejoin') { sessionRef.current = null; lsDel('session'); stateRef.current = null; setState(null); }
            if (msg.code === 'bad_rejoin' || msg.code === 'too_far') break; // too_far is already shown via the catch_rejected event
            // During a game, errors are momentary: show a toast. In menus, show a banner until dismissed.
            if (stateRef.current && stateRef.current.phase !== 'lobby') toast(msg.message, 'warn'); else setError(msg.message);
            break;
          case 'kicked': sessionRef.current = null; lsDel('session'); stateRef.current = null; setState(null); setKicked(true); break;
        }
      };
      sock.onclose = (ev) => {
        clearTimeout(wakeTimer); clearInterval(pinger); setConn('closed');
        // 4000 = this player connected from another tab/window. Don't reconnect, or the two tabs
        // would keep kicking each other off.
        if (ev.code === 4000) { setReplaced(true); return; }
        if (!closed) timer = setTimeout(connect, 2000);
      };
      sock.onerror = () => sock.close();
    };
    connect();
    return () => { closed = true; clearTimeout(timer); clearTimeout(wakeTimer); clearInterval(pinger); ws.current?.close(); };
  }, [onEvent, toast]);

  // ----- Geolocation -----
  const lastFix = useRef<{ lat: number; lng: number; accuracy: number; heading: number | null } | null>(null);
  const sendFix = useCallback(() => {
    const f = lastFix.current;
    if (!f || !stateRef.current || ws.current?.readyState !== 1) return; // only while in a game
    lastSent.current = Date.now();
    ws.current.send(JSON.stringify({ type: 'location', ...f }));
  }, []);
  // Phones stop reporting GPS when you stand still. Re-send the last fix every few seconds so a
  // hiding runner still counts as "here" for heartbeat, catches and jailbreaks.
  useEffect(() => {
    const id = setInterval(() => { if (Date.now() - lastSent.current > 4000) sendFix(); }, 2000);
    return () => clearInterval(id);
  }, [sendFix]);

  // Coming back after the phone was locked / Safari was in the background: tell runners what happened.
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return; }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      sendFix();
      const st = stateRef.current;
      if (away > 25000 && st?.phase === 'active' && st.you.role === 'runner' && st.you.status === 'free') {
        doFlash('revealed', 'Your phone stopped sharing your location, so chasers saw your last spot. Keep this screen open!', 7000);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [sendFix, doFlash]);

  const startGeo = useCallback(() => {
    if (watchId.current != null || !('geolocation' in navigator)) return;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setAccuracy(pos.coords.accuracy);
        setGeo(pos.coords.accuracy > 30 ? 'weak' : 'ok');
        lastFix.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, heading: pos.coords.heading };
        if (Date.now() - lastSent.current < 900) return;
        sendFix();
      },
      (err) => { if (err.code === err.PERMISSION_DENIED) setGeo('denied'); else setGeo('weak'); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    );
  }, []);

  const keepAwake = useCallback(async () => {
    try { wake.current = await navigator.wakeLock?.request('screen'); } catch {}
  }, []);

  useEffect(() => {
    const vis = () => { if (document.visibilityState === 'visible' && ready) void keepAwake(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [ready, keepAwake]);

  // Start GPS automatically once in a game (permission persists across reloads).
  useEffect(() => { if (state) startGeo(); }, [!!state, startGeo]); // eslint-disable-line react-hooks/exhaustive-deps

  const makeReady = useCallback(async () => {
    unlockAudio();
    startGeo();
    await keepAwake();
    setReady(true);
  }, [startGeo, keepAwake]);

  const createGame = useCallback(() => {
    const p = profileRef.current; if (!p) return;
    wantRejoin.current = false;
    send({ type: 'create_game', name: p.name, color: p.color, avatar: p.avatar });
  }, [send]);
  const joinGame = useCallback((code: string) => {
    const p = profileRef.current; if (!p) return;
    wantRejoin.current = false;
    send({ type: 'join_game', code: code.toUpperCase(), name: p.name, color: p.color, avatar: p.avatar });
  }, [send]);
  const leave = useCallback(() => {
    send({ type: 'leave' });
    sessionRef.current = null; lsDel('session'); stateRef.current = null; setState(null); setReady(false);
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
    wake.current?.release().catch(() => {}); wake.current = null; setGeo('idle');
    history.replaceState(null, '', '/');
  }, [send]);

  // Pre-filled code from /join/ABCD
  useEffect(() => {
    const m = location.pathname.match(/^\/join\/([A-Za-z]{4})/);
    if (m) setPendingCode(m[1].toUpperCase());
  }, []);

  const value = useMemo<Ctx>(() => ({
    conn, waking, state, profile, setProfile, send, createGame, joinGame, leave,
    error, clearError: () => setError(null), toasts, flash, clearFlash: () => setFlash(null),
    geo, accuracy, ready, makeReady, kicked, clearKicked: () => setKicked(false), pendingCode, notify: toast, replaced, ping: pingState,
  }), [pingState, replaced, toast, conn, waking, state, profile, setProfile, send, createGame, joinGame, leave, error, toasts, flash, geo, accuracy, ready, makeReady, kicked, pendingCode]);

  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}
