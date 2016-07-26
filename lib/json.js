import Promise from 'bluebird'

export function parse(json) {
  return new Promise((yep, nope) => {
    try {
      const data = JSON.parse(json)
      yep(data)
    } catch (e) {
      nope(e)
    }
  })
}

export function stringify(data) {
  return new Promise((yep, nope) => {
    try {
      const json = JSON.stringify(data)
      yep(json)
    } catch (e) {
      nope(e)
    }
  })
}
