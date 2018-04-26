#!/usr/bin/env node
import minimist from 'minimist'
import Module from './'
import path from 'path'

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
  console.log("Usage:  alltheversions [args]...\n\nOptions:")

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

// Run tests
Module.testAllWithVersions(versions, reporter).then(modules => {
  let pass = 0
  let fail = 0
  modules.forEach(m => {
    m.results.forEach(r => {
      if (r.passed) {
        pass += 1
      } else {
        fail += 1
      }
    })
    console.log(m.name, 'passed:', pass, 'failed:', fail)
    m.passed = pass
    m.failed = fail
  })

  process.exit(listHasFails(modules) ? 1 : 0)
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

function modHasFails (mod) {
  return mod.failed > 0
}

function listHasFails (list) {
  return list.map(modHasFails).reduce((m, v) => m || v, false)
}
