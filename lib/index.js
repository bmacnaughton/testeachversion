import Promise from 'bluebird'
import semver from 'semver'
import fs from 'fs'
import {spawnSync} from 'child_process'

import {major,minor,patch} from './granularity'
import versions from './versions'
import series from './series'

const filters = {
  major,
  minor,
  patch
}

export default class Module {

  //
  // Construct a module instance
  //
  constructor(mod, version, reporter, stdio) {
    this.reporter = reporter
    this.version = version
    this.name = mod.name
    this.stdio = stdio
    if (!mod.task) {
      this.command = 'npm'
      this.args = ['test']
    } else {
      let parts = mod.task.split(' ')
      this.command = parts.shift()
      this.args = parts
    }
    this.status = 'fail'
  }

  toString() {
    return this.name + '@' + this.version
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
    this.state = 'install'
    var opts = {}
    this.emit('info', `installing ${this.toString()}`)
    var results = spawnSync(
      'npm', [
        'install',
        '--save-dev',
        `${this.name}@${this.version}`
      ],
      opts
    )
    if (results.status || results.error) {
      let res = (results.stderr ? results.stderr : results.status).toString()
      this.emit('error', this, 'install', res)
      return Promise.reject(res)
    }
    this.emit('info', `installed ${this.toString()}`)
    return Promise.resolve()
  }

  //
  // Run the test task
  //
  test() {
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
  installAndTest() {
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

  //
  // Find all versions matching a module spec
  //
  static matchingSpec(mod, emitter, stdio) {
    return versions(mod.name)
      .then(res => {
        let list = res.reverse()

        /* TODO BAM rethink this. no documented API or options...
        // Support adjustable granularity
        if (mod.filter) {
          const filter = typeof mod.filter === 'function'
            ? list => mod.filter(list)
            : filters[mod.filter]

          if (!filter) {
            return Promise.reject(new Error(`Invalid filter: ${mod.filter}`))
          }

          list = filter(list)
        }
        // */

        // make each version a module and flag those not meeting the
        // version ranges specified so they will not be installed or
        // tested.
        list = list.map(version => {
          let m = new Module(mod, version, emitter, stdio)
          m.skip = !satisfies(version, mod.range)
          return m
        })

        return list
        //return list.map(version => new Module(mod, version, emitter))
      })
  }

  //
  // Iterate over a range of versions for a single module.
  //
  // Before starting it saves the existing version of the module
  // being tested so it can be restored when testing is complete.
  //
  static testSpecifiedVersions(mod, emitter, stdio) {
    // construct a module from the existing version so it can
    // be reinstalled when the tests are done. (set things back
    // when done.)
    let previousVersion
    try {
      // the packages are not installed for this program so the
      // require path must be fully specified.
      let packageName = process.cwd() + '/node_modules/' + mod.name + "/package"
      let existingVersion = require(packageName).version
      // make a module that can be used to install this version at the end.
      previousVersion = new Module(mod, existingVersion, emitter);
      previousVersion.emit('info', `found ${previousVersion}`)
    } catch (e) {
      emitter.emit('info', 'no previous version: ' + e.message)
    }
    return Module.matchingSpec(mod, emitter, stdio)
      .then(versions => {
        return versions
      })
      .then(versions => series(versions, version => version.installAndTest()))
      .catch(e => {
        console.log(e)
      })
      .then(versions => {
        // if there was a previous version and it's not the last version tested
        // then reinstall it.
        if (previousVersion) {
          let length = versions.length || 0
          if (length && versions[length - 1].version !== previousVersion.version) {
            previousVersion.emit('info', `restoring: ${previousVersion}`)
            previousVersion.install()
          }
        }
        mod.results = versions
        return mod
      })
  }

  //
  // Iterate over a list of module specifications, each with a specified
  // range of versions.
  //
  static testTheseVersions(mods, emitter, stdio) {
    let results = series(mods, mod => Module.testSpecifiedVersions(mod, emitter, stdio))
    return results
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
