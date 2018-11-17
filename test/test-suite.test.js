'use strict'

const TestSuite = require('../lib/test-suite').TestSuite
const semver = require('semver')
const assert = require('assert')
const getVersions = require('../lib/get-versions')

// fetch the example versions file.
const versions = require('./versions')

describe('test-suite', function () {
  let suite
  const stdio = [0, 1, 2]
  const hooks = {}
  const options = {stdio, hooks}

  this.timeout(20000)

  it('should construct a test suite using the versions file', function () {
    suite = new TestSuite(versions, options)
  })

  it('should make an entity from an existing package', function () {
    const bim = suite.makeEntityForExistingPackage('builtin-modules')
    assert(bim.version === '3.0.0')
    assert(bim.stdio === stdio, 'stdio should be correct')
  })

  it('should fetch matching versions', function () {
    return getVersions('ap')
      .then(versions => {
        assert(versions.length === 3, 'there should be 3 versions of "ap"')
        assert.deepEqual(versions, ['0.2.0', '0.1.0', '0.0.1'], 'fetched "ap" versions must match')
      })
  })

  const expected = ["0.0.1", "0.0.2", "0.1.0", "0.1.1", "0.1.2", "0.1.3", "0.2.0", "0.2.1", "0.3.0", "0.3.1", "0.3.2", "0.4.0", "0.4.1", "0.4.2", "0.5.0", "0.5.1", "0.5.2"]
  const skips = {"0.0.1": true, "0.0.2": true, "0.1.0": true, "0.1.1": true, "0.1.2": true, "0.1.3": true, "0.5.0": true}
  const amqplib = TestSuite.makeVersionSpec('amqplib', '>= 0.2.0 < 0.5.0 || > 0.5.0', 'true')

  //
  // the following checks cover a great deal of Entity internals as well
  // as TestSuite functions. There is not really any way to test individual
  // TestSuite functions without verifying that the resulting Entitys are
  // correct.
  //
  it('should convert versions to entities', function () {
    return suite.mapMatchingVersionsToEntities(amqplib)
      .then(entities => {
        assert(entities.length === 17, 'there should be 17 amqplib entities')
        entities.every((en, ix) => {
          assert(en.name === 'amqplib', 'name must be amqplib')
          assert(en.builtin === false, 'builtin must not be true')
          const shouldSkip = skips[en.version]
          assert(en.skip === shouldSkip, 'skipped versions must be correct')
          assert(en.version === expected[ix], 'versions must match')
        })
        return entities
      })
  })

  it('should test the correct versions', function () {
    hooks.entityMapper = function (entity) {
      return entity
    }
    suite.on('state', function (from, to, n) {
      if (to === 'tested') {
        //console.log(n.toString(), to, n.testStatus)
      }
    })
    return suite.testVersionsOfEntity(amqplib).then(vspec => {
      vspec.results.forEach(r => {
        const expected = r.version in skips ? 'skip' : 'pass'
        assert(r.testStatus === expected, `${r} found ${r.testStatus} but expected ${expected}`)
      })
      delete hooks.entityMapper
      return vspec
    })
  })

  it('should test a built-in module correctly', function () {
    const fs = TestSuite.makeVersionSpec('fs', '', 'true')

    return suite.testVersionsOfEntity(fs)
      .then(vspec => {
        assert(vspec.results.length === 1, 'there should only be 1 version of "fs"')
        const r = vspec.results[0]
        assert(r.state === 'tested', '"fs" state must be "tested"')
        assert(r.testStatus === 'pass', '"fs" testStatus must be "pass"')
        return vspec
      })
      .then(() => {
        // switch the test to fail
        fs.task = 'false'
        return suite.testVersionsOfEntity(fs)
      })
      .then(vspec => {
        assert(vspec.results.length === 1, 'there should only be 1 version of "fs"')
        const r = vspec.results[0]
        assert(r.state === 'tested', '"fs" state must be "tested"')
        assert(r.testStatus === 'fail', '"fs" testStatus must be "fail"')
        return vspec
      })

  })

  // node -e 'process.exit(require("ap/package").version !== "0.2.1")'

  it.skip('should discover satisfied versions', () => {
    return Entity.matchingSpec(spec).then(versions => {
      versions.forEach(nodule => {
        nodule.name.should.equal(spec.name)
        semver.satisfies(nodule.version, spec.range).should.equal(true)
      })
    })
  })

  it.skip('should discover satisfied versions from array range', () => {
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
