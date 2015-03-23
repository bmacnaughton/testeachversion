#!/usr/bin/env node
import minimist from 'minimist'
import Module from './'
import path from 'path'

// Define CLI flags
var options = [{
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
var argv = minimist(process.argv.slice(2), {
  'default': map('name', 'default'),
  alias: map('alias', 'name'),
  boolean: ['verbose']
})

// Show help text
if (argv.help) {
  console.log("Usage:  alltheversions [args]...\n\nOptions:")

  options.forEach((v) => {
    var msg = pad(20, `  -${v.alias}, --${v.name}`)
    msg += `   ${v.description}`
    if (typeof v.default !== 'undefined') {
      msg += ` (default: ${v.default})`
    }
    console.log(msg)
  })
  return
}

// Load specified reporter
var reporter
try {
  reporter = require(`./reporters/${argv.reporter}`)({
    verbose: argv.verbose
  })
} catch (e) {
  console.error(`Unknown reporter "${argv.reporter}"`)
  return
}

// Attempt to load versions file
var versions
try {
  versions = require(path.resolve(argv.config))
} catch (e) {
  console.error(`Unable to load version file "${argv.config}"`)
  return
}

// Support a single module spec without array wrapper
if ( ! Array.isArray(versions)) {
  versions = [versions]
}

// Allow scoping to a particular named module
if (argv.module) {
  versions = versions.filter((version) => version.name === argv.module)
}

// If there is nothing to run, just exit
if ( ! versions.length) {
  console.error('No modules specs to run')
  return
}

// Run tests
Module.testAllWithVersions(versions, reporter).then((modules) => {
  console.log('\ndone')
  process.exit(listHasFails(modules) ? 1 : 0)
})

//
// Helpers
//
function map (key, val) {
  var res = {}
  options.forEach((option) => {
    res[option[key]] = option[val]
  })
  return res
}

function pad (n, msg) {
  return msg + new Array(n - msg.length + 1).join(' ')
}

function versionFails (v) {
  return ! v.passed
}

function modHasFails (mod) {
  return mod.filter(versionFails).length > 0
}

function listHasFails (list) {
  return list.map(modHasFails).reduce((m, v) => m || v, false)
}
