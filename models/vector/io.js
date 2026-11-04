import * as CONST from "../../public/js/vector/const.js"

const SOC = CONST.SOCKET_EVENTS

/**
 * Puente de sockets. Cada emisión de estado es *por jugador*, porque cada
 * bando ve una partida distinta (`game.getStateFor`).
 */
export default class VectorIO {
  #game; #io;

  constructor({ game, io }) {
    this.#game = game
    this.#io = io
  }

  removeEvents(socket) { socket?.removeAllListeners() }

  setUpEvents(socket, pid) {
    const game = this.#game
    if (!socket || !pid) return

    socket.on(SOC.PLAYER_ONLINE, () => this.syncPlayer(game, pid))
    socket.on(SOC.SETUP, payload => game.setupIO(pid, payload))
    socket.on(SOC.MUTATE, mut_id => game.mutateIO(pid, mut_id))
    socket.on(SOC.DOCTRINE, doc_id => game.doctrineIO(pid, doc_id))
    socket.on(SOC.ABILITY, (ab_id, target) => game.abilityIO(pid, ab_id, target))
    socket.on(SOC.ACTION, (act_id, target) => game.actionIO(pid, act_id, target))
    socket.on(SOC.COMMIT, () => game.commitIO(pid))
    socket.on(SOC.UNCOMMIT, () => game.uncommitIO(pid))
  }

  // ─────────────────────────────────────────── Emisiones

  /** Manda a cada jugador su propia vista filtrada. */
  updateState(game) {
    game.players.forEach(p => this.syncPlayer(game, p.id))
  }

  syncPlayer(game, pid) {
    const player = game.getPlayer(pid)
    if (!player?.socket_id || !player.side) return
    this.#io.to(player.socket_id).emit(SOC.SYNC, game.getStateFor(player.side))
  }

  /** Solo a los jugadores de un bando (feedback inmediato al gastar). */
  syncSide(game, side) {
    game.playersOf(side).forEach(p => this.syncPlayer(game, p.id))
  }

  resolved(game, report) {
    game.players.forEach(p => {
      if (!p.socket_id || !p.side) return
      this.#io.to(p.socket_id).emit(SOC.RESOLVED, report, game.getStateFor(p.side))
    })
  }

  updateWaitingRoom(player, players) {
    this.#emit(SOC.JOINED_WAITING_ROOM, player, players)
  }

  pushLog(game, entry) {
    // Las entradas marcadas con un bando solo las ve ese bando
    if (!entry.side) return this.#emit(SOC.LOG, entry)
    game.playersOf(entry.side).forEach(p => {
      p.socket_id && this.#io.to(p.socket_id).emit(SOC.LOG, entry)
    })
  }

  updateTimer(time) { this.#emit(SOC.SET_TIMER, time) }

  gameEnd(game, context) { this.#emit(SOC.GAME_END, context) }

  playerQuit(pid) { this.#emit(SOC.PLAYER_QUIT, pid) }

  error(player, message) {
    player?.socket_id && this.#io.to(player.socket_id).emit(SOC.ERROR, message)
  }

  #emit(type, ...data) { this.#io.to(this.#game.id).emit(type, ...data) }
}
