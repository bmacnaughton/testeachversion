'use strict';

//
// This is used to run a list of promises serially, *not* in parallel
//
//module.exports = function (items, fn) {
//  // create a seed promise that resolves with no value
//  let p = Promise.resolve();
//
//  const results = []
//
//  items.forEach(item => {
//    p = p.then(last => {
//      if (last) results.push(last)
//      return fn(item)
//    })
//  })
//
//  return p.then(last => {
//    if (last) results.push(last)
//    return results
//  })
//}

// async/await version
module.exports = async function (items, fn) {
  const results = [];
  for (const item of items) {
    results.push(await fn(item));
  }
  return results;
}
