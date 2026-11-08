# Roadmap

## Done (backend)
- Lobby with 4-letter join code, characters, rejoin after refresh or a dropped signal
- Chaser selection: random (set count) or picked by the host
- Game duration 1 min – 3 h, head start (toggle + length), location updates (interval / live / off)
- Fuzzy updates, final countdown, heartbeat warning, anti-camping (all toggleable)
- Circular play zone, optional shrinking zone, out-of-zone warning and reveal
- When caught: out / infection / jail with jailbreak and immunity
- Runner view: map / compass / nothing
- Catch with distance check, confirm/dispute, auto-confirm
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
