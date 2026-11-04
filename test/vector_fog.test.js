import { test } from "node:test"
import assert from "node:assert/strict"
import { ready, grant, resolve, idle, stateFor, SIDES, ST } from "./vector_helpers.js"

test('la coalición no ve los infectados de una región sin detectar', () => {
  const game = ready()
  const view = stateFor(game, SIDES.COALITION)
  assert.equal(view.regions.mbanzu.known, false)
  assert.equal(view.regions.mbanzu.infected, null, 'sin datos')
  assert.equal(view.regions.mbanzu.healthy, null)
  assert.equal(view.total_infected, null, 'tampoco el total mundial')
})

test('el patógeno sí ve el mapa real al detalle', () => {
  const game = ready()
  const view = stateFor(game, SIDES.PATHOGEN)
  assert.equal(view.regions.mbanzu.known, true)
  assert.ok(view.regions.mbanzu.infected > 0)
  assert.ok(view.total_infected > 0)
})

test('al detectarse una región, la coalición ve sus cifras', () => {
  const game = ready()
  game.regions.mbanzu.detected = true
  const view = stateFor(game, SIDES.COALITION)
  assert.equal(view.regions.mbanzu.known, true)
  assert.ok(view.regions.mbanzu.infected > 0)
})

test('las mutaciones del patógeno salen ocultas y el rastreo las revela', () => {
  const game = grant(ready(), { dna: 200, funds: 200, ap: 8 })
  game.mutateIO(1, 'cough')
  game.mutateIO(1, 'fever')
  game.mutateIO(1, 'aerosol1')

  let view = stateFor(game, SIDES.COALITION)
  assert.deepEqual(view.opponent.tree, [], 'no ve ninguna')
  assert.equal(view.opponent.hidden_count, 3, 'solo sabe que hay 3')

  assert.equal(game.actionIO(2, 'trace'), true)
  view = stateFor(game, SIDES.COALITION)
  assert.equal(view.opponent.tree.length, 2, 'el rastreo revela 2')
  assert.equal(view.opponent.hidden_count, 1)
})

test('la secuenciación masiva hace que el rastreo revele 3', () => {
  const game = grant(ready(), { dna: 300, funds: 300, ap: 12 })
  ;['cough', 'fever', 'aerosol1', 'nausea'].forEach(m => game.mutateIO(1, m))
  game.doctrineIO(2, 'epi_watch')
  game.doctrineIO(2, 'mass_seq')
  game.actionIO(2, 'trace')
  assert.equal(stateFor(game, SIDES.COALITION).opponent.tree.length, 3)
})

test('el patógeno solo ve la cura por tramos de 10', () => {
  const game = ready()
  game.cure = 47.6
  assert.equal(stateFor(game, SIDES.PATHOGEN).cure, 40, 'redondeado hacia abajo')
  assert.equal(stateFor(game, SIDES.PATHOGEN).cure_exact, false)
  assert.equal(stateFor(game, SIDES.COALITION).cure, 47.6, 'la coalición sí lo sabe')
  assert.equal(stateFor(game, SIDES.COALITION).cure_exact, true)
})

test('la red satelital da una estimación, no el dato exacto', () => {
  const game = grant(ready(), { funds: 300, ap: 8 })
  game.regions.mbanzu.infected = 37
  let view = stateFor(game, SIDES.COALITION)
  assert.equal(view.regions.mbanzu.infected, null, 'sin satélite, nada')

  game.doctrineIO(2, 'epi_watch')
  game.doctrineIO(2, 'satellite')
  view = stateFor(game, SIDES.COALITION)
  assert.equal(view.regions.mbanzu.estimate, true)
  assert.equal(view.regions.mbanzu.infected, 35, 'redondeado a múltiplos de 5')
  assert.equal(view.regions.mbanzu.known, false, 'sigue sin ser dato confirmado')
})

test('la contrainteligencia destapa el ADN del patógeno', () => {
  const game = grant(ready(), { funds: 400, ap: 12 })
  assert.equal(stateFor(game, SIDES.COALITION).opponent.dna, null)
  ;['epi_watch', 'mass_seq', 'counter_intel'].forEach(d => game.doctrineIO(2, d))
  assert.ok(stateFor(game, SIDES.COALITION).opponent.dna > 0)
})

test('lo planificado no se filtra al rival hasta resolver la ronda', () => {
  const game = grant(ready(), { dna: 200, funds: 200, ap: 8 })
  game.mutateIO(1, 'cough')
  game.actionIO(2, 'surveillance', 'sahree')

  assert.deepEqual(stateFor(game, SIDES.PATHOGEN).you.pending, ['Tos (−6)'])
  assert.equal(stateFor(game, SIDES.COALITION).you.pending.length, 1)
  assert.equal(stateFor(game, SIDES.COALITION).opponent.tree.length, 0,
    'la coalición no ve la mutación recién comprada')

  const report = resolve(game)
  assert.ok(report.pathogen_actions.includes('Tos (−6)'), 'al resolver, se publica el resumen')
  assert.equal(stateFor(game, SIDES.PATHOGEN).you.pending.length, 0, 'la lista se vacía')
})

test('cada bando ve su propia reserva y no la del rival', () => {
  const game = ready()
  const p = stateFor(game, SIDES.PATHOGEN), c = stateFor(game, SIDES.COALITION)
  assert.ok(p.you.dna > 0)
  assert.equal(p.you.funds, undefined)
  assert.ok(c.you.funds > 0)
  assert.equal(c.you.dna, undefined)
  assert.equal(p.opponent.funds, undefined, 'el patógeno no ve los fondos')
})

test('la vista expone el estado de confirmación del rival, para saber si esperas', () => {
  const game = ready()
  assert.equal(stateFor(game, SIDES.COALITION).opponent.committed, false)
  game.commitIO(1)
  assert.equal(stateFor(game, SIDES.COALITION).opponent.committed, true)
  assert.equal(game.state, ST.PLANNING, 'sigue abierta')
})

test('las doctrinas de la coalición son públicas: el patógeno ve a qué juega', () => {
  const game = grant(ready(), { funds: 200 })
  game.doctrineIO(2, 'epi_watch')
  assert.deepEqual(stateFor(game, SIDES.PATHOGEN).opponent.tree, ['epi_watch'])
})

test('el informe de ronda llega a los dos bandos', () => {
  const game = grant(ready(), { dna: 100, ap: 4 })
  game.mutateIO(1, 'aerosol1')
  idle(game, 3)
  const report = stateFor(game, SIDES.COALITION).report
  assert.ok(report, 'hay informe')
  assert.equal(typeof report.deaths, 'number')
  assert.ok(Array.isArray(report.seeded))
})
