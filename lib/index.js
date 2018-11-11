const Promise = require('bluebird')
const semver = require('semver')
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

// TODO BAM - make two classes - TestSuite and Entity. Many Entity static methods
// should really be TestSuite methods.

module.exports = class Entity {

  //
  // Construct a module instance
  //
  constructor (pkg, version, reporter, stdio) {
    this.reporter = reporter
    this.version = version
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
    this.stdio = stdio
    this.status = 'fail'
  }

  toString () {
    return this.name + '@' + this.version
  }

  //
  // Only emits when there's a reporter
  //
  emit (...args) {
    if (this.reporter) {
      this.reporter.emit(...args)
    }
  }

  //
  // Install the appropriate version of this module
  //
  install () {
    this.state = 'install'
    let packages = [`${this.name}@${this.version}`]

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
    this.emit('info', `installing ${p}`)
    var results = spawnSync(
      'npm', [
        'install',
        '--save-dev',
        `${p}`
      ],
      opts
    )
    if (results.status || results.error) {
      let res = (results.stderr ? results.stderr : results.status).toString()
      this.emit('error', this, 'install', res)
      return Promise.reject(res)
    }
    this.emit('info', `installed ${p}`)
    return Promise.resolve(null)
  }

  //
  // Run the test task
  //
  test () {
    this.state = 'test'
    this.emit('test', this)
    var opts = {}
    if (this.stdio) {
      opts.stdio = this.stdio
    }
    var results = spawnSync(this.command, this.args, opts)

    // if there is an error return the output
    if (results.status || results.error) {
      let log
      if (results.stdout) {
        log += '\nSTDOUT:\n' + results.stdout.toString()
      }
      if (results.stderr) {
        log = '\nSTDERR:\n' + results.stderr.toString()
      }
      //let log = (results.stderr ? results.stderr : results.status).toString()
      return Promise.reject(log)
    }
    this.status = 'pass'
    return ''
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
      .then(() => this.test())
      // errors in the test module and before/after can cause
      // the whole test module to fail.
      .catch(res => {
        // if it never got to test fake that call
        if (this.state === 'install') {
          this.emit('test', this)
        }
        // make sure the test is marked as failing in case some
        // non-test error failed in the process of testing.
        this.status = 'fail'
        return res
      })
      .then(res => {
        this.emit(this.status, this, res)
        return this
      })
  }
}

//
// Helpers
//

function satisfies (version, ranges) {
  if (!Array.isArray(ranges)) {
    return semver.satisfies(version, ranges)
  }

  return ranges.reduce((m, r) => m || semver.satisfies(version, r), false)
}
