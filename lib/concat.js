export default function (stream, fn) {
  return new Promise((resolve, reject) => {
    var chunks = []
    stream.on('error', reject)
    stream.on('data', (chunk) => {
      chunks.push(chunk.toString('utf8'))
      if (fn) fn(chunk)
    })
    stream.on('end', () => resolve(chunks.join('')))
  })
}
