// Mirrors server/src/protocol.ts + settings.ts (types only).
export interface LatLng { lat: number; lng: number }
export type Role = 'chaser' | 'runner';
export type Status = 'free' | 'out' | 'jailed';
export type Phase = 'lobby' | 'headstart' | 'active' | 'paused' | 'ended';

export interface Settings {
  chasers: { count: number; selection: 'random' | 'host' };
  durationMin: number;
  headStart: { enabled: boolean; seconds: number };
  locationUpdates: { mode: 'interval' | 'live' | 'off'; intervalSec: number; showSec: number };
  fuzzy: { enabled: boolean; radiusM: number };
  finalCountdown: { enabled: boolean; lastMin: number; intervalSec: number };
  heartbeat: { enabled: boolean; distancesM: [number, number, number] };
  zone: { center: LatLng | null; radiusM: number };
  shrinkingZone: { enabled: boolean; style: 'stages' | 'smooth'; startAfterMin: number; finalRadiusM: number; stages: number; intervalMin: number; shrinkSec: number };
  caughtMode: 'out' | 'infection' | 'jail';
  jail: { location: LatLng | null; radiusM: number; holdSec: number; immunitySec: number };
  runnerView: 'map' | 'none';
  announcements: boolean;
  visibility: { runnersSeeChasers: boolean; chaserUpdates: 'interval' | 'live'; chaserIntervalSec: number; chaserShowSec: number; chasersSeeChasers: boolean };
  antiCamping: { enabled: boolean; afterMin: number };
  outOfZone: { graceSec: number };
  catching: { radiusM: number; autoAcceptSec: number; auto: boolean; autoRadiusM: number; autoHoldSec: number };
}

export interface PublicPlayer {
  id: string; name: string; color: string; avatar?: string;
  role: Role; status: Status; isHost: boolean; connected: boolean; immuneSec: number; gpsLost: boolean;
}
export interface RunnerMarker {
  playerId: string; lat: number; lng: number; radiusM: number; exact: boolean;
  reason: 'scheduled' | 'live' | 'out_of_zone' | 'anti_camping' | 'signal_lost'; ageSec: number;
}
export interface LiveMarker { playerId: string; lat: number; lng: number; accuracy: number; /** snapshot age, when not live */ ageSec?: number }
export interface PendingCatch { catchId: string; chaserId: string; runnerId: string; autoAcceptInSec: number }

export interface Results {
  winner: 'chasers' | 'runners' | 'none';
  reason: 'all_caught' | 'time_up' | 'host_ended';
  chaseDurationSec: number;
  players: Array<{
    playerId: string; name: string; color: string; startRole: Role; endRole: Role; endStatus: Status;
    survivedSec: number | null; catches: number; distanceM: number; closestCallM: number | null;
    route: Array<[number, number, number]>;
  }>;
  awards: Array<{ id: string; title: string; playerId: string; value: string }>;
  timeline: Array<{ atSec: number; event: string; playerId?: string; otherId?: string }>;
}

export interface GameState {
  code: string; phase: Phase; pausedFrom: Phase | null; settings: Settings; players: PublicPlayer[];
  you: {
    id: string; role: Role; status: Status; isHost: boolean; location: LiveMarker | null;
    inZone: boolean | null; outOfZoneRevealInSec: number | null; revealedForLeavingZone: boolean;
    heartbeat: number | null; jailbreakProgressSec: number | null;
  };
  zone: {
    center: LatLng | null; radiusM: number; finalRadiusM: number | null; shrinking: boolean;
    /** Size after the next shrink (dashed circle) and seconds until it starts (0 while shrinking). */
    nextRadiusM: number | null; nextShrinkInSec: number | null; stage: number | null; stages: number | null;
  };
  jail: { location: LatLng; radiusM: number } | null;
  timers: { headStartLeftSec: number | null; gameLeftSec: number | null; nextUpdateInSec: number | null; chaserRevealInSec: number | null; finalCountdownActive: boolean };
  map: { runners: RunnerMarker[]; chasers: LiveMarker[]; everyone: LiveMarker[] };
  pendingCatch: PendingCatch | null;
  results: Results | null;
}

export type EventName =
  | 'player_joined' | 'player_left' | 'player_kicked' | 'host_changed'
  | 'game_started' | 'head_start_over' | 'paused' | 'resumed'
  | 'locations_updated' | 'you_were_revealed' | 'chasers_revealed' | 'final_countdown' | 'zone_shrinking' | 'anti_camping'
  | 'time_warning' | 'out_of_zone' | 'back_in_zone' | 'revealed_for_leaving_zone' | 'signal_lost'
  | 'catch_request' | 'catch_disputed' | 'catch_rejected'
  | 'player_caught' | 'player_infected' | 'player_jailed' | 'jailbreak'
  | 'game_over' | 'back_to_lobby';

export type ServerMessage =
  | { type: 'joined'; code: string; playerId: string; token: string }
  | { type: 'state'; state: GameState }
  | { type: 'event'; event: EventName; data?: Record<string, unknown> }
  | { type: 'error'; code: string; message: string }
  | { type: 'kicked' }
  | { type: 'pong' };

export type ClientMessage =
  | { type: 'create_game'; name: string; color: string; avatar?: string }
  | { type: 'join_game'; code: string; name: string; color: string; avatar?: string }
  | { type: 'rejoin'; code: string; playerId: string; token: string }
  | { type: 'leave' }
  | { type: 'update_profile'; name?: string; color?: string; avatar?: string }
  | { type: 'update_settings'; settings: Record<string, unknown> }
  | { type: 'set_role'; playerId: string; role: Role }
  | { type: 'kick'; playerId: string }
  | { type: 'transfer_host'; playerId: string }
  | { type: 'start_game' } | { type: 'pause' } | { type: 'resume' } | { type: 'end_game' } | { type: 'rematch' }
  | { type: 'location'; lat: number; lng: number; accuracy: number; heading?: number | null }
  | { type: 'catch'; runnerId: string }
  | { type: 'catch_response'; catchId: string; accept: boolean }
  | { type: 'ping' };

export const AVATARS = ['🦊', '🐺', '🦉', '🐙', '🦈', '🐸', '🦇', '🐍', '🦅', '🐻', '🦎', '🕷️'];
export const COLORS = ['#ff5a2c', '#ffd23f', '#1fe3b4', '#5aa9ff', '#b57bff', '#ff6ec7', '#9be15d', '#ff9f1c', '#3dd6f5', '#f2f2f2'];
