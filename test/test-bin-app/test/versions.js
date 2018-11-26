'use strict'

const VS = require('testeachversion').VersionSpec

const packages = module.exports = []

test('ap')

//
// Helpers
//

function test (name, options = {}) {
  let ranges
  if (typeof options === 'string') {
    ranges = options
    options = {}
  } else if (options.ranges) {
    ranges = options.ranges
  }

  packages.push(new VS(name, {
    ranges,
    task: options.task || 'node index.js',
  }))
}
