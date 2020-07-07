'use strict'

const semver = require('semver')
const getNpmVersions = require('./get-npm-versions');
const series = require('./series')
const Entity = require('./entity').Entity
const bim = require('builtin-modules')


exports.TestSuite = class TestSuite {

  //
  // Construct a TestSuite for a package
  //
  constructor (versions, options = {}) {
    this.versions = versions           // the versions file contents
    this.stdio = options.stdio || 'pipe'
    this.hooks = options.hooks || {}

    this.em = options.emitter || require('./emitter')

    this.status
  }

  //
  // Iterate over a list of package version specifications, each with a
  // specified range of versions. these come from the versions file of
  // the package being tested.
  //
  runTestSuite () {
    const results = series(this.versions, v => this.testVersionsOfEntity(v))
    return results
  }

  //
  // Iterate over a range of versions for a single entity.
  //
  // Before starting it saves the existing version of the module
  // being tested so it can be restored when testing is complete.
  //
  testVersionsOfEntity (verSpec) {
    const builtin = bim.indexOf(verSpec.name) >= 0

    // built-in modules don't set up previous version, don't install

    let previousVersion

    if (!builtin) {

      // construct a entity from the existing version so it can
      // be reinstalled when the tests are done. (set things back
      // when done.)
      previousVersion = this.makeEntityForExistingPackage(verSpec.name)

      if (previousVersion instanceof Error) {
        const e = previousVersion
        this.em.emit('info', `${verSpec.name}: no previous version - ${e.message}`)
        previousVersion = undefined
      } else {
        previousVersion.context = {dependencies: []}
        this.em.emit('info', `found ${previousVersion} already installed`)
      }

      // check verSpec for dependencies and save current version for each so they can
      // be restored at the end.
      const dependencies = {}
      verSpec.ranges.forEach(r => {
        const deps = r.dependencies || []
        deps.forEach(d => {
          // handle private packages with leading '@'.
          const name = d.slice(d.lastIndexOf('@'))
          dependencies[name] = d
        })
      })

      const previousDependencyVersions = []
      for (const pkgName in dependencies) {
        const currentVersion = this.makeEntityForExistingPackage(pkgName)

        if (currentVersion instanceof Error) {
          const e = currentVersion
          this.em.emit('info', `${pkgName}: no previous version - ${e.message}`)
        } else {
          this.em.emit('info', `found ${previousVersion} already installed`)
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
    return this.mapMatchingVersionsToEntities(verSpec, builtin)
      .then(entities => {
        // allow this for testing
        if (this.hooks.entityMapper) {
          entities = entities.map(this.hooks.entityMapper.bind(this))
        }
        return entities
      })
      .then(entities =>
        series(entities, entity => entity.installAndTest()))
      .catch(e => {
        console.log(e)  // eslint-disable-line
      })
      .then(entities => {
        // if it's not a builtin entity then either install the previous
        // version or uninstall the package.
        // N.B. this doesn't handle all version-file-specified dependencies
        // correctly because they are not part of the npm package.
        verSpec.results = entities
        if (!builtin) {
          if (previousVersion) {
            this.em.emit('info', `restoring ${previousVersion}`)
            return previousVersion.install()
          } else {
            const last = entities[entities.length - 1]
            this.em.emit('info', `uninstalling ${last}`)
            return last.uninstall()
          }
        }
      })
      .catch(e => {
        this.em.emit('failed to restore initial state')
      })
      .then(() =>
        verSpec
      )
  }

  //
  // Map all versions matching a version spec for a package to an entity
  // that is used for testing.
  //
  mapMatchingVersionsToEntities (verSpec, builtin = false) {
    // have a single context for the entire package, not one per
    // version of the package.
    const context = {dependencies: {}}
    const options = {stdio: this.stdio, context}

    // make sure the verSpec version is one we understand.
    if (verSpec.version !== 2) {
      throw new Error(`VersionSpec version ${verSpec.version} not supported`)
    }

    // if it's builtin there is nothing to install. use the node version for the version.
    if (builtin) {
      return Promise.resolve([new Entity(verSpec.name, process.version, verSpec.task, options)])
    }

    // get all the versions on npm and make a list of each that satisfies one of the
    // verSpec ranges.
    return getNpmVersions(verSpec.name)
      .then(versions => {
        let list = versions.reverse();

        let latest = null;
        if (verSpec['latest-only']) {
          latest = semver.maxSatisfying(list, '>0.0.0');
        }

        // an entity is a package-version pair. flag entities that don't meet any
        // verSpec range so they'll be skipped (not installed or tested) later.
        list = list.map(v => {
          const pkg = new Entity(verSpec.name, v, verSpec.task, options)
          pkg.skip = false;
          let count = 0;

          // is this version in one of the verSpec ranges?
          for (let i = 0; i < verSpec.ranges.length; i++) {
            if (satisfies(v, verSpec.ranges[i].range)) {
              count += 1
              // add the dependencies to the package.
              if (verSpec.ranges[i].dependencies) {
                pkg.dependencies = verSpec.ranges[i].dependencies.map(d => {
                  const name = d.slice(0, d.lastIndexOf('@'))
                  const version = d.slice(d.lastIndexOf('@') + 1)
                  return new Entity(name, version, null, options)
                })
              }
            }
          }
          // if it failed to match any range mark or latest is specified
          // and it is not the latest then mark it to be skipped.
          if (count === 0 || latest && semver.neq(latest, v)) {
            pkg.skip = true;
          }

          return pkg
        })

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
      // TODO BAM if multiple dependencies on this package it could be located
      // in /node_modules/<name>/node_modules/<name>/
      const packagePath = `${process.cwd()}/node_modules/${name}/package`;
      const existingVersion = require(packagePath).version

      return new Entity(name, existingVersion, null, {stdio: this.stdio, existing: true})
    } catch (e) {
      return e
    }
  }

  toString () {
    return `TestSuite: ${this.name}`
  }

  //
  // Only emits when there's an emitter
  //
  emit (...args) {
    if (this.em) {
      this.em.emit(...args)
    }
  }

  on (...args) {
    this.em.on(...args)
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
