import rimraf from 'rimraf-promise'
import Promise from 'bluebird'
import {inherits} from 'util'
import assert from 'assert'
import semver from 'semver'
import fs from 'fs'
import {spawnSync} from 'child_process'

import {major,minor,patch} from './granularity'
import versions from './versions'
import series from './series'
import {parse} from './json'
import exec from './exec'

const filters = {
  major,
  minor,
  patch
}

export default class Module {

  //
  // Construct a module instance
  //
  constructor(mod, version, reporter) {
    this.reporter = reporter
    this.version = version
    this.name = mod.name
    if (!mod.task) {
      this.command = 'npm'
      this.args = ['test']
    } else {
      let parts = mod.task.split(' ')
      this.command = parts.shift()
      this.args = parts
    }
    this.passed = false
    this.result = ''
  }

  //
  // Only emits when there's a reporter
  //
  emit(...args) {
    if (this.reporter) {
      this.reporter.emit(...args)
    }
  }

  //
  // Install the appropriate version of this module
  //
  install() {
    var opts = {}
    this.emit('before-install', this)
    var results = spawnSync('npm', ['install', `${this.name}@${this.version}`], opts)

    if (results.status || results.error) {
      return Promise.reject(results.stderr ? results.stderr : results.status).toString()
    }
    return Promise.resolve()

  }

  //
  // Run the test task
  //
  test() {
    this.state = 'test'
    this.emit('test', this)
    var opts = {}
    var results = spawnSync(this.command, this.args, opts)

    if (results.status || results.error) {
      let log = (results.stderr ? results.stderr : results.status).toString()
      this.emit('fail', this, log)
      return log
    }
    this.emit('pass', this, '')
    return ''
  }

  //
  // Install a new version each test
  //
  testWithInstall() {
    return this.install()
      .then(() => this.test())
      .catch(res => {
        console.log('caught error state=', this.state, res)
        if (!this.passed) {
          this.emit('fail', this, res)
        }
      })
  }

  //
  // Find all versions matching a module spec
  //
  static matchingSpec(mod, emitter) {
    return versions(mod.name)
      .then(res => {
        let list = res.reverse()

        if (typeof mod.range !== 'undefined') {
          list = list.filter(version => satisfies(version, mod.range))
        }

        // Support adjustable granularity
        if (mod.filter) {
          const filter = typeof mod.filter === 'function'
            ? list => mod.filter(list)
            : filters[mod.filter]

          if ( ! filter) {
            return Promise.reject(new Error(`Invalid filter: ${mod.filter}`))
          }

          list = filter(list)
        }

        return list.map(version => new Module(mod, version, emitter))
      })
  }

  //
  // Test a module against a list of specified versions.
  //
  static testWithVersions(mod, emitter) {
    let previous

    try {
      let existingVersion = require('node_modules/' + mod + '/package').version
      previous = new Module(mod.name, )
    } catch (e) {}
    return Module.matchingSpec(mod, emitter)
      .then(versions => series(versions, version => version.testWithInstall()))
      .catch(e => {
        if (previousVersion) {

        }
      })
  }

  //
  // Iterate over a list of module specifications, each with a range
  // of versions.
  //
  static testAllWithVersions(mods, emitter) {
    return series(mods, mod => Module.testWithVersions(mod, emitter))
  }

}

//
// Helpers
//
function move (before, after) {
  return new Promise((yep, nope) => {
    fs.rename(before, after, callbackify(yep, nope))
  })
}

function makePromise (task, timeout) {
  assert(typeof task === 'string' || typeof task === 'function')
  if (typeof task === 'string') return () => exec(task, timeout)
  return () => promisify(task)
}

function callbackify (yep, nope) {
  return (err, res) => err ? nope(err) : yep(res)
}

function promisify (fn) {
  return new Promise((pass, fail) => {
    fn.length ? fn(callbackify(pass, fail)) : pass(fn())
  })
}

function satisfies (version, ranges) {
  if ( ! Array.isArray(ranges)) {
    return semver.satisfies(version, ranges)
  }

  return ranges.reduce((m, r) => m || semver.satisfies(version, r), false)
}
