/**
 * Simulación de equilibrio: dos políticas heurísticas razonables (no óptimas)
 * se enfrentan en N partidas con semillas distintas. Interesa el reparto de
 * victorias y la duración, no que empaten al 50 % exacto.
 */
import VectorGame from "../models/vector/game.js"
import * as C from "../public/js/vector/const.js"

const { SIDES, GAME_STATES: ST, MUTATIONS, DOCTRINES, REGIONS } = C

const PATHOGEN_PLAN = [
  'aerosol1', 'cough', 'hydric1', 'fever', 'asymptomatic', 'aerosol2',
  'insect', 'heat1', 'airtravel', 'pneumonia', 'drug1', 'hemorrhage',
  'nausea', 'organ_failure', 'cold1', 'drug2', 'necrosis',
]
const COALITION_PLAN = [
  'epi_watch', 'basic_research', 'isolation', 'sequencing', 'antivirals',
  'border_control', 'cordon', 'vaccine_platform', 'triage', 'mass_seq',
]

function playPathogen(game, pid) {
  const side = game.sides[SIDES.PATHOGEN]
  for (const m of PATHOGEN_PLAN) {
    if (side.ap < 1) break
    if (side.tree.includes(m)) continue
    if ((MUTATIONS[m].pre || []).some(p => !side.tree.includes(p))) continue
    if (side.dna < MUTATIONS[m].cost) break
    game.mutateIO(pid, m)
  }
  // Sobra ADN y acciones: empuja un brote donde más gente sana queda
  if (side.ap >= 1 && side.dna >= 30) {
    const best = Object.values(game.regions)
      .filter(r => r.infected > 0)
      .sort((a, b) => REGIONS[b.id].pop - REGIONS[a.id].pop)[0]
    if (best) game.abilityIO(pid, 'outbreak', best.id)
  }
}

function playCoalition(game, pid) {
  const side = game.sides[SIDES.COALITION]
  // Prioridad 1: el árbol, mientras sea asequible
  for (const d of COALITION_PLAN) {
    if (side.ap < 1) break
    if (side.tree.includes(d)) continue
    if ((DOCTRINES[d].pre || []).some(p => !side.tree.includes(p))) continue
    if (side.funds < DOCTRINES[d].cost) continue
    game.doctrineIO(pid, d)
  }
  // Prioridad 2: un laboratorio en la región rica más sana
  if (side.ap >= 2 && side.funds >= 35 && side.labs.length < 2) {
    const rich = Object.values(game.regions)
      .filter(r => REGIONS[r.id].wealth === 3 && !r.lab)
      .sort((a, b) => a.infected - b.infected)[0]
    if (rich) game.actionIO(pid, 'lab', rich.id)
  }
  // Prioridad 3: cuarentena en el foco detectado más grande
  if (side.ap >= 1 && side.funds >= 14) {
    const hot = Object.values(game.regions)
      .filter(r => r.detected && r.infected > 0 && r.quarantine < 3)
      .sort((a, b) => b.infected - a.infected)[0]
    if (hot) game.actionIO(pid, 'quarantine', hot.id)
  }
  // Resto: investigar
  while (side.ap >= 1 && side.funds >= 10 && game.world_detected) {
    if (!game.actionIO(pid, 'research')) break
  }
}

/** Juega una partida completa entre las dos políticas. Devuelve el contexto final. */
export function simulate(seed) {
  const game = new VectorGame({
    id: 'sim' + seed, host: { name: 'A' },
    config: { seed, random_sides: false },
  })
  game.join('B')
  const zeros = Object.keys(REGIONS)
  game.setupIO(1, { region: zeros[seed % zeros.length] })
  game.setupIO(2, { regions: ['avernon', 'jianto'] })

  let detect_round = null
  while (game.state === ST.PLANNING) {
    playPathogen(game, 1)
    playCoalition(game, 2)
    game.commitIO(1)
    game.commitIO(2)
    if (!detect_round && game.world_detected) detect_round = game.round
  }
  return { ...game.end_context, detect_round }
}

export { playPathogen, playCoalition, PATHOGEN_PLAN, COALITION_PLAN }
