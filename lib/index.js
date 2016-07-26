import rimraf from 'rimraf-promise'
import Promise from 'bluebird'
import {inherits} from 'util'
import assert from 'assert'
import semver from 'semver'
import fs from 'fs'

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
    this.task = makePromise(mod.task || 'npm test', mod.timeout || 1000 * 10)
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
  // Move existing module folder temporarily
  //
  move() {
    this.emit('before-move', this)
    return move(`node_modules/${this.name}`, `node_modules/${this.name}.moved`)
      .then(res => {
        this.emit('after-move', this, res)
        return this
      })
      .catch(() => this)
  }

  //
  // Restore temporarily moved module folder
  //
  restore() {
    this.emit('before-restore', this)
    return move(`node_modules/${this.name}.moved`, `node_modules/${this.name}`)
      .then(res => {
        this.emit('after-restore', this, res)
        return this
      })
      .catch(() => this)
  }

  //
  // Uninstall the module, if it exists already
  //
  uninstall() {
    this.emit('before-uninstall', this)
    return rimraf(`node_modules/${this.name}`)
      .then(res => {
        this.emit('after-uninstall', this, res)
        return this
      })
      .catch(() => this)
  }

  //
  // Install the appropriate version of this module
  //
  install() {
    let p = exec(`npm install ${this.name}@${this.version}`)
    this.emit('before-install', this, p)
    return p
      .then(res => {
        this.emit('after-install', this, res)
        return this
      })
      .catch(() => this)
  }

  //
  // Run the test task
  //
  test() {
    let p = this.task()
    this.emit('test', this, p)
    return p
      .then(res => {
        this.result = res
        this.passed = true
        this.emit('pass', this, res)
        return this
      })
      .catch(res => {
        this.result = res
        this.passed = false
        this.emit('fail', this, res)
        return this
      })
  }

  //
  // Serially run the test flow
  //
  testWithInstall() {
    return this.move()
      .then(() => this.install())
      .then(() => this.test())
      .then(() => this.uninstall())
      .then(() => this.restore())
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
  // Test against all versions matching a module spec
  //
  static testWithVersions(mod, emitter) {
    return Module.matchingSpec(mod, emitter)
      .then(versions => series(versions, version => version.testWithInstall()))
  }

  //
  // Test against a list a list of many module specs
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
