import { SIDES } from "../../public/js/vector/const.js"

export default class VectorPlayer {
  id; name; side = null; socket = null; online = false;

  constructor({ id, name, side = null }) {
    this.id = id
    this.name = name || `Jugador ${id}`
    this.side = side
  }

  setSocket(socket) { this.socket = socket; this.online = !!socket }
  get socket_id() { return this.socket?.id }

  toJSON() {
    return { id: this.id, name: this.name, side: this.side, online: this.online }
  }
}

export { SIDES }
