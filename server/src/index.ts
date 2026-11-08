import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { Game, GameError } from './game.ts';
import { ClientMessageSchema, type ServerMessage } from './protocol.ts';

const PORT = Number(process.env.PORT ?? 8080);
const VERSION = '2026-11-07c'; // bump when deploying, so /health shows which code is live
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
const EMPTY_GAME_TTL_MS = 30 * 60_000; // delete games with nobody connected after 30 min
const LOCATION_MIN_GAP_MS = 500;

const games = new Map<string, Game>();
/** playerId -> open socket (one per player; a new connection replaces the old). */
const sockets = new Map<string, WebSocket>();

function sendTo(playerId: string, msg: ServerMessage) {
  const ws = sockets.get(playerId);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!games.has(c)) return c;
  }
}

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    let players = 0; for (const g of games.values()) players += g.connectedCount;
    res.end(JSON.stringify({ ok: true, version: VERSION, games: games.size, players }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Game server is running. Connect with a WebSocket to /ws');
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024 });

interface Session { playerId: string | null; game: Game | null; lastLocationAt: number; alive: boolean }
const sessions = new WeakMap<WebSocket, Session>();

wss.on('connection', (ws) => {
  const s: Session = { playerId: null, game: null, lastLocationAt: 0, alive: true };
  sessions.set(ws, s);
  ws.on('pong', () => { s.alive = true; });

  const reply = (msg: ServerMessage) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
  const attach = (game: Game, playerId: string, token: string) => {
    const old = sockets.get(playerId);
    if (old && old !== ws) old.close(4000, 'replaced by a newer connection');
    s.game = game; s.playerId = playerId;
    sockets.set(playerId, ws);
    reply({ type: 'joined', code: game.code, playerId, token });
    game.setConnected(playerId, true);
    sendTo(playerId, { type: 'state', state: game.stateFor(playerId) });
  };

  ws.on('message', (raw) => {
    let data: unknown;
    try { data = JSON.parse(raw.toString()); } catch { return reply({ type: 'error', code: 'bad_json', message: 'Message was not valid JSON.' }); }
    const parsed = ClientMessageSchema.safeParse(data);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return reply({ type: 'error', code: 'bad_message', message: `${i.path.join('.') || 'message'}: ${i.message}` });
    }
    const msg = parsed.data;
    try {
      switch (msg.type) {
        case 'ping': return reply({ type: 'pong' });
        case 'create_game': {
          if (s.playerId) throw new GameError('already_in_game', 'Leave your current game first.');
          const game = new Game(newCode(), sendTo);
          games.set(game.code, game);
          const p = game.addPlayer(msg);
          return attach(game, p.id, p.token);
        }
        case 'join_game': {
          if (s.playerId) throw new GameError('already_in_game', 'Leave your current game first.');
          const game = games.get(msg.code);
          if (!game) throw new GameError('no_game', `No game with code ${msg.code}.`);
          const p = game.addPlayer(msg);
          return attach(game, p.id, p.token);
        }
        case 'rejoin': {
          const game = games.get(msg.code);
          if (!game) throw new GameError('no_game', 'That game has ended or expired.');
          const p = game.authenticate(msg.playerId, msg.token);
          return attach(game, p.id, p.token);
        }
        case 'leave': {
          if (!s.game || !s.playerId) return;
          const { game, playerId } = s;
          sockets.delete(playerId);
          s.game = null; s.playerId = null;
          game.removePlayer(playerId);
          if (game.isEmpty) games.delete(game.code);
          return;
        }
        default: {
          if (!s.game || !s.playerId) {
            if (msg.type === 'location') return; // phones send GPS before (re)joining; just ignore it
            throw new GameError('not_in_game', 'Join a game first.');
          }
          if (msg.type === 'location') {
            const now = Date.now();
            if (now - s.lastLocationAt < LOCATION_MIN_GAP_MS) return;
            s.lastLocationAt = now;
          }
          s.game.handle(s.playerId, msg);
        }
      }
    } catch (err) {
      if (err instanceof GameError) return reply({ type: 'error', code: err.code, message: err.message });
      console.error(err);
      reply({ type: 'error', code: 'server_error', message: 'Something went wrong on the server.' });
    }
  });

  ws.on('close', () => {
    if (s.playerId && sockets.get(s.playerId) === ws) {
      sockets.delete(s.playerId);
      s.game?.setConnected(s.playerId, false);
    }
  });
});

// Game clock: one tick per second for every game.
setInterval(() => {
  for (const g of games.values()) {
    try { g.tick(); } catch (err) { console.error(`tick ${g.code}`, err); }
  }
}, 1000);

// Keep connections alive through proxies and drop dead ones; clean up abandoned games.
setInterval(() => {
  for (const ws of wss.clients) {
    const s = sessions.get(ws);
    if (s && !s.alive) { ws.terminate(); continue; }
    if (s) s.alive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [code, g] of games) {
    if (g.connectedCount === 0 && now - g.lastActivity > EMPTY_GAME_TTL_MS) games.delete(code);
  }
}, 25_000);

http.listen(PORT, () => console.log(`Game server listening on http://localhost:${PORT} (WebSocket: ws://localhost:${PORT}/ws)`));
