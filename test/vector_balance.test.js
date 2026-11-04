/**
 * Test de equilibrio. Enfrenta dos políticas heurísticas razonables en muchas
 * partidas deterministas y comprueba que ningún bando domina. No busca el
 * 50 % exacto: busca que un cambio de fórmulas no rompa el juego en silencio.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { simulate } from "./vector_ai.js"
import { SIDES, END_REASONS } from "./vector_helpers.js"

const N = 400
const results = Array.from({ length: N }, (_, i) => simulate(i + 1))
const share = fn => results.filter(fn).length / N * 100

test('ninguno de los dos bandos domina la partida', () => {
  const pathogen = share(r => r.winner === SIDES.PATHOGEN)
  const coalition = share(r => r.winner === SIDES.COALITION)
  assert.equal(Math.round(pathogen + coalition), 100, 'toda partida tiene ganador')
  assert.ok(pathogen > 35 && pathogen < 65,
    `el patógeno gana el ${pathogen.toFixed(1)} %, fuera del margen 35-65`)
  assert.ok(coalition > 35 && coalition < 65,
    `la coalición gana el ${coalition.toFixed(1)} %, fuera del margen 35-65`)
})

test('las partidas se deciden jugando, no por agotar las rondas', () => {
  const timeouts = share(r => r.reason === END_REASONS.TIMEOUT)
  assert.ok(timeouts < 15, `${timeouts.toFixed(1)} % acaban por límite de rondas`)
})

test('los dos finales decisivos son alcanzables', () => {
  assert.ok(share(r => r.reason === END_REASONS.EXTINCTION) > 10, 'el patógeno llega a ganar por mortandad')
  assert.ok(share(r => r.reason === END_REASONS.CURE) > 10, 'la coalición llega a completar la cura')
})

test('la partida dura lo que debe: ni relámpago ni eterna', () => {
  const avg = results.reduce((s, r) => s + r.round, 0) / N
  assert.ok(avg > 12 && avg < 36, `duración media de ${avg.toFixed(1)} rondas`)
  assert.ok(results.every(r => r.round >= 3), 'ninguna se decide en 2 rondas')
})

test('el patógeno dispone de una ventana de sigilo antes de ser detectado', () => {
  const detected = results.filter(r => r.detect_round)
  const avg = detected.reduce((s, r) => s + r.detect_round, 0) / detected.length
  assert.ok(avg > 2, `se le detecta de media en la ronda ${avg.toFixed(1)}: demasiado pronto`)
  assert.ok(detected.length / N > 0.9, 'casi siempre se le acaba detectando')
})
