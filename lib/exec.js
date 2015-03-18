import {exec} from 'child_process'
import Promise from 'bluebird'

export default function (command) {
  return new Promise((resolve, reject) => {
    exec(command, function (err, res) {
      err ? reject(err) : resolve((res || '').toString('utf8'))
    })
  })
}
