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

const start = summary.indexOf('\n{\n')

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

if (!summary.meta) {
  console.error('bad format: meta is not present')
  process.exit(1)
}

const meta = summary.meta


let packages = summary.packages

console.log()
console.log(`${meta.package} ${meta.version} support matrix`)
console.log(`  using node ${meta.node} on ${meta.timestamp} commit ${meta.commit}`)
console.log('\npackages:\n')

Object.keys(packages).forEach(p => {
  console.log(p, '(last tested:', packages[p].latest + ')')
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
