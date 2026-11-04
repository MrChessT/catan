import { REGIONS, LAND_LINKS, SEA_LINKS, SIDES } from "./const.js"

const NS = 'http://www.w3.org/2000/svg'
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag)
  Object.entries(attrs).forEach(([k, v]) => v !== null && n.setAttribute(k, v))
  return n
}

const radius = pop => 10 + Math.sqrt(pop) * 0.55

/** Escala de color por proporción de infectados. */
function infectionColor(share) {
  if (share <= 0) return '#3d4a5c'
  if (share < 0.02) return '#6b5d3e'
  if (share < 0.08) return '#9a6b33'
  if (share < 0.20) return '#c2662a'
  if (share < 0.40) return '#d9512c'
  if (share < 0.65) return '#c3342b'
  return '#8e1f1f'
}

export default class VectorMap {
  #svg; #layers = {}; #onSelect; #nodes = {};
  selected = null;

  constructor(container, onSelect) {
    this.#onSelect = onSelect
    this.#svg = el('svg', { viewBox: '0 0 1000 620', class: 'v-map' })
    container.appendChild(this.#svg)
    ;['routes', 'regions', 'labels'].forEach(name => {
      this.#layers[name] = el('g', { class: 'v-layer-' + name })
      this.#svg.appendChild(this.#layers[name])
    })
    this.#drawRoutes()
    this.#drawRegions()
  }

  #drawRoutes() {
    const drawn = new Set()
    const line = (a, b, cls) => {
      const key = [a, b].sort().join('>') + cls
      if (drawn.has(key)) return
      drawn.add(key)
      const A = REGIONS[a], B = REGIONS[b]
      this.#layers.routes.appendChild(el('line', {
        x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: 'v-route ' + cls,
      }))
    }
    Object.entries(LAND_LINKS).forEach(([a, list]) => list.forEach(b => line(a, b, 'land')))
    Object.entries(SEA_LINKS).forEach(([a, list]) => list.forEach(b => line(a, b, 'sea')))
  }

  #drawRegions() {
    Object.entries(REGIONS).forEach(([rid, meta]) => {
      const r = radius(meta.pop)
      const g = el('g', { class: 'v-region', 'data-region': rid, tabindex: '0' })

      const halo = el('circle', { cx: meta.x, cy: meta.y, r: r + 7, class: 'v-halo' })
      const ring = el('circle', { cx: meta.x, cy: meta.y, r: r + 3.5, class: 'v-ring' })
      const body = el('circle', { cx: meta.x, cy: meta.y, r, class: 'v-body-circle' })
      const dead = el('path', { class: 'v-dead-arc', d: '' })
      const mark = el('text', {
        x: meta.x, y: meta.y + 4.5, class: 'v-mark', 'text-anchor': 'middle',
      })
      const badges = el('g', { class: 'v-badges' })

      const label = el('text', {
        x: meta.x, y: meta.y + r + 14, class: 'v-label', 'text-anchor': 'middle',
      })
      label.textContent = meta.name

      g.append(halo, ring, body, dead, mark, badges)
      this.#layers.regions.appendChild(g)
      this.#layers.labels.appendChild(label)

      g.addEventListener('click', () => this.#onSelect(rid))
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.#onSelect(rid) } })

      this.#nodes[rid] = { g, halo, ring, body, dead, mark, badges, label, r }
    })
  }

  select(rid) {
    this.selected = rid
    Object.entries(this.#nodes).forEach(([id, n]) =>
      n.g.classList.toggle('selected', id === rid))
  }

  /** `targets` limita qué regiones son clicables (null = todas). */
  setTargets(targets) {
    Object.entries(this.#nodes).forEach(([id, n]) =>
      n.g.classList.toggle('targetable', !!targets && targets.includes(id)))
    this.#svg.classList.toggle('targeting', !!targets)
  }

  render(state) {
    const is_pathogen = state.your_side === SIDES.PATHOGEN
    Object.entries(this.#nodes).forEach(([rid, n]) => {
      const meta = REGIONS[rid]
      const r = state.regions[rid]
      const pop = meta.pop

      if (r.known) {
        const share = (r.infected || 0) / pop
        n.body.setAttribute('fill', infectionColor(share))
        n.mark.textContent = r.infected > 0 ? Math.round(share * 100) + '%' : ''
      } else if (r.estimate) {
        const share = (r.infected || 0) / pop
        n.body.setAttribute('fill', infectionColor(share))
        n.body.setAttribute('opacity', '0.55')
        n.mark.textContent = r.infected > 0 ? '~' + Math.round(share * 100) + '%' : ''
      } else {
        n.body.setAttribute('fill', '#2c3542')
        n.mark.textContent = '?'
      }

      // Arco de mortandad alrededor del círculo
      const dead_share = r.dead / pop
      n.dead.setAttribute('d', dead_share > 0 ? arc(meta.x, meta.y, n.r + 3.5, dead_share) : '')

      n.g.classList.toggle('detected', !!r.detected)
      n.g.classList.toggle('unknown', !r.known && !r.estimate)
      n.g.classList.toggle('quarantined', r.quarantine > 0)
      n.g.classList.toggle('martial', !!r.martial)
      n.ring.setAttribute('stroke-width', r.quarantine ? 1.5 + r.quarantine * 1.2 : 1)

      // Distintivos: laboratorio, vigilancia, cierres, inmunizados
      n.badges.innerHTML = ''
      const chips = []
      if (r.lab) chips.push(['🔬', 'Laboratorio'])
      if (r.surveillance) chips.push(['📡', 'Vigilancia'])
      if (meta.airport && !r.airport_open) chips.push(['✈', 'Aeropuerto cerrado'])
      if (meta.port && !r.port_open) chips.push(['⚓', 'Puerto cerrado'])
      if (r.hospitals) chips.push(['🏥', `${r.hospitals} hospital(es)`])
      if (r.immune > 0) chips.push(['💉', 'Vacunados'])
      chips.forEach(([glyph, title], i) => {
        const t = el('text', {
          x: meta.x + n.r + 2, y: meta.y - n.r + 2 + i * 13, class: 'v-chip-glyph',
        })
        t.textContent = glyph
        const tt = el('title'); tt.textContent = title
        t.appendChild(tt)
        n.badges.appendChild(t)
      })

      n.label.classList.toggle('dim', !r.known && !r.estimate && !is_pathogen)
    })
  }
}

/** Arco de 0 a `share` de la circunferencia, empezando arriba. */
function arc(cx, cy, r, share) {
  const a = Math.min(0.9999, share) * Math.PI * 2
  const x1 = cx, y1 = cy - r
  const x2 = cx + Math.sin(a) * r, y2 = cy - Math.cos(a) * r
  return `M ${x1} ${y1} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x2} ${y2}`
}
