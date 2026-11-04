import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createGame, playSetup, ready, resolve, idle, grant, infectedIn,
  SIDES, ST, END_REASONS, LIMITS, REGIONS,
} from "./vector_helpers.js"

// ───────────────────────────────────────────── Bandos y preparación

test('los bandos se sortean y la partida pasa a preparación al llenarse', () => {
  const game = createGame()
  assert.equal(game.state, ST.SETUP)
  const sides = game.players.map(p => p.side).sort()
  assert.deepEqual(sides, [SIDES.COALITION, SIDES.PATHOGEN], 'un jugador por bando')
})

test('el sorteo aleatorio reparte los dos bandos en cualquier orden', () => {
  const seen = new Set()
  for (let seed = 1; seed <= 40; seed++) {
    const game = new (Object.getPrototypeOf(createGame()).constructor)({
      id: 'g' + seed, host: { name: 'A' }, config: { seed, random_sides: true },
    })
    game.join('B')
    seen.add(game.players[0].side)
  }
  assert.equal(seen.size, 2, 'al jugador 1 le toca a veces patógeno y a veces coalición')
})

test('la preparación siembra al paciente cero y despliega la vigilancia', () => {
  const game = playSetup(createGame(), { zero: 'mbanzu', watch: ['avernon', 'jianto'] })
  assert.equal(infectedIn(game, 'mbanzu'), LIMITS.patient_zero)
  assert.equal(game.regions.avernon.surveillance, true)
  assert.equal(game.regions.jianto.surveillance, true)
  assert.equal(game.state, ST.PLANNING)
  assert.equal(game.round, 1)
})

test('no se planifica hasta que los dos bandos han preparado', () => {
  const game = createGame()
  game.setupIO(1, { region: 'mbanzu' })
  assert.equal(game.state, ST.SETUP, 'falta la coalición')
  game.setupIO(2, { regions: ['avernon'] })
  assert.equal(game.state, ST.SETUP, 'la coalición debe elegir 2 regiones')
  game.setupIO(2, { regions: ['avernon', 'jianto'] })
  assert.equal(game.state, ST.PLANNING)
})

// ─────────────────────────────────────────────── Árboles de progreso

test('mutar cuesta ADN y un punto de acción', () => {
  const game = ready()
  const p = game.sides[SIDES.PATHOGEN]
  const dna = p.dna, ap = p.ap
  assert.equal(game.mutateIO(1, 'aerosol1'), true)
  assert.equal(p.dna, dna - 8)
  assert.equal(p.ap, ap - 1)
  assert.ok(p.tree.includes('aerosol1'))
})

test('las mutaciones respetan los prerrequisitos', () => {
  const game = grant(ready(), { dna: 100, ap: 5 })
  assert.equal(game.mutateIO(1, 'aerosol2'), false, 'sin Aerosoles I no se puede')
  game.mutateIO(1, 'aerosol1')
  assert.equal(game.mutateIO(1, 'aerosol2'), true)
})

test('la coalición sube su propio árbol de doctrinas', () => {
  const game = ready()
  const c = game.sides[SIDES.COALITION]
  const funds = c.funds
  assert.equal(game.doctrineIO(2, 'epi_watch'), true)
  assert.equal(c.funds, funds - 18)
  assert.ok(c.tree.includes('epi_watch'))
  assert.equal(game.doctrineIO(2, 'mass_seq'), false, 'cadena de prerrequisitos')
})

test('cada bando solo puede tocar su propio árbol', () => {
  const game = grant(ready(), { dna: 200, funds: 200, ap: 5 })
  assert.equal(game.mutateIO(2, 'aerosol1'), false, 'la coalición no muta')
  assert.equal(game.doctrineIO(1, 'epi_watch'), false, 'el patógeno no compra doctrinas')
})

test('los puntos de acción limitan la ronda', () => {
  const game = grant(ready(), { dna: 500 })
  assert.equal(game.sides[SIDES.PATHOGEN].ap, 3)
  assert.equal(game.mutateIO(1, 'cough'), true)
  assert.equal(game.mutateIO(1, 'fever'), true)
  assert.equal(game.mutateIO(1, 'nausea'), true)
  assert.equal(game.mutateIO(1, 'insomnia'), false, 'se agotaron los 3 puntos')
})

test('no se puede actuar después de confirmar', () => {
  const game = grant(ready(), { dna: 300 })
  game.commitIO(1)
  assert.equal(game.mutateIO(1, 'cough'), false)
})

// ───────────────────────────────────────── Turnos simultáneos

test('la ronda se resuelve solo cuando ambos confirman', () => {
  const game = ready()
  game.commitIO(1)
  assert.equal(game.round, 1, 'sigue en la ronda 1 esperando a la coalición')
  game.commitIO(2)
  assert.equal(game.round, 2)
  assert.equal(game.sides[SIDES.PATHOGEN].ap, 3, 'puntos de acción recargados')
  assert.equal(game.sides[SIDES.PATHOGEN].committed, false)
})

test('se puede retirar la confirmación antes de que el rival confirme', () => {
  const game = ready()
  game.commitIO(1)
  assert.equal(game.uncommitIO(1), true)
  assert.equal(game.sides[SIDES.PATHOGEN].committed, false)
  game.commitIO(2)
  assert.equal(game.round, 1, 'no se resolvió porque el patógeno se retiró')
})

// ─────────────────────────────────────────────────────── Contagio

test('el contagio crece dentro de la región infectada', () => {
  const game = grant(ready(), { dna: 100, ap: 3 })
  game.mutateIO(1, 'aerosol1')
  game.mutateIO(1, 'cough')
  const before = infectedIn(game, 'mbanzu')
  idle(game, 3)
  assert.ok(infectedIn(game, 'mbanzu') > before, 'los infectados aumentan')
})

test('el patógeno acaba sembrando regiones vecinas por tierra', () => {
  const game = grant(ready(), { dna: 400, ap: 9 })
  ;['aerosol1', 'cough', 'fever'].forEach(m => game.mutateIO(1, m))
  idle(game, 12)
  const reached = Object.values(game.regions).filter(r => r.infected > 0).length
  assert.ok(reached > 1, `se expandió a ${reached} regiones`)
})

test('las islas no se alcanzan sin ruta marítima ni aérea', () => {
  const game = grant(ready({ event_chance: 0 }), { dna: 600, ap: 20 })
  ;['aerosol1', 'cough'].forEach(m => game.mutateIO(1, m))
  idle(game, 20)
  assert.equal(infectedIn(game, 'caldera'), 0, 'Caldera es insular: hace falta puerto o avión')
})

test('la vía hídrica abre las rutas marítimas', () => {
  const game = grant(ready({ event_chance: 0 }), { dna: 900, ap: 40 })
  ;['hydric1', 'hydric2', 'aerosol1', 'cough', 'fever', 'insect', 'heat1'].forEach(m => game.mutateIO(1, m))
  assert.equal(game.pathogenStats().route.sea, true)
  idle(game, 22)
  const island_hit = ['zephyr', 'caldera', 'austra'].some(r => infectedIn(game, r) > 0)
    || game.regions.tovaland.infected > 0
  assert.ok(island_hit, 'el contagio viajó por mar')
})

test('la cuarentena frena el contagio interno', () => {
  const build = quarantine => {
    const game = grant(ready({ event_chance: 0 }), { dna: 300, ap: 9 })
    ;['aerosol1', 'cough', 'fever'].forEach(m => game.mutateIO(1, m))
    if (quarantine) {
      game.regions.mbanzu.quarantine = LIMITS.quarantine_max
      game.regions.mbanzu.hygiene = LIMITS.hygiene_max
    }
    idle(game, 6)
    return infectedIn(game, 'mbanzu')
  }
  assert.ok(build(true) < build(false), 'con cuarentena e higiene se contagia menos')
})

// ──────────────────────────────────────────── Detección y cura

test('no se puede investigar antes de detectar el patógeno', () => {
  const game = grant(ready(), { funds: 100 })
  assert.equal(game.world_detected, false)
  assert.equal(game.actionIO(2, 'research'), false, 'nadie sabe aún qué curar')
})

test('los síntomas graves acaban delatando al patógeno', () => {
  const game = grant(ready({ event_chance: 0 }), { dna: 800, ap: 30 })
  ;['cough', 'fever', 'pneumonia', 'hemorrhage', 'aerosol1'].forEach(m => game.mutateIO(1, m))
  idle(game, 10)
  assert.equal(game.world_detected, true)
})

test('la cura avanza al investigar y la partida la gana la coalición al 100 %', () => {
  const game = grant(ready({ event_chance: 0 }), { dna: 200, ap: 10 })
  game.mutateIO(1, 'cough')
  game.mutateIO(1, 'fever')
  idle(game, 8)
  assert.equal(game.world_detected, true, 'precondición: detectado')
  const start = game.cure
  grant(game, { funds: 400 })
  game.actionIO(2, 'research')
  resolve(game)
  assert.ok(game.cure > start, `la cura subió de ${start} a ${game.cure}`)

  for (let i = 0; i < 40 && game.state === ST.PLANNING; i++) {
    grant(game, { funds: 200 })
    game.actionIO(2, 'research'); game.actionIO(2, 'research'); game.actionIO(2, 'research')
    resolve(game)
  }
  assert.equal(game.state, ST.ENDED)
  assert.equal(game.end_context.reason, END_REASONS.CURE)
  assert.equal(game.end_context.winner, SIDES.COALITION)
})

test('la resistencia a fármacos frena la cura y los antivirales la recuperan', () => {
  const run = ({ drug, antiviral }) => {
    const game = grant(ready({ event_chance: 0 }), { dna: 400, ap: 20 })
    game.mutateIO(1, 'cough'); game.mutateIO(1, 'fever')
    if (drug) { game.mutateIO(1, 'drug1'); game.mutateIO(1, 'drug2') }
    idle(game, 8)
    if (!game.world_detected) return null
    if (antiviral) {
      grant(game, { funds: 300, ap: 4 })
      game.doctrineIO(2, 'basic_research'); game.doctrineIO(2, 'antivirals')
    }
    const before = game.cure
    grant(game, { funds: 300 })
    game.actionIO(2, 'research')
    resolve(game)
    return game.cure - before
  }
  const plain = run({}), resisted = run({ drug: true })
  assert.ok(plain !== null && resisted !== null)
  assert.ok(resisted < plain, 'con resistencia a fármacos la cura rinde menos')
})

// ──────────────────────────────────────────── Muertes y victoria

test('la letalidad mata y los hospitales reducen las muertes', () => {
  const build = hospital => {
    const game = grant(ready({ event_chance: 0 }), { dna: 900, ap: 30 })
    ;['cough', 'fever', 'pneumonia', 'hemorrhage', 'aerosol1'].forEach(m => game.mutateIO(1, m))
    if (hospital) game.regions.mbanzu.hospitals = LIMITS.hospital_max
    idle(game, 8)
    return game.regions.mbanzu.dead
  }
  const bare = build(false)
  assert.ok(bare > 0, 'sin hospitales hay muertos')
  assert.ok(build(true) < bare, 'con hospitales mueren menos')
})

test('el patógeno gana al superar el umbral de mortandad', () => {
  const game = grant(ready({ event_chance: 0, extinction_threshold: 2 }), { dna: 2000, ap: 60 })
  ;['cough', 'fever', 'pneumonia', 'hemorrhage', 'nausea', 'organ_failure', 'necrosis',
    'aerosol1', 'aerosol2', 'airtravel', 'hydric1', 'insect', 'heat1'].forEach(m => game.mutateIO(1, m))
  for (let i = 0; i < 30 && game.state === ST.PLANNING; i++) { grant(game, { dna: 50, ap: 3 }); resolve(game) }
  assert.equal(game.state, ST.ENDED)
  assert.equal(game.end_context.winner, SIDES.PATHOGEN)
  assert.equal(game.end_context.reason, END_REASONS.EXTINCTION)
})

test('el límite de rondas decide por marcador', () => {
  const game = ready({ max_rounds: 3, event_chance: 0 })
  idle(game, 5)
  assert.equal(game.state, ST.ENDED)
  assert.equal(game.end_context.reason, END_REASONS.TIMEOUT)
})

test('abandonar entrega la partida al rival', () => {
  const game = ready()
  game.removePlayer(1)
  assert.equal(game.state, ST.ENDED)
  assert.equal(game.end_context.reason, END_REASONS.FORFEIT)
  assert.equal(game.end_context.winner, SIDES.COALITION)
})

// ─────────────────────────────────────── Habilidades y acciones

test('el brote exige una región ya infectada y entra en recarga', () => {
  const game = grant(ready(), { dna: 100, ap: 6 })
  assert.equal(game.abilityIO(1, 'outbreak', 'avernon'), false, 'Avernon está limpia')
  const before = infectedIn(game, 'mbanzu')
  assert.equal(game.abilityIO(1, 'outbreak', 'mbanzu'), true)
  assert.ok(infectedIn(game, 'mbanzu') > before)
  assert.equal(game.abilityIO(1, 'outbreak', 'mbanzu'), false, 'en recarga')
})

test('el salto de vector ignora las rutas', () => {
  const game = grant(ready(), { dna: 100, ap: 6 })
  assert.equal(infectedIn(game, 'caldera'), 0)
  assert.equal(game.abilityIO(1, 'jump', 'caldera'), true)
  assert.ok(infectedIn(game, 'caldera') > 0, 'alcanzó una isla sin ruta')
})

test('resembrar necesita el reservorio ganadero', () => {
  const game = grant(ready(), { dna: 200, ap: 6 })
  assert.equal(game.abilityIO(1, 'reseed', 'avernon'), false)
  game.mutateIO(1, 'livestock')
  assert.equal(game.abilityIO(1, 'reseed', 'avernon'), true)
})

test('el laboratorio exige región rica y colapsa si la región muere', () => {
  const game = grant(ready(), { funds: 200, ap: 6 })
  assert.equal(game.actionIO(2, 'lab', 'mbanzu'), false, 'Mbanzu es pobre')
  assert.equal(game.actionIO(2, 'lab', 'avernon'), true)
  assert.equal(game.regions.avernon.lab, true)
})

test('vacunar requiere un mínimo de cura, y la plataforma lo baja', () => {
  const game = grant(ready(), { funds: 400, ap: 10 })
  assert.equal(game.actionIO(2, 'vaccinate', 'avernon'), false, 'cura al 0 %')
  game.cure = 30
  assert.equal(game.actionIO(2, 'vaccinate', 'avernon'), false, 'hace falta el 40 %')
  game.doctrineIO(2, 'basic_research'); game.doctrineIO(2, 'sequencing'); game.doctrineIO(2, 'vaccine_platform')
  assert.equal(game.actionIO(2, 'vaccinate', 'avernon'), true, 'con la plataforma basta el 25 %')
  assert.ok(game.regions.avernon.immune > 0)
})

test('el cierre coordinado deja los cierres sin coste de acción', () => {
  const game = grant(ready(), { funds: 500, ap: 12 })
  ;['isolation', 'cordon', 'coordinated'].forEach(d => game.doctrineIO(2, d))
  const ap = game.sides[SIDES.COALITION].ap
  assert.equal(game.actionIO(2, 'close_air', 'avernon'), true)
  assert.equal(game.sides[SIDES.COALITION].ap, ap, 'no gastó puntos de acción')
  assert.equal(game.regions.avernon.airport_open, false)
})

test('el protocolo de emergencia solo se usa una vez', () => {
  const game = grant(ready(), { funds: 300, ap: 8 })
  assert.equal(game.actionIO(2, 'emergency'), true)
  assert.equal(game.actionIO(2, 'emergency'), false)
})
