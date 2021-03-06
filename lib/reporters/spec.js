'use strict'

module.exports = function (ev, opt = {}) {
  opt.stdout = opt.stdout || process.stdout
  opt.stderr = opt.stderr || process.stderr
  opt.showSkips = 'showSkips' in opt ? opt.showSkips : true;

  ev.on('error', (entity, what, e) => {
    if (!opt.suppress) {
      opt.stderr.write(`  ${entity.toString()} ${what} failed: ${e}\n`)
    }
  })

  ev.on('info', message => {
    if (opt.verbose) {
      output.info(message)
    }
  })

  // different events vs. state changes?
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
      if (opt.verbose) {
        output.info('installing ' + entity.toString())
      }
      if (!entity.previousEntity) {
        output.name(entity.toString())
      }
    } else if (to === 'skipped' && opt.showSkips) {
      output.skipped(entity.toString())
    } else if (to === 'testing' && entity.builtin) {
      output.name(entity.toString())
    }

    if (!opt.verbose) {
      return
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
      opt.stdout.write('  \u001b[31m✖\u001b[0m install failed\n')
    },
    failed () {
      opt.stdout.write('  \u001b[31m✖\u001b[0m failed\n')
    },
    passed () {
      opt.stdout.write('  \u001b[32m✓\u001b[0m passed\n')
    },
    info (message) {
      opt.stdout.write(`[info] ${message}\n`)
    }
  }

  return ev
}
