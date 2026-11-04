import VectorGame from "../models/vector/game.js"
import * as CONST from "../public/js/vector/const.js"

export { CONST, VectorGame }
export const { SIDES, GAME_STATES: ST, END_REASONS, REGIONS, MUTATIONS, DOCTRINES, LIMITS } = CONST

/** Partida determinista: jugador 1 = patógeno, jugador 2 = coalición. */
export function createGame(config = {}) {
  const game = new VectorGame({
    id: 'test-game',
    host: { name: 'Ana' },
    config: Object.assign({ seed: 12345, random_sides: false }, config),
  })
  game.join('Beto')
  return game
}

/** Paciente cero + vigilancia inicial, listo para la ronda 1. */
export function playSetup(game, { zero = 'mbanzu', watch = ['avernon', 'jianto'] } = {}) {
  game.setupIO(1, { region: zero })
  game.setupIO(2, { regions: watch })
  return game
}

export function ready(config = {}) {
  return playSetup(createGame(config))
}

/** Confirma por los dos bandos: dispara el tick del mundo. */
export function resolve(game) {
  game.commitIO(1)
  game.commitIO(2)
  return game.round_report
}

/** Avanza `n` rondas sin que ninguno haga nada. */
export function idle(game, n = 1) {
  for (let i = 0; i < n && game.state === ST.PLANNING; i++) resolve(game)
  return game
}

/** Da recursos para poder comprar sin pelearse con la economía. */
export function grant(game, { dna = 0, funds = 0, ap = 0 } = {}) {
  const p = game.sides[SIDES.PATHOGEN], c = game.sides[SIDES.COALITION]
  if (dna) p.dna += dna
  if (funds) c.funds += funds
  if (ap) { p.ap += ap; c.ap += ap }
  return game
}

export const infectedIn = (game, rid) => game.regions[rid].infected
export const stateFor = (game, side) => game.getStateFor(side)
