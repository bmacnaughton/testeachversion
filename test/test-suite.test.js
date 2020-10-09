const TestSuite = require('../lib/test-suite').TestSuite
const Entity = require('../lib/entity').Entity;
const semver = require('semver')
const assert = require('assert')
const getVersions = require('../lib/get-npm-versions')
const VS = require('../lib/version-spec')

const getPackageVersions = require('npm-package-versions')

const fs = require('fs')

// fetch the example versions file.
const versions = require('./versions-ao-apm')

describe('test-suite', function () {
  let suite
  let stdio
  const hooks = {}
  const logpath = 'suite.log'

  this.timeout(40000)

  // setup using the current ranges of amqplib. if there start to be too many and it takes to much time adjust
  // to only check a shorter range.
  let expected
  const skips = {'0.0.1': true, '0.0.2': true, '0.1.0': true, '0.1.1': true, '0.1.2': true, '0.1.3': true, '0.5.0': true}
  const amqplib = new VS('amqplib', {
    ranges: '>= 0.2.0 < 0.5.0 || > 0.5.0',
    task: 'true'
  })
  before(function (done) {
    getPackageVersions('amqplib', function (err, versions) {
      expected = versions
      done()
    })
  })


  it('should construct a test suite using the versions file', function () {
    const streamOpts = {
      flags: 'w',
      defaultEncoding: 'utf8',
      mode: 0o664,
    }
    const logstream = fs.createWriteStream(logpath, streamOpts)

    return new Promise(function (resolve, reject) {
      function resolver () {
        stdio = [null, logstream, logstream]
        resolve()
      }
      logstream.on('open', resolver).on('error', reject)
    }).then(() => {
      suite = new TestSuite(versions, {stdio, hooks})
    })

  })

  it('should make an entity from an existing package', function () {
    const expectedVersion = require('builtin-modules/package.json').version;
    const bim = suite.makeEntityForExistingPackage('builtin-modules')
    assert(bim.version === expectedVersion);
    assert(bim.stdio === stdio, 'stdio should be correct')
  })

  it('should fetch matching versions', function () {
    return getVersions('ap')
      .then(versions => {
        assert(versions.length === 3, 'there should be 3 versions of "ap"')
        assert.deepEqual(versions, ['0.2.0', '0.1.0', '0.0.1'], 'fetched "ap" versions must match')
      })
  })

  let lastAmqplib

  //
  // the following checks cover a great deal of Entity internals as well
  // as TestSuite functions. There is not really any way to test individual
  // TestSuite functions without verifying that the resulting Entitys are
  // correct.
  //
  it('should convert versions to entities', function () {
    return suite.mapMatchingVersionsToEntities(amqplib)
      .then(entities => {
        const expLen = expected.length;
        assert(entities.length === expLen, `found ${entities.length} amqplib entities, expected ${expLen}`)
        entities.every((en, ix) => {
          assert(en.name === 'amqplib', 'name must be amqplib')
          assert(en.builtin === false, 'builtin must not be true')
          const shouldSkip = skips[en.version]
          assert(en.skip === shouldSkip, 'skipped versions must be correct')
          assert(en.version === expected[ix], 'versions must match')
        })
        lastAmqplib = entities[entities.length - 1]
        return entities
      })
  })

  it('should uninstall amqplib', function () {
    return lastAmqplib.uninstall()
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

  it('should test only test one version with the --latest-only option', function () {
    hooks.entityMapper = function (entity) {
      return entity;
    };
    const ap = new VS('ap', {task: 'true'});
    ap.latestOnly = true;
    const expected = ['skip', 'skip', 'pass'];
    return suite.testVersionsOfEntity(ap)
      .then(vspec => {
        assert(vspec.results.length === 3, 'there should be 3 results');
        vspec.results.forEach((r, ix) => {
          assert(r.testStatus === expected[ix], `${ix}: found ${r.testStatus}, expected: ${expected[ix]}`);
        });
        delete hooks.entityMapper;
        return vspec;
      });
  });

  it('should test a built-in module correctly', function () {
    const fs = new VS('fs', {task: 'true'})

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

  it('should allow function tasks for modules and builtin modules', function () {
    // ap is an existing package with only 3 versions that is not likely to ever
    // have another version. the three versions are 0.0.1, 0.1.0, and 0.2.0.
    let count = 0
    function fsFunc (entity) {
      assert(entity.name === 'fs')
      count += 1
      return {status: 0}
    }
    function apFunc (entity) {
      assert(entity.name === 'ap')
      count += 1
      // make odd patch versions fail
      return {status: entity.version.slice(-1) & 1}
    }
    const apExpected = ['fail', 'pass', 'pass']

    const fs = new VS('fs', {task: fsFunc})
    const ap = new VS('ap', {task: apFunc})

    return suite.testVersionsOfEntity(fs)
      .then(vspec => {
        assert(count === 1, 'fsFunc() test should be called 1 time')
        count = 0
        assert(vspec.results.length === 1, 'there should be only 1 result for "fs"')
        return suite.testVersionsOfEntity(ap)
      })
      .then(vspec => {
        assert(count === 3, 'apFunc() test should be called 3 times')
        assert(vspec.results.length === 3, 'there should be 3 results for "ap"')
        vspec.results.forEach((r, i) => {
          assert(r.testStatus === apExpected[i], `"ap" test ${i} must be ${apExpected[i]}`)
        })
      })
      .catch(e => {
        console.log(e); // eslint-disable-line no-console
      })
  })

  // node -e 'process.exit(require("ap/package").version !== "0.2.1")'

  it.skip('should discover satisfied versions', () => {
    const spec = 'must create a valid spec';
    return Entity.matchingSpec(spec).then(versions => {
      versions.forEach(nodule => {
        nodule.name.should.equal(spec.name)
        semver.satisfies(nodule.version, spec.range).should.equal(true)
      })
    })
  })

  it.skip('should discover satisfied versions from array range', () => {
    const possible = [
      '4.9.7',
      '4.9.8',
      '4.10.0',
      '4.10.1'
    ]

    const spec = {
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
    const spec = {
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

  // eslint-disable-next-line no-unused-vars
  function validateEntityList (spec, res) {
    res.should.be.instanceof(Array)
    res.forEach(res => validateVersionList(spec, res))
  }
})

// eslint-disable-next-line no-unused-vars
function delay (n) {
  return new Promise((done) => setTimeout(() => done(n), n))
}
