/**
 * Everything the frontend and server say to each other over the WebSocket.
 * Every message is JSON with a `type` field. The frontend can copy the TypeScript
 * types at the bottom of this file.
 */
import { z } from 'zod';
import { LatLngSchema, type LatLng, type Settings } from './settings.ts';

const Name = z.string().trim().min(1).max(24);
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be like #ff3366');
const Avatar = z.string().max(32).optional();
const Profile = { name: Name, color: Color, avatar: Avatar };

// ---------- Client -> Server ----------
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create_game'), ...Profile }),
  z.object({ type: z.literal('join_game'), code: z.string().trim().toUpperCase().length(4), ...Profile }),
  z.object({ type: z.literal('rejoin'), code: z.string().trim().toUpperCase().length(4), playerId: z.string(), token: z.string() }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('update_profile'), name: Name.optional(), color: Color.optional(), avatar: Avatar }),

  // Host only
  z.object({ type: z.literal('update_settings'), settings: z.record(z.unknown()) }),
  z.object({ type: z.literal('set_role'), playerId: z.string(), role: z.enum(['chaser', 'runner']) }),
  z.object({ type: z.literal('kick'), playerId: z.string() }),
  z.object({ type: z.literal('transfer_host'), playerId: z.string() }),
  z.object({ type: z.literal('start_game') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('end_game') }),
  z.object({ type: z.literal('rematch') }),

  // Gameplay
  z.object({
    type: z.literal('location'),
    lat: LatLngSchema.shape.lat,
    lng: LatLngSchema.shape.lng,
    accuracy: z.number().min(0).max(10000),
    heading: z.number().nullable().optional(),
  }),
  z.object({ type: z.literal('catch'), runnerId: z.string() }),
  z.object({ type: z.literal('catch_response'), catchId: z.string(), accept: z.boolean() }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------- Server -> Client ----------
export type Role = 'chaser' | 'runner';
/** free = in play. out = caught and spectating. jailed = caught, waiting for a jailbreak. */
export type Status = 'free' | 'out' | 'jailed';
export type Phase = 'lobby' | 'headstart' | 'active' | 'paused' | 'ended';

export interface PublicPlayer {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  role: Role;
  status: Status;
  isHost: boolean;
  connected: boolean;
  /** Seconds left of post-jailbreak immunity, 0 if none. */
  immuneSec: number;
}

/** A runner as a chaser sees them on the map. */
export interface RunnerMarker {
  playerId: string;
  /** Circle center. Exact location when `exact` is true. */
  lat: number;
  lng: number;
  /** 0 when exact. */
  radiusM: number;
  exact: boolean;
  reason: 'scheduled' | 'live' | 'out_of_zone' | 'anti_camping';
  /** Seconds since this location was revealed. */
  ageSec: number;
}

export interface LiveMarker {
  playerId: string;
  lat: number;
  lng: number;
  accuracy: number;
}

export interface PendingCatch {
  catchId: string;
  chaserId: string;
  runnerId: string;
  /** Seconds until it counts automatically. */
  autoAcceptInSec: number;
}

export interface Results {
  winner: 'chasers' | 'runners' | 'none';
  reason: 'all_caught' | 'time_up' | 'host_ended';
  chaseDurationSec: number;
  players: Array<{
    playerId: string;
    name: string;
    color: string;
    startRole: Role;
    endRole: Role;
    endStatus: Status;
    /** Seconds survived as a runner before first catch (or whole game). null for starting chasers. */
    survivedSec: number | null;
    catches: number;
    distanceM: number;
    /** Closest any chaser got while this runner was free. null if never measured. */
    closestCallM: number | null;
    /** Route samples [lat, lng, secondsIntoGame], about every 5 s. */
    route: Array<[number, number, number]>;
  }>;
  awards: Array<{ id: string; title: string; playerId: string; value: string }>;
  /** Timeline for the replay: catches, jailbreaks, etc. */
  timeline: Array<{ atSec: number; event: string; playerId?: string; otherId?: string }>;
}

/** What one player's screen should show. Sent on every change and once per second during a game. */
export interface GameState {
  code: string;
  phase: Phase;
  /** Set while paused: the phase to go back to. */
  pausedFrom: Phase | null;
  settings: Settings;
  players: PublicPlayer[];
  you: {
    id: string;
    role: Role;
    status: Status;
    isHost: boolean;
    /** Your last location the server received. */
    location: LiveMarker | null;
    /** true/false once you have a location during a game, null otherwise. */
    inZone: boolean | null;
    /** Seconds left before chasers see you (runners outside the zone). null when inside. */
    outOfZoneRevealInSec: number | null;
    /** True while chasers can see your exact location because you left the zone. */
    revealedForLeavingZone: boolean;
    /** Runners only, heartbeat enabled: 0 = nobody near, 1 = far, 2 = medium, 3 = near. */
    heartbeat: number | null;
    /** Runners only, runnerView = compass: bearing in degrees to the nearest chaser. */
    compassBearing: number | null;
    /** Seconds you've stood in jail toward a jailbreak, null when not in jail. */
    jailbreakProgressSec: number | null;
  };
  zone: {
    center: LatLng | null;
    /** Current radius (changes when the zone shrinks). */
    radiusM: number;
    /** Where the zone ends up, when shrinking is on. */
    finalRadiusM: number | null;
    shrinking: boolean;
  };
  jail: { location: LatLng; radiusM: number } | null;
  timers: {
    /** Seconds until head start ends (headstart phase). */
    headStartLeftSec: number | null;
    /** Seconds of chase left. */
    gameLeftSec: number | null;
    /** Seconds until the next scheduled location update for chasers. */
    nextUpdateInSec: number | null;
    finalCountdownActive: boolean;
  };
  map: {
    /** Chasers and spectators: last revealed position of each free runner. */
    runners: RunnerMarker[];
    /** Chasers and spectators: live positions of chasers. */
    chasers: LiveMarker[];
    /** Spectators and the end screen only: everyone live. */
    everyone: LiveMarker[];
  };
  /** A catch involving you that's waiting on the runner. */
  pendingCatch: PendingCatch | null;
  results: Results | null;
}

export type EventName =
  | 'player_joined' | 'player_left' | 'player_kicked' | 'host_changed'
  | 'game_started' | 'head_start_over' | 'paused' | 'resumed'
  | 'locations_updated' | 'you_were_revealed'
  | 'final_countdown' | 'zone_shrinking' | 'anti_camping'
  | 'time_warning'
  | 'out_of_zone' | 'back_in_zone' | 'revealed_for_leaving_zone'
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
