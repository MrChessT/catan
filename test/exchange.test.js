import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createGame, playInitialSetup, bankCorners, roll, endTurn, moveRobberOffBank, bankEvents, SOC, CONST,
} from "./helpers.js"
const COST = CONST.MONEY.EXCHANGE_COST

/** P1 has the bank unlocked, it's P1's actions phase and the robber is off the desert */
function readyToBank({ money } = {}) {
  const ctx = createGame()
  playInitialSetup(ctx, { 1: [bankCorners(ctx.game)[0]] })
  moveRobberOffBank(ctx.game)
  roll(ctx, 1, 1) // any non-7 roll → actions phase
  const p1 = ctx.game.getPlayer(1)
  if (money !== undefined) { p1.money = money }
  return { ...ctx, p1 }
}

test('exchange: 6 money → 1 resource of choice', () => {
  const ctx = readyToBank()
  const { p1, sockets, emitted } = ctx
  const wheat = p1.closed_cards.W, total = p1.resource_count
  sockets[1].send(SOC.BANK_EXCHANGE, 'W')
  assert.equal(p1.money, CONST.MONEY.UNLOCK_BONUS - COST)
  assert.equal(p1.closed_cards.W, wheat + 1)
  assert.equal(p1.resource_count, total + 1)
  const ev = bankEvents(emitted, 'sock-2').find(e => e.type === 'exchange')
  assert.deepEqual(ev, { type: 'exchange', pid: 1, context: { res: 'W', cost: COST } })
})

test('exchange: rejected without enough money', () => {
  const { p1, sockets, emitted } = readyToBank({ money: COST - 1 })
  const total = p1.resource_count
  sockets[1].send(SOC.BANK_EXCHANGE, 'O')
  assert.equal(p1.money, COST - 1)
  assert.equal(p1.resource_count, total)
  assert.equal(bankEvents(emitted, 'sock-1').at(-1).context.reason, 'no_money')
})

test('exchange: works repeatedly while there is money', () => {
  const { p1, sockets } = readyToBank({ money: COST * 2 + 1 })
  sockets[1].send(SOC.BANK_EXCHANGE, 'S')
  sockets[1].send(SOC.BANK_EXCHANGE, 'L')
  sockets[1].send(SOC.BANK_EXCHANGE, 'B')
  assert.equal(p1.money, 1)
  assert.equal(p1.closed_cards.S >= 1 && p1.closed_cards.L >= 1, true)
})

test('exchange: rejected while the robber is on the desert (for everyone)', () => {
  const ctx = createGame()
  playInitialSetup(ctx, { 1: [bankCorners(ctx.game)[0]] })
  roll(ctx, 1, 1)
  const p1 = ctx.game.getPlayer(1)
  assert.equal(ctx.game.board.getRobbedTile().type, CONST.BANK_TILE, 'robber starts on the desert')
  ctx.sockets[1].send(SOC.BANK_EXCHANGE, 'W')
  assert.equal(p1.money, CONST.MONEY.UNLOCK_BONUS)
  assert.equal(bankEvents(ctx.emitted, 'sock-1').at(-1).context.reason, 'robber')
})

test('exchange: rejected when it is not your turn or before rolling', () => {
  const ctx = createGame()
  playInitialSetup(ctx, { 2: [bankCorners(ctx.game)[0]] })
  moveRobberOffBank(ctx.game)
  const p2 = ctx.game.getPlayer(2)
  ctx.sockets[2].send(SOC.BANK_EXCHANGE, 'W') // P1's roll phase
  roll(ctx, 1, 1)
  ctx.sockets[2].send(SOC.BANK_EXCHANGE, 'W') // P1's actions phase
  endTurn(ctx)
  ctx.sockets[2].send(SOC.BANK_EXCHANGE, 'W') // P2's roll phase (must roll first)
  assert.equal(p2.money, CONST.MONEY.UNLOCK_BONUS)
  assert.equal(bankEvents(ctx.emitted).filter(e => e.type === 'exchange').length, 0)
  const reasons = bankEvents(ctx.emitted, 'sock-2').filter(e => e.type === 'error').map(e => e.context.reason)
  assert.deepEqual(reasons, ['not_your_turn', 'not_your_turn', 'not_your_turn'])
  roll(ctx, 1, 1)
  ctx.sockets[2].send(SOC.BANK_EXCHANGE, 'W')
  assert.equal(p2.money, CONST.MONEY.UNLOCK_BONUS - COST, 'works on own actions phase')
})

test('exchange: rejected with a locked bank even with money', () => {
  const ctx = createGame()
  playInitialSetup(ctx)
  moveRobberOffBank(ctx.game)
  roll(ctx, 1, 1)
  const p1 = ctx.game.getPlayer(1)
  p1.money = 50 // money without unlock (should never happen, but the server must not trust it)
  ctx.sockets[1].send(SOC.BANK_EXCHANGE, 'W')
  assert.equal(p1.money, 50)
  assert.equal(bankEvents(ctx.emitted, 'sock-1').at(-1).context.reason, 'locked')
})

test('exchange: invalid resources are rejected (manual socket.emit cheats)', () => {
  const { p1, sockets } = readyToBank({ money: 100 })
  const cards = JSON.stringify(p1.closed_cards)
  for (const bad of ['dK', 'dVp', 'toString', '__proto__', 'constructor', '', null, undefined, 5, { W: 1 }, ['W']]) {
    sockets[1].send(SOC.BANK_EXCHANGE, bad)
  }
  assert.equal(p1.money, 100)
  assert.equal(JSON.stringify(p1.closed_cards), cards)
})
