import {spawn} from 'child_process'
import Timeout from './timeout'
import Promise from 'bluebird'
import Concat from './concat'

//
// Spawn a process
//
export default function (command, ttl) {
  // This is kind of a bad hack...but needed to watch streams
  let proc = spawn('/bin/sh', ['-c', command])

  // Create promise to track process completion
  let p = new Promise((resolve, reject) => {
    // If a ttl was supplied, create a timeout rejector
    let t = ttl && new Timeout(ttl, () => {
      proc.kill()
      reject('Timeout')
    })

    // Concatenate the stdout stream into a promise
    // NOTE: This includes a chunk handler to tap the timeout
    let stdout = Concat(
      proc.stdout,
      t && t.tap.bind(t)
    )

    // Reject on errors
    proc.on('error', reject)

    // Stop timeout and resolve/reject by exit code
    proc.on('close', function (code) {
      stdout.then((res) => {
        if (t) t.stop()

        if (code) {
          reject(res)
        } else {
          resolve(res)
        }
      })
    })
  })

  // Attach stdout and stderr streams to promise
  p.stdout = proc.stdout
  p.stderr = proc.stderr

  return p
}
