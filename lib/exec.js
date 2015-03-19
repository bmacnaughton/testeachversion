import {exec} from 'child_process'
import Promise from 'bluebird'

export default function (command) {
  return new Promise((resolve, reject) => {
    exec(command, function (err, res) {
      var data = (res && res.toString('utf8')) || ''
      err ? reject(data) : resolve(data)
    })
  })
}
