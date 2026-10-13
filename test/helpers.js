import Game from "../models/game.js"
import * as CONST from "../public/js/const.js"
const SOC = CONST.SOCKET_EVENTS

/** Fake socket: records the handlers the server registers, so tests can "emit" like a client */
class FakeSocket {
  handlers = {}
  constructor(id) { this.id = id }
  on(event, fn) { this.handlers[event] = fn }
  removeAllListeners() { this.handlers = {} }
  /** Client -> Server */
  send(event, ...args) { this.handlers[event]?.(...args) }
}

/**
 * Creates a started game with `player_count` players, sockets connected,
 * no timers and the default (not shuffled) map.
 */
export function createGame({ player_count = 2, config = {} } = {}) {
  /** @type {{ to, event, args }[]} */
  const emitted = []
  const io = { to: to => ({ emit: (event, ...args) => emitted.push({ to, event, args }) }) }
  const game = new Game({
    id: 'test-game', io,
    host: { name: 'P1', id: 1 },
    config: { ...CONST.GAME_CONFIG, player_count, timer: false, ...config },
    onGameEnd: _ => {},
  })
  for (let i = 2; i <= player_count; i++) { game.join('P' + i) }
  const sockets = {}
  game.players.forEach(p => {
    sockets[p.id] = new FakeSocket('sock-' + p.id)
    game.setUpPlayerSocket(p.id, sockets[p.id])
  })
  game.players.forEach(p => sockets[p.id].send(SOC.PLAYER_ONLINE))
  return { game, sockets, emitted }
}

/** Corners touching the bank tile (desert) that are valid initial settlement spots */
export function bankCorners(game) {
  const desert = game.board.getRobbedTile()
  const valid = game.board.getSettlementLocations(-1).map(c => c.id)
  return desert.getAllCorners().map(c => c.id).filter(id => valid.includes(id))
}

/** A valid initial settlement corner NOT touching the bank tile */
export function nonBankCorner(game) {
  return game.board.getSettlementLocations(-1)
    .find(c => !c.tiles.some(t => t.type === CONST.BANK_TILE)
      && c.tiles.filter(t => t.type !== 'S').length === 3)?.id
}

export function anyRoadFrom(game, corner_id) {
  return game.board.findCorner(corner_id).getEdges(-1)
    .find(e => !e.corner1.surroundedBySea() && !e.corner2.surroundedBySea())?.id
}

/** Plays the whole initial setup. `spots[pid] = [first_corner, second_corner]` (optional) */
export function playInitialSetup({ game, sockets }, spots = {}) {
  const order = [...Array(game.player_count).keys()].map(i => i + 1)
  const placements = [...order.map(pid => [pid, 0]), ...order.slice().reverse().map(pid => [pid, 1])]
  placements.forEach(([pid, n]) => {
    if (game.active_pid !== pid) throw new Error(`Expected active pid ${pid}, got ${game.active_pid}`)
    const s = spots[pid]?.[n] ?? nonBankCorner(game)
    sockets[pid].send(SOC.INITIAL_SETUP, s, anyRoadFrom(game, s))
  })
  if (game.state !== CONST.GAME_STATES.PLAYER_ROLL) throw new Error('Setup did not finish: ' + game.state)
}

/** Forces the next dice roll(s) by stubbing Math.random */
export function withDice(d1, d2, fn) {
  const original = Math.random
  const values = [d1, d2]
  Math.random = () => values.length ? (values.shift() - 0.5) / 6 : original()
  try { return fn() } finally { Math.random = original }
}

/** Active player rolls the given dice. Returns the total */
export function roll({ game, sockets }, d1, d2) {
  withDice(d1, d2, _ => sockets[game.active_pid].send(SOC.ROLL_DICE))
  return d1 + d2
}

/** Ends the active player's turn (must be in PLAYER_ACTIONS) */
export function endTurn({ game, sockets }) { sockets[game.active_pid].send(SOC.END_TURN) }

/** Moves the robber away from the bank tile directly on the board (test shortcut) */
export function moveRobberOffBank(game) {
  const target = game.board.getRobbableTiles().find(id => game.board.findTile(id).type !== CONST.BANK_TILE)
  game.board.moveRobber(target)
}

export function bankEvents(emitted, socket_id) {
  return emitted.filter(e => e.event === SOC.BANK_EVENT && (!socket_id || e.to === socket_id))
    .map(e => ({ type: e.args[0], pid: e.args[1], context: e.args[2] }))
}

export { SOC, CONST }
