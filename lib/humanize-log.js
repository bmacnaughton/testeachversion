#!/usr/bin/env node
'use strict'

//
// read testeachversion's summary file and
// display a text representation of it.
//

const minimist = require('minimist')
const fs = require('fs')
const path = require('path')
const Grouper = require('./grouper')

const jsonSummaryPattern = /(?:.*\/)(.+-.+)-node-v(.+)-summary-(.+)\.json/

//
// define the CLI options and parse the command line
//

// Define CLI flags
const options = [{
  name: 'duplicates',
  alias: 'D',
  description: 'allow duplicate os-node-version matches',
  default: false
}, {
  name: 'all',
  alias: 'a',
  description: 'output passes, fails, and skips, not just passes',
  default: false
}]

// helper to create minimist options
function map (key, val) {
  const result = {}
  options.forEach(option => {
    result[option[key]] = option[val]
  })
  return result
}

// Parse process arguments
const argv = minimist(process.argv.slice(2), {
  default: map('name', 'default'),
  alias: map('alias', 'name'),
  boolean: ['duplicates', 'all']
})

if (argv._.length < 1) {
  console.error('usage:')
  console.error('    humanize: path [...path]')
  console.error('')
  console.error('Path may be repeated and each may be either a directory or a file')
  process.exit(1)
}

function getFiles (fileOrDir) {
  const p = new Promise(function (resolve, reject) {
    fs.stat(fileOrDir, function (err, stats) {
      if (err) {
        reject(err)
        return
      }

      if (stats.isFile()) {
        resolve([fileOrDir])
        return
      }

      if (stats.isDirectory()) {
        fs.readdir(fileOrDir, function (err, files) {
          if (err) {
            reject(err)
          } else {
            resolve(files.map(f => path.join(fileOrDir, f)))
          }
        })
      }
    })
  })
  return p
}

Promise.all(argv._.map(spec => getFiles(spec))).then(results => {
  // turn the results into a single array
  let files = []
  results.forEach(r => files = [].concat(r))

  // select only the summary files
  let summaries = []
  for (let i = 0; i < files.length; i++) {
    let file = files[i]
    let m = file.match(jsonSummaryPattern)
    if (m) {
      let summary = {
        file: file,
        os: m[1],
        nodeVersion: m[2],
        majorNodeVersion: m[2].split('.')[0],
        timestamp: m[3]
      }
      summaries.push(summary)
    }
  }
  return summaries
}).then(summaries => {
  // sort by node version
  summaries.sort((a, b) => {
    if (a.majorNodeVersion - b.majorNodeVersion) {
      return a.majorNodeVersion - b.majorNodeVersion
    }
    // node versions are the same, sort by OS
    if (a.os !== b.os) {
      return a.os < b.os ? -1 : 1
    }
    // node versions and OS are the same, sort by timestamp
    return a.timestamp < b.timestamp ? -1 : 1
  })
  return summaries
}).then(summaries => {
  // if duplicates are allowed don't do anything
  if (argv.duplicates) {
    return summaries
  }

  // because they are sorted this will only retain the latest timestamp
  // for duplicate os-node-version combinations.
  const dict = {}
  summaries.forEach(s => {
    dict[s.os + '-' + s.nodeVersion] = s
  })

  // counts on object keys being ordered.
  return Object.keys(dict).map(k => dict[k])
}).then(summaries => {
  return Promise.all(summaries.map(s => {
    return new Promise(function (resolve, reject) {
      // TODO BAM handles errors by resolving with no information but
      // flagging s.error = err and warning at end of the run.
      fs.readFile(s.file, 'utf8', function (err, contents) {
        if (err) {
          reject(err)
        } else {
          s.json = JSON.parse(contents)
          resolve(s)
        }
      })
    })
  }))
}).then(summaries => {
  summaries.forEach(s => {
    if (!s.json.meta) {
      throw new Error(`missing meta key in ${s.file}`)
    }
    if (s.json.meta.summaryVersion !== 1) {
      throw new Error(`bad version ${s.json.meta.summaryVersion} in ${s.file}`)
    }
  })
  return summaries
}).then(summaries => {
  let grouper = new Grouper()
  summaries.forEach(summary => grouper.addItem(summary, summary.majorNodeVersion))

  return grouper.groups
}).then(groups => {
  groups.forEach(g => {
    //console.log('node version', g.key)
    g.items.forEach(i => {
      let packages = i.json.packages
      let meta = i.json.meta

      console.log()
      console.log(`${meta.package} ${meta.version} on ${meta.linux.id} ${meta.linux.version_id}`)
      console.log(`  using node ${meta.node} at ${meta.timestamp}`)
      console.log(`  (commit ${meta.commit})`)
      console.log('\npackages:\n')

      Object.keys(packages).forEach(p => {
        let line = p
        if (!argv.a) line += ' (last tested:', packages[p].latest + ')'
        console.log(p)
        packages[p].ranges.forEach(r => {
          if (argv.a) {
            console.log(`  ${r.key} ${range(r)} (${r.count})`)
          } else {
            if (r.key === 'pass') {
              console.log('  ' + range(r))
            }
          }
        })
      })


    })
  })
})

//
// helpers
//

function range (r) {
  return r.first === r.last ? r.first : r.first + '-' + r.last
}
