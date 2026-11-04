import {
  SIDES, GAME_STATES as ST, REGIONS, CLIMATES, LIMITS,
  MUTATIONS, BRANCHES, DOCTRINES, DOCTRINE_BRANCHES, ABILITIES, ACTIONS,
  SOCKET_EVENTS as SOC,
} from "./const.js"
import VectorMap from "./map.js"

const socket = io()
let S = window.V_STATE
let selected = null
/** Regiones elegidas durante la preparación */
let setup_pick = []

const $ = id => document.getElementById(id)
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const pu = v => (v / 10).toFixed(1) + ' M'
const is_pathogen = () => S.your_side === SIDES.PATHOGEN

const map = new VectorMap($('v-map'), onRegionClick)

// ─────────────────────────────────────────────────────────── Sockets

socket.on('connect', () => socket.emit(SOC.PLAYER_ONLINE))
socket.on(SOC.SYNC, state => { S = state; render() })
socket.on(SOC.ERROR, msg => toast(msg, 'bad'))
socket.on(SOC.LOG, entry => { S.log = [...(S.log || []), entry].slice(-40); renderPanel() })
socket.on(SOC.RESOLVED, (report, state) => { S = state; render(); showReport(report) })
socket.on(SOC.GAME_END, ctx => { S.end_context = ctx; S.state = ST.ENDED; render(); showEnd(ctx) })

$('v-commit').addEventListener('click', () => {
  if (S.state === ST.SETUP) return submitSetup()
  if (S.you.committed) return socket.emit(SOC.UNCOMMIT)
  socket.emit(SOC.COMMIT)
})

// ─────────────────────────────────────────────────────── Interacción

function onRegionClick(rid) {
  if (S.state === ST.SETUP && !S.you.setup_done) {
    const limit = is_pathogen() ? 1 : 2
    if (setup_pick.includes(rid)) setup_pick = setup_pick.filter(r => r !== rid)
    else if (setup_pick.length < limit) setup_pick.push(rid)
    else setup_pick = [...setup_pick.slice(1), rid]
    map.setTargets(setup_pick)
    renderPanel()
    return
  }
  selected = selected === rid ? null : rid
  map.select(selected)
  renderPanel()
}

function submitSetup() {
  const limit = is_pathogen() ? 1 : 2
  if (setup_pick.length !== limit) {
    return toast(is_pathogen() ? 'Elige 1 región.' : 'Elige 2 regiones.', 'bad')
  }
  socket.emit(SOC.SETUP, is_pathogen() ? { region: setup_pick[0] } : { regions: setup_pick })
}

function buy(kind, id, target) {
  const event = { mutation: SOC.MUTATE, doctrine: SOC.DOCTRINE, ability: SOC.ABILITY, action: SOC.ACTION }[kind]
  if (kind === 'ability' || kind === 'action') socket.emit(event, id, target)
  else socket.emit(event, id)
}

// ─────────────────────────────────────────────────────────── Render

function render() {
  const side_name = is_pathogen() ? 'Patógeno' : 'Coalición'
  document.body.classList.toggle('side-pathogen', is_pathogen())
  document.body.classList.toggle('side-coalition', !is_pathogen())
  $('v-side-tag').textContent = side_name
  $('v-round').textContent = S.state === ST.SETUP ? 'preparación' : S.round
  $('v-maxround').textContent = S.state === ST.SETUP ? '' : ` / ${S.max_rounds}`

  const dead = S.dead_pct || 0
  $('v-dead-val').textContent = dead.toFixed(1) + ' %'
  $('v-dead-bar').style.width = Math.min(100, (dead / S.extinction_threshold) * 100) + '%'
  $('v-dead-goal').style.left = '100%'
  $('v-cure-val').textContent = (S.cure_exact ? S.cure.toFixed(1) : '≈ ' + S.cure) + ' %'
  $('v-cure-bar').style.width = S.cure + '%'

  $('v-res').innerHTML = is_pathogen()
    ? `<span class="v-res-icon">🧬</span><b>${S.you.dna}</b><small>ADN</small>`
    : `<span class="v-res-icon">💠</span><b>${S.you.funds}</b><small>Fondos</small>`
  $('v-ap').innerHTML = `<span class="v-res-icon">⚡</span><b>${S.you.ap}</b><small>acciones</small>`

  const $commit = $('v-commit')
  if (S.state === ST.SETUP) {
    $commit.textContent = S.you.setup_done ? 'Esperando rival…' : 'Confirmar elección'
    $commit.disabled = S.you.setup_done
    if (!S.you.setup_done) map.setTargets(setup_pick)
  } else if (S.state === ST.ENDED) {
    $commit.textContent = 'Partida terminada'
    $commit.disabled = true
    map.setTargets(null)
  } else {
    $commit.textContent = S.you.committed ? 'Retirar confirmación' : 'Confirmar ronda'
    $commit.disabled = false
    $commit.classList.toggle('waiting', S.you.committed)
    map.setTargets(null)
  }

  map.render(S)
  renderPanel()
}

function renderPanel() {
  const p = $('v-panel')
  p.innerHTML = [
    S.state === ST.SETUP ? setupBlock() : '',
    S.state === ST.PLANNING ? statusBlock() : '',
    regionBlock(),
    S.state === ST.PLANNING ? playBlock() : '',
    S.state !== ST.SETUP ? treeBlock() : '',
    opponentBlock(),
    logBlock(),
  ].join('')
  p.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
    const { buy: kind, id, target } = b.dataset
    buy(kind, id, target || selected)
  }))
}

function setupBlock() {
  if (S.you.setup_done) {
    return card('Preparación', `<p class="v-muted">Listo. Esperando al rival para empezar la ronda 1.</p>`)
  }
  const list = setup_pick.map(r => `<span class="v-pill">${esc(REGIONS[r].name)}</span>`).join('') || '<span class="v-muted">nada elegido</span>'
  const body = is_pathogen()
    ? `<p>Elige tu <b>paciente cero</b> en el mapa. Piensa en clima, densidad y riqueza:
         una región pobre y densa contagia rápido pero da pocos ingresos al rival;
         una rica te detecta antes.</p>`
    : `<p>Elige <b>2 regiones</b> donde desplegar tu vigilancia inicial. Ahí detectarás
         el brote mucho antes. Estás apostando a ciegas a dónde empezará.</p>`
  return card(is_pathogen() ? 'Paciente cero' : 'Vigilancia inicial', body + `<div class="v-picks">${list}</div>`)
}

function statusBlock() {
  const rival = S.opponent.committed
    ? '<b class="v-ok">ya ha confirmado</b> — te está esperando'
    : 'todavía está planificando'
  const mine = S.you.committed ? 'Has confirmado.' : 'Aún puedes gastar acciones.'
  const pending = (S.you.pending || []).length
    ? `<ul class="v-pending">${S.you.pending.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '<p class="v-muted">Nada planificado esta ronda.</p>'
  return card('Esta ronda', `<p>${mine} El rival ${rival}.</p>${pending}`)
}

function regionBlock() {
  if (!selected) return card('Región', '<p class="v-muted">Haz clic en una región del mapa.</p>')
  const meta = REGIONS[selected], r = S.regions[selected]
  const rows = []
  rows.push(['Continente', meta.continent])
  rows.push(['Población', pu(meta.pop)])
  rows.push(['Clima', CLIMATES[meta.climate].name + ` (${CLIMATES[meta.climate].mod >= 0 ? '+' : ''}${CLIMATES[meta.climate].mod} infect.)`])
  rows.push(['Riqueza', '◆'.repeat(meta.wealth) + '◇'.repeat(3 - meta.wealth)])
  rows.push(['Densidad', '●'.repeat(meta.density) + '○'.repeat(3 - meta.density)])
  if (r.known) {
    rows.push(['Infectados', pu(r.infected) + ` (${((r.infected / meta.pop) * 100).toFixed(1)} %)`])
    rows.push(['Sanos', pu(r.healthy)])
  } else if (r.estimate) {
    rows.push(['Infectados', '≈ ' + pu(r.infected) + ' (estimación satelital)'])
  } else {
    rows.push(['Infectados', '<span class="v-muted">sin datos</span>'])
  }
  rows.push(['Muertos', pu(r.dead)])
  if (r.immune) rows.push(['Inmunizados', pu(r.immune)])
  rows.push(['Cuarentena', r.quarantine ? `nivel ${r.quarantine}/${LIMITS.quarantine_max}` : '—'])
  rows.push(['Higiene', r.hygiene ? `nivel ${r.hygiene}/${LIMITS.hygiene_max}` : '—'])
  rows.push(['Hospitales', r.hospitals || '—'])
  const links = []
  if (meta.airport) links.push(r.airport_open ? '✈ aeropuerto abierto' : '<s>✈ aeropuerto cerrado</s>')
  if (meta.port) links.push(r.port_open ? '⚓ puerto abierto' : '<s>⚓ puerto cerrado</s>')
  if (!meta.airport && !meta.port) links.push('sin aeropuerto ni puerto')
  if (r.lab) links.push('🔬 laboratorio')
  if (r.surveillance) links.push('📡 vigilancia')
  if (r.martial) links.push('⚠ ley marcial')

  return card(esc(meta.name),
    `<table class="v-rows">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
     <p class="v-links">${links.join(' · ')}</p>`)
}

/** Habilidades (patógeno) o acciones (coalición) de la ronda. */
function playBlock() {
  const catalog = is_pathogen() ? ABILITIES : ACTIONS
  const currency = is_pathogen() ? S.you.dna : S.you.funds
  const items = Object.entries(catalog).map(([id, a]) => {
    const needs_region = a.target === 'region' || ['infected', 'any', 'clean'].includes(a.target)
    const cd = is_pathogen() ? (S.you.cooldowns?.[id] || 0) : 0
    const reasons = []
    if (cd > 0) reasons.push(`recarga ${cd}`)
    if (currency < a.cost) reasons.push('sin recursos')
    if (S.you.ap < a.ap) reasons.push('sin acciones')
    if (needs_region && !selected) reasons.push('elige región')
    if (a.once && S.you.emergency_used) reasons.push('ya usado')
    if (id === 'research' && !S.world_detected) reasons.push('patógeno sin detectar')
    if (id === 'trace' && !S.opponent.hidden_count) reasons.push('nada que revelar')
    if (id === 'vaccinate' && S.cure < (S.you.tree?.includes('vaccine_platform') ? 25 : LIMITS.vaccinate_cure_min)) {
      reasons.push('cura insuficiente')
    }
    if (id === 'lab' && selected && REGIONS[selected].wealth < 2) reasons.push('hace falta región rica')
    if (S.you.committed) reasons.push('ronda confirmada')
    const off = reasons.length
    const target_note = needs_region && selected ? ` → ${esc(REGIONS[selected].name)}` : ''
    return `<button class="v-item" data-buy="${is_pathogen() ? 'ability' : 'action'}" data-id="${id}"
      ${off ? 'disabled' : ''} title="${esc(a.desc)}">
        <span class="v-item-head"><b>${esc(a.name)}</b>
          <span class="v-cost">${a.cost}${is_pathogen() ? '🧬' : '💠'} · ${a.ap}⚡</span></span>
        <span class="v-item-desc">${esc(a.desc)}${target_note}</span>
        ${off ? `<span class="v-why">${reasons.join(' · ')}</span>` : ''}
      </button>`
  }).join('')
  return card(is_pathogen() ? 'Habilidades' : 'Acciones', `<div class="v-items">${items}</div>`)
}

/** Árbol de mutaciones o de doctrinas. */
function treeBlock() {
  const catalog = is_pathogen() ? MUTATIONS : DOCTRINES
  const branches = is_pathogen() ? BRANCHES : DOCTRINE_BRANCHES
  const currency = is_pathogen() ? S.you.dna : S.you.funds
  const owned = S.you.tree || []

  const groups = Object.entries(branches).map(([bid, b]) => {
    const nodes = Object.entries(catalog).filter(([, n]) => n.branch === bid).map(([id, n]) => {
      const has = owned.includes(id)
      const missing = (n.pre || []).filter(x => !owned.includes(x))
      const reasons = []
      if (missing.length) reasons.push('falta ' + missing.map(m => catalog[m].name).join(', '))
      if (currency < n.cost) reasons.push('sin recursos')
      if (S.you.ap < 1) reasons.push('sin acciones')
      if (S.you.committed) reasons.push('ronda confirmada')
      const off = has || reasons.length || S.state !== ST.PLANNING
      return `<button class="v-item ${has ? 'owned' : ''}" data-buy="${is_pathogen() ? 'mutation' : 'doctrine'}"
        data-id="${id}" ${off ? 'disabled' : ''} title="${esc(n.desc)}">
          <span class="v-item-head"><b>${esc(n.name)}</b>
            <span class="v-cost">${has ? '✓' : n.cost + (is_pathogen() ? '🧬' : '💠')}</span></span>
          <span class="v-item-desc">${esc(n.desc)}</span>
          ${!has && reasons.length ? `<span class="v-why">${esc(reasons.join(' · '))}</span>` : ''}
        </button>`
    }).join('')
    return `<div class="v-branch" style="--branch:${b.color}">
      <h4>${esc(b.name)}</h4><div class="v-items">${nodes}</div></div>`
  }).join('')

  const stats = is_pathogen() ? statsLine() : ''
  return card(is_pathogen() ? 'Mutaciones' : 'Doctrinas', stats + groups)
}

function statsLine() {
  const s = { inf: 0, sev: 0, let: 0, stealth: 0, drug: 0 }
  ;(S.you.tree || []).forEach(id => {
    const fx = MUTATIONS[id]?.fx || {}
    s.inf += fx.inf || 0; s.sev += fx.sev || 0; s.let += fx.let || 0
    s.stealth += fx.stealth || 0; s.drug += fx.drug || 0
  })
  return `<div class="v-statline">
    <span title="Infectividad">🦠 ${s.inf}</span><span title="Gravedad">⚠ ${s.sev}</span>
    <span title="Letalidad">☠ ${s.let}</span><span title="Sigilo">🫥 ${s.stealth}</span>
    <span title="Resistencia a fármacos">💊 ${s.drug}</span></div>`
}

function opponentBlock() {
  const o = S.opponent || {}
  if (is_pathogen()) {
    const docs = (o.tree || []).map(id => `<span class="v-pill">${esc(DOCTRINES[id]?.name || id)}</span>`).join('')
      || '<span class="v-muted">sin doctrinas todavía</span>'
    const labs = (o.labs || []).map(r => esc(REGIONS[r].name)).join(', ') || 'ninguno'
    return card('La coalición', `<p>Doctrinas (públicas):</p><div class="v-picks">${docs}</div>
      <p class="v-muted">Laboratorios: ${labs}. Han rastreado ${o.revealed_count || 0} de tus mutaciones.
      La cura la ves solo en tramos del 10 %.</p>`)
  }
  const known = (o.tree || []).map(id => `<span class="v-pill">${esc(MUTATIONS[id]?.name || id)}</span>`).join('')
  const hidden = o.hidden_count || 0
  return card('El patógeno', `
    <p>Mutaciones reveladas:</p>
    <div class="v-picks">${known || '<span class="v-muted">ninguna</span>'}
      ${'<span class="v-pill unknown">???</span>'.repeat(Math.min(hidden, 12))}</div>
    <p class="v-muted">${hidden} sin identificar. Usa <b>Rastreo genético</b> para destaparlas.
      ${o.dna !== null && o.dna !== undefined ? `ADN enemigo: <b>${o.dna}</b>.` : ''}</p>`)
}

function logBlock() {
  const items = (S.log || []).slice().reverse().map(e =>
    `<li><span class="v-log-round">R${e.round}</span>${esc(e.text)}</li>`).join('')
  return card('Registro', `<ul class="v-log">${items || '<li class="v-muted">—</li>'}</ul>`)
}

const card = (title, body) => `<section class="v-card-panel"><h3>${title}</h3>${body}</section>`

// ────────────────────────────────────────────────── Avisos y modales

let toast_timer
function toast(msg, kind = '') {
  const t = $('v-toast')
  t.textContent = msg
  t.className = 'v-toast show ' + kind
  clearTimeout(toast_timer)
  toast_timer = setTimeout(() => { t.className = 'v-toast' }, 2600)
}

function showReport(report) {
  if (!report) return
  const seeded = report.seeded.map(s =>
    `<li>El contagio alcanzó <b>${esc(REGIONS[s.region].name)}</b> desde ${esc(REGIONS[s.from].name)}
      (${{ land: 'por tierra', sea: 'por mar', air: 'por aire' }[s.kind]})</li>`).join('')
  const detected = report.detected.map(r =>
    `<li>Brote <b>detectado</b> en ${esc(REGIONS[r].name)}</li>`).join('')
  const events = report.events.map(e =>
    `<li class="v-ev"><b>${esc(e.name)}</b> — ${esc(e.desc)}</li>`).join('')
  const rival = (is_pathogen() ? report.coalition_actions : report.pathogen_actions) || []
  const rival_html = rival.length
    ? `<ul>${rival.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`
    : '<p class="v-muted">No hizo nada visible.</p>'

  overlay(`
    <div class="v-sheet">
      <h2>Ronda ${report.round}</h2>
      <div class="v-report-grid">
        <div><h4>El mundo</h4><ul>
          ${seeded || detected || events ? seeded + detected + events : '<li class="v-muted">Sin novedades.</li>'}
          ${report.deaths ? `<li>☠ ${pu(report.deaths)} muertos esta ronda</li>` : ''}
        </ul></div>
        <div><h4>Tu rival hizo</h4>${rival_html}</div>
      </div>
      <button class="v-btn v-btn-primary" data-close>Seguir</button>
    </div>`)
}

function showEnd(ctx) {
  const won = ctx.winner === S.your_side
  const label = ctx.winner === SIDES.PATHOGEN ? 'Gana el Patógeno' : 'Gana la Coalición'
  overlay(`
    <div class="v-sheet v-end ${won ? 'won' : 'lost'}">
      <h2>${won ? '¡Has ganado!' : 'Has perdido'}</h2>
      <p class="v-end-label">${label}</p>
      <p>${esc(ctx.text)}</p>
      <table class="v-rows">
        <tr><th>Rondas</th><td>${ctx.round}</td></tr>
        <tr><th>Muertos</th><td>${pu(ctx.dead)} (${ctx.dead_pct} %)</td></tr>
        <tr><th>Infectados al final</th><td>${pu(ctx.infected)}</td></tr>
        <tr><th>Cura</th><td>${ctx.cure} %</td></tr>
      </table>
      <p class="v-muted">Para que sea justo, jugad otra: el sorteo os dará bandos distintos.</p>
      <a class="v-btn v-btn-primary" href="/vector/logout">Nueva partida</a>
    </div>`, true)
}

function overlay(html, sticky = false) {
  const o = $('v-overlay')
  o.innerHTML = html
  o.classList.remove('hidden')
  o.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => o.classList.add('hidden')))
  if (!sticky) o.addEventListener('click', e => { if (e.target === o) o.classList.add('hidden') }, { once: true })
}

// Atajos: C confirmar, Esc cerrar
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return
  if (e.key === 'Escape') $('v-overlay').classList.add('hidden')
  if (e.key.toLowerCase() === 'c') $('v-commit').click()
})

render()
if (S.state === ST.ENDED && S.end_context) showEnd(S.end_context)
