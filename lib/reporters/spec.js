import {EventEmitter} from 'events'
import indent from 'indent-string'

export default function (opt) {
  opt.out = opt.out || process.stdout
  opt.err = opt.err || process.stderr
  let matrix
  let errors

  if (opt.matrixFile) {
    try {
      matrix = fs.openSync(opt.matrixFile, 'wx')
    } catch (e) {
      if (!opt.suppress) {
        opt.out.write(` failed to open matrix file: ${e.code}`)
      }
    }
    if (matrix) {
      writeHeader(matrix)
    }
  }

  if (opt.errorsFile) {
    try {
      errors = fs.openSync(opt.errorsFile, 'wx')
    } catch (e) {
      if (!opt.suppress) {
        opt.out.write(`failed to open errors file: ${e.code}`)
      }
    }
    if (errors) {
      writeHeader(errors)
    }
  }

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

//
// helpers
//

function writeHeader(fd) {
  // header: gmt, node version, npm version. other?
  // consider writing json?
}
