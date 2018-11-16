'use strict'

const EventEmitter = require('events').EventEmitter
const {spawnSync} = require('child_process')
const bim = require('builtin-modules')


exports.Entity = class Entity extends EventEmitter {

  //
  // Construct an Entity instance
  //
  constructor (name, version, task, options = {}) {
    super()

    // save the name and notice whether it's a builtin module. allow
    // the caller to specify that it's builtin so that arbitrary tests
    // can be run. builtin entities are not installed.
    this.name = name
    this.builtin = options.builtin || ~bim.indexOf(name)

    this.version = version

    this.task = getTask(task)

    this.context = options.context || {}
    this.stdio = options.stdio

    this.installStatus
    this.testStatus

    // log is used for all output. after each state change is emitted log is
    // cleared by changeState().
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
    // installed
    // testing
    // test-failed - log will be set
    // tested
    this.emit('state', from, to, this)
    //console.log('stateChange to:', to, 'log is:', this.log)
    this.log = {stdout: '', stderr: ''}
    return to
  }

  toString () {
    return `${this.name}@${this.version}`
  }

  //
  // Install this instance of the entity and its dependencies.
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
        return this.installEntity(d).then(r => {
          return [...results, r]
        })
      })
    }

    return packages.reduce(fn, Promise.resolve([]))
  }

  //
  // install the entity, p.
  //
  // this returns a promise even though it is currently synchronous. it
  // might become async in the future.
  //
  installEntity (p) {
    var opts = {}
    this.state = 'installing'

    // currently the tests for failure will cause an empty object to appear to succeed.
    let results = {}

    // if it is not builtin then it must be installed
    if (!this.builtin) {
      const args = ['install', '--save-dev', `${p}`]
      results = spawnSync('npm', args, opts)
    }
    this.installStatus = results.status || results.error || 0

    this.log.stdout = results.stdout.toString()
    this.log.stderr = results.stderr.toString()

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
    this.state = 'testing'
    var opts = {}
    if (this.stdio) {
      opts.stdio = this.stdio
    }
    var results = spawnSync(this.task.command, this.task.args, opts)

    this.log.stdout = results.stdout.toString()
    this.log.stderr = results.stderr.toString()

    // reject with error statuses on an error
    if (results.status || results.error) {
      this.testStatus = 'fail'
      this.state = 'test-failed'
      return Promise.reject(new Error('test-failed'))
    }

    // if no error resolve with
    this.testStatus = 'pass'
    this.state = 'tested'
    return Promise.resolve(null)
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

function getTask (task) {
  const t = {command: ':', args: []}
  if (typeof task === 'string') {
    let parts = task.split(' ')
    t.command = parts.shift()
    t.args = parts
  } else if (task.command && task.args) {
    t.command = task.command
    t.args = task.args
  } else if (task) {
    throw new Error('Invalid task:' + task)
  }
  return t
}
