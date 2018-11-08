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

module.exports = class TestSuite {

  //
  // Construct a TestSuite for a package
  //
  constructor (versions, emitter, stdio) {
    this.versions = versions        // the versions file contents
    this.emitter = emitter          // emit events using this
    this.stdio = stdio              // the stdio descriptor
    this.status = 'fail'
  }

  //
  // Iterate over a list of package version specifications, each with a
  // specified range of versions. these come from the versions file of
  // the package being tested.
  //
  runTestSuite () {
    let results = series(
      versions, v => this.testVersionsOfEntity(v)
    )
    return results
  }

  //
  // Iterate over a range of versions for a single entity.
  //
  // Before starting it saves the existing version of the module
  // being tested so it can be restored when testing is complete.
  //
  testVersionsOfEntity(verSpec) {
    // TODO BAM handle built-in node packages:
    // don't set up previous version, don't install


    // construct a entity from the existing version so it can
    // be reinstalled when the tests are done. (set things back
    // when done.)
    let previousVersion = this.makeEntityForExistingPackage(verSpec.name)

    if (previousVersion instanceof Error) {
      const e = previousVersion
      emitter.emit('info', 'no previous version: ' + e.message)
      previousVersion = undefined
    } else {
      previousVersion.context = {dependencies: []}
      previousVersion.emit('info', `found ${previousVersion}`)
    }

    // if this version has multiple ranges check for dependencies
    if (verSpec.ranges) {
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
        let currentVersion = this.makeEntityForExistingPackage(pkgName)

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
      // TODO BAM handle dependencies anyway?
      if (previousVersion) {
        previousVersion.dependencies = previousDependencyVersions.map(d => d.toString())
      }
    }

    // now convert the versions to entities.
    return this.mapMatchingVersionsToEntities(verSpec)
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
          previousVersion.install()
          /* don't depend on last version being different because dependencies would be missed.
          let length = entities.length || 0
          if (length && entities[length - 1].version !== previousVersion.version) {
            previousVersion.emit('info', `restoring: ${previousVersion}`)
            previousVersion.install()
          }
          // */
        }
        verSpec.results = entities
        return verSpec
      })
  }

  //
  // Map all versions matching a version spec for a package to an entity
  // that is used for testing.
  //
  mapMatchingVersionsToEntities (verSpec) {
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
  // make an entity for a package that is already installed locally.
  //
  makeEntityForExistingPackage (name) {
    try {
      // the packages are not installed for testeachversion so the
      // require path must be fully specified. i.e. this program is
      // running in another package's install directory.
      let packagePath = process.cwd() + '/node_modules/' + name + "/package"
      let existingVersion = require(packagePath).version

      return new Entity({name}, existingVersion, this.emitter, this.stdio)
    } catch (e) {
      return e
    }
  }

  toString() {
    return `TestSuite: ${this.name}`
  }

  //
  // Only emits when there's a reporter
  //
  emit(...args) {
    if (this.reporter) {
      this.reporter.emit(...args)
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
