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

  ev.on('pass', (mod, res) => {
    checkModule(mod)
    console.log(`  \u001b[32m✓\u001b[0m ${mod.version}`)

    if (options.verbose) {
      console.log(`\n${indent(res, ' ', 4)}\n`)
    }
  })

  ev.on('fail', (mod, err) => {
    checkModule(mod)
    console.log(`  \u001b[31m✖\u001b[0m ${mod.version}`)

    if (options.verbose) {
      console.log(`\n${indent(err, ' ', 4)}\n`)
    }
  })

  return ev
}
