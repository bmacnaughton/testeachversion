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
}, {
  name: 'output',
  alias: 'o',
  description: 'output file (only stdout for now)',
  default: 'stdout'
}, {
  name: 'template',
  alias: 't',
  description: 'fill in this template file (see code for details)',
  default: false
}, {
  name: 'template-file',
  alias: 'f',
  description: 'template file path',
  default: './matrix-template'
}, {
  name: 'last',
  alias: 'l',
  description: 'output last version of each package tested',
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
  boolean: ['duplicates', 'all', 'template', 'last']
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

// place for the template file if --template specified
let template

//
// main program flow
//
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
      // TODO BAM handle errors by resolving with no information but
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
  // group the files based on major node version
  let grouper = new Grouper()
  summaries.forEach(summary => grouper.addItem(summary, summary.majorNodeVersion))

  return grouper.groups
}).then(groups => {
  let fd = process.stdout
  if (argv.output === 'stdout') {
    fd = process.stdout
  } else {
    // for now. maybe forever - user can use command line to
    // redirect output to a file.
    fd = process.stdout
  }

  // for each major node version
  groups.forEach(g => {

    if (argv.output === 'stdout') {
      let bars = '='.repeat(60)
      fd.write(`\n${bars}`)
      fd.write(`\nnode version ${g.key}`)
      fd.write(`\n${bars}`)
    }

    // for each OS
    g.items.forEach(i => {
      let packages = i.json.packages
      let meta = i.json.meta

      fd.write(`\n${meta.package} ${meta.version} on ${meta.linux.id} ${meta.linux.version_id}`)
      fd.write(`\n  using node ${meta.node} at ${meta.timestamp}`)
      fd.write(`\n  (commit ${meta.commit})`)
      fd.write(`\n\npackages:\n`)

      // for each package
      Object.keys(packages).forEach(p => {
        let line = `\n${p}`
        if (argv.last) line += ` (last tested: ${packages[p].latest})`
        fd.write(line)

        // write the ranges for each package
        packages[p].ranges.forEach(r => {
          if (argv.all) {
            fd.write(`\n  ${r.key} ${range(r)} (${r.count})`)
          } else if (r.key === 'pass') {
            fd.write(`\n  ${range(r)}`)
          }
        })
      })

      fd.write('\n')
    })
  })
  // if output can be other than stdout must close
  return groups
}).then(groups => {
  // if --template then use a template to output a single file
  // per tab.
  // TODO BAM it's beginning to look like the whole humanize-logs function
  // should become a separate facility. this really is pushing the limits of
  // keeping this logically unrelated piece of code (shares understanding of
  // summary file output format with testeachversion) in the same repository.
  if (!argv.template) {
    process.exit(0)
  }

  const p = new Promise(function (resolve, reject) {
    fs.readFile(argv['template-file'], 'utf8', function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })

  return p.then(data => {
    return {groups, template: data}
  })
}).then(r => {
  const {groups, template} = r
  // for now hardcode this.
  // TODO BAM need better solution/setup at start.
  let fd = process.stdout

  // for each major node version
  groups.forEach(g => {
    // find ubuntu and set it as base for other oses to compare against
    // TODO BAM allow base to be configurable
    let base
    let others = []

    g.items.forEach(os => {
      if (os.json.meta.linux.id === 'ubuntu') {
        base = os
      } else {
        others.push(os)
      }
    })

    // in case there are differences between OSes issue a warning at the end.
    let basename = base.json.meta.linux.id
    let basePackages = base.json.packages
    let differences = []

    //*
    fd.write(`\nfor node version ${base.json.meta.node}:\n`)
    let othernames = others.map(o => o.json.meta.linux.id).join(', ')
    fd.write(`  base is ${basename} others are ${othernames}`)
    // */

    // build a dictionary of package: range, range [(alpine: range, range)...]
    const supported = {}

    Object.keys(basePackages).forEach(k => {
      let p = basePackages[k]

      // write the base os ranges for each range, r
      let text = p.ranges.reduce((result, r) => {
        if (r.key === 'pass') {
          result.push(`${range(r)}`)
        }
        return result
      }, []).join(', ')

      supported[k] = text

      //fd.write('\n' + k + ' ' + text)

      // for each package in the base compare against others.
      // N.B. this will not notice if an "other" os has a package
      // that is not in the base. the worst case for this is that
      // the supported packages will be understated for that os. if
      // important loop by index of keys and verify that they are
      // the same in each os the os test results.

      others.forEach(os => {
        let osPackage = os.json.packages[k]
        if (!osPackage) {
          throw new Error(os.json.meta.linux.id + ' is missing pacakge ' + k)
        }

        // if the ranges differ for this os write those ranges too
        if (!equalRanges(basePackages[k], osPackage)) {
          differences[os.json.meta.linux.id] = true

          let text = osPackage.ranges.reduce((result, r) => {
            if (r.key === 'pass') {
              result.push(`${range(r)}`)
            }
            return result
          }, []).join(', ')

          if (text) {
            supported[k] += ' (' + os.json.meta.linux.id + ': ' + text + ')'
          }

          //fd.write(' (' + os.json.meta.linux.id + ': ' + text + ')')
        }
      })
      fd.write('\n' + k + ' ' + supported[k])
    })

    fd.write('\n')

    if (Object.keys(differences).length) {
      fd.write('\nWARNING WARNING WARNING - differences\n')
    }

  })


}).catch(e => {
  console.error(e)
})

//
// helpers
//

function range (r) {
  return r.first === r.last ? r.first : r.first + '-' + r.last
}

// compare the ranges for two of the same package
function equalRanges(p1, p2) {
  if (p1.ranges.length !== p2.ranges.length) {
    return false
  }

  for (let i = 0; i < p1.ranges.length; i++) {
    if (!equalRange(p1.ranges[i], p2.ranges[i])) {
      return false
    }
  }
  return true
}

// compare a single range against another
function equalRange (r1, r2) {
  if (r1.count !== r2.count
    || r1.key !== r2.key
    || r1.first !== r2.first
    || r1.last !== r2.last) {
    return false
  }
  // the easy checks are done must compare arrays now but there
  // are only simple values, so no need for recursion.
  for (let i = 0; i < r1.items.length; i++) {
    if (r1.items[i] !== r2.items[i]) {
      return false
    }
  }
  return true
}
