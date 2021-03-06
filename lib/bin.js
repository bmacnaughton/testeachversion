#!/usr/bin/env node

//
// this is test-each-version.
//

/* eslint-disable no-console */

const minimist = require('minimist')
const TestSuite = require('./test-suite').TestSuite
const em = require('./emitter')
const Grouper = require('sequence-grouper')
const path = require('path')
const {spawnSync} = require('child_process')
const fs = require('fs')
const osInfo = require('linux-os-info')
const pkg = require('../package.json')


// get the linux name.
let linux
try {
  linux = osInfo({mode: 'sync'})
} catch (e) {
  linux = {id: 'unknown', version_id: 'unknown'}
  console.log('error fetching release info', e)
}

const ts = new Date().toISOString()

function makeLogName (type, ext) {
  let name = `${linux.id}-${linux.version_id}-node-${process.version}-${type}-${ts}`
  if (ext) {
    name += '.' + ext
  }
  return name
}

// Define CLI flags
const options = [{
  name: 'config',
  alias: 'c',
  description: 'Config file path',
  default: './test/versions'
}, {
  name: 'package',
  alias: 'p',
  description: 'package name to test (multiple allowed)',
}, {
  name: 'no-summary',
  alias: 'S',
  description: 'do not write summary file',
  default: false
}, {
  name: 'summary-file',
  description: 'summary file name',
  displayDefault: '<linux>-<version>-node-<version>-summary-<ts>.json',
  default: makeLogName('summary', 'json')
}, {
  name: 'no-details',
  alias: 'D',
  description: 'do not write details file',
  default: false
}, {
  name: 'details-file',
  description: 'details file name',
  displayDefault: '<linux>-<version>-node-<version>-details-<ts>',
  default: makeLogName('details')
}, {
  name: 'reporter',
  alias: 'r',
  description: 'Reporting style',
  default: 'spec'
}, {
  name: 'suppress',
  alias: 's',
  description: 'Suppress output of error text',
  default: true
}, {
  name: 'verbose',
  alias: 'V',
  description: 'Enable verbose logging',
  default: false
}, {
  name: 'downloads',
  alias: 'd',
  description: 'Display download counts',
  default: false
}, {
  name: 'log-directory',
  alias: 'l',
  description: 'Directory to write summary and detail logs',
  default: '.'
}, {
  name: 'version',
  alias: 'v',
  description: `show version (v${pkg.version})`
}, {
  name: 'latest-only',
  alias: 'L',
  description: 'Test only the latest version for each package specified',
  default: false,
}, {
  name: 'version-string',
  alias: 'vs',
  description: 'String to be inserted in summary file showing tested component versions',
  default: '',
}, {
  name: 'help',
  alias: 'h',
  description: 'Show help information'
}]

// Parse process arguments
const argv = minimist(process.argv.slice(2), {
  default: map('name', 'default'),
  alias: map('alias', 'name'),
  boolean: ['verbose', 'suppress', 'no-summary']
})

// Show help text
if (argv.help) {
  console.log('Usage: testeachversion [args]...\n\nOptions [default]:');

  options.forEach(o => {
    let alias = ''
    if (o.alias !== undefined) {
      alias = `-${o.alias}, `
    }
    let msg = padEnd(20, `  ${alias}--${o.name}`)
    msg += `   ${o.description}`
    const defaultValue = o.displayDefault || o.default;
    if (typeof defaultValue !== 'undefined') {
      msg += ` [${defaultValue}]`
    }
    console.log(msg)
  })
  process.exit();
}

if (argv.version) {
  console.log(`testeachversion v${pkg.version}`)
  process.exit();
}

// Load specified reporter. negate suppress because it is true
// if not specified.
//let reporter;
//try {
//  reporter = require(`./reporters/${argv.reporter}`)(em, {
//    verbose: argv.verbose,
//    suppress: argv.suppress,
//    showSkips: !argv['latest-only'],               // don't show skips if latest only.
//  })
//} catch (e) {
//  const args = [`Unknown reporter "${argv.reporter}"`]
//  if (argv.verbose) {
//    args.push(e)
//  }
//  console.error(...args)
//  // just to make the eslint error go away in case i ever implement
//  // reporters.
//  process.exit(1);
//}

// Attempt to load versions file
let versions
try {
  versions = require(path.resolve(argv.config))
} catch (e) {
  const args = [`Unable to load versions file "${path.resolve(argv.config)}"`]
  if (argv.verbose) {
    args.push(e)
  }
  console.error(...args)
  process.exit(1);
}

// Support a single module spec without array wrapper
if (!Array.isArray(versions)) {
  versions = [versions]
}
// N.B. this refers to packages as entities. why?
// because package is a reserved word in strict
// mode and entity isn't. The class is Entity
// and when you see entity it refers to a package.
// packages and modules are similar so it might make
// sense to think of them as the same thing.

// Allow specifying a subset of packages to test
if (argv.package) {
  const packages = [].concat(argv.package)
  versions = versions.filter(version => ~packages.indexOf(version.name))
}

// If there is nothing to run, just exit
if (!versions.length) {
  console.error('arguments:', process.argv.slice(2).join(' '))
  console.error('No packages to run')
  process.exit(1);
}

// TODO BAM integrate downloads into header data
if (argv.downloads) {
  // https://api.npmjs.org/downloads/point/last-month/levelup
  // https://github.com/npm/registry/blob/master/docs/download-counts.md
  // fetch all at once: /downloads/point/last-day/npm,express
}

// just mark the version spec as latestOnly now.
if (argv['latest-only']) {
  versions.forEach(v => v.latestOnly = true);
}

function info (msg) {
  em.emit('info', msg)
}

let identity
try {
  identity = require(path.resolve('./package.json'))
} catch (e) {
  info('cannot read ./package.json')
  identity = {name: 'test-each-version', version: 'not found'}
}

/*
let agent;
try {
  agent = require('appoptics-apm/package.json');
} catch (e) {
  info('cannot read appoptics-apm/package.json');
  agent = {name: 'appoptics-apm', version: 'not found'};
}

let bindings;
try {
  bindings = require('appoptics-bindings/package.json');
} catch (e) {
  info('cannot read appoptics-bindings/package.json');
  bindings = {name: 'appoptics-bindings', version: 'not found'};
}

let oboe;
try {
  const bpath = `${path.dirname(require.resolve('appoptics-bindings/package.json'))}/oboe/VERSION`;
  const version = fs.readFileSync(bpath, 'utf8').slice(0, -1);
  oboe = {name: 'oboe', version};
} catch (e) {
  info(`error ${e.code} ${e.message}`);
  oboe = {name: 'oboe', version: 'not found'};
}
// */

// get the branch being tested
info('fetching git branch')
let branch
// git rev-parse --abbrev-ref HEAD
let results = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
if (results.status || results.error) {
  //const res = (results.stderr ? results.stderr : results.status).toString()
  branch = 'not available'
} else {
  branch = results.stdout.toString().slice(0, -1)
}

// and the commit
info('fetching git commit')
let commit
results = spawnSync('git', ['rev-parse', 'HEAD'], {})
if (results.status || results.error) {
  //const res = (results.stderr ? results.stderr : results.status).toString()
  commit = 'not available'
} else {
  // remove newline.
  commit = results.stdout.toString().slice(0, -1)
}
info('git commit is ' + commit)

//
// try to get some information on errors.
//
process.on('uncaughtException', function (e) {
  console.error(e)
  process.exit(1)
})

//
// unless no details file is specified open a stream
// to the details file.
//
let stdio
let detailsFile
let opened
if (!argv.D) {
  const options = {
    flags: 'w',
    defaultEncoding: 'utf8',
    mode: 0o664,
  }
  const detailsPath = path.join(argv['log-directory'], argv['details-file'])
  detailsFile = fs.createWriteStream(detailsPath, options)

  opened = new Promise(function (resolve, reject) {
    function resolver () {
      stdio = [null, detailsFile, detailsFile]
      info('stdout and stderr directed to details file ' + argv['details-file'])
      resolve()
    }
    detailsFile.on('open', resolver).on('error', reject)
  })
} else if (typeof argv.D === 'string') {
  stdio = argv.D
  opened = Promise.resolve()
  info('spawnSync stdio set to ' + stdio)
}

//
// Run tests
//
const startTime = new Date().getTime()

opened.then(function () {
  // now that stdio streams are set create the test suite.
  const suite = new TestSuite(versions, {stdio})

  suite.runTestSuite().then(packages => {
    let exitStatus = 0

    failCheck:
    for (let i = 0; i < packages.length; i++) {
      for (let r = 0; r < packages[i].results.length; r++) {
        if (packages[i].results[r].testStatus === 'fail') {
          exitStatus = 1
          break failCheck
        }
      }
    }

    if (!argv['no-summary']) {
      const summaryPath = path.join(argv['log-directory'], argv['summary-file'])
      const fd = fs.openSync(summaryPath, 'w', 0o664)
      writeSummary(fd, packages)
      fs.closeSync(fd)
    }

    if (detailsFile) {
      detailsFile.end(function () {
        process.exit(exitStatus)
      })
    }

    process.exit(exitStatus)
  })
})


function writeSummary (fd, modules) {
  let totalFails = 0
  const endTime = new Date().getTime()

  // get total pass and fail count for each module and build
  // groups summary.
  modules.forEach(m => {
    // keep track of groups (sequential passes/fails)
    const grouper = new Grouper()
    let pass = 0
    let fail = 0
    let skip = 0
    m.results.forEach(r => {
      grouper.addItem(r.version, r.testStatus)
      if (r.testStatus === 'pass') {
        pass += 1
      } else if (r.testStatus === 'fail') {
        fail += 1
        totalFails += 1
      } else if (r.testStatus === 'skip') {
        skip += 1
      } else {
        console.error('unexpected testStatus:', r.testStatus)
      }
    })
    m.summary = {
      package: m.name,
      latest: m.results[m.results.length - 1].version,
      passed: pass,
      failed: fail,
      skipped: skip,
      ranges: grouper.groups
    }
  })
  modules.sort(function (a, b) {
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return 0
  })

  // build overall summary documenting the test
  const summary = {
    meta: {
      summaryVersion: 1,
      node: process.version,
      linux: linux,
      package: identity.name,
      version: identity.version,
      versions: argv['version-string'],
      branch: branch,
      commit: commit,
      timestamp: ts,
      startTime: startTime,
      endTime: endTime,
      totalFails: totalFails
    },
    packages: {}
  }

  modules.forEach(p => {
    summary.packages[p.name] = p.summary
  })

  // let's try fs.write instead of console.log
  const string = JSON.stringify(summary, null, 2)
  fs.writeSync(fd, '\n')
  const n = fs.writeSync(fd, string)
  fs.writeSync(fd, '\n')
  // bad test. returns bytes written. but i don't think
  // we have any multibyte characters, so should work.
  if (n !== string.length) {
    console.error('error writing JSON')
  }
}

//
// Helpers
//
function map (key, val) {
  const res = {}
  options.forEach(option => {
    res[option[key]] = option[val]
  })
  return res
}

function padEnd (n, msg) {
  let len = n - msg.length + 1
  if (len < 0) {
    len = 0
  }
  return msg + ' '.repeat(len)
}
