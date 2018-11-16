'use strict'

const Entity = require('../lib/entity').Entity
const assert = require('assert')
const semver = require('semver')
const fs = require('fs')

describe('entity', function () {
  let nodule
  let badule
  let spec

  this.timeout(20000)

  const reporter = {}
  const pkg = {
    name: 'ap',
    task: 'echo "done"'
  }

  before(() => {
    nodule = new Entity('ap', '0.2.0', 'echo done')
    badule = new Entity('xyzzy', '9.9.9', 'false')
    // node -r xyzzy -e 'process.exit()'
  })

  it.skip('should uninstall', () => {
    return nodule.uninstall().then(() => {
      if (fs.existsSync(`node_nodules/${spec.name}`)) {
        throw new Error(`${spec.name} should have been uninstalled`)
      }
    })
  })

  it('should be at the initial state', function () {
    assert(nodule.state === 'initial', 'must be "initial"')
  })

  it('should install', () => {
    // little function to output info while developing
    nodule.on('state', function (from, to, n) {
      const {installStatus, testStatus} = n
      //console.log('state', n.toString(), from, ' => ', to, 'i', installStatus, 't', testStatus)
    })

    return nodule.install().then(r => {
      assert(r && r.length, 'an array of install results must be returned')
      assert(nodule.state === 'installed', 'state must be "installed"')
      assert(nodule.installStatus === 'pass', 'installStatus must be "pass"')
      assert(!nodule.log.stderr, 'log must be empty')
      let pkg = require('ap/package')
      assert(pkg.version === '0.2.0', 'ap/package version should be 0.2.0')
    })
  })


  it('should execute the test specified', () => {
    let log = ''
    nodule.on('state', function (from, to, n) {
      if (to === 'tested') {
        log = n.log.stdout
      }
    })
    return nodule.test().then(result => {
      assert(result === null, 'result must be null')
      assert(nodule.state === 'tested', 'state must be "tested"')
      assert(nodule.testStatus === 'pass', 'testStatus must be "pass"')
      assert(log === 'done\n', `result should have been "done" but was "${log}"`)
      return true
    })

  })


  it('should handle a failed installation', function () {
    let log = ''
    badule.on('state', function (from, to, n) {
      const {installStatus, testStatus} = n
      //console.log('state', n.toString(), from, ' => ', to, 'i', installStatus, 't', testStatus)
      if (to === 'install-failed') {
        log = n.log
      }
    })

    let error = false
    return badule.install()
      .then(() => {
        error = false
      })
      .catch(e => {
        error = true
        return e
      })
      .then(e => {
        assert(error === true, 'an error must be generated')
        assert(e instanceof Error, 'an instance of Error must be returned')
        assert(badule.state === 'install-failed', 'state must be "install-failed"')
        assert(badule.installStatus === 'fail', 'installStatus must be "fail"')
        assert(log, 'log must not be empty')
        return true
      })
  })


  it.skip('should test with install', () => {
    return nodule.testWithInstall().then(
      res => validateTest(spec, res)
    )
  })

  it.skip('should test with versions', () => {
    return Entity.testWithVersions(spec).then(
      res => validateVersionList(spec, res)
    )
  })

  it.skip('should test with nodule list', () => {
    return Entity.testTheseVersions([spec, spec]).then(
      res => validateEntityList(spec, res)
    )
  })

  it.skip('should not fail to return result when failing a test', () => {
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

  it.skip('should support function tasks', () => {
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

  it.skip('should support function tasks with callbacks', () => {
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

  it.skip('should support function tasks with promises', () => {
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





  it.skip('should support function filter', () => {
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
