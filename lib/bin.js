#!/usr/bin/env node
import minimist from 'minimist'
import Module from './'
import path from 'path'
import Grouper from './grouper'

// Define CLI flags
const options = [{
  name: 'config',
  alias: 'c',
  description: 'Config file path',
  'default': './test/versions'
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

// Allow scoping to a particular named module
if (argv.module) {
  versions = versions.filter(version => version.name === argv.module)
}

// If there is nothing to run, just exit
if (!versions.length) {
  console.error('No modules specs to run')
  return
}

let startTime = new Date().getTime()
// Run tests
Module.testAllWithVersions(versions, reporter).then(modules => {
  let totalFails = 0
  let endTime = new Date().getTime()
  // get total pass and fail count for each module and output
  // groups summary as a JSON array.
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
      passed: pass,
      failed: fail,
      ranges: grouper.groups
    }
  })
  modules.sort(function (a, b) {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  })
  // document the run with JSON but make each item start on a new
  // line for human readability.
  let summary = [JSON.stringify({
    meta: 'node',
    version: process.version,
    timestamp: new Date(),
    startTime: startTime,
    endTime: endTime
  })]
  summary = summary.concat(modules.map(m => JSON.stringify(m.summary)))
  summary = ['[', summary.join(',\n'), ']'].join('\n')
  console.log(summary)

  process.exit(totalFails === 0 ? 0 : 1)
})

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
