import {EventEmitter} from 'events'
import indent from 'indent-string'

module.exports = function (options) {
  var ev = new EventEmitter
  var currentModule = ''

  function checkModule (mod) {
    if (mod.name !== currentModule) {
      currentModule = mod.name
      console.log(`\n${mod.name}`)
    }
  }

  function extra (out) {
    if (options.verbose) {
      console.log(`\n${indent(out, ' ', 4)}\n`)
    }
  }

  ev.on('pass', (mod, out) => {
    checkModule(mod)
    console.log(`  \u001b[32m✓\u001b[0m ${mod.version}`)
    extra(out)
  })

  ev.on('fail', (mod, out) => {
    checkModule(mod)
    console.log(`  \u001b[31m✖\u001b[0m ${mod.version}`)
    extra(out)
  })

  return ev
}
