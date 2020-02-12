'use strict';

const Promise = require('bluebird').Promise
const retry = require('retry')


module.exports = function retryPromiseFunction (fn, opts) {

  const operation = retry.operation(opts)

  // indirectly execute the promise function so it
  // resolves the promise when successful or rejects
  // it when the retry count has been exceeded.
  function attempt (resolve, reject) {
    operation.attempt(function () {
      fn()
        .then(n => resolve(n))
        .catch(err => {
          if (operation.retry(err)) {
            return
          }
          reject(operation.mainError())
        })
    })
  }

  const p = new Promise(attempt)
  return p
}

/*
function tryOp (operation, delay, times) {
  return new Promise((resolve, reject) => {

    const waitX = (ms, n) => {
      return new Promise(resolve => setTimeout(() => {
        console.log('waitX popped', n)
        resolve(n)
        return n
      }, ms))
    }

    const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

    const wrappedResolve = n => {
      console.log('resolving', n)
      return n
    }
    return operation()
      .then(n => wrappedResolve(n))
      .catch(reason => {
        console.log('catch', times)
        if (--times > 0) {
          return waitX(delay, times)
            .then(tryOp(operation, delay, times))
            .then(n => wrappedResolve(n))
            .catch(reject)
        }
        return reject(reason)
      })
  })
}
// */
