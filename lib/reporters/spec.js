import {EventEmitter} from 'events'
import indent from 'indent-string'
import through2 from 'through2'

export default function (opt) {
  opt.out = opt.out || process.stdout
  opt.err = opt.err || process.stderr
  let ev = new EventEmitter
  let currentModule
  let spin

  ev.on('before-install', (mod, p) => {
    if (mod.name !== currentModule) {
      currentModule = mod.name
      opt.out.write(`\n${mod.name}\n`)
    }

    if (opt.verbose) {
      opt.out.write(`  ${mod.version}\n`)
      return
    }

    if (opt.out.isTTY) {
      spin = spinner(15, (c) => {
        opt.out.clearLine()
        opt.out.cursorTo(0)
        opt.out.write(`  ${c} ${mod.version}`)
      })
    }
  })

  ev.on('test', (mod, p) => {
    if (opt.verbose && p.stdout && p.stderr) {
      p.stdout.pipe(indentStream(4)).pipe(opt.out)
      p.stderr.pipe(indentStream(4)).pipe(opt.err)
    }
  })

  function resultHandler (mark, msg) {
    var s = msg === 'passed' ? opt.out : opt.err
    return (mod) => {
      if (opt.verbose) {
        s.write(`\n    ${mark} ${msg}\n\n`)
        return
      }

      if (opt.out.isTTY) {
        spin.stop()
        opt.out.clearLine()
        opt.out.cursorTo(0)
      }

      s.write(`  ${mark} ${mod.version}\n`)
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
