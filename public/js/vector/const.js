/**
 * VECTOR — constantes compartidas entre servidor y cliente.
 *
 * Todo el *contenido* del juego (regiones, mutaciones, acciones, eventos) vive
 * aquí como datos declarativos, no como código. Añadir una mutación nueva es
 * añadir un objeto a MUTATIONS; el motor no se toca.
 *
 * Unidades de población: 1 `pu` = 100.000 personas. 420 pu = 42 M.
 */

export const SIDES = { PATHOGEN: 'pathogen', COALITION: 'coalition' }

export const GAME_STATES = {
  WAITING: 'waiting',     // faltan jugadores
  SETUP: 'setup',         // paciente cero + vigilancia inicial
  PLANNING: 'planning',   // los dos bandos planifican a la vez
  ENDED: 'ended',
}

export const END_REASONS = {
  EXTINCTION: 'extinction',     // gana patógeno: mortandad masiva
  CURE: 'cure',                 // gana coalición: cura completada
  ERADICATED: 'eradicated',     // gana coalición: 0 infectados
  TIMEOUT: 'timeout',           // límite de rondas: se compara marcador
  FORFEIT: 'forfeit',           // abandono
}

export const GAME_CONFIG = {
  pathogen_slots: 1,
  coalition_slots: 1,
  /** los bandos se sortean al empezar: cada partida te puede tocar uno u otro */
  random_sides: true,
  action_points: 3,
  start_dna: 14,
  start_funds: 40,
  max_rounds: 40,
  /** % de la población mundial muerta con el que gana el patógeno */
  extinction_threshold: 60,
  /** segundos por ronda; 0 = sin límite */
  round_timer: 0,
  /** multiplicador del avance de la cura: más bajo = partidas más largas */
  cure_rate: 0.72,
  event_chance: 45,
  seed: 0,
}

// ─────────────────────────────────────────────────────────────── Climas

/**
 * Modificador de infectividad por clima. El patógeno lo compensa con
 * mutaciones de resistencia.
 */
export const CLIMATES = {
  temperate: { name: 'Templado', mod: 0 },
  cold: { name: 'Frío', mod: -4 },
  hot: { name: 'Cálido', mod: -3 },
  arid: { name: 'Árido', mod: -5 },
  humid: { name: 'Húmedo', mod: +1 },
}

// ─────────────────────────────────────────────────────────────── Mapa

/**
 * 20 regiones de un mundo ficticio. `pop` en pu, `wealth` 1-3 (pobre→rico),
 * `density` 1-3, `land` adyacencia terrestre (se normaliza a simétrica),
 * `x`/`y` posición en el lienzo SVG de 1000×620.
 */
export const REGIONS = {
  harrowmark: { name: 'Harrowmark', continent: 'Norvanda', pop: 180, wealth: 3, climate: 'cold', density: 2, airport: true, port: true, x: 120, y: 110, land: ['vjelund', 'kolstad', 'avernon'] },
  vjelund: { name: 'Vjelund', continent: 'Norvanda', pop: 95, wealth: 3, climate: 'cold', density: 1, airport: true, port: true, x: 225, y: 70, land: ['kolstad'] },
  kolstad: { name: 'Kolstad', continent: 'Norvanda', pop: 310, wealth: 2, climate: 'cold', density: 2, airport: true, port: false, x: 305, y: 145, land: ['tannholt', 'ghazan'] },

  avernon: { name: 'Avernon', continent: 'Avenia', pop: 420, wealth: 3, climate: 'temperate', density: 3, airport: true, port: true, x: 170, y: 250, land: ['tannholt', 'pellory', 'cressmoor'] },
  pellory: { name: 'Pellory', continent: 'Avenia', pop: 365, wealth: 3, climate: 'temperate', density: 3, airport: true, port: false, x: 265, y: 320, land: ['cressmoor', 'tannholt', 'sahree'] },
  cressmoor: { name: 'Cressmoor', continent: 'Avenia', pop: 240, wealth: 2, climate: 'temperate', density: 2, airport: false, port: true, x: 115, y: 375, land: [] },
  tannholt: { name: 'Tannholt', continent: 'Avenia', pop: 285, wealth: 3, climate: 'temperate', density: 3, airport: true, port: false, x: 300, y: 230, land: ['ghazan'] },

  sahree: { name: 'Sahree', continent: 'Sahreen', pop: 520, wealth: 1, climate: 'arid', density: 2, airport: true, port: true, x: 420, y: 330, land: ['ghazan', 'ulmek'] },
  ghazan: { name: 'Ghazan', continent: 'Sahreen', pop: 390, wealth: 2, climate: 'arid', density: 2, airport: true, port: false, x: 505, y: 258, land: ['sherab'] },
  ulmek: { name: 'Ulmek', continent: 'Sahreen', pop: 275, wealth: 1, climate: 'arid', density: 1, airport: false, port: false, x: 430, y: 420, land: ['okanye', 'mbanzu'] },

  jianto: { name: 'Jianto', continent: 'Jiantai', pop: 980, wealth: 2, climate: 'humid', density: 3, airport: true, port: true, x: 705, y: 220, land: ['sherab', 'namyu', 'kadrashi'] },
  sherab: { name: 'Sherab', continent: 'Jiantai', pop: 640, wealth: 1, climate: 'humid', density: 3, airport: true, port: false, x: 618, y: 292, land: ['kadrashi'] },
  namyu: { name: 'Namyu', continent: 'Jiantai', pop: 455, wealth: 3, climate: 'humid', density: 3, airport: true, port: true, x: 785, y: 300, land: ['kadrashi'] },
  kadrashi: { name: 'Kadrashi', continent: 'Jiantai', pop: 720, wealth: 1, climate: 'humid', density: 3, airport: false, port: true, x: 680, y: 372, land: [] },

  tovaland: { name: 'Tovaland', continent: 'Tovara', pop: 330, wealth: 1, climate: 'hot', density: 2, airport: true, port: true, x: 360, y: 500, land: ['mbanzu'] },
  mbanzu: { name: 'Mbanzu', continent: 'Tovara', pop: 420, wealth: 1, climate: 'hot', density: 2, airport: false, port: true, x: 470, y: 520, land: ['okanye'] },
  okanye: { name: 'Okanye', continent: 'Tovara', pop: 295, wealth: 1, climate: 'hot', density: 1, airport: true, port: true, x: 560, y: 470, land: [] },

  zephyr: { name: 'Islas Zephyr', continent: 'Insular', pop: 85, wealth: 2, climate: 'humid', density: 1, airport: true, port: true, x: 860, y: 430, land: [] },
  caldera: { name: 'Caldera', continent: 'Insular', pop: 60, wealth: 3, climate: 'hot', density: 1, airport: true, port: true, x: 900, y: 180, land: [] },
  austra: { name: 'Base Austra', continent: 'Polar', pop: 10, wealth: 3, climate: 'cold', density: 1, airport: true, port: true, x: 600, y: 575, land: [] },
}

/** Adyacencia terrestre simétrica, derivada de REGIONS[].land */
export const LAND_LINKS = (() => {
  const adj = {}
  Object.keys(REGIONS).forEach(id => { adj[id] = new Set() })
  Object.entries(REGIONS).forEach(([id, r]) => {
    (r.land || []).forEach(other => {
      if (!adj[other]) return
      adj[id].add(other)
      adj[other].add(id)
    })
  })
  return Object.fromEntries(Object.entries(adj).map(([id, set]) => [id, [...set]]))
})()

/**
 * Rutas marítimas: unen puertos a menos de SEA_RANGE en el lienzo. Es lo que
 * conecta las islas con el continente, así que cerrar un puerto importa.
 */
export const SEA_RANGE = 330

export const SEA_LINKS = (() => {
  const ids = Object.keys(REGIONS).filter(id => REGIONS[id].port)
  const adj = Object.fromEntries(ids.map(id => [id, []]))
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = REGIONS[ids[i]], b = REGIONS[ids[j]]
      if (Math.hypot(a.x - b.x, a.y - b.y) > SEA_RANGE) continue
      adj[ids[i]].push(ids[j])
      adj[ids[j]].push(ids[i])
    }
  }
  return adj
})()

/** Regiones con aeropuerto: el salto aéreo puede unir cualquier par abierto. */
export const AIR_HUBS = Object.keys(REGIONS).filter(id => REGIONS[id].airport)

/** Intentos de contagio aéreo por ronda (evita que el avión globalice al instante) */
export const AIR_ATTEMPTS = 3

export const WORLD_POP = Object.values(REGIONS).reduce((sum, r) => sum + r.pop, 0)

// ─────────────────────────────────────────────────────────── Mutaciones

export const BRANCHES = {
  transmission: { name: 'Transmisión', color: '#4aa3df' },
  symptom: { name: 'Síntomas', color: '#d9534f' },
  resistance: { name: 'Resistencia', color: '#8e7cc3' },
}

/**
 * `fx` acumula en las estadísticas del patógeno:
 *   inf (infectividad) · sev (gravedad) · let (letalidad)
 *   stealth (sigilo: frena la detección) · drug (resistencia a fármacos)
 *   clim.{cold,hot,arid,humid,temperate} (compensa el clima)
 *   route.{air,sea} (habilita rutas)
 *   reseed (permite resembrar regiones erradicadas)
 */
export const MUTATIONS = {
  // ── Transmisión
  aerosol1: { name: 'Aerosoles I', branch: 'transmission', cost: 8, fx: { inf: 2 }, desc: 'Gotículas en suspensión. Contagio básico por aire.' },
  aerosol2: { name: 'Aerosoles II', branch: 'transmission', cost: 18, pre: ['aerosol1'], fx: { inf: 3, clim: { cold: 1 } }, desc: 'Partículas más finas; aguanta en interiores cerrados.' },
  hydric1: { name: 'Vía hídrica I', branch: 'transmission', cost: 8, fx: { inf: 1, route: { sea: true } }, desc: 'Sobrevive en agua. Habilita las rutas marítimas entre puertos.' },
  hydric2: { name: 'Vía hídrica II', branch: 'transmission', cost: 16, pre: ['hydric1'], fx: { inf: 3, clim: { humid: 2 } }, desc: 'Resiste la cloración de las redes de abastecimiento.' },
  blood: { name: 'Vía sanguínea', branch: 'transmission', cost: 12, fx: { inf: 2, sev: 1 }, desc: 'Contagio por fluidos. Difícil de cortar con higiene.' },
  rodent: { name: 'Vector roedor', branch: 'transmission', cost: 14, fx: { inf: 2, clim: { arid: 2 } }, desc: 'Reservorio en roedores urbanos.' },
  insect: { name: 'Vector insecto', branch: 'transmission', cost: 16, fx: { inf: 3, clim: { hot: 2 } }, desc: 'Transmisión por picadura. Brutal en clima cálido.' },
  livestock: { name: 'Reservorio ganadero', branch: 'transmission', cost: 20, fx: { inf: 2, reseed: true }, desc: 'Persiste en el ganado: permite resembrar regiones erradicadas.' },
  airtravel: { name: 'Viaje aéreo', branch: 'transmission', cost: 24, fx: { inf: 2, route: { air: true } }, desc: 'Salta entre aeropuertos abiertos. La ruta más rápida del mundo.' },
  asymptomatic: { name: 'Portador asintomático', branch: 'transmission', cost: 20, fx: { inf: 1, stealth: 4 }, desc: 'Contagias sin dar síntomas. El mundo tarda en verte.' },

  // ── Síntomas
  cough: { name: 'Tos', branch: 'symptom', cost: 6, fx: { inf: 1, sev: 1 }, desc: 'Expulsa carga vírica. Barato y eficaz.' },
  fever: { name: 'Fiebre', branch: 'symptom', cost: 8, fx: { inf: 1, sev: 2 }, desc: 'Sube la temperatura corporal.' },
  nausea: { name: 'Náusea', branch: 'symptom', cost: 6, fx: { inf: 1, sev: 1 }, desc: 'Malestar digestivo.' },
  insomnia: { name: 'Insomnio', branch: 'symptom', cost: 7, fx: { sev: 1 }, desc: 'Deteriora el sistema inmune.' },
  pneumonia: { name: 'Neumonía', branch: 'symptom', cost: 18, pre: ['cough'], fx: { sev: 3, let: 2 }, desc: 'Infección pulmonar. Colapsa hospitales.' },
  hemorrhage: { name: 'Hemorragia', branch: 'symptom', cost: 24, pre: ['fever'], fx: { sev: 4, let: 4 }, desc: 'Sangrado interno. Muy visible, muy letal.' },
  organ_failure: { name: 'Fallo orgánico', branch: 'symptom', cost: 26, pre: ['nausea'], fx: { sev: 4, let: 5 }, desc: 'Los órganos dejan de responder.' },
  coma: { name: 'Coma', branch: 'symptom', cost: 22, pre: ['insomnia'], fx: { sev: 3, let: 3 }, desc: 'Pérdida de consciencia prolongada.' },
  necrosis: { name: 'Necrosis sistémica', branch: 'symptom', cost: 45, pre: ['hemorrhage', 'organ_failure'], fx: { sev: 6, let: 10 }, desc: 'Muerte celular masiva. El final de la partida.' },

  // ── Resistencia
  cold1: { name: 'Resistencia al frío I', branch: 'resistance', cost: 10, fx: { clim: { cold: 3 } }, desc: 'Aguanta el invierno de Norvanda.' },
  cold2: { name: 'Resistencia al frío II', branch: 'resistance', cost: 20, pre: ['cold1'], fx: { clim: { cold: 3 } }, desc: 'Inmune a la congelación.' },
  heat1: { name: 'Resistencia al calor I', branch: 'resistance', cost: 10, fx: { clim: { hot: 3 } }, desc: 'Resiste temperaturas altas.' },
  heat2: { name: 'Resistencia al calor II', branch: 'resistance', cost: 20, pre: ['heat1'], fx: { clim: { hot: 3 } }, desc: 'Estable por encima de 40 °C.' },
  arid1: { name: 'Resistencia a la sequedad', branch: 'resistance', cost: 12, fx: { clim: { arid: 3 } }, desc: 'Sobrevive sin humedad ambiental.' },
  humid1: { name: 'Resistencia a la humedad', branch: 'resistance', cost: 12, fx: { clim: { humid: 3 } }, desc: 'No se degrada con humedad alta.' },
  drug1: { name: 'Resistencia a fármacos I', branch: 'resistance', cost: 16, fx: { drug: 2 }, desc: 'Frena la investigación de la cura.' },
  drug2: { name: 'Resistencia a fármacos II', branch: 'resistance', cost: 30, pre: ['drug1'], fx: { drug: 3 }, desc: 'Obliga a reformular la cura desde cero.' },
  genetic: { name: 'Camuflaje genético', branch: 'resistance', cost: 28, fx: { stealth: 5 }, desc: 'El rastreo genético falla contra ti.' },
}

/** Habilidades activas del patógeno. `cd` = rondas de recarga. */
export const ABILITIES = {
  outbreak: { name: 'Brote', cost: 12, ap: 1, cd: 2, target: 'infected', desc: 'Pico de contagio en una región ya infectada.' },
  jump: { name: 'Salto de vector', cost: 30, ap: 2, cd: 3, target: 'any', desc: 'Infecta cualquier región, ignorando rutas y cierres.' },
  shed: { name: 'Mutación espontánea', cost: 10, ap: 1, cd: 2, target: 'none', desc: 'Gana un síntoma al azar, gratis. No controlas cuál.' },
  reseed: { name: 'Resembrar', cost: 18, ap: 1, cd: 3, target: 'clean', requires: 'reseed', desc: 'Reinfecta una región erradicada desde el reservorio animal.' },
}

// ─────────────────────────────────────────────────────────── Doctrinas

export const DOCTRINE_BRANCHES = {
  containment: { name: 'Contención', color: '#e0a33e' },
  medicine: { name: 'Medicina', color: '#4cb77c' },
  intelligence: { name: 'Inteligencia', color: '#5b8def' },
}

/**
 * Árbol de progreso de la coalición: mejoras permanentes que se compran con
 * Fondos, en paralelo a las mutaciones del patógeno. `fx` lo lee el motor:
 *   quarantine_power · route_block · seed_defense · research_bonus · lab_bonus
 *   vaccine_min · vaccine_share · hospital_cut · antiviral
 *   detection_bonus · trace_count · see_dna · see_infected · cheap_closures
 */
export const DOCTRINES = {
  // ── Contención
  isolation: { name: 'Protocolo de aislamiento', branch: 'containment', cost: 22, fx: { quarantine_power: 0.06 }, desc: 'Cada nivel de cuarentena frena más el contagio.' },
  cordon: { name: 'Cordón sanitario', branch: 'containment', cost: 40, pre: ['isolation'], fx: { route_block: true }, desc: 'Una región en cuarentena deja de exportar contagio por tierra.' },
  coordinated: { name: 'Cierre coordinado', branch: 'containment', cost: 55, pre: ['cordon'], fx: { cheap_closures: true }, desc: 'Cerrar aeropuertos y puertos no consume puntos de acción.' },
  border_control: { name: 'Control fronterizo', branch: 'containment', cost: 30, fx: { seed_defense: 12 }, desc: 'Mucho más difícil que el patógeno siembre una región nueva.' },

  // ── Medicina
  basic_research: { name: 'Investigación básica', branch: 'medicine', cost: 20, fx: { research_bonus: 1 }, desc: 'Cada Investigar rinde más.' },
  sequencing: { name: 'Secuenciación', branch: 'medicine', cost: 38, pre: ['basic_research'], fx: { research_bonus: 2, lab_bonus: 1 }, desc: 'Investigación y laboratorios mucho más productivos.' },
  vaccine_platform: { name: 'Plataforma de vacunas', branch: 'medicine', cost: 52, pre: ['sequencing'], fx: { vaccine_min: 25, vaccine_share: 0.1 }, desc: 'Permite vacunar con la cura al 25 % y inmuniza más gente.' },
  triage: { name: 'Triaje hospitalario', branch: 'medicine', cost: 26, fx: { hospital_cut: 0.12 }, desc: 'Los hospitales de campaña evitan muchas más muertes.' },
  antivirals: { name: 'Antivirales', branch: 'medicine', cost: 44, pre: ['basic_research'], fx: { antiviral: 0.5 }, desc: 'Anula la mitad de la resistencia a fármacos del patógeno.' },

  // ── Inteligencia
  epi_watch: { name: 'Vigilancia epidemiológica', branch: 'intelligence', cost: 18, fx: { detection_bonus: 14 }, desc: 'Detectas los brotes antes en todo el mundo.' },
  mass_seq: { name: 'Secuenciación masiva', branch: 'intelligence', cost: 34, pre: ['epi_watch'], fx: { trace_count: 3 }, desc: 'El rastreo revela 3 mutaciones en vez de 2.' },
  counter_intel: { name: 'Contrainteligencia', branch: 'intelligence', cost: 50, pre: ['mass_seq'], fx: { see_dna: true }, desc: 'Ves el ADN del patógeno y sus recargas de habilidad.' },
  satellite: { name: 'Red satelital', branch: 'intelligence', cost: 36, pre: ['epi_watch'], fx: { see_infected: true }, desc: 'Estimación de infectados incluso en regiones sin detectar.' },
}

/** Acciones de la coalición. `ap` puntos de acción, `cost` fondos. */
export const ACTIONS = {
  research: { name: 'Investigar', cost: 10, ap: 1, target: 'none', desc: 'Inyecta fondos en la cura. Requiere que el patógeno esté detectado.' },
  lab: { name: 'Centro de investigación', cost: 35, ap: 2, target: 'region', desc: 'Acelera la cura cada ronda. Solo en región rica; si colapsa, lo pierdes.' },
  surveillance: { name: 'Red de vigilancia', cost: 8, ap: 1, target: 'region', desc: 'Detecta el brote en esa región mucho antes.' },
  trace: { name: 'Rastreo genético', cost: 18, ap: 1, target: 'none', desc: 'Revela 2 mutaciones ocultas del patógeno.' },
  quarantine: { name: 'Cuarentena', cost: 14, ap: 1, target: 'region', desc: 'Frena el contagio dentro y hacia fuera de la región.' },
  close_air: { name: 'Cerrar aeropuerto', cost: 10, ap: 1, target: 'region', desc: 'Corta las rutas aéreas de la región.' },
  close_port: { name: 'Cerrar puerto', cost: 10, ap: 1, target: 'region', desc: 'Corta las rutas marítimas de la región.' },
  hygiene: { name: 'Campaña de higiene', cost: 9, ap: 1, target: 'region', desc: 'Reduce el contagio interno. Acumulable hasta 3.' },
  hospital: { name: 'Hospital de campaña', cost: 16, ap: 1, target: 'region', desc: 'Reduce muertes y algo de contagio. Acumulable hasta 2.' },
  vaccinate: { name: 'Vacunación', cost: 22, ap: 1, target: 'region', desc: 'Inmuniza población sana. Requiere la cura al 40 %.' },
  martial: { name: 'Ley marcial', cost: 25, ap: 2, target: 'region', desc: 'Cuarentena máxima permanente, pero hunde tus ingresos ahí.' },
  emergency: { name: 'Protocolo de emergencia', cost: 50, ap: 2, target: 'none', once: true, desc: 'Confinamiento mundial durante una ronda. Una sola vez por partida.' },
}

export const LIMITS = {
  quarantine_max: 3,
  hygiene_max: 3,
  hospital_max: 2,
  vaccinate_cure_min: 40,
  /** fracción de población sana que inmuniza una vacunación */
  vaccinate_share: 0.35,
  /** infectados iniciales del paciente cero, en pu */
  patient_zero: 4,
  outbreak_share: 0.08,
  jump_seed: 3,
}

// ───────────────────────────────────────────────────────────── Eventos

/**
 * Mazo de eventos mundiales. `fx` es un identificador que el motor resuelve;
 * `side` indica a quién beneficia (solo informativo para la UI).
 */
export const EVENTS = {
  festival: { name: 'Festival en Avernon', side: 'pathogen', fx: 'spread_rich', desc: 'Aglomeraciones en las regiones ricas: contagio al alza esta ronda.' },
  heatwave: { name: 'Ola de calor', side: 'neutral', fx: 'heatwave', desc: 'Las regiones cálidas sufren; las frías respiran.' },
  cold_snap: { name: 'Ola de frío', side: 'neutral', fx: 'coldsnap', desc: 'Las regiones frías se cierran sobre sí mismas.' },
  lab_leak: { name: 'Filtración de laboratorio', side: 'coalition', fx: 'cure_boost', desc: 'Un hallazgo accidental acelera la cura.' },
  funding_cut: { name: 'Recorte presupuestario', side: 'pathogen', fx: 'funds_cut', desc: 'La coalición pierde parte de sus fondos.' },
  donation: { name: 'Donación internacional', side: 'coalition', fx: 'funds_boost', desc: 'Entra dinero fresco en el fondo común.' },
  migration: { name: 'Migración masiva', side: 'pathogen', fx: 'migration', desc: 'El contagio salta por tierra ignorando una cuarentena.' },
  panic: { name: 'Pánico informativo', side: 'coalition', fx: 'awareness', desc: 'Los medios destapan el brote: detección inmediata.' },
  strike: { name: 'Huelga sanitaria', side: 'pathogen', fx: 'hospital_down', desc: 'Los hospitales de campaña dejan de operar esta ronda.' },
  mutation_drift: { name: 'Deriva genética', side: 'pathogen', fx: 'free_dna', desc: 'El patógeno acumula ADN extra.' },
  border_treaty: { name: 'Tratado de fronteras', side: 'coalition', fx: 'close_all_air', desc: 'Cierre coordinado de aeropuertos en las regiones no infectadas.' },
  smuggling: { name: 'Contrabando', side: 'pathogen', fx: 'reopen_port', desc: 'Se reabre un puerto cerrado.' },
  vaccine_trial: { name: 'Ensayo clínico', side: 'coalition', fx: 'cure_boost_big', desc: 'Un ensayo exitoso da un salto en la cura.' },
  denial: { name: 'Negacionismo', side: 'pathogen', fx: 'hygiene_down', desc: 'Las campañas de higiene pierden un nivel.' },
}

// ───────────────────────────────────────────────── Eventos de socket

export const SOCKET_EVENTS = {
  PLAYER_ONLINE: 'v-player-online',
  JOINED_WAITING_ROOM: 'v-joined-waiting',
  PICK_SIDE: 'v-pick-side',
  STATE_CHANGE: 'v-state',
  SYNC: 'v-sync',
  SETUP: 'v-setup',
  MUTATE: 'v-mutate',
  DOCTRINE: 'v-doctrine',
  ABILITY: 'v-ability',
  ACTION: 'v-action',
  COMMIT: 'v-commit',
  UNCOMMIT: 'v-uncommit',
  RESOLVED: 'v-resolved',
  LOG: 'v-log',
  ERROR: 'v-error',
  GAME_END: 'v-end',
  PLAYER_QUIT: 'v-quit',
  SET_TIMER: 'v-timer',
}
