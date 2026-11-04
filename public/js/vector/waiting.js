import { SOCKET_EVENTS as SOC } from "./const.js"

const socket = io()
let players = window.V_PLAYERS || []
const total = window.V_PLAYER_COUNT || 2

const $slots = document.getElementById('v-slots')
const $status = document.getElementById('v-status')
const $link = document.getElementById('v-link')
const $key = document.getElementById('v-key')
const $copied = document.getElementById('v-copied')

$link.textContent = `${location.origin}/vector?game_id=${window.V_GAME_ID}`

function copy(text) {
  navigator.clipboard?.writeText(text)
  $copied.classList.add('show')
  setTimeout(() => $copied.classList.remove('show'), 1400)
}
$key.addEventListener('click', () => copy(window.V_GAME_ID))
$link.addEventListener('click', () => copy($link.textContent))

function render() {
  $slots.innerHTML = ''
  for (let i = 0; i < total; i++) {
    const p = players[i]
    const el = document.createElement('div')
    el.className = 'v-slot' + (p ? ' filled' : '')
    el.innerHTML = p
      ? `<div class="v-avatar">${(p.name || '?')[0].toUpperCase()}</div><span>${p.name}</span>`
      : `<div class="v-avatar empty">?</div><span>Plaza libre</span>`
    $slots.appendChild(el)
  }
  const missing = total - players.length
  $status.textContent = missing > 0
    ? `Falta ${missing} jugador${missing > 1 ? 'es' : ''} por entrar…`
    : 'Completo. Empezando…'
  if (missing <= 0) setTimeout(() => location.reload(), 600)
}

socket.on(SOC.JOINED_WAITING_ROOM, (_player, all) => { players = all || players; render() })
socket.on('connect', () => socket.emit(SOC.PLAYER_ONLINE))
render()
