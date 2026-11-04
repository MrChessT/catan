/**
 * VECTOR — motor de juego, autoritativo en servidor.
 *
 * Dos bandos sorteados al empezar la partida. Cada ronda ambos planifican a la
 * vez; cuando los dos confirman, se resuelve el tick del mundo. El cliente solo
 * pinta lo que este motor le deja ver (`getStateFor`).
 */
import * as CONST from "../../public/js/vector/const.js"
import VectorPlayer from "./player.js"
import VectorIO from "./io.js"

const {
  SIDES, GAME_STATES: ST, END_REASONS, GAME_CONFIG,
  REGIONS, LAND_LINKS, SEA_LINKS, AIR_HUBS, AIR_ATTEMPTS, CLIMATES, WORLD_POP,
  MUTATIONS, DOCTRINES, ABILITIES, ACTIONS, EVENTS, LIMITS,
} = CONST

/** PRNG con semilla: las partidas y los tests son reproducibles. */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export default class VectorGame {
  id; config; state = ST.WAITING; round = 0; cure = 0;
  world_detected = false; end_context = null;
  /** @type {VectorPlayer[]} */ players = [];
  regions = {}; log = []; round_report = null;
  sides = {};

  #io; #rng; #onGameEnd; #mods = {}; #next_mods = {}; #emergency = 0;
  #initial_rich = 0; #used_events = new Set();

  constructor({ id, io = null, host, config = {}, onGameEnd = () => {} }) {
    this.id = id
    this.config = Object.assign({}, GAME_CONFIG, config)
    this.#io = io ? new VectorIO({ game: this, io }) : null
    this.#onGameEnd = onGameEnd
    this.#rng = mulberry32(this.config.seed || Math.floor(Math.random() * 1e9))

    Object.entries(REGIONS).forEach(([rid, r]) => {
      this.regions[rid] = {
        id: rid, infected: 0, dead: 0, immune: 0, detected: false,
        quarantine: 0, hygiene: 0, hospitals: 0, surveillance: false,
        lab: false, martial: false, airport_open: !!r.airport, port_open: !!r.port,
      }
    })
    this.#initial_rich = this.#richPop()

    this.sides[SIDES.PATHOGEN] = {
      side: SIDES.PATHOGEN, dna: this.config.start_dna, ap: 0, committed: false,
      setup_done: false, tree: [], revealed: [], cooldowns: {}, pending: [],
    }
    this.sides[SIDES.COALITION] = {
      side: SIDES.COALITION, funds: this.config.start_funds, ap: 0, committed: false,
      setup_done: false, tree: [], labs: [], research: 0,
      emergency_used: false, pending: [],
    }

    if (host?.name) this.join(host.name)
  }

  // ───────────────────────────────────────────────────── Jugadores

  get player_count() { return this.config.pathogen_slots + this.config.coalition_slots }
  get is_full() { return this.players.length >= this.player_count }
  hasPlayer(pid) { return this.players.some(p => p.id === pid) }
  getPlayer(pid) { return this.players.find(p => p.id === pid) }
  playersOf(side) { return this.players.filter(p => p.side === side) }

  join(name) {
    if (this.is_full || this.state !== ST.WAITING) return null
    const id = this.players.length + 1
    const player = new VectorPlayer({ id, name })
    this.players.push(player)
    this.#io?.updateWaitingRoom(player.toJSON(), this.players.map(p => p.toJSON()))
    if (this.is_full) this.#assignSides()
    return player
  }

  removePlayer(pid) {
    const player = this.getPlayer(pid)
    if (!player) return
    if (this.state === ST.WAITING) {
      this.players = this.players.filter(p => p.id !== pid)
      this.players.forEach((p, i) => { p.id = i + 1 })
      return
    }
    if (this.state === ST.ENDED) return
    this.#end(END_REASONS.FORFEIT, player.side === SIDES.PATHOGEN ? SIDES.COALITION : SIDES.PATHOGEN,
      `${player.name} abandonó la partida.`)
  }

  setUpPlayerSocket(pid, socket) {
    const player = this.getPlayer(pid)
    if (!player) return
    player.setSocket(socket)
    this.#io?.setUpEvents(socket, pid)
  }

  removePlayerSocket(pid) { this.getPlayer(pid)?.setSocket(null) }

  /** Sorteo de bandos: cada partida te puede tocar patógeno o cura. */
  #assignSides() {
    const slots = [
      ...Array(this.config.pathogen_slots).fill(SIDES.PATHOGEN),
      ...Array(this.config.coalition_slots).fill(SIDES.COALITION),
    ]
    if (this.config.random_sides) {
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(this.#rng() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]]
      }
    }
    this.players.forEach((p, i) => { p.side = slots[i] })
    this.state = ST.SETUP
    this.#refillAP()
    this.#pushLog('Bandos sorteados. ' + this.players.map(p =>
      `${p.name} → ${p.side === SIDES.PATHOGEN ? 'Patógeno' : 'Coalición'}`).join(' · '))
    this.#io?.updateState(this)
  }

  // ───────────────────────────────────────────────────── Preparación

  /**
   * Patógeno: `{ region }` paciente cero. Coalición: `{ regions: [a, b] }`
   * donde despliega su vigilancia inicial.
   */
  setupIO(pid, payload = {}) {
    const side = this.#sideOf(pid, ST.SETUP)
    if (!side || side.setup_done) return this.#err(pid, 'No te toca preparar.')

    if (side.side === SIDES.PATHOGEN) {
      const rid = payload.region
      if (!this.regions[rid]) return this.#err(pid, 'Región inválida.')
      this.regions[rid].infected = LIMITS.patient_zero
      side.patient_zero = rid
      side.setup_done = true
      this.#pushLog('El patógeno ha elegido su paciente cero.', SIDES.PATHOGEN)
    } else {
      const list = (payload.regions || []).filter(rid => this.regions[rid]).slice(0, 2)
      if (list.length !== 2) return this.#err(pid, 'Elige 2 regiones de vigilancia.')
      list.forEach(rid => { this.regions[rid].surveillance = true })
      side.setup_done = true
      this.#pushLog('La coalición ha desplegado su vigilancia inicial.', SIDES.COALITION)
    }

    if (this.#both('setup_done')) {
      this.state = ST.PLANNING
      this.round = 1
      this.#refillAP()
      this.#pushLog('Ronda 1. Los dos bandos planifican.')
    }
    this.#io?.updateState(this)
  }

  // ─────────────────────────────────────────────── Acciones de ronda

  /** Compra un nodo del árbol: mutación (patógeno) o doctrina (coalición). */
  #buyNode(pid, node_id, catalog, currency) {
    const side = this.#sideOf(pid, ST.PLANNING)
    if (!side) return this.#err(pid, 'No puedes actuar ahora.')
    if (side.committed) return this.#err(pid, 'Ya has confirmado la ronda.')
    const node = catalog[node_id]
    if (!node) return this.#err(pid, 'Nodo desconocido.')
    if (side.tree.includes(node_id)) return this.#err(pid, 'Ya lo tienes.')
    if ((node.pre || []).some(p => !side.tree.includes(p))) return this.#err(pid, 'Te faltan prerrequisitos.')
    if (side.ap < 1) return this.#err(pid, 'Sin puntos de acción.')
    if (side[currency] < node.cost) return this.#err(pid, 'Recursos insuficientes.')

    side[currency] -= node.cost
    side.ap -= 1
    side.tree.push(node_id)
    side.pending.push(`${node.name} (−${node.cost})`)
    this.#io?.syncSide(this, side.side)
    return true
  }

  mutateIO(pid, mut_id) {
    const side = this.getPlayer(pid)?.side
    if (side !== SIDES.PATHOGEN) return this.#err(pid, 'No eres el patógeno.')
    return this.#buyNode(pid, mut_id, MUTATIONS, 'dna')
  }

  doctrineIO(pid, doc_id) {
    const side = this.getPlayer(pid)?.side
    if (side !== SIDES.COALITION) return this.#err(pid, 'No eres la coalición.')
    return this.#buyNode(pid, doc_id, DOCTRINES, 'funds')
  }

  abilityIO(pid, ab_id, target) {
    const side = this.#sideOf(pid, ST.PLANNING)
    if (!side || side.side !== SIDES.PATHOGEN) return this.#err(pid, 'No eres el patógeno.')
    if (side.committed) return this.#err(pid, 'Ya has confirmado la ronda.')
    const ab = ABILITIES[ab_id]
    if (!ab) return this.#err(pid, 'Habilidad desconocida.')
    if ((side.cooldowns[ab_id] || 0) > 0) return this.#err(pid, 'En recarga.')
    if (ab.requires && !this.pathogenStats().reseed) return this.#err(pid, 'Necesitas el reservorio ganadero.')
    if (side.ap < ab.ap) return this.#err(pid, 'Sin puntos de acción.')
    if (side.dna < ab.cost) return this.#err(pid, 'ADN insuficiente.')

    const r = this.regions[target]
    if (ab.target === 'infected' && !(r?.infected > 0)) return this.#err(pid, 'Esa región no está infectada.')
    if (ab.target === 'any' && !r) return this.#err(pid, 'Región inválida.')
    if (ab.target === 'clean' && !r) return this.#err(pid, 'Región inválida.')
    if (ab.target === 'clean' && r.infected > 0) return this.#err(pid, 'Esa región ya está infectada.')

    side.dna -= ab.cost
    side.ap -= ab.ap
    side.cooldowns[ab_id] = ab.cd

    switch (ab_id) {
      case 'outbreak': {
        const add = Math.max(2, Math.floor(this.#healthy(r) * LIMITS.outbreak_share))
        r.infected += Math.min(add, this.#healthy(r))
        side.pending.push(`Brote en ${REGIONS[target].name}`)
        break
      }
      case 'jump': {
        r.infected += Math.min(LIMITS.jump_seed, this.#healthy(r))
        side.pending.push(`Salto de vector a ${REGIONS[target].name}`)
        break
      }
      case 'reseed': {
        r.infected += Math.min(2, this.#healthy(r))
        side.pending.push(`Resiembra en ${REGIONS[target].name}`)
        break
      }
      case 'shed': {
        const pool = Object.keys(MUTATIONS).filter(m => MUTATIONS[m].branch === 'symptom'
          && !side.tree.includes(m) && (MUTATIONS[m].pre || []).every(p => side.tree.includes(p)))
        if (!pool.length) { side.pending.push('Mutación espontánea sin efecto'); break }
        const pick = pool[Math.floor(this.#rng() * pool.length)]
        side.tree.push(pick)
        side.pending.push(`Mutación espontánea → ${MUTATIONS[pick].name}`)
        break
      }
    }
    this.#io?.syncSide(this, side.side)
    return true
  }

  actionIO(pid, act_id, target) {
    const side = this.#sideOf(pid, ST.PLANNING)
    if (!side || side.side !== SIDES.COALITION) return this.#err(pid, 'No eres la coalición.')
    if (side.committed) return this.#err(pid, 'Ya has confirmado la ronda.')
    const act = ACTIONS[act_id]
    if (!act) return this.#err(pid, 'Acción desconocida.')
    const fx = this.coalitionFx()
    let ap_cost = act.ap
    if (fx.cheap_closures && (act_id === 'close_air' || act_id === 'close_port')) ap_cost = 0
    if (act.once && side.emergency_used) return this.#err(pid, 'Ya se ha usado.')
    if (side.ap < ap_cost) return this.#err(pid, 'Sin puntos de acción.')
    if (side.funds < act.cost) return this.#err(pid, 'Fondos insuficientes.')

    const r = this.regions[target]
    if (act.target === 'region' && !r) return this.#err(pid, 'Región inválida.')

    switch (act_id) {
      case 'research':
        if (!this.world_detected) return this.#err(pid, 'Aún no hay patógeno detectado.')
        side.research += 4 + (fx.research_bonus || 0)
        side.pending.push('Investigación en la cura')
        break
      case 'lab':
        if (REGIONS[target].wealth < 2) return this.#err(pid, 'Hace falta una región rica.')
        if (r.lab) return this.#err(pid, 'Ya hay un laboratorio ahí.')
        r.lab = true
        side.labs.push(target)
        side.pending.push(`Laboratorio en ${REGIONS[target].name}`)
        break
      case 'surveillance':
        if (r.surveillance) return this.#err(pid, 'Ya hay vigilancia ahí.')
        r.surveillance = true
        side.pending.push(`Vigilancia en ${REGIONS[target].name}`)
        break
      case 'trace': {
        const hidden = this.sides[SIDES.PATHOGEN].tree
          .filter(m => !this.sides[SIDES.PATHOGEN].revealed.includes(m))
        if (!hidden.length) return this.#err(pid, 'No hay nada oculto que revelar.')
        const n = fx.trace_count || 2
        for (let i = 0; i < n && hidden.length; i++) {
          const pick = hidden.splice(Math.floor(this.#rng() * hidden.length), 1)[0]
          this.sides[SIDES.PATHOGEN].revealed.push(pick)
        }
        side.pending.push('Rastreo genético')
        break
      }
      case 'quarantine':
        if (r.quarantine >= LIMITS.quarantine_max) return this.#err(pid, 'Cuarentena ya al máximo.')
        r.quarantine++
        side.pending.push(`Cuarentena en ${REGIONS[target].name}`)
        break
      case 'close_air':
        if (!REGIONS[target].airport) return this.#err(pid, 'Esa región no tiene aeropuerto.')
        if (!r.airport_open) return this.#err(pid, 'Ya está cerrado.')
        r.airport_open = false
        side.pending.push(`Aeropuerto cerrado en ${REGIONS[target].name}`)
        break
      case 'close_port':
        if (!REGIONS[target].port) return this.#err(pid, 'Esa región no tiene puerto.')
        if (!r.port_open) return this.#err(pid, 'Ya está cerrado.')
        r.port_open = false
        side.pending.push(`Puerto cerrado en ${REGIONS[target].name}`)
        break
      case 'hygiene':
        if (r.hygiene >= LIMITS.hygiene_max) return this.#err(pid, 'Higiene ya al máximo.')
        r.hygiene++
        side.pending.push(`Higiene en ${REGIONS[target].name}`)
        break
      case 'hospital':
        if (r.hospitals >= LIMITS.hospital_max) return this.#err(pid, 'Ya hay 2 hospitales.')
        r.hospitals++
        side.pending.push(`Hospital en ${REGIONS[target].name}`)
        break
      case 'vaccinate': {
        const min = fx.vaccine_min ?? LIMITS.vaccinate_cure_min
        if (this.cure < min) return this.#err(pid, `La cura debe estar al ${min} %.`)
        const healthy = this.#healthy(r)
        if (healthy <= 0) return this.#err(pid, 'No queda población sana ahí.')
        const share = LIMITS.vaccinate_share + (fx.vaccine_share || 0)
        r.immune += Math.max(1, Math.floor(healthy * share))
        side.pending.push(`Vacunación en ${REGIONS[target].name}`)
        break
      }
      case 'martial':
        if (r.martial) return this.#err(pid, 'Ya hay ley marcial ahí.')
        r.martial = true
        r.quarantine = LIMITS.quarantine_max
        side.pending.push(`Ley marcial en ${REGIONS[target].name}`)
        break
      case 'emergency':
        side.emergency_used = true
        this.#emergency = 1
        side.pending.push('Protocolo de emergencia mundial')
        break
    }

    side.funds -= act.cost
    side.ap -= ap_cost
    this.#io?.syncSide(this, side.side)
    return true
  }

  commitIO(pid) {
    const side = this.#sideOf(pid, ST.PLANNING)
    if (!side) return this.#err(pid, 'No puedes confirmar ahora.')
    side.committed = true
    this.#io?.updateState(this)
    if (this.#both('committed')) this.#resolveRound()
    return true
  }

  uncommitIO(pid) {
    const side = this.#sideOf(pid, ST.PLANNING)
    if (!side || !side.committed) return false
    side.committed = false
    this.#io?.updateState(this)
    return true
  }

  // ─────────────────────────────────────────────── Estadísticas

  /** Agrega los efectos del árbol de mutaciones. */
  pathogenStats() {
    const s = {
      inf: 0, sev: 0, let: 0, stealth: 0, drug: 0,
      clim: { temperate: 0, cold: 0, hot: 0, arid: 0, humid: 0 },
      route: { air: false, sea: false }, reseed: false,
    }
    this.sides[SIDES.PATHOGEN].tree.forEach(id => {
      const fx = MUTATIONS[id]?.fx || {}
      s.inf += fx.inf || 0; s.sev += fx.sev || 0; s.let += fx.let || 0
      s.stealth += fx.stealth || 0; s.drug += fx.drug || 0
      if (fx.reseed) s.reseed = true
      if (fx.route) Object.assign(s.route, fx.route)
      Object.entries(fx.clim || {}).forEach(([k, v]) => { s.clim[k] = (s.clim[k] || 0) + v })
    })
    return s
  }

  /** Agrega los efectos del árbol de doctrinas. */
  coalitionFx() {
    const fx = {}
    this.sides[SIDES.COALITION].tree.forEach(id => {
      Object.entries(DOCTRINES[id]?.fx || {}).forEach(([k, v]) => {
        if (typeof v === 'boolean') fx[k] = fx[k] || v
        else if (k === 'vaccine_min') fx[k] = Math.min(fx[k] ?? 999, v)
        else fx[k] = (fx[k] || 0) + v
      })
    })
    return fx
  }

  #healthy(r) { return Math.max(0, REGIONS[r.id].pop - r.infected - r.dead - r.immune) }
  #richPop() {
    return Object.values(this.regions).reduce((sum, r) =>
      REGIONS[r.id].wealth === 3 ? sum + this.#healthy(r) + r.immune : sum, 0)
  }
  get total_infected() { return Object.values(this.regions).reduce((s, r) => s + r.infected, 0) }
  get total_dead() { return Object.values(this.regions).reduce((s, r) => s + r.dead, 0) }
  get dead_pct() { return (this.total_dead / WORLD_POP) * 100 }

  /** Tasa de contagio interno de una región, 0 = contención total. */
  #infectionRate(r, stats, fx) {
    const meta = REGIONS[r.id]
    const eff = stats.inf + CLIMATES[meta.climate].mod + (stats.clim[meta.climate] || 0)
      + (this.#mods.clim?.[meta.climate] || 0)
    let rate = Math.max(0.04, 0.45 + eff * 0.065)
    rate *= 1 + (meta.density - 2) * 0.12
    rate *= 1 - Math.min(0.5, r.hygiene * 0.12 + (meta.wealth - 1) * 0.05)
    rate *= 1 - Math.min(0.85, r.quarantine * (0.18 + (fx.quarantine_power || 0)))
    rate *= 1 - r.hospitals * (this.#mods.hospitals_off ? 0 : 0.07)
    if (this.#emergency > 0) rate *= 0.45
    rate *= this.#mods.spread_mult_rich && meta.wealth === 3 ? 1.6 : 1
    return Math.max(0, rate)
  }

  // ─────────────────────────────────────────────── Tick del mundo

  #resolveRound() {
    this.#mods = this.#next_mods
    this.#next_mods = {}
    const stats = this.pathogenStats()
    const fx = this.coalitionFx()
    const before = {
      infected: this.total_infected, dead: this.total_dead,
      regions: Object.values(this.regions).filter(r => r.infected > 0).length,
    }
    const report = { round: this.round, seeded: [], detected: [], deaths: 0, events: [] }

    this.#spreadInternal(stats, fx)
    this.#spreadCrossBorder(stats, fx, report)
    report.deaths = this.#applyDeaths(stats, fx)
    this.#runDetection(stats, fx, report)
    this.#advanceCure(stats, fx)
    this.#payIncome(before)
    this.#runEvent(report)

    if (this.#emergency > 0) this.#emergency--

    const p = this.sides[SIDES.PATHOGEN], c = this.sides[SIDES.COALITION]
    report.pathogen_actions = p.pending.slice()
    report.coalition_actions = c.pending.slice()
    p.pending = []; c.pending = []
    Object.keys(p.cooldowns).forEach(k => { p.cooldowns[k] = Math.max(0, p.cooldowns[k] - 1) })
    c.research = 0

    this.round_report = report
    this.#pushLog(`Ronda ${this.round}: ${this.#fmt(this.total_infected)} infectados, `
      + `${this.#fmt(this.total_dead)} muertos (${this.dead_pct.toFixed(1)} %), cura ${this.cure.toFixed(0)} %.`)

    if (this.#checkEnd()) return

    this.round++
    p.committed = false; c.committed = false
    this.#refillAP()
    if (this.round > this.config.max_rounds) return this.#timeout()
    this.#io?.resolved(this, report)
    this.#io?.updateState(this)
  }

  #spreadInternal(stats, fx) {
    Object.values(this.regions).forEach(r => {
      if (r.infected <= 0) return
      const healthy = this.#healthy(r)
      if (healthy <= 0) return
      const rate = this.#infectionRate(r, stats, fx)
      const pressure = r.infected / REGIONS[r.id].pop
      let gain = Math.floor(healthy * pressure * rate)
      if (gain < 1 && rate >= 0.2 && r.infected >= 2) gain = 1
      r.infected += Math.min(gain, healthy)
    })
  }

  #spreadCrossBorder(stats, fx, report) {
    const attempts = []
    Object.values(this.regions).forEach(r => {
      if (r.infected <= 0) return
      if (fx.route_block && r.quarantine >= LIMITS.quarantine_max
        && !this.#mods.ignore_quarantine) return
      LAND_LINKS[r.id].forEach(t => attempts.push([r.id, t, 'land', 1.0]))
      if (stats.route.sea && r.port_open) {
        (SEA_LINKS[r.id] || []).forEach(t => {
          if (this.regions[t].port_open) attempts.push([r.id, t, 'sea', 0.7])
        })
      }
    })

    if (stats.route.air) {
      const hubs = AIR_HUBS.filter(id => this.regions[id].airport_open)
      const sources = hubs.filter(id => this.regions[id].infected > 0)
      for (let i = 0; i < AIR_ATTEMPTS && sources.length && hubs.length; i++) {
        const src = sources[Math.floor(this.#rng() * sources.length)]
        const dst = hubs[Math.floor(this.#rng() * hubs.length)]
        if (src !== dst) attempts.push([src, dst, 'air', 1.3])
      }
    }

    attempts.forEach(([src_id, dst_id, kind, factor]) => {
      const src = this.regions[src_id], dst = this.regions[dst_id]
      const healthy = this.#healthy(dst)
      if (healthy <= 0) return
      const share = src.infected / REGIONS[src_id].pop
      const defense = dst.quarantine * 15 + dst.hygiene * 5
        + (REGIONS[dst_id].wealth - 1) * 4 + src.quarantine * 20 + (fx.seed_defense || 0)
      const chance = clamp(share * 100 * factor * 2.2 - defense, 0, 90)
      if (this.#rng() * 100 >= chance) return
      const fresh = dst.infected === 0
      dst.infected += Math.min(fresh ? 1 : 2, healthy)
      if (fresh) report.seeded.push({ region: dst_id, from: src_id, kind })
    })
  }

  #applyDeaths(stats, fx) {
    let total = 0
    Object.values(this.regions).forEach(r => {
      if (r.infected <= 0 || stats.let <= 0) return
      const cut = this.#mods.hospitals_off ? 0 : r.hospitals * (0.22 + (fx.hospital_cut || 0))
      const rate = stats.let * 0.006 * (1 - Math.min(0.8, cut))
      const deaths = Math.min(r.infected, Math.floor(r.infected * rate))
      r.infected -= deaths
      r.dead += deaths
      total += deaths
      if (r.lab && this.#healthy(r) <= 0) {
        r.lab = false
        const c = this.sides[SIDES.COALITION]
        c.labs = c.labs.filter(l => l !== r.id)
        this.#pushLog(`El laboratorio de ${REGIONS[r.id].name} ha colapsado.`)
      }
    })
    return total
  }

  #runDetection(stats, fx, report) {
    Object.values(this.regions).forEach(r => {
      if (r.detected || r.infected <= 0) return
      let score = stats.sev * 1.6 + (r.infected / REGIONS[r.id].pop) * 90
        + (r.surveillance ? 35 : 0) + (REGIONS[r.id].wealth - 1) * 6
        + (fx.detection_bonus || 0) - stats.stealth * 4
      if (this.world_detected) score += 25
      if (this.#mods.force_detect) score = 100
      if (this.#rng() * 100 >= clamp(score, 1, 96)) return
      r.detected = true
      report.detected.push(r.id)
      if (!this.world_detected) {
        this.world_detected = true
        this.#pushLog(`¡Patógeno detectado en ${REGIONS[r.id].name}! Comienza la carrera por la cura.`)
      }
    })
  }

  #advanceCure(stats, fx) {
    if (!this.world_detected) return
    const c = this.sides[SIDES.COALITION]
    const labs = c.labs.length * (3 + (fx.lab_bonus || 0))
    const base = c.research + labs
    if (base <= 0) return
    const rich = this.#initial_rich ? this.#richPop() / this.#initial_rich : 1
    const drug = stats.drug * (1 - (fx.antiviral || 0))
    const rate = this.config.cure_rate ?? 1
    this.cure = clamp(this.cure + base * rate * (0.4 + 0.6 * rich) / (1 + drug * 0.15), 0, 100)
  }

  #payIncome(before) {
    const p = this.sides[SIDES.PATHOGEN], c = this.sides[SIDES.COALITION]
    const new_inf = Math.max(0, this.total_infected + this.total_dead - before.infected - before.dead)
    const new_dead = Math.max(0, this.total_dead - before.dead)
    const new_regions = Math.max(0, Object.values(this.regions).filter(r => r.infected > 0).length - before.regions)
    p.dna += 4 + new_regions * 4 + Math.floor(new_inf / 14) + Math.floor(new_dead / 10)
      + (this.#mods.free_dna || 0)

    const weighted = Object.values(this.regions).reduce((sum, r) => {
      const meta = REGIONS[r.id]
      return sum + this.#healthy(r) * meta.wealth * (r.martial ? 0.4 : 1)
    }, 0)
    c.funds += Math.max(2, 5 + Math.floor(weighted / 900)) + (this.#mods.funds || 0)
    if (this.#mods.funds_cut) c.funds = Math.max(0, Math.floor(c.funds * 0.65))
  }

  #runEvent(report) {
    if (this.round < 2) return
    if (this.#rng() * 100 >= this.config.event_chance) return
    const pool = Object.keys(EVENTS).filter(e => !this.#used_events.has(e))
    if (!pool.length) return
    const id = pool[Math.floor(this.#rng() * pool.length)]
    const ev = EVENTS[id]
    this.#used_events.add(id)
    report.events.push({ id, name: ev.name, desc: ev.desc, side: ev.side })
    this.#pushLog(`Evento: ${ev.name}. ${ev.desc}`)

    const n = this.#next_mods
    switch (ev.fx) {
      case 'spread_rich': n.spread_mult_rich = true; break
      case 'heatwave': n.clim = { hot: 3, cold: -2 }; break
      case 'coldsnap': n.clim = { cold: 3, hot: -2 }; break
      case 'cure_boost': if (this.world_detected) this.cure = clamp(this.cure + 6, 0, 100); break
      case 'cure_boost_big': this.cure = clamp(this.cure + 9, 0, 100); break
      case 'funds_cut': n.funds_cut = true; break
      case 'funds_boost': n.funds = 25; break
      case 'migration': n.ignore_quarantine = true; break
      case 'awareness': n.force_detect = true; break
      case 'hospital_down': n.hospitals_off = true; break
      case 'free_dna': n.free_dna = 12; break
      case 'close_all_air':
        Object.values(this.regions).forEach(r => { if (r.infected === 0) r.airport_open = false })
        break
      case 'reopen_port': {
        const shut = Object.values(this.regions).filter(r => REGIONS[r.id].port && !r.port_open)
        if (shut.length) shut[Math.floor(this.#rng() * shut.length)].port_open = true
        break
      }
      case 'hygiene_down':
        Object.values(this.regions).forEach(r => { r.hygiene = Math.max(0, r.hygiene - 1) })
        break
    }
  }

  // ─────────────────────────────────────────────────────── Final

  #checkEnd() {
    if (this.cure >= 100) {
      return this.#end(END_REASONS.CURE, SIDES.COALITION, 'La cura se ha distribuido en todo el mundo.')
    }
    if (this.world_detected && this.total_infected === 0) {
      return this.#end(END_REASONS.ERADICATED, SIDES.COALITION, 'El patógeno ha sido erradicado.')
    }
    if (this.dead_pct >= this.config.extinction_threshold) {
      return this.#end(END_REASONS.EXTINCTION, SIDES.PATHOGEN, 'La mortandad ha superado el umbral de colapso.')
    }
    const healthy = Object.values(this.regions).reduce((s, r) => s + this.#healthy(r), 0)
    if (healthy === 0 && this.total_infected > 0) {
      return this.#end(END_REASONS.EXTINCTION, SIDES.PATHOGEN, 'No queda población sana en el mundo.')
    }
    return false
  }

  #timeout() {
    const pathogen_score = (this.dead_pct / this.config.extinction_threshold) * 100
    const winner = pathogen_score > this.cure ? SIDES.PATHOGEN : SIDES.COALITION
    this.#end(END_REASONS.TIMEOUT, winner,
      `Límite de rondas. Patógeno ${pathogen_score.toFixed(0)} vs cura ${this.cure.toFixed(0)}.`)
  }

  #end(reason, winner, text) {
    this.state = ST.ENDED
    this.end_context = {
      reason, winner, text, round: this.round,
      dead: this.total_dead, dead_pct: +this.dead_pct.toFixed(1),
      infected: this.total_infected, cure: +this.cure.toFixed(1),
      players: this.players.map(p => p.toJSON()),
    }
    this.#pushLog(`Fin de la partida: ${text}`)
    this.#io?.gameEnd(this, this.end_context)
    this.#onGameEnd(this.id)
    return true
  }

  // ───────────────────────────────────────────────────── Utilidades

  #sideOf(pid, required_state) {
    const player = this.getPlayer(pid)
    if (!player?.side) return null
    if (required_state && this.state !== required_state) return null
    return this.sides[player.side]
  }

  #both(key) { return this.sides[SIDES.PATHOGEN][key] && this.sides[SIDES.COALITION][key] }

  #refillAP() {
    this.sides[SIDES.PATHOGEN].ap = this.config.action_points
    this.sides[SIDES.COALITION].ap = this.config.action_points
  }

  #fmt(pu) { return (pu / 10).toFixed(1) + ' M' }

  #pushLog(text, side = null) {
    this.log.push({ round: this.round, text, side })
    if (this.log.length > 200) this.log.shift()
    this.#io?.pushLog(this, { round: this.round, text, side })
  }

  #err(pid, message) {
    this.#io?.error(this.getPlayer(pid), message)
    return false
  }

  // ─────────────────────────────────────────── Vista por bando

  /**
   * Estado filtrado. El patógeno ve el mapa real pero no el detalle de la cura;
   * la coalición solo ve las regiones detectadas y las mutaciones reveladas.
   */
  getStateFor(side) {
    const is_pathogen = side === SIDES.PATHOGEN
    const p = this.sides[SIDES.PATHOGEN], c = this.sides[SIDES.COALITION]
    const fx = this.coalitionFx()

    const regions = {}
    Object.values(this.regions).forEach(r => {
      const pub = {
        id: r.id, detected: r.detected, quarantine: r.quarantine, hygiene: r.hygiene,
        hospitals: r.hospitals, lab: r.lab, martial: r.martial,
        airport_open: r.airport_open, port_open: r.port_open, dead: r.dead, immune: r.immune,
        // La red de vigilancia es secreta: el patógeno no sabe dónde le esperan
        surveillance: is_pathogen ? false : r.surveillance,
      }
      if (is_pathogen || r.detected) {
        regions[r.id] = { ...pub, infected: r.infected, healthy: this.#healthy(r), known: true }
      } else if (fx.see_infected) {
        // Red satelital: estimación redondeada, no el dato exacto
        const est = r.infected === 0 ? 0 : Math.max(1, Math.round(r.infected / 5) * 5)
        regions[r.id] = { ...pub, infected: est, estimate: true, healthy: null, known: false }
      } else {
        regions[r.id] = { ...pub, infected: null, healthy: null, known: false }
      }
    })

    return {
      id: this.id, state: this.state, round: this.round, max_rounds: this.config.max_rounds,
      your_side: side, world_detected: this.world_detected,
      world_pop: WORLD_POP, total_dead: this.total_dead, dead_pct: +this.dead_pct.toFixed(2),
      extinction_threshold: this.config.extinction_threshold,
      total_infected: is_pathogen || fx.see_infected ? this.total_infected : null,
      // El patógeno solo ve la cura en tramos de 10: sabe que avanza, no cuánto exacto
      cure: is_pathogen ? Math.floor(this.cure / 10) * 10 : +this.cure.toFixed(1),
      cure_exact: !is_pathogen,
      regions,
      players: this.players.map(pl => pl.toJSON()),
      you: is_pathogen
        ? { dna: p.dna, ap: p.ap, committed: p.committed, setup_done: p.setup_done, tree: p.tree, cooldowns: p.cooldowns, pending: p.pending }
        : { funds: c.funds, ap: c.ap, committed: c.committed, setup_done: c.setup_done, tree: c.tree, labs: c.labs, emergency_used: c.emergency_used, pending: c.pending },
      opponent: is_pathogen
        ? { committed: c.committed, setup_done: c.setup_done, tree: c.tree, labs: c.labs, revealed_count: p.revealed.length }
        : {
          committed: p.committed, setup_done: p.setup_done,
          tree: p.revealed.slice(), hidden_count: p.tree.length - p.revealed.length,
          dna: fx.see_dna ? p.dna : null, cooldowns: fx.see_dna ? p.cooldowns : null,
        },
      log: this.log.slice(-40),
      report: this.round_report,
      end_context: this.end_context,
    }
  }

  toJSON() {
    return {
      id: this.id, state: this.state, round: this.round,
      players: this.players.map(p => p.toJSON()),
      player_count: this.player_count,
      cure: +this.cure.toFixed(1), dead_pct: +this.dead_pct.toFixed(2),
    }
  }
}

export { CONST }
