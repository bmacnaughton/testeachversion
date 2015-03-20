//
// Tap-able timeout helper
//
export default class Timeout {

  constructor(n, fn) {
    this.timeout = n
    this.task = fn
    this.start()
  }

  start() {
    this.timer = setTimeout(this.task, this.timeout)
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
  }

  tap() {
    this.stop()
    this.start()
  }

}
