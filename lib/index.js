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

// TODO BAM - make two classes - TestSuite and Entity. Many Entity statis methods
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
        this.installPackage(d).then(r => [...results, r])
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

  //
  // Map all versions matching a version spec for a package to an entity
  // that is used for testing.
  //
  static mapMatchingVersionsToEntities (verSpec, emitter, stdio) {
    // have a single context for the entire package, not one per
    // version of the package.
    let context = {}

    return versions(verSpec.name)
      .then(versions => {
        let list = versions.reverse()

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

        // make each version an entity and flag those not meeting any
        // version range specified so they will not be installed or
        // tested.
        //
        // there are two different versions of entity definitions in the
        // versions file. v2 allows dependencies and multiple ranges with
        // different dependencies.
        const pinfo = {name: verSpec.name, task: verSpec.task, context}
        if (verSpec.version === 1) {
          // for each version in the list returned by versions().
          list = list.map(v => {
            let pkg = new Entity(pinfo, v, emitter, stdio)
            pkg.skip = !satisfies(v, verSpec.range)
            return pkg
          })
        } else if (verSpec.version === 2) {
          // version 2 makes the assumption that the ranges are in order
          // and don't overlap.
          list = list.map(v => {
            let pkg = new Entity(pinfo, v, emitter, stdio)
            pkg.skip = false
            let count = 0
            for (let i = 0; i < verSpec.ranges.length; i++) {
              if (satisfies(v, verSpec.ranges[i].range)) {
                count += 1
                // add the dependencies to the package.
                pkg.dependencies = verSpec.ranges[i].dependencies
              }
            }
            // if it failed to match any range mark it to be skipped.
            if (count === 0) {
              pkg.skip = true
            }

            return pkg
          })
        } else {
          const m = `Unsupported version (${verSpec.version}) for ${verSpec.name}`
          throw new Error(m)
        }

        return list
      })
  }

  //
  // Iterate over a range of versions for a single entity.
  //
  // Before starting it saves the existing version of the module
  // being tested so it can be restored when testing is complete.
  //
  static testSpecifiedVersions (verSpec, emitter, stdio) {
    // construct a entity from the existing version so it can
    // be reinstalled when the tests are done. (set things back
    // when done.)
    let previousVersion = Entity.makeEntityForExistingPackage(verSpec.name, emitter)

    if (previousVersion instanceof Error) {
      const e = previousVersion
      emitter.emit('info', 'no previous version: ' + e.message)
      previousVersion = undefined
    } else {
      previousVersion.context = {dependencies: []}
      previousVersion.emit('info', `found ${previousVersion}`)
    }

    // scan verSpec for dependencies and save current version for each so they can
    // be restored at the end.
    let dependencies = {}
    verSpec.ranges.forEach(r => {
      let deps = r.dependencies || []
      deps.forEach(d => {
        let parts = d.split('@')
        // handle private packages' leading '@'
        let packageName = parts[parts.length === 2 ? 0 : 1]
        dependencies[packageName] = true
      })
    })
    let previousDependencyVersions = []
    for (let pkgName in dependencies) {
      let currentVersion = Entity.makeEntityForExistingPackage(pkgName, emitter)

      if (currentVersion instanceof Error) {
        const e = currentVersion
        emitter.emit('info', 'no previous version: ' + e.message)
      } else {
        currentVersion.emit('info', `found ${currentVersion}`)
        previousDependencyVersions.push(currentVersion)
      }
    }

    // add the dependencies to the previous version of the package being tested.
    // this means that if the previous version couldn't be read for any reason
    // then no previous versions will be re-installed so any fixes will need to
    // be done manually.
    if (previousVersion) {
      previousVersion.dependencies = previousDependencyVersions.map(d => d.toString())
    }

    return Entity.mapMatchingVersionsToEntities(verSpec, emitter, stdio)
      .then(entities => {
        return entities
      })
      .then(entities => series(entities, entity => entity.installAndTest()))
      .catch(e => {
        console.log(e)
      })
      .then(entities => {
        // if there was a previous version and it's not the last version tested
        // then reinstall it. because the original versions of dependencies are
        // attached to previousVersion they will be reinstalled as well.
        if (previousVersion) {
          let length = entities.length || 0
          if (length && entities[length - 1].version !== previousVersion.version) {
            previousVersion.emit('info', `restoring: ${previousVersion}`)
            previousVersion.install()
          }
        }
        verSpec.results = entities
        return verSpec
      })
  }

  //
  // Iterate over a list of package version specifications, each with a
  // specified range of versions. these come from the versions file of
  // the package being tested.
  //
  static testTheseVersions (versions, emitter, stdio) {
    let results = series(
      versions, v => Entity.testSpecifiedVersions(v, emitter, stdio)
    )
    return results
  }

  static makeEntityForExistingPackage (name, emitter) {
    try {
      // the packages are not installed for testeachversion so the
      // require path must be fully specified. i.e. this program is
      // running in another package's install directory.
      let packagePath = process.cwd() + '/node_modules/' + name + "/package"
      let existingVersion = require(packagePath).version
      // make an entity that can be used to restore this version at the end.
      return new Entity({name}, existingVersion, emitter)
    } catch (e) {
      return e
    }
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
