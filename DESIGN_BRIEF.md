# Design Brief: Outdoor Chase Game (web app)

> Paste this whole document into your design tool. It is self-contained. Replace **[GAME NAME]** with your own name and branding; don't copy any existing app's name or look.

---

## 1. What this is

**[GAME NAME]** is a phone web app for a real-life game of tag played outdoors, usually after dark, by a group of friends (6–20 people, up to 50).

- One person **hosts**. Everyone else **joins with a 4-letter code** in their phone browser. Nothing to install and no accounts.
- Players are split into **chasers** and **runners**. Runners hide and run. Chasers hunt them down and tag them in real life.
- The app is the **referee**. It tracks everyone's GPS, gives chasers periodic hints about where runners are, warns runners when a chaser is close, confirms catches, enforces the play zone, runs the clock, and declares a winner.
- A game lasts anywhere from 1 minute to 3 hours (usually 15–30 minutes).

**The feeling to design for:** tense, sneaky, adrenaline. Think "being hunted at night." Fun with friends, not grim.

---

## 2. Where and how it's used (most important section)

| Reality | What it means for the design |
|---|---|
| **Outdoors at night**, in parks and on streets | **Dark UI by default.** A bright white screen ruins your night vision. |
| **Runners are hiding** | **A glowing screen gives away your hiding spot.** Runner screens should be very dim and mostly black. Offer a "stealth" look: minimal light, red or dim accents, no big bright areas. |
| **Running, one hand, sweaty fingers** | **Huge tap targets** (56 px+). Primary actions near the bottom (thumb zone). No small icons, swipes or precise gestures for important actions. |
| **Glancing for 1–2 seconds** | The most important information (time left, danger level, warnings) must be readable at a glance, in big type, from arm's length. |
| **Phone in hand, screen kept on** | Browsers stop GPS when the screen locks, so the app keeps the screen awake. Remind players to keep it open and to turn brightness down. |
| **Sound can give you away** | Sounds are optional (host setting), and runners hiding may want earbuds. Every sound needs a visual equivalent. |
| **Mixed iPhone and Android, browser only** | iPhone browsers **can't vibrate**, so don't rely on haptics. Sound and visuals carry the alerts; Android also vibrates. |
| **Spotty mobile data, GPS jitter** | Design clear states for "reconnecting," "GPS weak" and "location off." |
| **Friends, casual** | Playful copy, fun avatars, bold colors per player. It should feel like a party game. |

---

## 3. Design principles

1. **Glanceable first.** Each in-game screen has ONE dominant element: the countdown, the danger meter or the map.
2. **Dark and dim.** True black backgrounds, low-brightness runner screens, no white flashes.
3. **Big and forgiving.** Large targets, confirmation for destructive or irreversible actions (catch, end game, kick).
4. **Role is always obvious.** You should never wonder whether you're a chaser or a runner. Give each role a distinct color identity (for example chasers in a hot red or orange, runners in a cool teal or green) used consistently.
5. **Alerts escalate.** Info (toast) → warning (banner) → danger (full-screen takeover). Out of zone, a catch request and "you're caught" are takeovers.
6. **Never rely on color alone.** Player colors also need names or initials. Danger levels also need labels or icons.
7. **Respect reduced motion.** Provide a non-animated fallback for pulsing and heartbeat effects.

---

## 4. Roles

| Role | Goal | What they see |
|---|---|---|
| **Host** | Sets up and runs the game (also plays as a chaser or runner) | Settings, zone drawing, start, pause, end, kick |
| **Chaser** | Tag every runner before time runs out | A map with runner hints (fuzzy circles or dots), other chasers live, the catch button |
| **Runner** | Survive until the timer ends; free jailed teammates | Depending on the setting: a map of themselves and the zone, OR a compass to the nearest chaser, OR nothing. Plus the danger meter and warnings. |
| **Jailed runner** | Wait to be freed (jail mode) | Jail location, "waiting for a jailbreak" |
| **Spectator** | Caught and out, or joined mid-game | Live map of everyone (the god view) |

**Win conditions:** chasers win if every runner is caught. Runners win if at least one is still free when time runs out. The host can also end the game (no winner).

---

## 5. Game flow

```
Home ─┬─ Create game ─┐
      └─ Join (code) ─┴─> Character setup ─> LOBBY ─(host taps Start)─> HEAD START ─> CHASE ─> END SCREEN ─(Play again)─> LOBBY
                                               ↑                            │   ↑              │
                                       zone + settings (host)               └─ PAUSED (host) ──┘
```

**Phases:** `lobby` → `headstart` → `active` → `ended`, with `paused` possible during head start or chase.

---

## 6. Screen inventory

Each screen lists its **purpose**, **content**, **actions** and **states to design**.

### 6.1 Home
- **Purpose:** start or join.
- **Content:** game name/logo, short tagline.
- **Actions:** **Create game** (primary), **Join game** (4-letter code input: big, monospaced letter boxes, auto-uppercase, no I or O).
- **Also:** a deep link `site.com/join/ABCD` opens with the code filled in.
- **States:** wrong code ("No game with code ABCD"), game full, server waking up (the free server can take up to about a minute on first connect, so show a friendly "Waking up the server…" loader).

### 6.2 Character setup
- **Content:** name (1–24 characters), color picker (8–12 bold swatches), avatar picker (your designed set, e.g. animals or masks).
- **Behavior:** remembered on the phone, so returning players skip this. Editable later from the lobby.

### 6.3 Permissions / Ready check (before or in the lobby)
Phones need user taps to unlock things. Design one friendly **"Get ready"** step with a big **Ready** button that:
- asks for **location** permission (required; explain why: "so the game can referee"),
- unlocks **sound** (iPhones need a tap first),
- turns on **keep screen awake**,
- (if compass mode) asks for **motion/compass** permission on iPhone.

**States:** location denied (explain how to enable it in settings), GPS weak (accuracy worse than about 30 m).

### 6.4 Lobby
- **Content:**
  - **Join code**, huge, plus Copy link, Share (`navigator.share`) and a QR code.
  - **Player list:** avatar, name, color, host crown, role tag (when the host picks roles), grayed out when disconnected.
  - **Zone preview** map, so everyone can see the play area.
  - Summary of key settings (duration, head start, mode).
- **Host actions:** Settings, Draw zone, tap a player to toggle chaser/runner (only when "host picks" is on; otherwise show "Chasers will be picked randomly"), Kick, Make host, **Start** (disabled with a reason until there's a zone and 2+ players).
- **Non-host:** settings are read-only, plus a "Waiting for host to start…" state.
- **Actions for all:** edit character, leave.

### 6.5 Zone setup (host)
- Full-screen map. The host places a **circle** (drag the center, drag a handle or use a slider for the radius; show meters). A "Use my location" button.
- If jail mode is on: drop a **jail pin** (defaults to the zone center if not placed).
- If the shrinking zone is on: show the **final size** as a dashed inner circle.

### 6.6 Settings (host)
Grouped, with sub-options hidden when their switch is off. Full list in section 7.

### 6.7 Role reveal (start of game)
- A dramatic full-screen moment: "**You're a CHASER**" or "**You're a RUNNER**". Big, role-colored, with a short instruction:
  - Runner: "Run and hide! Chasers are released in 3:00."
  - Chaser: "Stay at the start. Close your eyes."

### 6.8 Head start (phase `headstart`)
- **Chaser:** screen blacked out; giant countdown; "Don't peek."
- **Runner:** big countdown "Chasers released in 2:41", plus their normal runner view underneath.

### 6.9 Chaser view (phase `active`)
- **Main element: the map.**
  - zone circle (shrinks live when that setting is on)
  - yourself
  - other chasers (live)
  - **runner hints**:
    - **fuzzy circle**: the runner is somewhere inside it
    - **exact dot**: when the location is exact
    - each hint is labeled with the runner's name, color and how long ago it updated ("40 s ago")
    - hints fade as they age
    - a special style for "left the zone" (exact, flagged as a penalty)
  - jail pin (jail mode)
- **Top bar:** game timer · "Next update in 1:12" countdown · runners left (e.g. "3/5 free").
- **Bottom:** big **CATCH** button → a list of free runners (avatar + name) → tap one → "Waiting for Ava to confirm… auto-confirms in 12 s".
- **Feedback states:** "Too far (42 m), get closer", "Ava disputed the catch", "Caught Ava!" (celebration).
- **Final countdown** (last few minutes): the timer changes style (red, pulsing), and updates come faster.

### 6.10 Runner view (phase `active`, status free)
Three variants, based on the host's "What runners see" setting:
- **Map:** yourself, the zone and the jail. **No chasers.** Keep it dim.
- **Compass:** one large arrow pointing toward the nearest chaser. No distance. It rotates as you turn your body.
- **Nothing:** just the timer, the danger meter and warnings. The most stealthy option.

**Always present:**
- **Game timer.**
- **Danger / heartbeat meter** with 4 levels: 0 none, 1 far (about 80 m), 2 close (about 50 m), 3 very close (about 25 m). Visual: pulsing screen-edge vignette and an icon or label ("Chaser nearby"). Sound: a heartbeat that speeds up. It shows no direction, only intensity. This is a signature element, so make it great.
- **"You were revealed"** flash when your location is sent to chasers.
- **Out-of-zone takeover:** a red full-screen warning: "Get back in! Chasers see you in 8 s", then "Chasers can see you!"
- **Catch request takeover:** "Sam says they caught you." Two huge buttons: **Yes, caught** / **No, they didn't**, with an auto-confirm countdown.
- **Jailbreak progress** (jail mode, when standing at the jail): "Freeing your team… 3/5 s" ring.
- **Immunity** after a jailbreak: "Immune for 8 s" badge.

### 6.11 Caught states
- **Jailed:** "You're in jail. Walk to the jail and wait for a teammate." Map to the jail, with teammates' status.
- **Out (spectator):** a live god-view map of everyone, with the roster and who's still free. Fun to watch.
- **Infected:** a transition "You're infected! You're a chaser now", then switch to the chaser view.

### 6.12 Paused
- Overlay on everything: "Game paused by host". The host sees **Resume**.

### 6.13 Host in-game menu
- Small, out of the way (a corner button) → Pause / Resume / End game (confirm) / Kick player.

### 6.14 End screen (phase `ended`)
- **Winner banner:** "Runners win!", "Chasers win!" or "Game ended". The reason: everyone caught / time's up / host ended.
- **Awards:** cards with title, player and value:
  - *Longest Survivor* (time)
  - *Top Chaser* (catches)
  - *Closest Call* (closest a chaser got, in meters)
  - *Marathon* (distance, in km)
- **Stats table** per player: survived time, catches, distance, closest call, start role → end role.
- **Route replay:** a map with each player's path as a colored line, plus a **timeline scrubber** that animates everyone's dots over time. Catches and jailbreaks are marked on the timeline.
- **Share card:** an image summary to post in the group chat.
- **Actions:** host **Play again** (back to the lobby with the same people and settings), everyone **Leave**.

### 6.15 Global states (design these as reusable overlays or banners)
- **Reconnecting…** (signal dropped; the app auto-rejoins the same game)
- **GPS weak / location off**
- **Keep this screen open!** reminder
- **Kicked from game**
- **Generic error toast**

---

## 7. Settings (host): everything that's adjustable

Group these into sections. Rarely changed items go under **Advanced**.

**Players**
- Number of chasers: stepper, 1 up to (players − 1), default 1
- How chasers are picked: **Random** / **Host picks**

**Time**
- Game duration: 1 min – 3 h, default 20 min (slider with nice steps: 5, 10, 15, 20, 30, 45, 60, 90, 120, 180)
- Head start: on/off, plus length 10 s – 30 min, default 3 min

**Location updates (what chasers see)**
- Mode: **Every X** / **Live** / **Off**
- Update every: 10 s – 30 min, default 2 min
- Fuzzy updates: on/off, plus circle size 10–500 m, default 60 m
- Final countdown: on/off; starts with 1–60 min left (default 3); updates every 5 s – 10 min (default 30 s)
- Anti-camping: on/off. If nobody is caught for 1–60 min (default 6), the next update is exact.

**Runners**
- What runners see: **Map** / **Compass** / **Nothing**
- Heartbeat warning: on/off; distances far/mid/near, default 80/50/25 m (Advanced)

**Play zone**
- Zone circle: center + radius 20 m – 20 km, default 200 m (drawn on the map)
- Shrinking zone: on/off; starts after 0–180 min (default 5); final size (default 80 m)
- Out-of-zone grace: 0–300 s, default 15 s (Advanced)

**When a runner is caught**
- **Infection** switch: caught runners become chasers
- **Jailbreak** switch: caught runners go to jail and a teammate can free them
  - Only one can be on at a time; turning one on turns the other off. Both off = caught runners are out and spectate.
  - Jail options: jail location (map pin, default zone center), jail size 5–100 m (default 15), seconds to free 1–60 (default 5), immunity after a jailbreak 0–120 s (default 10)

**Catching** (Advanced)
- Catch distance: 5–100 m, default 15 m
- Auto-confirm catch after: 5–120 s, default 15 s

**Other**
- Sounds & announcements: on/off

---

## 8. Moments, alerts and announcements

Each needs a visual treatment (toast / banner / takeover) and an optional sound or voice line.

| Moment | Who sees it | Suggested treatment |
|---|---|---|
| Player joined / left / kicked | everyone | small toast |
| New host | everyone | toast |
| Game started + role reveal | everyone | full-screen takeover |
| Head start over ("Here they come!") | everyone | takeover + sound |
| Paused / resumed | everyone | overlay |
| Locations updated | chasers, spectators | ping sound + map pulse |
| You were revealed | runners | dim red flash + sound |
| Final countdown begins | everyone | banner, timer turns red |
| Zone is shrinking | everyone | banner, animated circle |
| Anti-camping triggered | everyone | banner |
| 5 minutes left / 1 minute left | everyone | banner + voice |
| You left the zone / back in zone | that player | takeover / toast |
| Runner revealed for leaving the zone | that runner + chasers | banner |
| Catch request | the runner (takeover), the chaser (waiting state) | |
| Catch disputed | chaser, runner, host | toast |
| Catch too far | chaser | toast with the distance |
| Someone caught | everyone | banner "Sam caught Ava!" |
| Infected / jailed | everyone | banner |
| JAILBREAK! | everyone | big takeover + sound |
| Game over | everyone | → end screen |

---

## 9. Data each screen can use

The server pushes a full "state" object about once a second. The design can rely on all of this being available:

- **Game:** join code, phase, all settings
- **Players list:** name, color, avatar, role (chaser/runner), status (free / out / jailed), is host, connected, immunity seconds left
- **You:** your role, status, location, in zone (yes/no), seconds until revealed for leaving the zone, revealed (yes/no), heartbeat level 0–3, compass direction to the nearest chaser (degrees), jailbreak progress (seconds)
- **Zone:** center, current radius, final radius (if shrinking), shrinking now (yes/no)
- **Jail:** location and radius (jail mode only)
- **Timers:** head start seconds left, game seconds left, seconds until the next update, final countdown active (yes/no)
- **Map (chasers and spectators):** runner hints (position, circle radius or exact, reason, age in seconds), chaser positions (live). Spectators also get everyone live.
- **Pending catch:** who caught whom, seconds until auto-confirm
- **Results (end):** winner, reason, chase duration, per-player stats and routes, awards, timeline of events

**Not available** (so don't design for it): chat, live runner positions for chasers (unless the host sets updates to "Live"), the distance to a chaser for runners (only the 0–3 level), the direction to a chaser in map mode.

---

## 10. Technical constraints and the recommended stack

- **Web app**, mobile-first, portrait only. Must work in **Safari (iOS) and Chrome (Android)**. Make it installable to the home screen (PWA manifest + icon) but don't require it.
- **Stack suggestion:** Next.js (React) + Tailwind CSS. A map with **MapLibre GL** (supports custom dark map styles) or **Leaflet** with OpenStreetMap tiles. Use a **dark map style**.
- **Realtime:** one WebSocket connection to the game server. The UI simply re-renders from the latest state, and one-off moments arrive as events. No polling.
- **Must be HTTPS** (phones block GPS on plain HTTP).
- **Screen Wake Lock API** keeps the screen on; it's enabled from a tap.
- **iPhone limitations:** no vibration from websites; sound only after a user tap; compass permission must be requested from a tap.
- **Phone sizes:** design for 360–430 px wide; respect safe areas (notch, home indicator).
- **Performance:** keep it light (cheap phones, mobile data). Avoid heavy animation on map screens; battery matters in a 30+ minute game.
- **Persisted on the phone:** character (name, color, avatar) and the current game session (for auto-rejoin).

---

## 11. Coming later (leave room in the UI)

- **One-time abilities:** a runner **Decoy** (sends chasers a fake location once) and a chaser **Radar** (reveals all runners exactly once). Plan a spot for one ability button per role in the in-game screens.
- Host resolving disputed catches.
- More game modes (sardines, flashlight, kick the can).

---

## 12. What to design

1. A **visual identity**: name treatment, logo mark, color system (dark base; chaser color; runner color; danger/warning colors; 8–12 player colors that are distinct on a dark map), type scale (a bold display face for timers and the code; a legible UI face), iconography.
2. **All screens in section 6**, including every role variant and state.
3. **A component set:**
   - **Map elements:** zone circle, shrinking-zone ring, fuzzy hint circle, exact dot, aging/fade style, player markers, jail pin, your own location.
   - **Indicators:** big timer, next-update countdown, heartbeat/danger meter, compass arrow, jailbreak progress ring, immunity badge.
   - **Controls and overlays:** catch button and runner picker, toast / banner / takeover styles, settings controls (switch, stepper, segmented control, slider with value), player chip/row, code input, award card.
4. **Motion notes:** role reveal, heartbeat pulse, "locations updated" ping, jailbreak celebration, catch moment. Include reduced-motion fallbacks.
5. **A stealth/dim treatment** for runner screens.
