export default function (stream, fn) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('error', reject)
    stream.on('data', chunk => {
      chunks.push(chunk)
      if (fn) fn(chunk)
    })
    stream.on('end', () => {
      const buf = Buffer.concat(chunks)
      resolve(buf.toString('utf8'))
    })
  })
}
