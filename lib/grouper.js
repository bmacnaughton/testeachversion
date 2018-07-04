'use strict'

//
// Object to group a series of items based on a key. As long
// as the key doesn't change items will be accumulated into
// a single group. A new group will be created on every key
// change.
//
// g = new Grouper()
//
// items.forEach(i => g.addItem(i, i.key))
//
// when done, fetch groups:
//
// groups = g.groups
//
// groups.forEach(group => {
//   console.log(group.first)        // first item added to the group
//   console.log(group.last)         // last item added to the group
//   console.log(group.key)          // the key for the group
//   console.log(group.count)        // the count of items in the group
//   console.log(groups.items)       // an array of items in the group
// })
//
function Grouper (options) {
  this.group = new Group(Symbol('empty'), Symbol('nokey'))
  this.groups = []
  this.opts = options || {}
}

//
// add an item
//
// if the key doesn't match the current group's key then a
// new group is created.
//
// if you want the all matching keys in a single group then the items
// should be sorted by the key before using addItem to add them.
//
// conversely, if you want sequences of matching keys, say runs of tests
// that pass or fail, then sort the test results by sequence then group
// using the test result (pass or fail) as the key.
//
Grouper.prototype.addItem = function (item, key) {
  // same key?
  if (this.group.key === key) {
    return this.group.add(item)
  }
  // the key changed or first item
  this.group = new Group(item, key)
  this.groups.push(this.group)
  return this.group
}

//
// constructor
//
function Group (item, key) {
  this.first = item
  this.last = item
  this.key = key
  this.count = 1
  this.items = [item]
}

//
// add an item to the group
//
Group.prototype.add = function (item) {
  this.count += 1
  this.last = item
  this.items.push(item)
  return this
}

module.exports = Grouper


