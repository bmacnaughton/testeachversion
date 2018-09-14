function reduce (versions, n) {
  return versions.reduce((list, version) => {
    const matcher = new RegExp('^' + version.split('.').slice(0, n).join('\.'))
    if ( ! list.filter(v => matcher.test(v)).length) {
      list.push(version)
    }
    return list
  }, [])
}

exports.patch = function patch (versions) {
  return reduce(versions, 3)
}

exports.minor = function minor (versions) {
  return reduce(versions, 2)
}

exports.major = function major (versions) {
  return reduce(versions, 1)
}
