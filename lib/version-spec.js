'use strict'

class VersionSpec {

  constructor (name, options = {}) {
    this.version = 2
    this.name = name

    this.ranges = [{range: '*'}]
    if (options.ranges) {
      if (typeof options.ranges === 'string') {
        this.ranges[0].range = options.ranges
      } else if (Array.isArray(options.ranges)) {
        this.ranges = options.ranges
      } else {
        throw new Error(`Unexpected range ${options.range} for package ${name}`)
      }
    }

    this.timeout = options.timeout || 1000 * 60
    this.task = options.task || 'false'
  }
}

module.exports = VersionSpec
