# Roadmap

## Done (backend)
- Lobby with 4-letter join code, characters, rejoin after refresh or a dropped signal
- Chaser selection: random (set count) or picked by the host
- Game duration 1 min – 3 h, head start (toggle + length), location updates (interval / live / off)
- Fuzzy updates, final countdown, heartbeat warning, anti-camping (all toggleable)
- Leaving the zone: chasers see you after 3 s, you're out after 15 s (both adjustable)
- Runners see each other on their map (optional)
- Every event pings: sound, screen-edge flash and vibration (Android; best-effort tap on iPhone iOS 18+)
- Circular play zone, optional shrinking zone (in stages with set timings, or continuous), out-of-zone warning and reveal
- When caught: out / infection / jail with jailbreak and immunity
- Runner view: map / nothing (runners only get a pulsing "how close" warning, never a direction)
- Who can see chasers: runners (optional; live, or a snapshot every X shown for Y seconds) and other chasers (optional)
- Chasers' runner updates can disappear after a set time instead of staying until the next one
- Phones that go dark for 30 s reveal the runner's last spot ("PHONE OFF"); lock-the-app guide in the lobby
- Zone can be placed anywhere: place search, tap to move, drag the edge to resize (up to 20 km)
- /gallery page showing every screen with sample data
- Catch with distance check, confirm/dispute, auto-confirm; optional auto-catch when a chaser stays within a set distance (needs good GPS on both phones)
- Host controls: pause, resume, end, kick, transfer host, rematch
- Event stream for sounds and announcements
- End screen data: winner, awards, stats, route replay, timeline
- Bot simulator and rule tests

## Next: frontend (you)
See [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md).

## Later
- **One-time abilities** (one use per game each):
  - Runner **decoy**: sends chasers one fake location update.
  - Chaser **radar scan**: reveals every runner exactly, once.
  - Planned shape: setting `abilities: { enabled, decoy, radar }`, message `{ type: 'use_ability', ability }`, event `ability_used`, and `you.abilities` in state showing what's left.
- Host can resolve disputed catches (force catch / dismiss)
- Native wrapper (Capacitor) for lock-screen location and real vibration on iPhone
- Save finished games (database) so replays survive a server restart
- More modes: sardines, flashlight, kick the can
