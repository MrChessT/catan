import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createGame, playInitialSetup, bankCorners, roll, endTurn, bankEvents, SOC, CONST,
} from "./helpers.js"

test('players start with no money and the bank locked', () => {
  const { game } = createGame()
  game.players.forEach(p => {
    assert.equal(p.money, CONST.MONEY.START)
    assert.equal(p.bank_unlocked, false)
    assert.deepEqual(p.bets, [])
  })
})

test('first settlement next to the desert unlocks the bank and gives the bonus once', () => {
  const ctx = createGame()
  const { game, emitted } = ctx
  const [c1, c2] = bankCorners(game)
  playInitialSetup(ctx, { 1: [c1] })
  const p1 = game.getPlayer(1), p2 = game.getPlayer(2)
  assert.ok(p1.pieces.S.includes(c1))
  assert.equal(p1.bank_unlocked, true)
  assert.equal(p1.money, CONST.MONEY.UNLOCK_BONUS)
  assert.equal(p2.bank_unlocked, false)
  assert.equal(p2.money, 0)
  // Another settlement and a city next to the desert do not give the bonus again
  game.build(1, 'S', c2)
  game.build(1, 'C', c1)
  assert.equal(p1.money, CONST.MONEY.UNLOCK_BONUS, 'bonus is only given once')
  const unlocks = bankEvents(emitted, 'sock-2').filter(e => e.type === 'unlock')
  assert.equal(unlocks.length, 1, 'everyone is told once')
  assert.deepEqual(unlocks[0], { type: 'unlock', pid: 1, context: { amount: CONST.MONEY.UNLOCK_BONUS } })
})

test('a city next to the desert also unlocks the bank', () => {
  const ctx = createGame()
  const { game } = ctx
  playInitialSetup(ctx)
  const c = bankCorners(game).find(id => !game.board.findCorner(id).piece)
  game.getPlayer(2).pieces.S.push(c) // settlement placed without the bonus (as if built before the rule)
  game.board.build(2, 'S', c)
  game.build(2, 'C', c)
  assert.equal(game.getPlayer(2).bank_unlocked, true)
  assert.equal(game.getPlayer(2).money, CONST.MONEY.UNLOCK_BONUS)
})

test('building away from the desert does not unlock the bank', () => {
  const ctx = createGame()
  playInitialSetup(ctx)
  ctx.game.players.forEach(p => assert.equal(p.bank_unlocked, false))
})

test('money is public, bets are private in toJSON', () => {
  const ctx = createGame()
  playInitialSetup(ctx, { 1: [bankCorners(ctx.game)[0]] })
  const p1 = ctx.game.getPlayer(1)
  const pub = p1.toJSON(), priv = p1.toJSON(true)
  assert.equal(pub.money, CONST.MONEY.UNLOCK_BONUS)
  assert.equal(pub.bank_unlocked, true)
  assert.equal(pub.bets, undefined)
  assert.equal(pub.closed_cards, undefined)
  assert.deepEqual(priv.bets, [])
  // Other players receive the money update without private data
  const to_p2 = ctx.emitted.filter(e => e.to === 'sock-2' && e.event === SOC.UPDATE_PLAYER && e.args[0].id === 1)
  assert.ok(to_p2.some(e => e.args[0].money === CONST.MONEY.UNLOCK_BONUS))
  assert.ok(to_p2.every(e => e.args[0].closed_cards === undefined && e.args[0].bets === undefined))
})

test('money is never a resource: robber drop, steal and dice ignore it', () => {
  const ctx = createGame()
  const { game } = ctx
  playInitialSetup(ctx, { 1: [bankCorners(game)[0]] })
  const p1 = game.getPlayer(1)
  assert.equal(p1.closed_cards.money, undefined)
  // Many rolls, including 7s, never touch money
  for (let i = 0; i < 6; i++) {
    roll(ctx, 3, 4) // 7 → robber
    if (game.state === CONST.GAME_STATES.ROBBER_DROP) {
      game.players.forEach(p => ctx.sockets[p.id].send(SOC.ROBBER_DROP, {}))
    }
    if (game.state === CONST.GAME_STATES.ROBBER_MOVE) {
      const tile = game.board.getRobbableTiles()[0]
      ctx.sockets[game.active_pid].send(SOC.ROBBER_MOVE, tile)
    }
    endTurn(ctx)
  }
  assert.equal(p1.money, CONST.MONEY.UNLOCK_BONUS)
  assert.equal(Object.keys(p1.closed_cards).includes('money'), false)
})

test('giveMoney / takeMoney validate amounts and balance', () => {
  const { game } = createGame()
  const p = game.getPlayer(1)
  assert.equal(p.takeMoney(1), false)
  assert.equal(p.giveMoney(-5), false)
  assert.equal(p.giveMoney(1.5), false)
  assert.equal(p.giveMoney(7), true)
  assert.equal(p.takeMoney(8), false)
  assert.equal(p.takeMoney(7), true)
  assert.equal(p.money, 0)
})
