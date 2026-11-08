# Chase Game

A real-life outdoor chase game (chasers vs runners) refereed by a phone web app.

| Folder / file | What it is |
|---|---|
| [server/](server/) | Game server (Node.js + TypeScript, WebSockets). Done. |
| `frontend/` | Coming next: the phone web app. |
| [DESIGN_BRIEF.md](DESIGN_BRIEF.md) | Everything a designer needs to design the frontend. |
| [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md) | Technical guide for connecting the frontend to the server. |
| [ROADMAP.md](ROADMAP.md) | What's done and what's planned. |

## Quick start
```bash
cd server && npm install && npm run dev
```
Then watch a fake game: `npm run bots -- --create --count 6 --start --fast`
