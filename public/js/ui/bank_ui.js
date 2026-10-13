import * as CONST from "../const.js"
import MSG from "../const_messages.js"
import { escapeHTML } from "../utils.js"
const $ = document.querySelector.bind(document)
const M = CONST.MONEY.EMOJI
const BET_NUMBERS = Object.keys(CONST.BET_MULTIPLIER).map(Number).sort((a, b) => a - b)

export default class BankUI {
  player; opponents
  #getDeniedReason; #onExchange; #onBet; #getTurn
  #selected_res; #selected_num; #last_result
  $el = $('#game > .bank-zone')

  constructor(player, opponents, { getDeniedReason, onExchange, onBet, getTurn }) {
    this.player = player
    this.opponents = opponents
    this.#getDeniedReason = getDeniedReason
    this.#onExchange = onExchange
    this.#onBet = onBet
    this.#getTurn = getTurn
  }

  render() {
    this.$el.innerHTML = `
      <div class="money-list"></div>
      <div class="bet-status"></div>
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
        <section class="bet">
          <div class="title">Apostar <small>a la suma de los dados</small></div>
          <div class="bet-numbers">${BET_NUMBERS.map(n => `
            <button class="bet-number" data-num="${n}" title="Paga ×${CONST.BET_MULTIPLIER[n]}">
              <b>${n}</b><small>×${CONST.BET_MULTIPLIER[n]}</small>
            </button>`).join('')}
          </div>
          <label class="bet-amount-row">Cantidad
            <input type="number" class="bet-amount" min="1" step="1" value="1" inputmode="numeric">${M}
          </label>
          <div class="note bet-note"></div>
          <button class="action do-bet">Apostar</button>
        </section>
      </div>
    `
    this.$money_list = this.$el.querySelector('.money-list')
    this.$hint = this.$el.querySelector('.bank-hint')
    this.$toggle = this.$el.querySelector('.bank-toggle')
    this.$panel = this.$el.querySelector('.bank-panel')
    this.$exchange_btn = this.$el.querySelector('.do-exchange')
    this.$exchange_note = this.$el.querySelector('.exchange-note')
    this.$bet_status = this.$el.querySelector('.bet-status')
    this.$bet_amount = this.$el.querySelector('.bet-amount')
    this.$bet_btn = this.$el.querySelector('.do-bet')
    this.$bet_note = this.$el.querySelector('.bet-note')
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
    this.$el.querySelectorAll('.bet-number').forEach($num => $num.addEventListener('click', _ => {
      this.#selected_num = +$num.dataset.num
      this.update()
    }))
    this.$bet_amount.addEventListener('input', _ => this.update())
    this.$bet_btn.addEventListener('click', _ => {
      if (this.$bet_btn.disabled) return
      this.#onBet(this.#selected_num, this.#betAmount())
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
    this.#updateBet(denied, money)
  }

  #betAmount() { return Number(this.$bet_amount.value) }

  #updateBet(denied, money) {
    const active_bet = this.player.bets?.[0]
    // Active bet (or last result) is always visible, the panel only on my turn
    if (active_bet) {
      const payout = Math.floor(active_bet.amount * CONST.BET_MULTIPLIER[active_bet.number])
      this.$bet_status.innerHTML = `🎯 Apuesta al <b>${active_bet.number}</b>: ${active_bet.amount}${M} → ${payout}${M}
        <small>${this.#betWindowText(active_bet)}</small>`
    } else if (this.#last_result) {
      const { type, number, amount, payout } = this.#last_result
      this.$bet_status.innerHTML = type === 'bet_win'
        ? `🎉 Ganaste la apuesta al <b>${number}</b>: +${payout}${M}`
        : `💸 Perdiste la apuesta al <b>${number}</b> (${amount}${M})`
    } else {
      this.$bet_status.innerHTML = ''
    }
    this.$bet_status.dataset.result = active_bet ? 'active' : (this.#last_result?.type || '')

    this.$el.querySelectorAll('.bet-number').forEach($num => {
      $num.classList[+$num.dataset.num === this.#selected_num ? 'add' : 'remove']('selected')
      $num.disabled = !!active_bet
    })
    this.$bet_amount.max = Math.max(1, money)
    this.$bet_amount.disabled = !!active_bet
    const amount = this.#betAmount()
    const valid_amount = Number.isInteger(amount) && amount > 0 && amount <= money
    this.$bet_btn.disabled = !!denied || !!active_bet || !this.#selected_num || !valid_amount
    if (active_bet) { this.$bet_note.innerHTML = 'Ya tienes una apuesta activa.' }
    else if (!money) { this.$bet_note.innerHTML = `No tienes dinero para apostar.` }
    else if (!this.#selected_num) { this.$bet_note.innerHTML = 'Elige un número (el 7 no se puede).' }
    else if (!valid_amount) { this.$bet_note.innerHTML = `Cantidad entera entre 1 y ${money}${M}.` }
    else {
      const payout = Math.floor(amount * CONST.BET_MULTIPLIER[this.#selected_num])
      this.$bet_note.innerHTML = `Si sale el <b>${this.#selected_num}</b> en esta ronda o en las
        ${CONST.MONEY.BET_WINDOW} siguientes cobras <b>${payout}${M}</b>.`
    }
  }

  #betWindowText(bet) {
    const rounds_left = bet.turn_created + CONST.MONEY.BET_WINDOW - this.#getTurn()
    if (rounds_left > 0) return `Válida esta ronda y ${rounds_left} más`
    if (rounds_left === 0) return 'Última ronda'
    return 'Caduca en la próxima tirada'
  }

  /** Last resolved bet of mine (win/lose), shown until the next bet */
  setBetResult(type, context) {
    this.#last_result = { type, ...context }
    this.update()
  }

  #renderMoneyList() {
    const all_players = [this.player, ...this.opponents].sort((a, b) => a.id - b.id)
    this.$money_list.innerHTML = all_players.map(p => `
      <div class="money-row p${p.id} ${p.id === this.player.id ? 'me' : ''} ${p.removed ? 'deactivated' : ''}">
        <span class="name">${escapeHTML(p.name)}</span>
        <span class="lock">${p.bank_unlocked ? '' : '🔒'}</span>
        <span class="amount">${p.money || 0}${M}</span>
      </div>
    `).join('')
  }
}
