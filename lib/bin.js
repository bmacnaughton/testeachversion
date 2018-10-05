#!/usr/bin/env node
const minimist = require('minimist')
const Entity = require('./')
const Grouper = require('./grouper')
const path = require('path')
const {spawnSync} = require('child_process')
const fs = require('fs')
const osInfo = require('linux-os-info')
const pkg = require('../package.json')


// get the linux name.
var linux
try {
  linux = osInfo({mode: 'sync'})
} catch (e) {
  linux = {id: 'unknown', version_id: 'unknown'}
  console.log('error fetching release info', e)
}

let ts = new Date().toISOString()

function makeLogName(type, ext) {
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
  'default': 'spec'
}, {
  name: 'suppress',
  alias: 's',
  description: 'Suppress output of error text',
  default: true
}, {
  name: 'verbose',
  alias: 'v',
  description: 'Enable verbose logging',
  'default': false
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
  description: 'show version'
}, {
  name: 'help',
  alias: 'h',
  description: 'Show help information'
}]

// Parse process arguments
const argv = minimist(process.argv.slice(2), {
  default: map('name', 'default'),
  alias: map('alias', 'name'),
  boolean: ['verbose', 'suppress', 'no-details', 'no-summary']
})

// Show help text
if (argv.help) {
  console.log("Usage: testeachversion [args]...\n\nOptions [default]:")

  options.forEach(o => {
    let alias = ''
    if (o.alias !== undefined) {
      alias = `-${o.alias}, `
    }
    let msg = padEnd(20, `  ${alias}--${o.name}`)
    msg += `   ${o.description}`
    let defaultValue = o.displayDefault || o.default
    if (typeof defaultValue !== 'undefined') {
      msg += ` [${defaultValue}]`
    }
    console.log(msg)
  })
  return
}

if (argv.version) {
  console.log('testeachversion version', pkg.version)
}

// Load specified reporter. negate suppress because it is true
// if not specified.
let reporter
try {
  reporter = require(`./reporters/${argv.reporter}`)({
    verbose: argv.verbose,
    suppress: argv.suppress
  })
} catch (e) {
  console.error(`Unknown reporter "${argv.reporter}"`, e)
  return
}

// Attempt to load versions file
let versions
try {
  versions = require(path.resolve(argv.config))
} catch (e) {
  console.error(`Unable to load versions file "${argv.config}"`)
  return
}

// Support a single module spec without array wrapper
if (!Array.isArray(versions)) {
  versions = [versions]
}
// N.B. this refers packages as entities. why?
// because package is a reserved word in strict
// mode and entity isn't. The class is Entity
// and when you see entity it refers to a package.
// packages and modules are similar so it might make
// sense to think of them as the same thing.

// Allow specifying a subset of packages to test
if (argv.package) {
  let packages = [].concat(argv.package)
  versions = versions.filter(version => ~packages.indexOf(version.name))
}

// If there is nothing to run, just exit
if (!versions.length) {
  console.error('arguments:', process.argv.slice(2).join(' '))
  console.error('No packages to run')
  return
}

// TODO BAM integrate downloads into header data
if (argv.downloads) {
  // https://api.npmjs.org/downloads/point/last-month/levelup
  // https://github.com/npm/registry/blob/master/docs/download-counts.md
  // fetch all at once: /downloads/point/last-day/npm,express
}

function info (msg) {
  reporter.emit('info', msg)
}

let identity
try {
  identity = require(path.resolve('./package.json'))
} catch (e) {
  info('cannot read ./package.json')
  identity = { name: 'not found', version: 'not found' }
}

// get the branch being tested
info('fetching git branch')
let branch
// git rev-parse --abbrev-ref HEAD
results = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
if (results.status || results.error) {
  let res = (results.stderr ? results.stderr : results.status).toString()
  branch = 'not available'
} else {
  branch = results.stdout.toString().slice(0, -1)
}

// and the commit
info('fetching git commit')
let commit
let results = spawnSync('git', ['rev-parse', 'HEAD'], {})
if (results.status || results.error) {
  let res = (results.stderr ? results.stderr : results.status).toString()
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
if (!argv.D) {
  let options = {
    flags: 'w',
    defaultEncoding: 'utf8',
    mode: 0o664,
  }
  var detailsPath = path.join(argv['log-directory'], argv['details-file'])
  detailsFile = fs.createWriteStream(detailsPath, options)
  stdio = [null, detailsFile, detailsFile]
  info('opened details file ' + argv['details-file'])
}

//
// Run tests
//
let startTime = new Date().getTime()
Entity.testTheseVersions(versions, reporter, stdio).then(packages => {
  let exitStatus = 0

  failCheck:
  for (let i = 0; i < packages.length; i++) {
    for (let r = 0; r < packages[i].results.length; r++) {
      if (packages[i].results[r].status === 'failed') {
        exitStatus = 1
        break failCheck
      }
    }
  }

  if (!argv['no-summary']) {
    let summaryPath = path.join(argv['log-directory'], argv['summary-file'])
    let fd = fs.openSync(summaryPath, 'w', 0o664)
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


function writeSummary(fd, modules) {
  let totalFails = 0
  let endTime = new Date().getTime()

  // get total pass and fail count for each module and build
  // groups summary.
  modules.forEach(m => {
    // keep track of groups (sequential passes/fails)
    let grouper = new Grouper()
    let pass = 0
    let fail = 0
    let skip = 0
    m.results.forEach(r => {
      grouper.addItem(r.version, r.status)
      if (r.status === 'pass') {
        pass += 1
      } else if (r.status === 'fail') {
        fail += 1
        totalFails += 1
      } else if (r.status === 'skip') {
        skip += 1
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
  let summary = {
    meta: {
      summaryVersion: 1,
      node: process.version,
      linux: linux,
      package: identity.name,
      version: identity.version,
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
  let string = JSON.stringify(summary, null, 2)
  fs.writeSync(fd, '\n')
  let n = fs.writeSync(fd, string)
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
