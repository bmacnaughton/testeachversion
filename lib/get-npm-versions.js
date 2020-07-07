'use strict';

const https = require('https')
const semver = require('semver')
const Promise = require('bluebird')
const concat = require('./concat')
const {parse} = require('./json')
const retryPromise = require('./retry-promise')

function get (name) {
  const p = new Promise((resolve, reject) => {
    https.request({
      method: 'GET',
      host: 'registry.npmjs.org',
      path: `/${name}`,
      agent: false,
      headers: {
        'accept': 'application/json',
        'accept-encoding': 'identity',
        'user-agent': 'https://github.com/bmacnaughton/testallversions',
      },
    })
      .on('response', resolve)
      .on('error', reject)
      .end();
  })

  return p.then(res => {
    if (res.statusCode !== 200) {
      res.destroy()
      throw new Error(`failed to get https://registry.npmjs.org/${name} versions. Code ${res.statusCode}`)
    }
    return res
  }).then(concat)
}

module.exports = function (name) {
  const opts = {minTimeout: 250, maxTimeout: 2000};
  return retryPromise(function () {return get(name)}, opts)
  //return get(module)
    .then(parse)
    .then(fixupVersions)
}

function fixupVersions (json) {
  return Object.keys(json.versions)
    .filter(v => semver.valid(v))
    .sort(semver.rcompare)
}
