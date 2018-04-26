import {EventEmitter} from 'events'
import indent from 'indent-string'
import through2 from 'through2'

export default function (opt) {
  opt.out = opt.out || process.stdout
  opt.err = opt.err || process.stderr
  let ev = new EventEmitter
  let currentModule
  let spin

  ev.on('before-install', (mod) => {
    if (opt.verbose) {
      opt.out.write(`\ninstalling ${mod.toString()}\n`)
    }

    if (opt.out.isTTY) {
      spin = spinner(15, (c) => {
        opt.out.clearLine()
        opt.out.cursorTo(0)
        opt.out.write(`  ${c} ${mod.version}`)
      })
    }
  })

  ev.on('install-error', (mod, e) => {
    if (!opt.suppress) {
      opt.out.write(`  ${mod.toString()} install failed: ${e}\n`)
    }
  })

  ev.on('info', message => {
    if (opt.verbose) {
      opt.out.write('\n[info]' + message)
    }
  })

  ev.on('restore-previous', mod => {
    if (opt.verbose) {
      opt.out.write(`  restoring ${mod.toString}`)
    }
  })

  ev.on('test', mod => {
    opt.out.write(mod.toString())
    if (opt.verbose) {
      //p.stdout.pipe(indentStream(4)).pipe(opt.out)
      //p.stderr.pipe(indentStream(4)).pipe(opt.err)
    }
  })

  function resultHandler (mark, msg) {
    var s = msg === 'passed' ? opt.out : opt.err
    return (mod) => {
      s.write(`  ${mark} ${msg}\n`)

      if (opt.out.isTTY) {
        spin.stop()
        opt.out.clearLine()
        opt.out.cursorTo(0)
      }
    }
  }

  ev.on('pass', resultHandler('\u001b[32m✓\u001b[0m', 'passed'))
  ev.on('fail', function (mod, res) {
    (resultHandler('\u001b[31m✖\u001b[0m', 'failed'))()
    if (!opt.suppress) {
      opt.err.write(res)
    }
  })

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
