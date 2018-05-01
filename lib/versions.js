import https from 'https'
import semver from 'semver'
import Promise from 'bluebird'
import concat from './concat'
import {parse} from './json'

function get(module) {
  const p = new Promise((yep, nope) => {
    https.request({
      method: 'GET',
      host: 'registry.npmjs.org',
      path: `/${module}`,
      agent: false,
      headers: {
        'accept': 'application/json',
        'accept-encoding': 'identity',
        'user-agent': 'https://github.com/bmacnaughton/testallversions',
      },
    })
    .on('response', yep)
    .on('error', nope)
    .end()
  })

  return p.then(res => {
    if (res.statusCode !== 200) {
      res.destroy()
      throw new Error(`failed to get https://registry.npmjs.org/${module} versions.`)
    }
    return res
  }).then(concat)
}

module.exports = function (module) {
  return get(module)
    .then(parse)
    .then(versions)
}

function versions (json) {
  return Object.keys(json.versions)
    .filter(v => semver.valid(v))
    .sort(semver.rcompare)
}
