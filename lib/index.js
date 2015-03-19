import rimraf from 'rimraf-promise'
import Promise from 'bluebird'
import {inherits} from 'util'
import series from './series'
import semver from 'semver'
import exec from './exec'

export default class Module {

  constructor(mod, version, emitter) {
    this.emitter = emitter
    this.version = version
    this.name = mod.name
    this.task = mod.task || 'npm test'
  }

  uninstall() {
    return rimraf(`node_modules/${this.name}`).then((res) => {
      if (this.emitter) {
        this.emitter.emit('uninstall', this, res)
      }

      return this
    }, () => this)
  }

  install() {
    return exec(`npm install ${this.name}@${this.version}`).then((res) => {
      if (this.emitter) {
        this.emitter.emit('install', this, res)
      }

      return this
    }, () => this)
  }

  test() {
    return exec(this.task).then((res) => {
      this.passed = true
      this.result = res

      if (this.emitter) {
        this.emitter.emit('pass', this, res)
      }

      return this
    }, (res) => {
      this.passed = false
      this.result = res

      if (this.emitter) {
        this.emitter.emit('fail', this, res)
      }

      return this
    })
  }

  testWithInstall() {
    return this.uninstall()
      .then(() => this.install())
      .then(() => this.test())
  }

  static matchingSpec(mod, emitter) {
    return exec(`npm view ${mod.name} versions`).then((res) => {
      var list = JSON.parse(res.replace(/\'/g, '"')).reverse()

      if (typeof mod.range !== 'undefined') {
        list = list.filter((version) => satisfies(version, mod.range))
      }

      return list.map((version) => new Module(mod, version, emitter))
    })
  }

  static testWithVersions(mod, emitter) {
    return Module.matchingSpec(mod, emitter).then((versions) => {
      return series(versions, (version) => version.testWithInstall())
    })
  }

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
