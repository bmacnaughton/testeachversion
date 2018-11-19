'use strict'

module.exports = function (ev, opt) {
  opt = opt || {}
  opt.stdout = opt.stdout || process.stdout
  opt.stderr = opt.stderr || process.stderr

  ev.on('error', (entity, what, e) => {
    if (!opt.suppress) {
      opt.stderr.write(`  ${entity.toString()} ${what} failed: ${e}\n`)
    }
  })

  ev.on('info', message => {
    if (opt.verbose) {
      opt.stdout.write(`[info] ${message}\n`)
    }
  })

  ev.on('state', function (from, to, entity) {
    if (to === 'tested') {
      if (entity.testStatus === 'pass') {
        output.passed()
      } else if (entity.testStatus === 'fail') {
        output.failed()
      } else {
        opt.stdout.write('  unexpected testStatus')
      }
    } else if (to === 'install-failed') {
      output.installFailed()
    } else if (to === 'installing') {
      output.name(entity.toString())
    } else if (to === 'skipped') {
      output.skipped(entity.toString())
    }
  })

  const output = {
    name (name) {
      opt.stdout.write(name)
    },
    skipped (name) {
      opt.stdout.write(`${name}  \u001b[36m➖\u001b[0m skipped\n`)
    },
    installFailed () {
      opt.stdout.write(`  \u001b[31m✖\u001b[0m install failed\n`)
    },
    failed () {
      opt.stdout.write(`  \u001b[31m✖\u001b[0m failed\n`)
    },
    passed () {
      opt.stdout.write(`  \u001b[32m✓\u001b[0m passed\n`)
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
