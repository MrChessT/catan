import * as CONST from "../const.js"
import { escapeHTML } from "../utils.js"
const $ = document.querySelector.bind(document)
const M = CONST.MONEY.EMOJI

export default class BankUI {
  player; opponents
  $el = $('#game > .bank-zone')

  constructor(player, opponents) {
    this.player = player
    this.opponents = opponents
  }

  render() {
    this.$el.innerHTML = `
      <div class="money-list" title="Dinero de cada jugador (no da puntos de victoria)"></div>
    `
    this.$money_list = this.$el.querySelector('.money-list')
    this.update()
  }

  update() {
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
