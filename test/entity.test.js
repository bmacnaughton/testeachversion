'use strict'

const Entity = require('../lib/entity').Entity
const assert = require('assert')
const semver = require('semver')
const fs = require('fs')

describe('entity', function () {
  let nodule
  let badule

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
    const state = nodule.state

    return nodule.test().then(result => {
      const log = nodule.log.stdout
      assert(result === null, 'result must be null')
      assert(nodule.state === state, `state must be unchanged (${state})`)
      assert(!nodule.testStatus, 'testStatus must be falsey')
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
        const log = nodule.log
        assert(installed === true, 'installed must be true')
        assert(log.stdout && !log.stderr, 'install logs must be as expected')
        assert(nodule.state === 'tested', 'state must be "tested"')
        assert(nodule.testStatus === 'pass', 'testStatus must be "pass"')
      })
  })

  it('should set test to fail if the install fails', function () {
    const badule = new Entity('xyzzy', '9.9.9', 'true')
    let installFailedState = false

    badule.on('state', function(from, to, n) {
      if (to === 'install-failed') {
        installFailedState = true
      }
    })

    return badule.installAndTest()
      .then(r => {
        assert(installFailedState, 'the install-failed state event must be emitted')
        assert(r === badule, 'the return value must be the badule Entity')
        assert(r.installStatus === 'fail')
        assert(r.testStatus === 'fail')
      })
  })

  it('should handle a test that fails', function () {
    const state = nodule.state
    nodule.task = {command: 'false', args: []}
    // clear testStatus from previous test
    nodule.testStatus = undefined
    let succeeded = false
    return nodule.test()
      .then(r => {
        succeeded = true
      })
      .catch(e => {
        assert(nodule.state === state, `state must be ${state}`)
        assert(!nodule.testStatus, 'testStatus must be falsey')
        assert(e instanceof Error, 'e must be an instance of Error')
      })
      .then(r => {
        assert(succeeded === false, 'the test did not fail as it should')
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

  it('should correctly identify builtin modules', function () {
    const builtins = ['crypto', 'fs', 'http', 'https', 'zlib']
    builtins.forEach(b => {
      const bi = new Entity(b)
      assert(bi.builtin, `builtin must be true for ${b}`)
      assert(bi.task.command === 'true', `${b} must have the default command`)
    })
  })

  it('should support function tasks', function () {
    function result (status) {
      return {status}
    }
    let entity = new Entity('ap', '0.2.0', () => result(0))
    let failed = false

    return entity.test().then(res => {
      assert(res === null, 'the result should be null')
    })
    .then(() => {
      entity.task = () => result(1)
      return entity.test()
    })
    .catch(e => {
      assert(e instanceof Error, 'must fail with an Error')
      failed = true
    })
    .then(r => {
      assert(failed, 'must have failed')
    })
  })

  //
  // TODO BAM handle callbacks and promises.
  //
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
