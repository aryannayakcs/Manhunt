import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { distanceM, offsetPoint } from '../src/geo.ts';
import type { ServerMessage } from '../src/protocol.ts';

const CENTER = { lat: 40.7829, lng: -73.9654 };

function setup(n = 4, settings: Record<string, unknown> = {}) {
  let now = 1_000_000;
  const inbox = new Map<string, ServerMessage[]>();
  const game = new Game('TEST', (id, msg) => { if (!inbox.has(id)) inbox.set(id, []); inbox.get(id)!.push(msg); }, { now: () => now });
  const players = Array.from({ length: n }, (_, i) => game.addPlayer({ name: `P${i}`, color: '#112233' }));
  const host = players[0];
  game.handle(host.id, { type: 'update_settings', settings: { zone: { center: CENTER, radiusM: 200 }, ...settings } });
  const at = (id: string, meters: number, bearing = 0) => {
    const p = offsetPoint(CENTER, meters, bearing);
    game.handle(id, { type: 'location', lat: p.lat, lng: p.lng, accuracy: 5 });
  };
  const advance = (sec: number) => { for (let i = 0; i < sec; i++) { now += 1000; game.tick(); } };
  const events = (id: string) => (inbox.get(id) ?? []).filter(m => m.type === 'event').map(m => (m as { event: string }).event);
  const roles = () => {
    const chasers = players.filter(p => p.role === 'chaser');
    const runners = players.filter(p => p.role === 'runner');
    return { chasers, runners };
  };
  return { game, players, host, at, advance, events, roles };
}

test('random chaser selection picks the configured count', () => {
  const { game, host, roles } = setup(6, { chasers: { count: 2, selection: 'random' } });
  game.handle(host.id, { type: 'start_game' });
  assert.equal(roles().chasers.length, 2);
  assert.equal(game.phase, 'headstart');
});

test('host selection requires at least one chaser and one runner', () => {
  const { game, host, players, roles } = setup(3, { chasers: { count: 1, selection: 'host' } });
  assert.throws(() => game.handle(host.id, { type: 'start_game' }), /chaser/);
  game.handle(host.id, { type: 'set_role', playerId: players[2].id, role: 'chaser' });
  game.handle(host.id, { type: 'start_game' });
  assert.deepEqual(roles().chasers.map(p => p.id), [players[2].id]);
});

test('settings validate and allow 3 hour games but not more', () => {
  const { game, host, players } = setup(2);
  game.handle(host.id, { type: 'update_settings', settings: { durationMin: 180 } });
  assert.equal(game.settings.durationMin, 180);
  assert.throws(() => game.handle(host.id, { type: 'update_settings', settings: { durationMin: 181 } }), /durationMin/);
  assert.throws(() => game.handle(players[1].id, { type: 'update_settings', settings: { durationMin: 30 } }), /host/);
});

test('head start, then fuzzy scheduled updates that contain the runner', () => {
  const { game, host, at, advance, roles } = setup(2, {
    headStart: { enabled: true, seconds: 30 }, locationUpdates: { mode: 'interval', intervalSec: 60 }, fuzzy: { enabled: true, radiusM: 50 },
  });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r] } = roles();
  at(c.id, 0); at(r.id, 100, 90);
  const tick = (n: number) => { for (let i = 0; i < n; i++) { at(c.id, 0); at(r.id, 100, 90); advance(1); } };
  tick(29);
  assert.equal(game.phase, 'headstart');
  assert.equal(game.stateFor(c.id).map.runners.length, 0, 'chasers see nothing during head start');
  tick(1);
  assert.equal(game.phase, 'active');
  tick(60);
  const m = game.stateFor(c.id).map.runners;
  assert.equal(m.length, 1);
  assert.equal(m[0].exact, false);
  assert.ok(distanceM(m[0], offsetPoint(CENTER, 100, 90)) <= 50, 'runner is inside the fuzzy circle');
  assert.equal(game.stateFor(r.id).map.runners.length, 0, 'runners do not see the chaser map');
});

test('catch flow: too far is rejected, close + confirm puts runner out, chasers win', () => {
  const { game, host, at, advance, roles } = setup(2, { headStart: { enabled: false, seconds: 10 } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r] } = roles();
  at(c.id, 0); at(r.id, 100);
  assert.throws(() => game.handle(c.id, { type: 'catch', runnerId: r.id }), /Too far/);
  at(r.id, 10);
  game.handle(c.id, { type: 'catch', runnerId: r.id });
  const pc = game.stateFor(r.id).pendingCatch!;
  assert.ok(pc);
  game.handle(r.id, { type: 'catch_response', catchId: pc.catchId, accept: true });
  assert.equal(game.phase, 'ended');
  assert.equal(game.stateFor(c.id).results?.winner, 'chasers');
  advance(1);
});

test('disputed catch is cancelled; ignored catch auto-accepts', () => {
  const { game, host, at, advance, roles } = setup(3, { headStart: { enabled: false, seconds: 10 }, catching: { radiusM: 15, autoAcceptSec: 10 } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r1, r2] } = roles();
  at(c.id, 0); at(r1.id, 5); at(r2.id, 200, 180);
  game.handle(c.id, { type: 'catch', runnerId: r1.id });
  game.handle(r1.id, { type: 'catch_response', catchId: game.stateFor(r1.id).pendingCatch!.catchId, accept: false });
  assert.equal(r1.status, 'free');
  game.handle(c.id, { type: 'catch', runnerId: r1.id });
  advance(10);
  assert.equal(r1.status, 'out');
  assert.equal(game.phase, 'active', 'one runner still free');
});

test('infection mode turns caught runners into chasers', () => {
  const { game, host, at, roles } = setup(3, { headStart: { enabled: false, seconds: 10 }, caughtMode: 'infection' });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r1] } = roles();
  at(c.id, 0); at(r1.id, 5);
  game.handle(c.id, { type: 'catch', runnerId: r1.id });
  game.handle(r1.id, { type: 'catch_response', catchId: game.stateFor(r1.id).pendingCatch!.catchId, accept: true });
  assert.equal(r1.role, 'chaser');
  assert.equal(r1.status, 'free');
});

test('jail mode: standing in jail frees jailed runners with immunity', () => {
  const { game, host, at, advance, roles, events } = setup(3, { headStart: { enabled: false, seconds: 10 }, caughtMode: 'jail', jail: { holdSec: 5, immunitySec: 10 } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r1, r2] } = roles();
  at(c.id, 100); at(r1.id, 105); at(r2.id, 150, 180);
  game.handle(c.id, { type: 'catch', runnerId: r1.id });
  game.handle(r1.id, { type: 'catch_response', catchId: game.stateFor(r1.id).pendingCatch!.catchId, accept: true });
  assert.equal(r1.status, 'jailed');
  at(r2.id, 3); // jail = zone center
  for (let i = 0; i < 6; i++) { at(r2.id, 3); advance(1); }
  assert.equal(r1.status, 'free');
  assert.ok(events(c.id).includes('jailbreak'));
  at(r1.id, 101);
  assert.throws(() => game.handle(c.id, { type: 'catch', runnerId: r1.id }), /immune/);
});

test('leaving the zone reveals the runner exactly after the grace period', () => {
  const { game, host, at, advance, roles, events } = setup(2, { headStart: { enabled: false, seconds: 10 }, outOfZone: { graceSec: 10 }, locationUpdates: { mode: 'off', intervalSec: 60 } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r] } = roles();
  at(c.id, 0); at(r.id, 300);
  advance(1);
  assert.ok(events(r.id).includes('out_of_zone'));
  assert.equal(game.stateFor(c.id).map.runners.length, 0);
  for (let i = 0; i < 10; i++) { at(r.id, 300); advance(1); }
  const m = game.stateFor(c.id).map.runners;
  assert.equal(m[0]?.exact, true);
  assert.equal(m[0]?.reason, 'out_of_zone');
  at(r.id, 50); advance(1);
  assert.equal(game.stateFor(c.id).map.runners.length, 0, 'reveal clears when back inside');
});

test('heartbeat warns runners without revealing direction', () => {
  const { game, host, at, advance, roles } = setup(2, { headStart: { enabled: false, seconds: 10 } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r] } = roles();
  at(r.id, 0); at(c.id, 40, 90); advance(1);
  const you = game.stateFor(r.id).you;
  assert.equal(you.heartbeat, 2);
  assert.ok(!('compassBearing' in you), 'no direction is sent to runners');
  assert.throws(() => game.handle(host.id, { type: 'update_settings', settings: { runnerView: 'compass' } }));
});

test('time up with a free runner = runners win; pause stops the clock', () => {
  const { game, host, at, advance, roles } = setup(2, { headStart: { enabled: false, seconds: 10 }, durationMin: 1 });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r] } = roles();
  at(c.id, 0); at(r.id, 100);
  advance(30);
  game.handle(host.id, { type: 'pause' });
  advance(120);
  assert.equal(game.phase, 'paused');
  game.handle(host.id, { type: 'resume' });
  assert.equal(game.stateFor(r.id).timers.gameLeftSec, 30);
  advance(30);
  assert.equal(game.phase, 'ended');
  const res = game.stateFor(r.id).results!;
  assert.equal(res.winner, 'runners');
  assert.ok(res.awards.some(a => a.id === 'longest_survivor'));
  game.handle(host.id, { type: 'rematch' });
  assert.equal(game.phase, 'lobby');
});

test('shrinking zone gets smaller over the game', () => {
  const { game, host, advance } = setup(2, { headStart: { enabled: false, seconds: 10 }, durationMin: 10, zone: { center: CENTER, radiusM: 200 }, shrinkingZone: { enabled: true, style: 'smooth', startAfterMin: 0, finalRadiusM: 100 } });
  game.handle(host.id, { type: 'start_game' });
  advance(300);
  assert.equal(Math.round(game.zoneRadius()), 150);
});

test('walking distance is counted even with small 1-second steps', () => {
  const { game, host, players, advance } = setup(2, { headStart: { enabled: false, seconds: 10 } });
  game.handle(host.id, { type: 'start_game' });
  const p = players[1];
  for (let i = 0; i <= 100; i++) {
    const pt = offsetPoint(CENTER, i * 1.4, 90); // walking pace, one update per second
    game.handle(p.id, { type: 'location', lat: pt.lat, lng: pt.lng, accuracy: 8 });
    advance(1);
  }
  game.handle(host.id, { type: 'end_game' });
  const d = game.stateFor(p.id).results!.players.find(x => x.playerId === p.id)!.distanceM;
  assert.ok(d >= 125 && d <= 145, `expected ~140 m, got ${d}`);
});

test('a runner whose phone goes dark is shown at their last spot until it comes back', () => {
  const { game, host, at, advance, roles, events } = setup(2, { headStart: { enabled: false, seconds: 10 }, locationUpdates: { mode: 'off', intervalSec: 60 } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r] } = roles();
  at(r.id, 100);
  for (let i = 0; i < 25; i++) { at(c.id, 0); advance(1); }
  assert.equal(game.stateFor(c.id).map.runners.length, 0, 'still fine before 30 s');
  for (let i = 0; i < 10; i++) { at(c.id, 0); advance(1); }
  const m = game.stateFor(c.id).map.runners;
  assert.equal(m[0]?.reason, 'signal_lost');
  assert.equal(m[0]?.exact, true);
  assert.ok(events(c.id).includes('signal_lost'));
  assert.equal(game.stateFor(c.id).players.find(p => p.id === r.id)?.gpsLost, true);
  at(r.id, 120); advance(1);
  assert.equal(game.stateFor(c.id).map.runners.length, 0, 'hidden again once the phone is back');
  assert.equal(game.stateFor(c.id).players.find(p => p.id === r.id)?.gpsLost, false);
});

test('who can see chasers: runners (off by default) and chasers (on by default)', () => {
  const { game, host, at, roles } = setup(4, { headStart: { enabled: false, seconds: 10 }, chasers: { count: 2, selection: 'random' } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c1, c2], runners: [r] } = roles();
  at(c1.id, 0); at(c2.id, 50); at(r.id, 100);
  assert.equal(game.stateFor(r.id).map.chasers.length, 0, 'runners see no chasers by default');
  assert.equal(game.stateFor(c1.id).map.chasers.length, 2, 'chasers see each other by default');

  // settings can only change in the lobby: end, change, start again
  game.handle(host.id, { type: 'end_game' });
  game.handle(host.id, { type: 'rematch' });
  game.handle(host.id, { type: 'update_settings', settings: { chasers: { count: 2, selection: 'random' }, visibility: { runnersSeeChasers: true, chaserUpdates: 'live', chasersSeeChasers: false } } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [d1, d2], runners: [r2] } = roles();
  at(d1.id, 0); at(d2.id, 50); at(r2.id, 100);
  assert.equal(game.stateFor(r2.id).map.chasers.length, 2, 'runners now see chasers');
  assert.deepEqual(game.stateFor(d1.id).map.chasers.map(x => x.playerId), [d1.id], 'chasers only see themselves');

  // runners with the "nothing" view never get chaser positions
  game.handle(host.id, { type: 'end_game' });
  game.handle(host.id, { type: 'rematch' });
  game.handle(host.id, { type: 'update_settings', settings: { runnerView: 'none' } });
  game.handle(host.id, { type: 'start_game' });
  const { runners: [r3], chasers: [e1] } = roles();
  at(e1.id, 0); at(r3.id, 100);
  assert.equal(game.stateFor(r3.id).map.chasers.length, 0);
});

test('staged zone: holds, shrinks one step at a time, announces each stage', () => {
  // 3 stages from 200 m to 80 m: 160 -> 120 -> 80. First shrink at 2 min, every 3 min, each takes 60 s.
  const { game, host, advance, events } = setup(2, { headStart: { enabled: false, seconds: 10 }, durationMin: 20,
    shrinkingZone: { enabled: true, style: 'stages', startAfterMin: 2, finalRadiusM: 80, stages: 3, intervalMin: 3, shrinkSec: 60 } });
  game.handle(host.id, { type: 'start_game' });
  const z = () => game.stateFor(host.id).zone;
  assert.equal(z().radiusM, 200);
  assert.equal(z().nextRadiusM, 160);
  assert.equal(z().nextShrinkInSec, 120);
  advance(119);
  assert.equal(z().radiusM, 200, 'holds until the first shrink');
  advance(31);
  assert.equal(z().shrinking, true);
  assert.equal(z().radiusM, 180, 'halfway through the first shrink');
  advance(30);
  assert.equal(z().radiusM, 160);
  assert.equal(z().shrinking, false, 'holds after the shrink');
  assert.equal(z().nextRadiusM, 120);
  assert.equal(z().nextShrinkInSec, 120);
  assert.equal(z().stage, 2);
  advance(120 + 60 + 120 + 60);
  assert.equal(z().radiusM, 80, 'reaches the final size after the last stage');
  assert.equal(z().nextRadiusM, null);
  assert.equal(events(host.id).filter(e => e === 'zone_shrinking').length, 3);
});

test('auto-catch: staying within range catches the runner with no tap or confirmation', () => {
  const { game, host, advance, roles, events } = setup(3, { headStart: { enabled: false, seconds: 10 }, catching: { auto: true, autoRadiusM: 5, autoHoldSec: 2 } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r1, r2] } = roles();
  const put = (id: string, m: number, accuracy = 5) => { const p = offsetPoint(CENTER, m, 90); game.handle(id, { type: 'location', lat: p.lat, lng: p.lng, accuracy }); };
  const step = (cm: number, r1m: number, acc = 5) => { put(c.id, cm); put(r1.id, r1m, acc); put(r2.id, -150); advance(1); };
  step(0, 20); step(0, 20);
  assert.equal(r1.status, 'free', 'not caught at 20 m');
  step(0, 4, 40); step(0, 4, 40); step(0, 4, 40);
  assert.equal(r1.status, 'free', 'not caught when GPS accuracy is poor');
  step(0, 4); // first moment close
  assert.equal(r1.status, 'free', 'has to stay close for the hold time');
  step(0, 3); step(0, 3);
  assert.equal(r1.status, 'out', 'caught automatically');
  assert.ok(events(c.id).includes('player_caught'));
  assert.equal(game.phase, 'active', 'other runner still free');
});

test('auto-catch is off by default', () => {
  const { game, host, at, advance, roles } = setup(2, { headStart: { enabled: false, seconds: 10 } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r] } = roles();
  for (let i = 0; i < 5; i++) { at(c.id, 0); at(r.id, 1); advance(1); }
  assert.equal(r.status, 'free');
});

test('runners see chasers on a timer, each snapshot shown for a set time', () => {
  const { game, host, at, advance, roles, events } = setup(3, { headStart: { enabled: false, seconds: 10 },
    visibility: { runnersSeeChasers: true, chaserUpdates: 'interval', chaserIntervalSec: 60, chaserShowSec: 15, chasersSeeChasers: true } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r] } = roles();
  const tick = (n: number) => { for (let i = 0; i < n; i++) { at(c.id, 0); at(r.id, 100); advance(1); } };
  tick(1);
  assert.equal(game.stateFor(r.id).map.chasers.length, 0, 'nothing before the first snapshot');
  assert.equal(game.stateFor(r.id).timers.chaserRevealInSec, 59);
  tick(59);
  const snap = game.stateFor(r.id).map.chasers;
  assert.equal(snap.length, 1, 'snapshot at 60 s');
  assert.equal(snap[0].ageSec, 0);
  assert.ok(events(r.id).includes('chasers_revealed'));
  tick(14);
  assert.equal(game.stateFor(r.id).map.chasers.length, 1, 'still shown at 14 s');
  tick(1);
  assert.equal(game.stateFor(r.id).map.chasers.length, 0, 'gone after 15 s');
  assert.equal(game.stateFor(r.id).timers.chaserRevealInSec, 45);
});

test('chasers: each runner update can disappear after a set time', () => {
  const { game, host, at, advance, roles } = setup(2, { headStart: { enabled: false, seconds: 10 },
    locationUpdates: { mode: 'interval', intervalSec: 60, showSec: 10 } });
  game.handle(host.id, { type: 'start_game' });
  const { chasers: [c], runners: [r] } = roles();
  const tick = (n: number) => { for (let i = 0; i < n; i++) { at(c.id, 0); at(r.id, 100); advance(1); } };
  tick(60);
  assert.equal(game.stateFor(c.id).map.runners.length, 1, 'update shown');
  tick(9);
  assert.equal(game.stateFor(c.id).map.runners.length, 1);
  tick(1);
  assert.equal(game.stateFor(c.id).map.runners.length, 0, 'hidden after 10 s');
});
