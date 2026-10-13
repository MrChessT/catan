import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createGame, playInitialSetup, bankCorners, roll, endTurn, moveRobberOffBank, bankEvents, SOC, CONST,
} from "./helpers.js"
const ST = CONST.GAME_STATES
const WINDOW = CONST.MONEY.BET_WINDOW

/** P1 (bank unlocked, 10 money) is in its actions phase with the robber off the desert */
function readyToBet() {
  const ctx = createGame()
  playInitialSetup(ctx, { 1: [bankCorners(ctx.game)[0]] })
  moveRobberOffBank(ctx.game)
  roll(ctx, 2, 3) // 5
  return { ...ctx, p1: ctx.game.getPlayer(1) }
}

/** Ends the turn and rolls `d1+d2` for the next player (who ends up in the actions phase) */
function nextTurnRolling(ctx, d1, d2) {
  endTurn(ctx)
  roll(ctx, d1, d2)
  if (ctx.game.state !== ST.PLAYER_ACTIONS) throw new Error('unexpected state ' + ctx.game.state)
}

test('bet: amount is taken when placed, bet is private', () => {
  const { game, p1, sockets, emitted } = readyToBet()
  sockets[1].send(SOC.BANK_BET, 6, 4)
  assert.equal(p1.money, 6)
  assert.deepEqual(p1.bets, [{ number: 6, amount: 4, turn_created: game.turn }])
  assert.deepEqual(p1.toJSON(true).bets, p1.bets, 'kept on refresh (private JSON)')
  assert.equal(p1.toJSON().bets, undefined)
  const to_p2 = bankEvents(emitted, 'sock-2').find(e => e.type === 'bet_placed')
  assert.deepEqual(to_p2.context, { amount: 4 }, 'others do not see the number')
  const to_p1 = bankEvents(emitted, 'sock-1').find(e => e.type === 'bet_placed')
  assert.deepEqual(to_p1.context, { amount: 4, number: 6, turn_created: game.turn, payout: 6 })
})

test('bet: wins with floor(amount × multiplier) when the number comes out', () => {
  const ctx = readyToBet()
  ctx.sockets[1].send(SOC.BANK_BET, 6, 5) // 5 × 1.5 = 7.5 → 7
  assert.equal(ctx.p1.money, 5)
  nextTurnRolling(ctx, 3, 3) // P2 rolls a 6
  assert.equal(ctx.p1.money, 5 + 7)
  assert.deepEqual(ctx.p1.bets, [])
  const win = bankEvents(ctx.emitted, 'sock-2').find(e => e.type === 'bet_win')
  assert.deepEqual(win.context, { number: 6, amount: 5, turn_created: 3, payout: 7 })
})

test('bet: every multiplier pays as documented', () => {
  const expected = { 2: 50, 12: 50, 3: 30, 11: 30, 4: 20, 5: 20, 9: 20, 10: 20, 6: 15, 8: 15 }
  for (const [number, payout] of Object.entries(expected)) {
    const ctx = readyToBet()
    ctx.sockets[1].send(SOC.BANK_BET, +number, 10)
    const d1 = Math.min(6, +number - 1), d2 = +number - d1
    nextTurnRolling(ctx, d1, d2)
    assert.equal(ctx.p1.money, payout, `bet on ${number}`)
  }
})

test('bet: still wins on the last roll of the window (turn_created + 3)', () => {
  const ctx = readyToBet()
  const { game, p1, sockets } = ctx
  sockets[1].send(SOC.BANK_BET, 12, 2)
  const created = game.turn
  // 2 players: 2 rolls per round. Stop at P1's actions in round created + WINDOW:
  // the next roll (P2's) is the last one of the window
  while (!(game.turn === created + WINDOW && game.active_pid === 1)) { nextTurnRolling(ctx, 2, 3) }
  assert.equal(p1.bets.length, 1, 'still active')
  nextTurnRolling(ctx, 6, 6)
  assert.equal(game.turn, created + WINDOW, 'rolled within the window')
  assert.equal(p1.money, 8 + 10)
  assert.equal(p1.bets.length, 0)
})

test('bet: lost on the first roll after the window, even if the number comes out', () => {
  const ctx = readyToBet()
  const { game, p1, sockets, emitted } = ctx
  sockets[1].send(SOC.BANK_BET, 12, 2)
  const created = game.turn
  while (game.turn <= created + WINDOW) { nextTurnRolling(ctx, 2, 3) }
  // That loop already rolled once in turn created + WINDOW + 1 → lost there
  assert.equal(game.turn, created + WINDOW + 1)
  assert.equal(p1.bets.length, 0)
  assert.equal(p1.money, 8, 'nothing paid back')
  const lose = bankEvents(emitted, 'sock-2').filter(e => e.type === 'bet_lose')
  assert.equal(lose.length, 1, 'resolved only once')
  assert.deepEqual(lose[0].context, { number: 12, amount: 2, turn_created: created })
  // A 12 later does not pay anything
  nextTurnRolling(ctx, 6, 6)
  assert.equal(p1.money, 8)
})

test('bet: the window is exactly 3 table turns (turn_created + 3)', () => {
  const ctx = readyToBet()
  const { game, p1, sockets } = ctx
  sockets[1].send(SOC.BANK_BET, 12, 2)
  const created = game.turn
  const rolls_while_active = []
  while (p1.bets.length) {
    nextTurnRolling(ctx, 2, 3)
    p1.bets.length && rolls_while_active.push(game.turn)
  }
  assert.equal(Math.max(...rolls_while_active), created + WINDOW)
})

test('bet: a 7 does not resolve a bet but does count for the expiry', () => {
  const ctx = readyToBet()
  const { game, p1, sockets } = ctx
  sockets[1].send(SOC.BANK_BET, 6, 2)
  const created = game.turn
  while (game.turn <= created + WINDOW) { nextTurnRolling(ctx, 2, 3) }
  assert.equal(p1.bets.length, 0)
  // New bet, then the expiring roll is a 7
  const ctx2 = readyToBet()
  ctx2.sockets[1].send(SOC.BANK_BET, 6, 2)
  const c2 = ctx2.game.turn
  while (!(ctx2.game.turn === c2 + WINDOW && ctx2.game.active_pid === 2)) { nextTurnRolling(ctx2, 2, 3) }
  endTurn(ctx2)
  roll(ctx2, 3, 4) // first roll of turn c2 + WINDOW + 1 is a 7
  assert.equal(ctx2.p1.bets.length, 0)
  assert.equal(bankEvents(ctx2.emitted, 'sock-1').filter(e => e.type === 'bet_lose').length, 1)
})

test('bet: only one active bet per player', () => {
  const { p1, sockets, emitted } = readyToBet()
  sockets[1].send(SOC.BANK_BET, 6, 2)
  sockets[1].send(SOC.BANK_BET, 8, 2)
  assert.equal(p1.bets.length, 1)
  assert.equal(p1.money, 8)
  assert.equal(bankEvents(emitted, 'sock-1').at(-1).context.reason, 'bet_active')
})

test('bet: invalid numbers and amounts are rejected (manual socket.emit cheats)', () => {
  const { p1, sockets } = readyToBet()
  const bad = [
    [7, 1], [1, 1], [13, 1], [0, 1], ['6', 1], [6.5, 1], [null, 1], ['__proto__', 1], ['toString', 1],
    [6, 0], [6, -3], [6, 1.5], [6, '5'], [6, NaN], [6, Infinity], [6, null], [6, 11], [6, { valueOf: _ => 1 }],
  ]
  bad.forEach(([n, a]) => sockets[1].send(SOC.BANK_BET, n, a))
  assert.equal(p1.money, 10)
  assert.deepEqual(p1.bets, [])
})

test('bet: can not bet with the robber on the desert, out of turn or with a locked bank', () => {
  // Robber on the desert
  const ctx = createGame()
  playInitialSetup(ctx, { 1: [bankCorners(ctx.game)[0]], 2: [bankCorners(ctx.game)[3]] })
  roll(ctx, 2, 3)
  ctx.sockets[1].send(SOC.BANK_BET, 6, 2)
  assert.equal(ctx.game.getPlayer(1).money, 10)
  assert.equal(bankEvents(ctx.emitted, 'sock-1').at(-1).context.reason, 'robber')
  // Out of turn
  moveRobberOffBank(ctx.game)
  ctx.sockets[2].send(SOC.BANK_BET, 6, 2)
  assert.equal(ctx.game.getPlayer(2).bets.length, 0)
  assert.equal(bankEvents(ctx.emitted, 'sock-2').at(-1).context.reason, 'not_your_turn')
  // Locked bank
  const ctx3 = createGame()
  playInitialSetup(ctx3)
  moveRobberOffBank(ctx3.game)
  roll(ctx3, 2, 3)
  ctx3.game.getPlayer(1).money = 10
  ctx3.sockets[1].send(SOC.BANK_BET, 6, 2)
  assert.equal(ctx3.game.getPlayer(1).bets.length, 0)
})

test('bet: resolves even after the robber closes the bank', () => {
  const ctx = readyToBet()
  ctx.sockets[1].send(SOC.BANK_BET, 8, 4)
  const desert = ctx.game.board.getRobbableTiles()
    .find(id => ctx.game.board.findTile(id).type === CONST.BANK_TILE)
  ctx.game.board.moveRobber(desert) // bank closed now
  nextTurnRolling(ctx, 4, 4)
  assert.equal(ctx.p1.money, 6 + 6)
})

test('bet: all of the money can be bet, but not more', () => {
  const { p1, sockets } = readyToBet()
  sockets[1].send(SOC.BANK_BET, 2, 11)
  assert.equal(p1.bets.length, 0)
  sockets[1].send(SOC.BANK_BET, 2, 10)
  assert.equal(p1.money, 0)
  assert.equal(p1.bets.length, 1)
})

test('bet: with 3 and 4 players the window covers every roll until turn_created + 3', () => {
  for (const player_count of [3, 4]) {
    const ctx = createGame({ player_count })
    const { game } = ctx
    playInitialSetup(ctx, { 1: [bankCorners(game)[0]] })
    moveRobberOffBank(game)
    roll(ctx, 2, 3)
    ctx.sockets[1].send(SOC.BANK_BET, 12, 1)
    const created = game.turn
    let rolls = 0
    while (game.getPlayer(1).bets.length) { nextTurnRolling(ctx, 2, 3); rolls++ }
    // Rest of this round (player_count - 1 rolls) + 3 full rounds, then the expiring roll
    assert.equal(rolls, (player_count - 1) + WINDOW * player_count + 1, `${player_count} players`)
    assert.equal(game.turn, created + WINDOW + 1)
  }
})
