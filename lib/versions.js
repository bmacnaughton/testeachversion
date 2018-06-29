import https from 'https'
import semver from 'semver'
import Promise from 'bluebird'
import concat from './concat'
import {parse} from './json'
const retryPromise = require('./retry-promise')

function get(module) {
  const p = new Promise((resolve, reject) => {
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
    .on('response', resolve)
    .on('error', reject)
    .end()
  })

  return p.then(res => {
    if (res.statusCode !== 200) {
      res.destroy()
      throw new Error(`failed to get https://registry.npmjs.org/${module} versions. Code ${res.statusCode}`)
    }
    return res
  }).then(concat)
}

module.exports = function (module) {
  let opts = {minTimeout: 250, maxTimeout: 2000}
  return retryPromise(function () {return get(module)}, opts)
  //return get(module)
    .then(parse)
    .then(versions)
}

function versions (json) {
  return Object.keys(json.versions)
    .filter(v => semver.valid(v))
    .sort(semver.rcompare)
}
