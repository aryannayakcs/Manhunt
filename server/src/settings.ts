import { z } from 'zod';

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

/**
 * Every host-adjustable setting. "Toggleable" features have an `enabled` flag.
 * The frontend sends partial updates; the server merges them and validates the result.
 */
export const SettingsSchema = z.object({
  chasers: z.object({
    /** How many chasers to pick when selection is "random". */
    count: z.number().int().min(1).max(49),
    /** "random" = app picks at start; "host" = host assigns roles in the lobby. */
    selection: z.enum(['random', 'host']),
  }),
  /** Length of the chase, after the head start. 1 minute to 3 hours. */
  durationMin: z.number().int().min(1).max(180),
  headStart: z.object({
    enabled: z.boolean(),
    seconds: z.number().int().min(10).max(1800),
  }),
  /** How chasers see runners: on a schedule, live, or never (only penalties reveal). */
  locationUpdates: z.object({
    mode: z.enum(['interval', 'live', 'off']),
    intervalSec: z.number().int().min(10).max(1800),
  }),
  /** Scheduled updates show a circle the runner is somewhere inside instead of an exact dot. */
  fuzzy: z.object({
    enabled: z.boolean(),
    radiusM: z.number().min(10).max(500),
  }),
  /** In the last N minutes, updates come every `intervalSec` instead. */
  finalCountdown: z.object({
    enabled: z.boolean(),
    lastMin: z.number().int().min(1).max(60),
    intervalSec: z.number().int().min(5).max(600),
  }),
  /** Runners get a proximity level (1-3) when a chaser is within these distances. */
  heartbeat: z.object({
    enabled: z.boolean(),
    /** [far, medium, near] in meters, e.g. [80, 50, 25]. */
    distancesM: z.tuple([z.number().min(1), z.number().min(1), z.number().min(1)]),
  }),
  zone: z.object({
    center: LatLngSchema.nullable(),
    radiusM: z.number().min(20).max(20000),
  }),
  shrinkingZone: z.object({
    enabled: z.boolean(),
    /** stages: holds still, then shrinks a step, several times. smooth: shrinks continuously until the end. */
    style: z.enum(['stages', 'smooth']),
    /** Minutes into the chase when the first shrink starts. */
    startAfterMin: z.number().min(0).max(180),
    finalRadiusM: z.number().min(10).max(20000),
    /** stages: how many shrinks to get from the full size to the final size. */
    stages: z.number().int().min(1).max(10),
    /** stages: minutes from the start of one shrink to the start of the next. */
    intervalMin: z.number().min(1).max(60),
    /** stages: seconds each shrink takes. */
    shrinkSec: z.number().int().min(10).max(600),
  }),
  /** What happens to a caught runner: out (spectate), infection (becomes a chaser) or jail (can be freed). */
  caughtMode: z.enum(['out', 'infection', 'jail']),
  jail: z.object({
    /** null = use the zone center. */
    location: LatLngSchema.nullable(),
    radiusM: z.number().min(5).max(100),
    /** Seconds a free runner must stand in jail to free everyone. */
    holdSec: z.number().int().min(1).max(60),
    /** Seconds freed runners can't be caught after a jailbreak. */
    immunitySec: z.number().int().min(0).max(120),
  }),
  /** What a runner's screen shows: their own map, or nothing but the timer and danger warning.
   *  Runners are never told which direction a chaser is in. */
  runnerView: z.enum(['map', 'none']),
  /** Frontend should play sounds / voice lines for events when true. */
  announcements: z.boolean(),
  /** Who sees chasers' live positions on their map. */
  visibility: z.object({
    /** Runners see where chasers are (needs runnerView = map). */
    runnersSeeChasers: z.boolean(),
    /** Chasers see their teammates. */
    chasersSeeChasers: z.boolean(),
  }),
  /** If nobody is caught for N minutes, the next update is exact even when fuzzy is on. */
  antiCamping: z.object({
    enabled: z.boolean(),
    afterMin: z.number().int().min(1).max(60),
  }),
  outOfZone: z.object({
    /** Seconds a runner can be outside the zone before chasers see their exact location. */
    graceSec: z.number().int().min(0).max(300),
  }),
  catching: z.object({
    /** Max distance between chaser and runner for a catch to count (GPS accuracy is added on top, capped). */
    radiusM: z.number().min(5).max(100),
    /** If the runner doesn't confirm or dispute, the catch counts after this many seconds. */
    autoAcceptSec: z.number().int().min(5).max(120),
  }),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  chasers: { count: 1, selection: 'random' },
  durationMin: 20,
  headStart: { enabled: true, seconds: 180 },
  locationUpdates: { mode: 'interval', intervalSec: 120 },
  fuzzy: { enabled: true, radiusM: 60 },
  finalCountdown: { enabled: true, lastMin: 3, intervalSec: 30 },
  heartbeat: { enabled: true, distancesM: [80, 50, 25] },
  zone: { center: null, radiusM: 200 },
  shrinkingZone: { enabled: false, style: 'stages', startAfterMin: 5, finalRadiusM: 80, stages: 3, intervalMin: 4, shrinkSec: 60 },
  caughtMode: 'out',
  jail: { location: null, radiusM: 15, holdSec: 5, immunitySec: 10 },
  runnerView: 'map',
  announcements: true,
  visibility: { runnersSeeChasers: false, chasersSeeChasers: true },
  antiCamping: { enabled: false, afterMin: 6 },
  outOfZone: { graceSec: 15 },
  catching: { radiusM: 15, autoAcceptSec: 15 },
};

/** Deep partial used for settings updates. */
export type SettingsPatch = { [K in keyof Settings]?: Settings[K] extends object ? Partial<Settings[K]> | null : Settings[K] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in base)) continue; // ignore unknown keys
    out[k] = isPlainObject(base[k]) && isPlainObject(v) ? deepMerge(base[k], v) : v;
  }
  return out;
}

/** Merge a partial update into current settings. Returns the new settings or an error message. */
export function applySettingsPatch(current: Settings, patch: unknown): { ok: true; settings: Settings } | { ok: false; error: string } {
  const merged = deepMerge(current, patch);
  const parsed = SettingsSchema.safeParse(merged);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join('.')}: ${issue.message}` };
  }
  const s = parsed.data;
  // Keep heartbeat distances ordered far > medium > near.
  s.heartbeat.distancesM = [...s.heartbeat.distancesM].sort((a, b) => b - a) as [number, number, number];
  if (s.shrinkingZone.finalRadiusM > s.zone.radiusM) s.shrinkingZone.finalRadiusM = s.zone.radiusM;
  // A shrink can't take longer than the gap between shrinks.
  s.shrinkingZone.shrinkSec = Math.min(s.shrinkingZone.shrinkSec, s.shrinkingZone.intervalMin * 60);
  return { ok: true, settings: s };
}
