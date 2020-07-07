'use strict';

exports.parse = function parse (json) {
  return new Promise((resolve, reject) => {
    try {
      const data = JSON.parse(json)
      resolve(data)
    } catch (e) {
      reject(e)
    }
  })
}

exports.stringify = function stringify (data) {
  return new Promise((resolve, reject) => {
    try {
      const json = JSON.stringify(data)
      resolve(json)
    } catch (e) {
      reject(e)
    }
  })
}
