import Promise from 'bluebird'

//
// This is used to run a list of promises in serial, *not* parallel
//
export default function (items, fn) {
  var results = []

  var p = Promise.resolve()

  items.forEach((item) => {
    p = p.then((last) => {
      if (last) {
        results.push(last)
      }
      return fn(item)
    })
  })

  return p.then(function (last) {
    if (last) {
      results.push(last)
    }
    return results
  })
}
