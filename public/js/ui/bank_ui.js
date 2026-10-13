import * as CONST from "../const.js"
import MSG from "../const_messages.js"
import { escapeHTML } from "../utils.js"
const $ = document.querySelector.bind(document)
const M = CONST.MONEY.EMOJI

export default class BankUI {
  player; opponents
  #getDeniedReason; #onExchange
  #selected_res
  $el = $('#game > .bank-zone')

  constructor(player, opponents, { getDeniedReason, onExchange }) {
    this.player = player
    this.opponents = opponents
    this.#getDeniedReason = getDeniedReason
    this.#onExchange = onExchange
  }

  render() {
    this.$el.innerHTML = `
      <div class="money-list" title="Dinero de cada jugador (no da puntos de victoria)"></div>
      <div class="bank-hint"></div>
      <button class="bank-toggle hide" title="Abrir / cerrar el banco">🏦 Banco</button>
      <div class="bank-panel hide">
        <section class="exchange">
          <div class="title">Canjear <small>${CONST.MONEY.EXCHANGE_COST}${M} → 1 recurso</small></div>
          <div class="res-options">${Object.keys(CONST.RESOURCES).map(res => `
            <button class="res-option" data-res="${res}" title="${CONST.RESOURCES[res]}">
              <div class="res-icon ${res}"></div>
            </button>`).join('')}
          </div>
          <button class="action do-exchange">Canjear</button>
          <div class="note exchange-note"></div>
        </section>
      </div>
    `
    this.$money_list = this.$el.querySelector('.money-list')
    this.$hint = this.$el.querySelector('.bank-hint')
    this.$toggle = this.$el.querySelector('.bank-toggle')
    this.$panel = this.$el.querySelector('.bank-panel')
    this.$exchange_btn = this.$el.querySelector('.do-exchange')
    this.$exchange_note = this.$el.querySelector('.exchange-note')
    this.#setupEvents()
    this.update()
  }

  #setupEvents() {
    this.$toggle.addEventListener('click', _ => this.togglePanel())
    this.$el.querySelectorAll('.res-option').forEach($opt => $opt.addEventListener('click', _ => {
      this.#selected_res = $opt.dataset.res
      this.update()
    }))
    this.$exchange_btn.addEventListener('click', _ => {
      if (this.$exchange_btn.disabled || !this.#selected_res) return
      this.#onExchange(this.#selected_res)
    })
    // Keep the game keyboard shortcuts (space, e, r, s…) away from the bank inputs
    this.$el.addEventListener('keydown', e => e.stopPropagation())
  }

  togglePanel(show = this.$panel.classList.contains('hide')) {
    this.$panel.classList[show && !this.#getDeniedReason() ? 'remove' : 'add']('hide')
    this.$toggle.classList[this.$panel.classList.contains('hide') ? 'remove' : 'add']('active')
  }

  update() {
    if (!this.$money_list) return
    this.#renderMoneyList()
    const denied = this.#getDeniedReason()
    this.$hint.innerHTML = denied ? MSG.BANK_HINT[denied] : ''
    this.$toggle.classList[denied ? 'add' : 'remove']('hide')
    denied && this.togglePanel(false)
    // Exchange
    const money = this.player.money || 0
    const missing = CONST.MONEY.EXCHANGE_COST - money
    this.$el.querySelectorAll('.res-option').forEach($opt => {
      $opt.classList[$opt.dataset.res === this.#selected_res ? 'add' : 'remove']('selected')
    })
    this.$exchange_btn.disabled = !!denied || missing > 0 || !this.#selected_res
    this.$exchange_note.innerHTML = missing > 0
      ? `Te faltan ${missing}${M}`
      : (this.#selected_res ? '' : 'Elige un recurso')
  }

  #renderMoneyList() {
    const all_players = [this.player, ...this.opponents].sort((a, b) => a.id - b.id)
    this.$money_list.innerHTML = all_players.map(p => `
      <div class="money-row p${p.id} ${p.id === this.player.id ? 'me' : ''} ${p.removed ? 'deactivated' : ''}"
        title="${p.bank_unlocked ? 'Banco desbloqueado' : 'Banco bloqueado: construye junto al desierto'}">
        <span class="name">${escapeHTML(p.name)}</span>
        <span class="lock">${p.bank_unlocked ? '' : '🔒'}</span>
        <span class="amount">${p.money || 0}${M}</span>
      </div>
    `).join('')
  }
}
