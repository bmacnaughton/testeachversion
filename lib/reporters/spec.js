'use strict'

module.exports = function (ev, opt) {
  opt = opt || {}
  opt.out = opt.out || process.stdout
  opt.err = opt.err || process.stderr

  ev.on('error', (entity, what, e) => {
    if (!opt.suppress) {
      opt.err.write(`  ${entity.toString()} ${what} failed: ${e}\n`)
    }
  })

  ev.on('info', message => {
    if (opt.verbose) {
      opt.out.write(`[info] ${message}\n`)
    }
  })

  ev.on('state', function (from, to, n) {
    if (to === 'install-failed') {
      output('\u001b[31m✖\u001b[0m', 'failed')
    } else if (to === 'tested') {
      if (n.testStatus === 'pass') {
        output('\u001b[32m✓\u001b[0m', 'passed')
      } else if (to === 'skipped') {
        output('\u001b[36m➖\u001b[0m', 'skipped')
      } else {
        output('\u001b[31m✖\u001b[0m', 'failed')
        if (!opt.suppress && n.log.stderr) {
          opt.err.write(n.log.stderr.toString())
        }
      }
    }
  })

  // TODO BAM reconsider outputting "fail" to stderr.
  function output (mark, msg) {
    var s = msg !== 'failed' ? opt.out : opt.err
    return (mod) => {
      s.write(`  ${mark} ${msg}\n`)
    }
  }

  /*
  ev.on('pass', resultHandler('\u001b[32m✓\u001b[0m', 'passed'))
  ev.on('fail', function (mod, res) {
    (resultHandler('\u001b[31m✖\u001b[0m', 'failed'))()
    if (!opt.suppress && res) {
      opt.err.write(res)
    }
  })
  ev.on('skip', resultHandler('\u001b[36m➖\u001b[0m', 'skipped'))
  // */

  return ev
}
