# Frontend Guide

Everything you need to build the frontend. The server is done: it handles rooms, roles, timers, location updates, catches and every game rule. Your frontend's job is to:

1. Open a WebSocket to the server.
2. Send the player's actions and GPS location.
3. Show whatever is in the latest `state` message, and play sounds for `event` messages.

You can use any framework (React/Next.js, Svelte, plain HTML). The exact message types are in [server/src/protocol.ts](server/src/protocol.ts). If you use TypeScript, copy that file's types into your project.

---

## 1. Connecting

| Where | URL |
|---|---|
| Local dev | `ws://localhost:8080/ws` |
| Deployed | `wss://YOUR-SERVER.onrender.com/ws` (must be `wss://` on an HTTPS site) |

Every message is JSON with a `type` field.

```js
const ws = new WebSocket(SERVER_URL);

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case 'joined':  // save these so you can rejoin after a refresh / dropped signal
      localStorage.setItem('session', JSON.stringify({ code: msg.code, playerId: msg.playerId, token: msg.token }));
      break;
    case 'state':  render(msg.state); break;              // redraw the screen from this
    case 'event':  onEvent(msg.event, msg.data); break;    // play a sound / show a toast
    case 'error':  showError(msg.message); break;          // msg.code is machine-readable
    case 'kicked': localStorage.removeItem('session'); goHome(); break;
  }
};

// On (re)connect: if we have a saved session, rejoin it instead of showing the home screen.
ws.onopen = () => {
  const saved = JSON.parse(localStorage.getItem('session') || 'null');
  if (saved) ws.send(JSON.stringify({ type: 'rejoin', ...saved }));
};
```

**Reconnect automatically.** When the socket closes, try again every 2 seconds. The `rejoin` puts the player back in the same game with the same role. If `rejoin` returns error `no_game` or `bad_rejoin`, clear the saved session and go to the home screen.

**The state message is the source of truth.** The server sends a fresh `state` whenever something changes, and once per second during a game. Don't track game logic yourself; just render the latest state. Timers are in seconds (`gameLeftSec`, etc.), so you can count them down locally between updates for smoothness.

---

## 2. Sending location

Send GPS from the moment a player joins until they leave. Once a second is ideal; the server ignores anything faster than every 0.5 s.

```js
navigator.geolocation.watchPosition(
  (pos) => ws.send(JSON.stringify({
    type: 'location',
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,   // meters; the server uses it for fairness
    heading: pos.coords.heading,     // may be null
  })),
  (err) => showError('Location is off: ' + err.message),
  { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
);
```

**Keep the screen on** during a game, because browsers stop sending location when the phone locks:

```js
let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
```
Call `keepAwake()` from a button tap (for example "Ready" or "Start"). Show a warning like "Keep this screen open!" during the game.

---

## 3. Screens

### Home
- Buttons: **Create game**, **Join game** (a 4-letter code input).
- Also support a join link like `yoursite.com/join/ABCD` that pre-fills the code.
- Sends `{ type: 'create_game', name, color, avatar? }` or `{ type: 'join_game', code, name, color, avatar? }`.

### Character
- Name (1–24 characters), color (`#rrggbb` format), optional avatar id (any string up to 32 characters, such as `"fox"`; you design the avatars).
- Save it in `localStorage` so players set it once.
- Change it later with `{ type: 'update_profile', name?, color?, avatar? }`.

### Lobby (`state.phase === 'lobby'`)
- The join code, big (`state.code`), plus a share/copy link button and maybe a QR code.
- Player list from `state.players`: name, color, avatar, host crown (`isHost`), and gray out anyone with `connected: false`.
- **Host only** (`state.you.isHost`):
  - The settings panel (section 4).
  - If `settings.chasers.selection === 'host'`: tap a player to toggle chaser/runner → `{ type: 'set_role', playerId, role: 'chaser' | 'runner' }`. If it's `'random'`, show "Chasers picked randomly at start" instead of roles.
  - Kick → `{ type: 'kick', playerId }`; make host → `{ type: 'transfer_host', playerId }`.
  - **Start** → `{ type: 'start_game' }`. Requires a zone and at least 2 players.
- Everyone else sees the settings read-only.
- Leave button → `{ type: 'leave' }`, then clear the saved session.

### Zone setup (host, inside the lobby)
- A map where the host drags a circle: center + radius → `{ type: 'update_settings', settings: { zone: { center: { lat, lng }, radiusM } } }`.
- A "use my location" button to center it.
- If jail mode is on: let the host drop a jail pin → `settings: { jail: { location: { lat, lng } } }`. With no pin, jail is the zone center.
- Draw `state.zone` and `state.jail` for everyone in the lobby so they can see the area.

### Head start (`phase === 'headstart'`)
- Big countdown from `state.timers.headStartLeftSec`.
- **Chasers:** black out the map. "Close your eyes / stay at the start. Head start ends in 2:41."
- **Runners:** "Run and hide!" plus their own view (map/compass/none).

### Chaser view (`phase === 'active'`, `you.role === 'chaser'`)
- Map with:
  - the zone circle (`state.zone.center`, `state.zone.radiusM`; it changes if the zone is shrinking)
  - yourself (`you.location`)
  - other chasers, live (`state.map.chasers`)
  - runners from `state.map.runners`:
    - `exact: false` → draw a circle of `radiusM` around `lat/lng` (the runner is somewhere inside)
    - `exact: true` → draw a dot. `reason` tells you why: `out_of_zone` (they left the zone), `anti_camping`, `live`, `scheduled`.
    - `ageSec` → show "updated 40 s ago" and fade older markers.
  - the jail, if present (`state.jail`)
- "Next update in 1:12" from `timers.nextUpdateInSec` (null when updates are off or live).
- Game timer from `timers.gameLeftSec`; style it differently when `timers.finalCountdownActive` is true.
- **Catch button:** pick a runner from the list of free runners (`players` with `role === 'runner'` and `status === 'free'`) → `{ type: 'catch', runnerId }`. If they're too far, you get error `too_far` with the distance in the message.
- While `state.pendingCatch` exists: "Waiting for Ava to confirm… (auto in 12 s)".

### Runner view (`you.role === 'runner'`, `you.status === 'free'`)
What it shows depends on `settings.runnerView`:
- `'map'`: map with yourself, the zone and the jail. No chasers.
- `'compass'`: an arrow pointing at the nearest chaser (section 6), with no distance.
- `'none'`: just the timer and warnings.

Always show:
- Game timer.
- **Heartbeat** (`you.heartbeat`, null when off): 0 = nobody near, 1 = far, 2 = closer, 3 = very close. Play a heartbeat sound that gets faster at higher levels and pulse the screen edges red. Vibrate on Android (`navigator.vibrate`); iPhones can't vibrate from a website.
- **Out of zone** (`you.inZone === false`): a big red warning. Show `you.outOfZoneRevealInSec` as "Get back in! Chasers see you in 8 s". Once `you.revealedForLeavingZone` is true: "Chasers can see you!"
- **You were revealed:** the `you_were_revealed` event. Flash "Your location was just sent to the chasers."
- **Catch prompt:** when `state.pendingCatch` has `runnerId === you.id`, show a modal: "Sam says they caught you." Buttons **Yes, caught** / **No, they didn't** → `{ type: 'catch_response', catchId, accept: true | false }`. It auto-accepts after `autoAcceptInSec`.
- **Jailbreak progress** (`you.jailbreakProgressSec`): when standing in jail, show "Freeing your team… 3/5" (the total is `settings.jail.holdSec`).
- **Immunity:** your entry in `players` has `immuneSec > 0` right after a jailbreak. Show "Immune for 8 s".

### Caught views
- `status === 'jailed'`: "You're in jail. Walk to the jail and wait for a teammate to free you." Show the jail on a map.
- `status === 'out'` (or joined mid-game): **spectator**. Show the full live map from `state.map.everyone`, plus the runner markers as chasers see them.
- Infection mode: the player's `role` just changes to `chaser`. Show "You're infected! You're a chaser now" and switch to the chaser view.

### Paused (`phase === 'paused'`)
- Overlay: "Game paused by host." `state.pausedFrom` tells you what's underneath.
- Host: **Resume** → `{ type: 'resume' }`.

### Host controls during a game
A small menu with: **Pause** `{ type: 'pause' }`, **Resume**, **End game** `{ type: 'end_game' }`, **Kick**.

### End screen (`phase === 'ended'`, `state.results`)
- Winner banner: `results.winner` is `'chasers'`, `'runners'` or `'none'` (host ended it). `results.reason` is `all_caught`, `time_up` or `host_ended`.
- Awards (`results.awards`): each has `title`, `playerId` and `value`, e.g. *Longest Survivor: Ava (14:02)*. The award ids are `longest_survivor`, `top_chaser`, `closest_call` and `marathon`.
- Per-player stats (`results.players`): `survivedSec`, `catches`, `distanceM`, `closestCallM`, starting and ending role.
- **Route replay:** each player's `route` is a list of `[lat, lng, secondsIntoGame]`. Draw each as a colored line, with a slider that animates the dots over time. Overlay `results.timeline` events (catches, jailbreaks) as markers on the slider.
- Share card: design it yourself (for example, render to a canvas and use `navigator.share`).
- Host: **Play again** → `{ type: 'rematch' }`. This goes back to the lobby with the same players and settings.

---

## 4. Settings panel (host)

Send only what changed. The server merges it in:
```js
ws.send(JSON.stringify({ type: 'update_settings', settings: { headStart: { enabled: false } } }));
```
If a value is out of range, you get `error` with code `bad_settings`, and the settings stay as they were. Settings can only change in the lobby. The current values are always in `state.settings`.

| Setting | Key | Control | Range | Default |
|---|---|---|---|---|
| Number of chasers | `chasers.count` | stepper | 1–49 (server caps at players − 1) | 1 |
| How chasers are picked | `chasers.selection` | toggle: `random` / `host` | | `random` |
| Game duration | `durationMin` | slider | 1–180 min | 20 |
| Head start on/off | `headStart.enabled` | switch | | on |
| Head start length | `headStart.seconds` | slider | 10–1800 s | 180 |
| Location updates | `locationUpdates.mode` | `interval` / `live` / `off` | | `interval` |
| Update every | `locationUpdates.intervalSec` | slider | 10–1800 s | 120 |
| Fuzzy updates | `fuzzy.enabled` | switch | | on |
| Fuzzy circle size | `fuzzy.radiusM` | slider | 10–500 m | 60 |
| Final countdown | `finalCountdown.enabled` | switch | | on |
| …starts with this long left | `finalCountdown.lastMin` | slider | 1–60 min | 3 |
| …updates every | `finalCountdown.intervalSec` | slider | 5–600 s | 30 |
| Heartbeat warning | `heartbeat.enabled` | switch | | on |
| Heartbeat distances | `heartbeat.distancesM` | 3 numbers [far, mid, near] | meters | [80, 50, 25] |
| Play zone | `zone.center`, `zone.radiusM` | map circle | 20–20000 m | 200 m |
| Shrinking zone | `shrinkingZone.enabled` | switch | | off |
| …starts after | `shrinkingZone.startAfterMin` | slider | 0–180 min | 5 |
| …final size | `shrinkingZone.finalRadiusM` | slider | 10 m – zone size | 80 |
| When caught | `caughtMode` | `out` / `infection` / `jail` | | `out` |
| Jail location | `jail.location` | map pin (null = zone center) | | null |
| Jail size | `jail.radiusM` | slider | 5–100 m | 15 |
| Seconds to jailbreak | `jail.holdSec` | slider | 1–60 | 5 |
| Immunity after jailbreak | `jail.immunitySec` | slider | 0–120 s | 10 |
| What runners see | `runnerView` | `map` / `compass` / `none` | | `map` |
| Sounds & announcements | `announcements` | switch | | on |
| Anti-camping | `antiCamping.enabled` | switch | | off |
| …if nobody's caught for | `antiCamping.afterMin` | slider | 1–60 min | 6 |
| Out-of-zone grace | `outOfZone.graceSec` | slider | 0–300 s | 15 |
| Catch distance | `catching.radiusM` | slider | 5–100 m | 15 |
| Auto-confirm catch after | `catching.autoAcceptSec` | slider | 5–120 s | 15 |

Infection and jailbreak are both options of **When caught** (`caughtMode`), because a caught runner can't both become a chaser and go to jail. You can still show them as two switches in your UI: turning one on sets `caughtMode` to `'infection'` or `'jail'`, and turning both off sets `'out'`.

Hide the sub-settings when their switch is off, and put the rarely changed ones (catch distance, grace period, heartbeat distances) under "Advanced".

---

## 5. Events (sounds and announcements)

Events are one-off moments. Play a sound or voice line and show a toast. Only play sounds when `state.settings.announcements` is true.

| Event | Who gets it | `data` | Suggested announcement |
|---|---|---|---|
| `player_joined` / `player_left` / `player_kicked` | all | `playerId, name` | "Ava joined" |
| `host_changed` | all | `playerId` | "Ben is now the host" |
| `game_started` | all | `chaserIds, headStartSec` | "You're a CHASER" / "You're a RUNNER. Go!" |
| `head_start_over` | all | | "Ready or not, here they come!" |
| `paused` / `resumed` | all | | "Game paused" |
| `locations_updated` | chasers, spectators | `exact` | ping sound + "Locations updated" |
| `you_were_revealed` | free runners | `exact` | "Your location was sent!" |
| `final_countdown` | all | `minutesLeft` | "Final countdown! Updates are faster" |
| `zone_shrinking` | all | `finalRadiusM` | "The zone is shrinking!" |
| `anti_camping` | all | | "Nobody's been caught. Exact locations next!" |
| `time_warning` | all | `minutesLeft` (5 or 1) | "5 minutes left" |
| `out_of_zone` / `back_in_zone` | that player | | alarm / all-clear |
| `revealed_for_leaving_zone` | that runner + chasers | `playerId` | "Cleo left the zone. Location revealed!" |
| `catch_request` | the runner and chaser | `catchId, chaserId, runnerId` | runner: show the confirm modal |
| `catch_disputed` | chaser, runner, host | `catchId, chaserId, runnerId` | "Ava disputed the catch" |
| `catch_rejected` | chaser | `runnerId, distanceM` | "Too far (42 m)" |
| `player_caught` | all | `runnerId, chaserId, mode` | "Sam caught Ava!" |
| `player_infected` | all | `playerId` | "Ava is infected!" |
| `player_jailed` | all | `playerId` | "Ava is in jail" |
| `jailbreak` | all | `byId, freedIds` | "JAILBREAK! Dev freed 3 runners" |
| `game_over` | all | `winner, reason` | "Runners win!" |
| `back_to_lobby` | all | | |

iPhones only play sounds after the user has tapped something, so have players tap a **Ready** button (which also turns on keep-awake) before the game starts, and play a silent sound then to unlock audio.

---

## 6. Compass

`you.compassBearing` is the direction to the nearest chaser in degrees from **north**. To point an arrow on screen, subtract the direction the phone is facing:

```js
let deviceHeading = 0;
// iPhone: must be called from a button tap
async function enableCompass() {
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    if (await DeviceOrientationEvent.requestPermission() !== 'granted') return;
  }
  window.addEventListener('deviceorientationabsolute', (e) => { deviceHeading = 360 - e.alpha; }); // Android
  window.addEventListener('deviceorientation', (e) => { if (e.webkitCompassHeading != null) deviceHeading = e.webkitCompassHeading; }); // iPhone
}
const arrowRotation = (state.you.compassBearing - deviceHeading + 360) % 360; // rotate your arrow by this many degrees
```

---

## 7. Errors

`{ type: 'error', code, message }`. The `message` is written for players, so you can show it directly.

| Code | Meaning |
|---|---|
| `no_game` | wrong join code, or the game expired |
| `bad_rejoin` | saved session isn't valid anymore; clear it |
| `game_full` | 50 players max |
| `not_host` | only the host can do that |
| `bad_settings` | a setting was out of range (message says which) |
| `bad_phase` | wrong time for that action (e.g. changing settings mid-game) |
| `no_zone` / `not_enough_players` / `no_chasers` / `no_runners` | can't start yet |
| `head_start` / `too_far` / `immune` / `already_pending` / `bad_target` | catch didn't go through |
| `bad_message` / `bad_json` | your frontend sent something malformed (a bug) |

---

## 8. Things that will bite you

- **HTTPS is required for GPS on phones.** `http://192.168.x.x:3000` won't get location. To test on real phones, deploy (Vercel gives you HTTPS) or use a tunnel like `cloudflared tunnel --url http://localhost:3000`.
- **Maps:** the app uses MapLibre GL with the free OpenFreeMap dark style (no API key). CARTO tiles now need a key. For circles, Leaflet has `L.circle(center, { radius })`, which takes meters.
- **Screen lock kills location.** Use the wake lock, tell players to keep the app open, and suggest turning brightness down.
- **Big tap targets:** people use this while running, at night. Use large buttons, high contrast and a dark theme.

## 9. Testing without friends

Run the server, create a lobby from your frontend, then add fake players that walk around:

```bash
cd server && npm run dev
```
```bash
cd server && npm run bots -- --code ABCD --count 5
```

Or watch a complete game play out in the terminal (20 s head start, 3 min game):

```bash
cd server && npm run bots -- --create --count 6 --start --fast
```
