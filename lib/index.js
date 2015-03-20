import rimraf from 'rimraf-promise'
import Promise from 'bluebird'
import {inherits} from 'util'
import series from './series'
import semver from 'semver'
import exec from './exec'

export default class Module {

  //
  // Construct a module instance
  //
  constructor(mod, version, reporter) {
    this.reporter = reporter
    this.version = version
    this.name = mod.name
    this.task = mod.task || 'npm test'
    this.timeout = mod.timeout || 1000 * 10
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
  // Uninstall the module, if it exists already
  //
  uninstall() {
    this.emit('before-uninstall', this)
    return rimraf(`node_modules/${this.name}`).then((res) => {
      this.emit('after-uninstall', this, res)
      return this
    }, () => this)
  }

  //
  // Install the appropriate version of this module
  //
  install() {
    let p = exec(`npm install ${this.name}@${this.version}`)
    this.emit('before-install', this, p)
    return p.then((res) => {
      this.emit('after-install', this, res)
      return this
    }, () => this)
  }

  //
  // Run the test task
  //
  test() {
    let p = exec(this.task, this.timeout)
    this.emit('test', this, p)
    return p.then((res) => {
      this.passed = true
      this.result = res
      this.emit('pass', this, res)
      return this
    }, (res) => {
      this.passed = false
      this.result = res
      this.emit('fail', this, res)
      return this
    })
  }

  //
  // Serially run the uninstall -> install -> test flow
  //
  testWithInstall() {
    return this.uninstall()
      .then(() => this.install())
      .then(() => this.test())
  }

  //
  // Find all versions matching a module spec
  //
  static matchingSpec(mod, emitter) {
    return exec(`npm view ${mod.name} versions`).then((res) => {
      let list = JSON.parse(res.replace(/\'/g, '"')).reverse()

      if (typeof mod.range !== 'undefined') {
        list = list.filter((version) => satisfies(version, mod.range))
      }

      return list.map((version) => new Module(mod, version, emitter))
    })
  }

  //
  // Test against all versions matching a module spec
  //
  static testWithVersions(mod, emitter) {
    return Module.matchingSpec(mod, emitter).then((versions) => {
      return series(versions, (version) => version.testWithInstall())
    })
  }

  //
  // Test against a list a list of many module specs
  //
  static testAllWithVersions(mods, emitter) {
    return series(mods, (mod) => Module.testWithVersions(mod, emitter))
  }

}

//
// Helpers
//
function satisfies (version, ranges) {
  if ( ! Array.isArray(ranges)) {
    return semver.satisfies(version, ranges)
  }

  return ranges.reduce((m, r) => m || semver.satisfies(version, r), false)
}
