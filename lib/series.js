export default function (items, fn) {
  var results = []

  var p = Promise.resolve()

  items.forEach((item) => {
    p = p.then((last) => {
      if (last) {
        results.push(last)
      }
      return fn(item)
    }).catch((e) => console.log('dafuq?', e.stack))
  })

  return p.then(function (last) {
    if (last) {
      results.push(last)
    }
    return results
  })
}
