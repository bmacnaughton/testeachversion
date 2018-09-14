const Promise = require('bluebird')
const Module = require('../dist/')
const semver = require('semver')
const fs = require('fs')

describe('module', function () {
  let module
  let spec

  this.timeout(20000)

  before(() => {
    spec = {
      name: 'ap',
      task: 'echo "test"',
      range: '*'
    }

    module = new Module(spec, '0.2.0')
  })

  it('should discover satisfied versions', () => {
    return Module.matchingSpec(spec).then(versions => {
      versions.forEach(module => {
        module.name.should.equal(spec.name)
        semver.satisfies(module.version, spec.range).should.equal(true)
      })
    })
  })

  it('should discover satisfied versions from array range', () => {
    let possible = [
      '4.9.7',
      '4.9.8',
      '4.10.0',
      '4.10.1'
    ]

    let spec = {
      name: 'express',
      task: 'true',
      range: ['~4.9.7', '<= 4.10.1 >= 4.10.0']
    }

    return Module.matchingSpec(spec).then(versions => {
      versions.length.should.equal(possible.length)
      versions.forEach(module => {
        module.name.should.equal(spec.name)
        possible.should.containEql(module.version)
      })
    })
  })

  it('should uninstall', () => {
    return module.uninstall().then(() => {
      if (fs.existsSync(`node_modules/${spec.name}`)) {
        throw new Error(`${spec.name} should have been uninstalled`)
      }
    })
  })

  it('should install', () => {
    return module.install().then(() => {
      let pkg = require('ap/package')
      pkg.version.should.equal('0.2.0')
    })
  })

  it('should move', () => {
    return module.move().then(() => {
      if ( ! fs.existsSync(`node_modules/${spec.name}.moved`)) {
        throw new Error(`${spec.name} should have been moved`)
      }
    })
  })

  it('should restore', () => {
    return module.restore().then(() => {
      if ( ! fs.existsSync(`node_modules/${spec.name}`)) {
        throw new Error(`${spec.name} should have been restored`)
      }
    })
  })

  it('should test', () => {
    return module.test().then(
      res => validateTest(spec, res)
    )
  })

  it('should test with install', () => {
    return module.testWithInstall().then(
      res => validateTest(spec, res)
    )
  })

  it('should test with versions', () => {
    return Module.testWithVersions(spec).then(
      res => validateVersionList(spec, res)
    )
  })

  it('should test with module list', () => {
    return Module.testTheseVersions([spec, spec]).then(
      res => validateModuleList(spec, res)
    )
  })

  it('should not fail to return result when failing a test', () => {
    let data = {
      name: 'ap',
      task: 'exit 1'
    }

    let mod = new Module(data, '0.2.0')
    return mod.testWithInstall().then(res => {
      res.name.should.equal(mod.name)
      res.task.should.equal(mod.task)
      res.status.should.equal(false)
      res.result.should.equal('')
    })
  })

  it('should support function tasks', () => {
    let data = {
      name: 'ap',
      task: () => 'test'
    }

    let mod = new Module(data, '0.2.0')
    return mod.testWithInstall().then(res => {
      res.name.should.equal(mod.name)
      res.status.should.equal(true)
      res.result.should.equal('test')
    })
  })

  it('should support function tasks with callbacks', () => {
    let data = {
      name: 'ap',
      task: (done) => delay(100).then(() => done(null, 'test'))
    }

    let mod = new Module(data, '0.2.0')
    return mod.testWithInstall().then(res => {
      res.name.should.equal(mod.name)
      res.status.should.equal(true)
      res.result.should.equal('test')
    })
  })

  it('should support function tasks with promises', () => {
    let data = {
      name: 'ap',
      task: () => delay(100).then(() => 'test')
    }

    let mod = new Module(data, '0.2.0')
    return mod.testWithInstall().then(res => {
      res.name.should.equal(mod.name)
      res.status.should.equal(true)
      res.result.should.equal('test')
    })
  })

  it('should support major filter', () => {
    let spec = {
      name: 'express',
      task: 'echo "test"',
      range: '>= 1.0.0 < 3.0.0',
      filter: 'major'
    }

    return Module.matchingSpec(spec).then(filtered => {
      filtered.length.should.equal(2)
      return Promise.all(filtered.map(module => {
        module.name.should.equal(spec.name)
        semver.satisfies(module.version, spec.range).should.equal(true)

        return Module.matchingSpec({
          name: 'express',
          task: 'echo "test"',
          range: `^${module.version}`
        }).then(versions => {
          versions.forEach(v => {
            semver.satisfies(v.version, `^${module.version}`).should.equal(true)
          })
        })
      }))
    })
  })

  it('should support minor filter', () => {
    let spec = {
      name: 'express',
      task: 'echo "test"',
      range: '^2.0.0',
      filter: 'minor'
    }

    return Module.matchingSpec(spec).then(filtered => {
      filtered.length.should.equal(6)
      return Promise.all(filtered.map(module => {
        module.name.should.equal(spec.name)
        semver.satisfies(module.version, spec.range).should.equal(true)

        return Module.matchingSpec({
          name: 'express',
          task: 'echo "test"',
          range: `~${module.version}`
        }).then(versions => {
          versions.forEach(v => {
            semver.satisfies(v.version, `~${module.version}`).should.equal(true)
          })
        })
      }))
    })
  })

  it('should support function filter', () => {
    let spec = {
      name: 'express',
      task: 'echo "test"',
      range: '^2.0.0',
      filter: vers => vers.slice(0, 2)
    }

    return Module.matchingSpec(spec).then(filtered => {
      filtered.length.should.equal(2)
      filtered.forEach(module => {
        module.name.should.equal(spec.name)
        semver.satisfies(module.version, spec.range).should.equal(true)
      })
    })
  })

  //
  // Validators
  //

  function validateTest (spec, res) {
    res.name.should.equal(spec.name)
    res.status.should.equal(true)
    res.result.should.equal('test\n')
  }

  function validateVersionList (spec, res) {
    res.should.be.instanceof(Array)
    res.forEach(res => validateTest(spec, res))
  }

  function validateModuleList (spec, res) {
    res.should.be.instanceof(Array)
    res.forEach(res => validateVersionList(spec, res))
  }
})

function delay (n) {
  return new Promise((done) => setTimeout(() => done(n), n))
}
