#!/usr/bin/env node
import minimist from 'minimist'
import Module from './'
import Grouper from './grouper'
import path from 'path'
import {spawnSync} from 'child_process'

// Define CLI flags
const options = [{
  name: 'config',
  alias: 'c',
  description: 'Config file path',
  'default': './test/versions'
}, {
  name: 'package',
  alias: 'p',
  description: 'package names to test',
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
  name: 'help',
  alias: 'h',
  description: 'Show help information'
}]

// Parse process arguments
const argv = minimist(process.argv.slice(2), {
  'default': map('name', 'default'),
  alias: map('alias', 'name'),
  boolean: ['verbose', 'suppress']
})

// Show help text
if (argv.help) {
  console.log("Usage:  testeachversion [args]...\n\nOptions:")

  options.forEach(v => {
    let msg = pad(20, `  -${v.alias}, --${v.name}`)
    msg += `   ${v.description}`
    if (typeof v.default !== 'undefined') {
      msg += ` (default: ${v.default})`
    }
    console.log(msg)
  })
  return
}

// Load specified reporter
let reporter
try {
  reporter = require(`./reporters/${argv.reporter}`)({
    verbose: argv.verbose,
    suppress: argv.suppress
  })
} catch (e) {
  console.error(`Unknown reporter "${argv.reporter}"`)
  return
}

// Attempt to load versions file
let versions
try {
  versions = require(path.resolve(argv.config))
} catch (e) {
  console.error(`Unable to load version file "${argv.config}"`)
  return
}

// Support a single module spec without array wrapper
if (!Array.isArray(versions)) {
  versions = [versions]
}

// Allow scoping to a subset of packages
if (argv.package || argv.p) {
  let packages = []
  if (argv.packages) packages = packages.concat(argv.packages)
  if (argv.p) packages = packages.concat(argv.p)
  versions = versions.filter(version => ~packages.indexOf(version.name))
}

// If there is nothing to run, just exit
if (!versions.length) {
  console.error('No packages to run')
  return
}

// get the current git commit being tested if available
var commit
var results = spawnSync('git', ['rev-parse', 'HEAD'], {})
if (results.status || results.error) {
  let res = (results.stderr ? results.stderr : results.status).toString()
  commit = 'not available'
} else {
  commit = results.stdout.toString().slice(0, -1)
}

let identity
try {
  identity = require(path.resolve('./package.json'))
} catch (e) {
  identity = {name: 'not found', version: 'not found'}
}


//
// Run tests
//
let startTime = new Date().getTime()
Module.testAllWithVersions(versions, reporter).then(packages => {
  let exitStatus = 0

  failCheck:
  for (let i = 0; i < packages.length; i++) {
    for (let r = 0; r < packages[i].results.length; r++) {
      if (!packages[i].results[r].passed) {
        exitStatus = 1
        break failCheck
      }
    }
  }

  writeSummary(packages)

  process.exit(exitStatus)
})


function writeSummary(modules) {
  let totalFails = 0
  let endTime = new Date().getTime()

  // get total pass and fail count for each module and build
  // groups summary.
  modules.forEach(m => {
    // keep track of groups (sequential passes/fails)
    let grouper = new Grouper()
    let pass = 0
    let fail = 0
    m.results.forEach(r => {
      grouper.addItem(r.version, r.passed ? 'pass' : 'fail')
      if (r.passed) {
        pass += 1
      } else {
        fail += 1
        totalFails += 1
      }
    })
    m.summary = {
      package: m.name,
      latest: m.results[m.results.length - 1].version,
      passed: pass,
      failed: fail,
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
      node: process.version,
      package: identity.name,
      version: identity.version,
      commit: commit,
      timestamp: new Date(),
      startTime: startTime,
      endTime: endTime,
      totalFails: totalFails
    },
    packages: {}
  }

  modules.forEach(p => {
    summary.packages[p.name] = p.summary
  })

  console.log(JSON.stringify(summary, null, 2))
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

function pad (n, msg) {
  return msg + new Array(n - msg.length + 1).join(' ')
}
