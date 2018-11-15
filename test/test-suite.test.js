'use strict'

const Entity = require('../lib/entity')
const semver = require('semver')
const fs = require('fs')

describe('entity', function () {
  let nodule
  let spec

  this.timeout(20000)

  before(() => {
    spec = {
      name: 'ap',
      task: 'echo "test"',
      range: '*'
    }

    nodule = new Entity(spec, '0.2.0')
  })

  it('should discover satisfied versions', () => {
    return Entity.matchingSpec(spec).then(versions => {
      versions.forEach(nodule => {
        nodule.name.should.equal(spec.name)
        semver.satisfies(nodule.version, spec.range).should.equal(true)
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

    return Entity.matchingSpec(spec).then(versions => {
      versions.length.should.equal(possible.length)
      versions.forEach(nodule => {
        nodule.name.should.equal(spec.name)
        possible.should.containEql(nodule.version)
      })
    })
  })

  it('should uninstall', () => {
    return nodule.uninstall().then(() => {
      if (fs.existsSync(`node_nodules/${spec.name}`)) {
        throw new Error(`${spec.name} should have been uninstalled`)
      }
    })
  })

  it('should install', () => {
    return nodule.install().then(() => {
      let pkg = require('ap/package')
      pkg.version.should.equal('0.2.0')
    })
  })

  it('should move', () => {
    return nodule.move().then(() => {
      if ( ! fs.existsSync(`node_nodules/${spec.name}.moved`)) {
        throw new Error(`${spec.name} should have been moved`)
      }
    })
  })

  it('should restore', () => {
    return nodule.restore().then(() => {
      if ( ! fs.existsSync(`node_nodules/${spec.name}`)) {
        throw new Error(`${spec.name} should have been restored`)
      }
    })
  })

  it('should test', () => {
    return nodule.test().then(
      res => validateTest(spec, res)
    )
  })

  it('should test with install', () => {
    return nodule.testWithInstall().then(
      res => validateTest(spec, res)
    )
  })

  it('should test with versions', () => {
    return Entity.testWithVersions(spec).then(
      res => validateVersionList(spec, res)
    )
  })

  it('should test with nodule list', () => {
    return Entity.testTheseVersions([spec, spec]).then(
      res => validateEntityList(spec, res)
    )
  })

  it('should not fail to return result when failing a test', () => {
    let data = {
      name: 'ap',
      task: 'exit 1'
    }

    let mod = new Entity(data, '0.2.0')
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

    let mod = new Entity(data, '0.2.0')
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

    let mod = new Entity(data, '0.2.0')
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

    let mod = new Entity(data, '0.2.0')
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

    return Entity.matchingSpec(spec).then(filtered => {
      filtered.length.should.equal(2)
      return Promise.all(filtered.map(nodule => {
        nodule.name.should.equal(spec.name)
        semver.satisfies(nodule.version, spec.range).should.equal(true)

        return Entity.matchingSpec({
          name: 'express',
          task: 'echo "test"',
          range: `^${nodule.version}`
        }).then(versions => {
          versions.forEach(v => {
            semver.satisfies(v.version, `^${nodule.version}`).should.equal(true)
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

    return Entity.matchingSpec(spec).then(filtered => {
      filtered.length.should.equal(6)
      return Promise.all(filtered.map(nodule => {
        nodule.name.should.equal(spec.name)
        semver.satisfies(nodule.version, spec.range).should.equal(true)

        return Entity.matchingSpec({
          name: 'express',
          task: 'echo "test"',
          range: `~${nodule.version}`
        }).then(versions => {
          versions.forEach(v => {
            semver.satisfies(v.version, `~${nodule.version}`).should.equal(true)
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

    return Entity.matchingSpec(spec).then(filtered => {
      filtered.length.should.equal(2)
      filtered.forEach(nodule => {
        nodule.name.should.equal(spec.name)
        semver.satisfies(nodule.version, spec.range).should.equal(true)
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

  function validateEntityList (spec, res) {
    res.should.be.instanceof(Array)
    res.forEach(res => validateVersionList(spec, res))
  }
})

function delay (n) {
  return new Promise((done) => setTimeout(() => done(n), n))
}
