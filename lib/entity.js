const semver = require('semver')
const EventEmitter = require('events').EventEmitter
const fs = require('fs')
const {spawnSync} = require('child_process')

const {major, minor, patch} = require('./granularity')
const versions = require('./versions')
const series = require('./series')

const filters = {
  major,
  minor,
  patch
}

module.exports = class Entity extends EventEmitter {

  //
  // Construct an Entity instance
  //
  constructor (pkg, version, stdio) {
    super()
    this.name = pkg.name
    if (!pkg.task) {
      this.command = 'npm'
      this.args = ['test']
    } else {
      let parts = pkg.task.split(' ')
      this.command = parts.shift()
      this.args = parts
    }
    this.context = pkg.context || {}

    this.version = version
    this.stdio = stdio

    this.installStatus
    this.testStatus

    // log is used for all output. after each state change is emitted log is
    // cleared by changeState().
    this.log = ''

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
    // install-failed
    // installed
    // testing
    // test-failed
    // tested
    this.emit('state', from, to, this)
    this.log = ''
    return to
  }

  toString () {
    return `${this.name}@${this.version}`
  }

  //
  // Install the appropriate version of this module
  //
  install () {
    let packages = [this.toString()]

    // TODO BAM - make context.dependencies a map and only install
    // those that don't match this.dependencies.
    if (this.context.dependencies !== this.dependencies) {
      packages = packages.concat(this.dependencies)
      this.context.dependencies = this.dependencies
    }

    // https://decembersoft.com/posts/promises-in-serial-with-array-reduce/
    const fn = (p, d) => {
      return p.then(results => {
        return this.installPackage(d).then(r => {
          return [...results, r]
        })
      })
    }

    return packages.reduce(fn, Promise.resolve([]))
  }

  installPackage (p) {
    var opts = {}
    this.state = 'installing'
    var results = spawnSync(
      'npm', [
        'install',
        '--save-dev',
        `${p}`
      ],
      opts
    )
    debugger
    this.installStatus = results.status || results.error || 0

    if (results.status || results.error) {

      let log = ''
      if (results.stdout) {
        log += '\nSTDOUT:\n' + results.stdout.toString()
      }
      if (results.stderr) {
        log += '\nSTDERR:\n' + results.stderr.toString()
      }

      this.log = log
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
    this.state = 'testing'
    var opts = {}
    if (this.stdio) {
      opts.stdio = this.stdio
    }
    var results = spawnSync(this.command, this.args, opts)

    // if there is an error capture the output
    if (results.status || results.error) {
      let log
      if (results.stdout) {
        log += '\nSTDOUT:\n' + results.stdout.toString()
      }
      if (results.stderr) {
        log = '\nSTDERR:\n' + results.stderr.toString()
      }
      this.log = log
      this.testStatus = 'fail'
      this.state = 'test-failed'
      return Promise.reject(new Error('test-failed'))
    }
    this.testStatus = 'pass'
    this.state = 'tested'
    return Promise.resolve('')
  }

  //
  // Install a new version each test
  //
  installAndTest () {
    // if skipped count as a fail but output skip.
    if (this.skip) {
      this.state = 'skipped'
      this.status = 'skip'
      this.emit('test', this)
      this.emit('skip', this)
      return Promise.resolve(this)
    }

    return this.install()
      .then(() => {
        this.state = 'testing'
        this.test()
      })
      // errors in the test module and before/after can cause
      // the whole test module to fail.
      .catch(res => {
        this.status = 'fail'
        return res
      })
      .then(res => {
        this.state = 'tested'
        //this.emit(this.status, this, res)
        return this
      })
  }
}
