function reduce (versions, n) {
  return versions.reduce((list, version) => {
    var matcher = new RegExp('^' + version.split('.').slice(0, n).join('\.'))
    if ( ! list.filter(v => matcher.test(v)).length) {
      list.push(version)
    }
    return list
  }, [])
}

export function patch (versions) {
  return reduce(versions, 3)
}

export function minor (versions) {
  return reduce(versions, 2)
}

export function major (versions) {
  return reduce(versions, 1)
}
