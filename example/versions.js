'use strict'

const VersionSpec = require('testeachversion').VersionSpec
const packages = module.exports = []

//
// using a minimum version can avoid testing versions
// known to fail or deprecated, speeding the test.
//
test('amqplib', '>= 0.2.0 < 0.5.0 || > 0.5.0')

test('bcrypt', '>= 0.8.6')
test('bluebird')

test('cassandra-driver', '>= 3.3.0')
test('co-render')
test('director', '>= 1.1.10')
test('express', '>= 3.0.0')

test('generic-pool', '>= 2.4.0')

test('hapi', {
  ranges: [
    {
      range: '>= 9.0.1 < 17.0.0',
      dependencies: ['vision@4'],
    }, {
      range: '>= 17.0.0',
      dependencies: ['vision@5'],
    }
  ]
})

test('koa-resource-router')
test('koa-route', '>= 1.0.1')
test('koa-router', '>= 1.6.0')
test('koa')
test('level', '>= 1.0.0')
test('memcached', '>= 2.2.0')

test('mongodb-core', '>= 2.0.0')

test('mongoose', '>= 2.2.1 < 4.2 || >= 4.2.2')

test('mysql', '>= 2.0.0')
test('oracledb', '>=2.0.0')

test('pg', '>= 2.8.4')
test('q', '>= 0.9.0')
test('raw-body')
test('redis', '>= 0.8.0')
test('restify', '>= 2.0.0 < 2.0.2 || >= 2.0.3')
test('tedious', '>= 0.1.5')

test('vision', {
  ranges: [
    {
      range: '>= 4.0.0 < 5.0.0',
      dependencies: ['hapi@16']
    }, {
      range: '>= 5.0.0',
      dependencies: ['hapi@17']
    }
  ]
})


//
// Helpers
//

function test (name, ranges, task) {
  task = task || './node_modules/gulp/bin/gulp.js test:probe:' + name
  packages.push(VersionSpec(name, {task, ranges}))
}
