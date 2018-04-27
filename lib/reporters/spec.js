import {EventEmitter} from 'events'
import indent from 'indent-string'
import through2 from 'through2'

export default function (opt) {
  opt.out = opt.out || process.stdout
  opt.err = opt.err || process.stderr
  let ev = new EventEmitter
  let currentModule

  ev.on('error', (mod, what, e) => {
    if (!opt.suppress) {
      opt.out.write(`  ${mod.toString()} ${what} failed: ${e}\n`)
    }
  })

  ev.on('info', message => {
    if (opt.verbose) {
      opt.out.write('\n[info]' + message)
    }
  })

  ev.on('test', mod => {
    opt.out.write(mod.toString())
    if (opt.verbose) {

    }
  })

  function resultHandler (mark, msg) {
    var s = msg === 'passed' ? opt.out : opt.err
    return (mod) => {
      s.write(`  ${mark} ${msg}\n`)
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
