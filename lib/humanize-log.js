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

const jsonSummaryPattern = /(?:.*\/)*(.+-.+)-node-v(.+)-summary-(.+)\.json/

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
  description: 'fill in the template file (see code for details)',
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
}, {
  name: 'differences',
  alias: 'd',
  description: 'force writing templates',
  default: false
}, {
  name: 'verbose',
  alias: 'v',
  description: 'write out intermediate data and information',
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
  boolean: ['duplicates', 'all', 'template', 'last', 'differences', 'verbose']
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
  // verify that it is a supported version of the summary file
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
      fd.write(`\n  (${meta.branch} commit ${meta.commit})`)
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
  // build a dictionary of the range text for each package with parenthesized
  // (os: ranges) appended when the ranges differ across those OSes tested.
  const {groups, template} = r

  // for now hardcode this.
  // TODO BAM need better solution/setup at start.
  let fd = process.stdout

  const supported = {}

  // for each major node version
  groups.forEach(g => {
    let nodeVersion = g.key
    supported[nodeVersion] = {}
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

    if (!base) {
      throw new Error('Cannot find base linux version (ubuntu)')
    }

    // in case there are differences between OSes issue a warning at the end.
    let basename = base.json.meta.linux.id
    let basePackages = base.json.packages
    let differences = {}

    if (argv.v) {
      fd.write(`\nfor node version ${base.json.meta.node}:\n`)
      let othernames = others.map(o => o.json.meta.linux.id).join(', ')
      fd.write(`  base is ${basename} others are ${othernames}`)
    }

    Object.keys(basePackages).forEach(k => {
      let p = basePackages[k]

      // write the base os ranges for each range, r
      let text = p.ranges.reduce((result, r) => {
        if (r.key === 'pass') {
          result.push(`${range(r)}`)
        }
        return result
      }, []).join(', ')

      // store base os supported packages for this node version
      supported[nodeVersion][k] = text

      // for each package in the base compare against others.
      // N.B. this will not notice if an "other" os has a package
      // that is not in the base. the worst case for this is that
      // the supported packages will be understated for that os. if
      // important loop by index of keys and verify that they are
      // the same in each os the os test results.

      others.forEach(os => {
        let osPackage = os.json.packages[k]
        let meta = os.json.meta
        if (!osPackage) {
          throw new Error(meta.linux.id + ' is missing pacakge ' + k)
        }

        // if the ranges differ for this os write those ranges too
        if (!equalRanges(basePackages[k], osPackage)) {
          // keep track of which packages there were differences in
          differences[k] = true

          let text = osPackage.ranges.reduce((result, r) => {
            if (r.key === 'pass') {
              result.push(`${range(r)}`)
            }
            return result
          }, []).join(', ')

          if (text) {
            supported[nodeVersion][k] += ' (' + meta.linux.id + ': ' + text + ')'
          }
        }
      })
      if (argv.v) {
        fd.write('\n' + k + ' ' + supported[nodeVersion][k])
      }
    })

    if (argv.v) {
      fd.write('\n')
    }

    // add supported by node version to the context
    r.supported = supported

    // warn if differences across OS results
    if (Object.keys(differences).length) {
      fd.write('\nWARNING - differences for node version ' + nodeVersion)
      Object.keys(differences).forEach(k => {
        fd.write('\n - ' + k + ' ' + supported[nodeVersion][k])
      })
      fd.write('\n')
    }

  })

  return r
}).then(r => {
  const {groups, template, supported} = r
  r.output = {}

  // form is {{package:what}} where
  // - package is the package name
  // - what is versions (can be extended)
  //const re = /({{([-a-zA-Z_]+):([-a-zA-Z_]+)}})/g
  const re = /{{([-a-zA-Z0-9_]+:[-a-zA-Z0-9_]+)}}/g

  // split it into pieces and get all the substitution patterns.
  const tparts = template.split(re)

  // for each node version in supported insert the ranges into the template
  Object.keys(supported).forEach(nodeVersion => {
    const errors = []
    // copy the split template pieces
    const parts = tparts.map(i => i)

    // the template is split on the substitution pattern so every other
    // element is the pattern.
    for (let i = 1; i < parts.length; i += 2) {
      const [pkg, action] = parts[i].split(':')

      // TODO BAM invoke action-dependent function in future but for now the
      // only action is "versions".
      if (action !== 'versions') {
        parts[i] = "N/A"
        errors.push('Unknown action: ' + action + ' for package: ' + pkg)
      } else if (!supported[nodeVersion][pkg]) {
        parts[i] = 'N/A'
        errors.push('No supported versions for ' + pkg)
      } else {
        parts[i] = supported[nodeVersion][pkg]
      }
    }

    r.output[nodeVersion] = {parts, errors}
  })
  return r
}).then(r => {
  //
  // write the filled-in templates here, one per node version. if
  // there are errors for a given version then use a .err extension
  // instead of .txt so it won't automatically overwrite existing content.
  //
  const output = r.output

  // one promise for each file written. resolved when done.
  const done = []
  const options = {
    flags: 'w',
    defaultEncoding: 'utf8',
    mode: 0o664
  }

  Object.keys(output).forEach(nodeVersion => {
    const {parts, errors} = output[nodeVersion]

    const p = new Promise(function (resolve, reject) {
      let filename = 'nodejs' + nodeVersion + (errors.length ? '.err' : '.txt')
      const f = fs.createWriteStream(filename, options)
      let i = 0

      // call writeFile when the stream is writable
      function writeFile () {
        while (f.write(parts[i])) {
          if (++i >= parts.length) {
            let lastChunk
            if (errors.length) {
              lastChunk = '\nErrors:\n' + errors.join('\n') + '\n'
            }
            f.end(lastChunk)
            break
          }
        }
      }

      // resolve promise when finished
      function finishFile () {
        resolve(nodeVersion)
      }

      function error (e) {
        reject(e)
      }

      f.on('error', error)
      f.on('finish', finishFile)
      f.on('drain', writeFile)

      // jump start the writer.
      f.emit('drain')
    })

    done.push(p)
  })

  return Promise.all(done)
}).then(r => {
  console.log(r)

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
  for (let i = 0; i < r1._items.length; i++) {
    if (r1._items[i] !== r2._items[i]) {
      return false
    }
  }
  return true
}
