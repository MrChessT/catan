import { test } from "node:test"
import assert from "node:assert/strict"
import { createGame, playInitialSetup, withDice, SOC, CONST } from "./helpers.js"
const ST = CONST.GAME_STATES

test('only the active player can roll, and only once', () => {
  const ctx = createGame()
  const { game, sockets } = ctx
  playInitialSetup(ctx)
  const other = game.active_pid === 1 ? 2 : 1
  withDice(2, 3, _ => sockets[other].send(SOC.ROLL_DICE))
  assert.equal(game.state, ST.PLAYER_ROLL, 'a non active player can not roll')
  assert.equal(game.dice_rolls.length, 0)
  withDice(2, 3, _ => sockets[game.active_pid].send(SOC.ROLL_DICE))
  assert.equal(game.state, ST.PLAYER_ACTIONS)
  withDice(2, 3, _ => sockets[game.active_pid].send(SOC.ROLL_DICE))
  assert.equal(game.dice_rolls.length, 1, 'rolling again is ignored')
})

test('only the active player can end their turn, and only in the actions phase', () => {
  const ctx = createGame()
  const { game, sockets } = ctx
  playInitialSetup(ctx)
  const active = game.active_pid, other = active === 1 ? 2 : 1
  sockets[active].send(SOC.END_TURN)
  assert.equal(game.state, ST.PLAYER_ROLL, 'can not end the turn before rolling')
  withDice(2, 3, _ => sockets[active].send(SOC.ROLL_DICE))
  sockets[other].send(SOC.END_TURN)
  assert.equal(game.active_pid, active, 'another player can not end my turn')
  assert.equal(game.state, ST.PLAYER_ACTIONS)
  sockets[active].send(SOC.END_TURN)
  assert.equal(game.active_pid, other)
  assert.equal(game.state, ST.PLAYER_ROLL)
})

test('ending the turn can not skip the robber drop of other players', () => {
  const ctx = createGame()
  const { game, sockets } = ctx
  playInitialSetup(ctx)
  const p2 = game.getPlayer(2)
  p2.giveCards({ S: 4, W: 4 }) // 8+ cards → must drop on a 7
  withDice(3, 4, _ => sockets[game.active_pid].send(SOC.ROLL_DICE))
  assert.equal(game.state, ST.ROBBER_DROP)
  const count = p2.resource_count
  sockets[game.active_pid].send(SOC.END_TURN)
  assert.equal(game.state, ST.ROBBER_DROP, 'still waiting for the drop')
  assert.equal(p2.resource_count, count, 'no random cards were taken')
})
