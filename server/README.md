# Game server

Realtime referee for the chase game. Node.js + TypeScript (run directly by Node 22.18+, no build step), WebSockets via `ws`, validation via `zod`. All game state is in memory.

## Run locally
```bash
npm install
npm run dev        # http://localhost:8080, WebSocket at ws://localhost:8080/ws
```

## Test
```bash
npm test                                              # rule tests
npm run typecheck
npm run bots -- --create --count 6 --start --fast     # full fake game in the terminal
npm run bots -- --code ABCD --count 5                 # add bots to your own lobby
```

## Files
| File | What it does |
|---|---|
| `src/index.ts` | HTTP + WebSocket server, game codes, 1-second tick, cleanup |
| `src/game.ts` | All game rules: roles, timers, updates, zone, catches, jail, results |
| `src/settings.ts` | Every setting with ranges and defaults |
| `src/protocol.ts` | Every message between frontend and server (types to share with the frontend) |
| `src/geo.ts` | Distance, bearing and fuzzy-circle math |
| `scripts/bots.ts` | Fake players for testing |

## Deploy (Render, free tier)
1. Push this repo to GitHub.
2. On Render: **New → Web Service**, pick the repo, set **Root Directory** to `server`.
3. Build command `npm install`, start command `npm start`. Render sets `PORT` itself.
4. Your frontend connects to `wss://<your-service>.onrender.com/ws`.

Free Render services sleep after 15 minutes of no traffic and take about a minute to wake up. Open the site a minute before you play. Games live in memory, so a restart or redeploy ends any game in progress.
