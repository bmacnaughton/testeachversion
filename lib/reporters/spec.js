import {EventEmitter} from 'events'
import indent from 'indent-string'

export default function (opt) {
  opt.out = opt.out || process.stdout
  opt.err = opt.err || process.stderr

  let ev = new EventEmitter

  ev.on('error', (mod, what, e) => {
    if (!opt.suppress) {
      opt.out.write(`  ${mod.toString()} ${what} failed: ${e}\n`)
    }
  })

  ev.on('info', message => {
    if (opt.verbose) {
      opt.out.write(`[info] ${message}\n`)
    }
  })

  ev.on('test', mod => {
    opt.out.write(`${mod}`)
    if (opt.verbose) {

    }
  })

  // TODO BAM reconsider outputting "fail" to stderr.
  function resultHandler (mark, msg) {
    var s = msg !== 'failed' ? opt.out : opt.err
    return (mod) => {
      s.write(`  ${mark} ${msg}\n`)
    }
  }

  ev.on('pass', resultHandler('\u001b[32m✓\u001b[0m', 'passed'))
  ev.on('fail', function (mod, res) {
    (resultHandler('\u001b[31m✖\u001b[0m', 'failed'))()
    if (!opt.suppress && res) {
      opt.err.write(res)
    }
  })
  ev.on('skip', resultHandler('\u001b[36m➖\u001b[0m', 'skipped'))

  return ev
}
