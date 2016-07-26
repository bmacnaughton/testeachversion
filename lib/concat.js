import Promise from 'bluebird'

export default function (stream, fn) {
  return new Promise((yep, nope) => {
    const chunks = []
    stream.on('error', nope)
    stream.on('data', chunk => {
      chunks.push(chunk)
      if (fn) fn(chunk)
    })
    stream.on('end', () => {
      const buf = Buffer.concat(chunks)
      yep(buf.toString('utf8'))
    })
  })
}
