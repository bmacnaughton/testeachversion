import rimraf from 'rimraf-promise'
import {EventEmitter} from 'events'
import Promise from 'bluebird'
import {inherits} from 'util'
import series from './series'
import semver from 'semver'
import exec from './exec'

function forward (src, dest, type) {
  src.on(type, (...args) => {
    dest.emit(type, ...args)
  })
}

export default class Module extends EventEmitter {

  constructor(mod, version, emitter) {
    this.version = version
    this.name = mod.name
    this.task = mod.task || 'npm test'

    if (emitter) {
      forward(this, emitter, 'uninstall')
      forward(this, emitter, 'install')
      forward(this, emitter, 'test')
    }
  }

  uninstall() {
    return rimraf(`node_modules/${this.name}`).then((res) => {
      this.emit('uninstall', this)
      return this
    }, () => this)
  }

  install() {
    return exec(`npm install ${this.name}@${this.version}`).then((res) => {
      this.emit('install', this)
      return this
    }, () => this)
  }

  test() {
    return exec(this.task).then((res) => {
      this.passed = true
      this.result = res
      this.emit('test', this, this.passed)
      return this
    }, (err) => {
      this.passed = false
      this.error = err
      this.emit('test', this, this.passed)
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
      return JSON.parse(res.replace(/\'/g, '"'))
        .filter((version) => semver.satisfies(version, mod.range))
        .map((version) => new Module(mod, version, emitter))
        .reverse()
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
