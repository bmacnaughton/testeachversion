#!/usr/bin/env node
import {EventEmitter} from 'events'
import indent from 'indent-string'
import minimist from 'minimist'
import Module from './module'
import path from 'path'

var argv = minimist(process.argv.slice(2), {
  'default': {
    config: './test/versions'
  },
  alias: {
    c: 'config',
  }
})

var versions
try {
  versions = require(path.resolve(argv.config))
} catch (e) {
  console.error(e.message)
  return
}

if ( ! Array.isArray(versions)) {
  versions = [versions]
}

var ev = new EventEmitter
var currentModule = ''

function result (passed) {
  return '\u001b[' + (passed ? '32m✓' : '31m✖') + '\u001b[0m'
}

ev.on('test', (mod) => {
  if (mod.name !== currentModule) {
    currentModule = mod.name
    console.log(`\n${mod.name}`)
  }
  console.log(`  ${result(mod.passed)} ${mod.version}`)

  if ( ! mod.passed) {
    console.log(`\n${indent(mod.error.stack, ' ', 4)}\n`)
  }
})

Module.testAllWithVersions(versions, ev).then((results) => {
  console.log('\ndone')
})
