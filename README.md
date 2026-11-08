# Manhunt

Real-life tag after dark. Everyone joins from their phone's browser with a 4-letter code; the app referees: roles, head start, location hints for chasers, heartbeat warnings for runners, catches, jail, and a winner.

| Folder / file | What it is |
|---|---|
| [frontend/](frontend/) | The phone web app (Next.js + MapLibre). |
| [server/](server/) | The game server (Node.js + TypeScript, WebSockets). |
| [render.yaml](render.yaml) | One-click setup for the server on Render. |
| [DESIGN_BRIEF.md](DESIGN_BRIEF.md) | The design brief the frontend was built from. |
| [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md) | How the frontend talks to the server. |
| [ROADMAP.md](ROADMAP.md) | What's done and what's planned. |

## Run it on your computer
```bash
cd server && npm install && npm run dev
```
```bash
cd frontend && npm install && npm run dev
```
Open http://localhost:3000. To fill a lobby with fake players: `cd server && npm run bots -- --code ABCD --count 5`.

## Put it online (free)
1. **Server → Render.** On [render.com](https://render.com), sign in with GitHub, then **New → Blueprint**, pick this repo, **Apply**. You get a URL like `https://manhunt-server-xxxx.onrender.com`.
2. **Frontend → Vercel.** Import the repo on [vercel.com](https://vercel.com) with **Root Directory** `frontend`, and add the environment variable `NEXT_PUBLIC_WS_URL` = `wss://manhunt-server-xxxx.onrender.com/ws`.
3. Share the Vercel link with your friends.

The free Render server sleeps after 15 minutes without players and takes about a minute to wake up. The app shows "Waking up the server…" while that happens, so open it a minute before you play. Don't redeploy the server mid-game: games live in memory.

## Tips for playing
- Everyone taps **I'm ready** in the lobby. It turns on location, sound and keep-screen-on.
- Keep the app open with the screen on and brightness low. Phones stop sharing location when locked.
- iPhones can't vibrate from a website, so runners should wear one earbud for the heartbeat sound.
- Testing tip: add `?server=wss://your-server/ws` to the site URL to point a phone at a different server (`?server=default` resets it).
