'use strict'

//
// read the output of testeachversion, parse the summary section, and
// display a text representation of it.
//

const minimist = require('minimist')
const fs = require('fs')

const argv = minimist(process.argv.slice(2))

if (!argv._[0]) {
  console.warn('usage: textify-summary filepath')
  process.exit(1)
}

let summary = fs.readFileSync(argv._[0], 'utf8')

const start = summary.indexOf('\n[\n')

if (start === -1) {
  console.error('cannot find JSON marker in file')
  process.exit(1)
}

try {
  summary = JSON.parse(summary.slice(start))
} catch (e) {
  console.error('cannot parse summary section of file', e.message || e.code)
  process.exit(1)
}

if (!summary[0].meta) {
  console.error('meta is not the first array element')
  process.exit(1)
}

const meta = summary.shift()

// this should have been done by bin.js when outputting the summary but
// there was a bug in the sort function.
summary.sort(function (a, b) {
  if (a.package < b.package) return -1
  if (a.package > b.package) return 1
  return 0
})

let packages = {}
summary.forEach(e => {
  if (e.package) {
    packages[e.package] = e
  } else {
    console.warn('unknown summary item', e)
  }
})

console.log()
console.log('Appoptics-APM Package Support Matrix')
console.log('  for nodejs', meta.version, 'as of', meta.timestamp)
console.log('\npackages:\n')

Object.keys(packages).forEach(p => {
  console.log(p)
  packages[p].ranges.forEach(r => {
    if (r.key === 'pass') {
      if (r.first === r.last) {
        console.log('  ' + r.first)
      } else {
        console.log('  ' + r.first + '-' + r.last)
      }
    }
  })
})
