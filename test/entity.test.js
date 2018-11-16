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

  before(() => {
    nodule = new Entity('ap', '0.2.0', 'echo done')
    badule = new Entity('xyzzy', '9.9.9', 'false')
    // node -r xyzzy -e 'process.exit()'
  })

  it('should be at the initial state', function () {
    assert(nodule.state === 'initial', 'must be "initial"')
  })

  it('should uninstall the entity', () => {
    return nodule.uninstallEntity().then(() => {
      if (fs.existsSync(`node_nodules/${nodule.name}`)) {
        throw new Error(`${nodule.name} should have been uninstalled`)
      }
      assert(nodule.state === 'uninstalled', 'state must be "uninstalled"')
      assert(nodule.uninstallStatus === 'pass', 'uninstallStatus must be "pass"')
      assert(!nodule.log.stderr, 'stderr log must be empty')
    })
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
      assert(!nodule.log.stderr, 'stderr log must be empty')
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

  it('should install and test', function () {
    let installLog = ''
    let testLog = ''
    let installed = false

    nodule.on('state', function (from, to, n) {
      if (to === 'installed' && n.installStatus === 'pass') {
        installed = true
        installLog = n.log
      } else if (to === 'tested') {
        testLog = n.log
      }
    })

    return nodule.installAndTest()
      .then(r => {
        assert(installed === true, 'installed must be true')
        assert(installLog.stdout && !installLog.stderr, 'install logs must be as expected')
        assert(nodule.state === 'tested', 'state must be "tested"')
        assert(nodule.testStatus === 'pass', 'testStatus must be "pass"')
        assert(!testLog.stdout && !testLog.stderr, 'test logs must be empty')
      })
  })

  it('should handle a test that fails', function () {
    nodule.task = {command: 'false', args: []}
    let succeeded = false
    return nodule.test()
      .then(r => {
        succeeded = true
      })
      .catch(e => {
        assert(nodule.state === 'tested', 'state must be "tested"')
        assert(nodule.testStatus === 'fail', 'testStatus must be "fail"')
        assert(e instanceof Error, 'e must be an instance of Error')
      })
      .then(r => {
        assert(succeeded === false, 'the test must have failed')
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


  //
  // consider adding function tasks again
  //
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
})

function delay (n) {
  return new Promise((done) => setTimeout(() => done(n), n))
}
