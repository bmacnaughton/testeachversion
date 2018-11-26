'use strict'

const {spawnSync} = require('child_process')
const bim = require('builtin-modules')
const em = require('./emitter')

//
// Entities are usually packages but can be node built-in modules
// or just abstract tests.
//
exports.Entity = class Entity {

  //
  // Construct an Entity instance
  //
  constructor (name, version, task, options = {}) {

    // save the name and notice whether it's a builtin module. allow
    // the caller to specify that it's builtin so that arbitrary tests
    // can be run. builtin entities are not installed.
    this.name = name
    this.builtin = options.builtin || bim.indexOf(name) != -1

    this.version = version

    this.task = getTask(task)

    if (options.stdio) {
      if (!Array.isArray(options.stdio) && typeof options.stdio !== 'string') {
        throw new TypeError('Entity - options.stdio must be an array or string')
      }
    }
    this.stdio = options.stdio
    this.spawnOpts = {
      stdio: this.stdio
    }

    // each entity can be set to skip. this is typically used for non-production
    // versions of packages, e.g., '-rc1' suffix.
    this.skip = options.skip
    this.context = options.context || {}
    // dependencies are treated as a unit right now. it might make more sense
    // to treat them as individual items. that would require changing from an
    // array to a map and only installing those that differ.
    // TODO BAM consider changing to map. See install().
    this.dependencies = options.dependencies || []

    this.installStatus = undefined
    this.testStatus = undefined
    this.uninstallStatus = undefined

    // this entity is the entity that was found when the testing started.
    this.previousEntity = options.existing

    // this only gets the output if stdio is not set to redirect output
    // to another stream.
    this.log = {stdout: '', stderr: ''}

    let state
    Object.defineProperty(this, 'state', {
      get () {return state},
      set (newState) {state = this.stateChange(state, newState)}
    })

    this.state = 'initial'
  }

  stateChange (from, to) {
    // initial
    // installing
    // install-failed - log will be set
    // installed - if status === 'failed' the log will be set
    // testing
    // tested
    em.emit('state', from, to, this)
    return to
  }

  toString () {
    return `${this.name}@${this.version}`
  }

  on (...args) {
    em.on(...args)
  }

  //
  // Install this version of the entity and its dependencies.
  //
  install () {
    // always install this package
    let packages = [this.toString()]

    // add the dependencies for this package.
    // TODO BAM - make context.dependencies a map and only install
    // those that don't match this.dependencies.
    if (this.context.dependencies !== this.dependencies) {
      packages = packages.concat(this.dependencies)
      this.context.dependencies = this.dependencies
    }

    // https://decembersoft.com/posts/promises-in-serial-with-array-reduce/
    const fn = (p, d) => {
      return p.then(results => {
        return this.installEntity(d).then(r => {
          return [...results, r]
        })
      })
    }

    return packages.reduce(fn, Promise.resolve([]))
  }

  //
  // uninstall an entity.
  //
  uninstall () {
    this.state = 'uninstalling'
    let results = {}

    if (!this.builtin) {
      const args = ['uninstall', `${this}`]
      results = spawnSync('npm', args, this.spawnOpts)
    }
    this.uninstallStatus = results.status || results.error || 0

    this.log.stdout = results.stdout ? results.stdout.toString() : ''
    this.log.stderr = results.stderr ? results.stderr.toString() : ''

    if (this.status) {
      this.uninstallStatus = 'fail'
      this.state = 'uninstall-failed'
      return Promise.reject(new Error('uninstall-failed'))
    }

    this.uninstallStatus = 'pass'
    this.state = 'uninstalled'
    return Promise.resolve(null)
  }

  //
  // install the entity.
  //
  // this returns a promise even though it is currently synchronous. it
  // might become async in the future.
  //
  installEntity () {
    this.state = 'installing'

    // currently the tests for failure will cause an empty object to appear to succeed.
    let results = {}

    // if it is not builtin then it must be installed
    if (!this.builtin) {
      const args = ['install', '--save-dev', `${this}`]
      results = spawnSync('npm', args, this.spawnOpts)
    }
    this.installStatus = results.status || results.error || 0
    this.log.stdout = results.stdout ? results.stdout.toString() : ''
    this.log.stderr = results.stderr ? results.stderr.toString() : ''

    if (this.installStatus) {
      this.installStatus = 'fail'
      this.state = 'install-failed'
      return Promise.reject(new Error('install-failed'))
    }

    this.installStatus = 'pass'
    this.state = 'installed'
    return Promise.resolve(null)
  }

  //
  // Run the test task
  //
  test () {
    var opts = {}

    let results
    let error

    if (typeof this.task === 'function') {
      try {
        results = this.task(this)
      } catch (e) {
        error = e
      }
      this.log.stdout = results.stdout || ''
      this.log.stderr = results.stderr || ''
    } else {
      results = spawnSync(this.task.command, this.task.args, this.spawnOpts)
      this.log.stdout = results.stdout ? results.stdout.toString() : ''
      this.log.stderr = results.stderr ? results.stderr.toString() : ''
    }

    // reject with error statuses on an error
    if (results.status || results.error) {
      return Promise.reject(new Error('tested-failed'))
    } else if (error instanceof Error) {
      return Promise.reject(error)
    }

    // if no error resolve with nothing
    return Promise.resolve(null)
  }

  //
  // Install a new version each test
  //
  installAndTest () {
    // if skipped it didn't pass or fail.
    if (this.skip) {
      this.testStatus = 'skip'
      this.state = 'skipped'
      return Promise.resolve(this)
    }
    const fn = () => this.builtin ? Promise.resolve() : this.install()

    return fn()
      .then(() => {
        this.state = 'testing'
        return this.test()
      })
      .then(r => {
        this.testStatus = 'pass'
      })
      // errors in the test module and before/after can cause
      // the whole test module to fail.
      .catch(e => {
        this.testStatus = 'fail'
      })
      .then(r => {
        this.state = 'tested'
        return this
      })
  }
}

//
// helper function to accept multiple forms of a task
//
function getTask (task) {
  let t = {command: 'true', args: []}
  if (!task) {
    return t
  }
  // if not defaulted figure out what was specified.
  if (typeof task === 'string') {
    let parts = task.split(' ')
    t.command = parts.shift()
    t.args = parts
  } else if (task.command && task.args) {
    t.command = task.command
    t.args = task.args
  } else if (typeof task === 'function') {
    t = task
  } else if (task) {
    throw new Error('Invalid task:' + task)
  }
  return t
}
