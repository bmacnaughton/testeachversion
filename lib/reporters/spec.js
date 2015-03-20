import {EventEmitter} from 'events'
import indent from 'indent-string'
import through2 from 'through2'

export default function (options) {
  let ev = new EventEmitter
  let currentModule
  let spin

  ev.on('before-install', (mod, p) => {
    if (mod.name !== currentModule) {
      currentModule = mod.name
      console.log(`\n${mod.name}`)
    }

    if (options.verbose) {
      console.log(`  ${mod.version}`)
      return
    }

    spin = spinner(15, (c) => {
      process.stdout.clearLine()
      process.stdout.cursorTo(0)
      process.stdout.write(`  ${c} ${mod.version}`)
    })
  })

  ev.on('test', (mod, p) => {
    if (options.verbose) {
      p.stdout.pipe(indentStream(4)).pipe(process.stdout)
      p.stderr.pipe(indentStream(4)).pipe(process.stderr)
    }
  })

  function resultHandler (mark, msg) {
    return (mod) => {
      if (options.verbose) {
        console.log(`\n    ${mark} ${msg}\n`)
      } else {
        spin.stop()
        process.stdout.clearLine()
        process.stdout.cursorTo(0)
        console.log(`  ${mark} ${mod.version}`)
      }
    }
  }

  ev.on('pass', resultHandler('\u001b[32m✓\u001b[0m', 'passed'))
  ev.on('fail', resultHandler('\u001b[31m✖\u001b[0m', 'failed'))

  return ev
}

//
// Helpers
//

function indentStream (n) {
  return through2(function (chunk, enc, callback) {
    let s = indent(chunk.toString('utf8'), ' ', n)
    let b = new Buffer(s)
    this.push(b)
    callback()
  })
}

let chars = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
let len = chars.length
function spinner (fps, fn) {
  let frame = 0

  let t = setInterval(() => {
    fn(chars[frame++ % len])
  }, 1000 / fps)

  return {
    stop() { clearInterval(t) }
  }
}
