import {spawn} from 'child_process'
import Timeout from './timeout'
import Promise from 'bluebird'
import concat from './concat'

//
// Spawn a process
//
export default function (command, ttl) {
  // This is kind of a bad hack...but needed to watch streams
  const proc = spawn('/bin/sh', ['-c', command])

  // Create promise to track process completion
  const p = new Promise((yep, nope) => {
    // If a ttl was supplied, create a timeout rejector
    const t = ttl && new Timeout(ttl, () => {
      proc.kill()
      nope(new Error('Timeout'))
    })

    // Concatenate the stdout stream into a promise
    // NOTE: This includes a chunk handler to tap the timeout
    const stdout = concat(proc.stdout, t && () => t.tap())

    // Reject on errors
    proc.on('error', nope)

    // Stop timeout and resolve/reject by exit code
    proc.on('close', function (code) {
      stdout.then((res) => {
        if (t) t.stop()
        if (code) {
          nope(res)
        } else {
          yep(res)
        }
      }, nope)
    })
  })

  // Attach stdout and stderr streams to promise
  p.stdout = proc.stdout
  p.stderr = proc.stderr

  return p
}
