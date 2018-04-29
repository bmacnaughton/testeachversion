'use strict'

function Grouper (options) {
  this.group = new Group(Symbol('empty'), Symbol('nokey'))
  this.groups = []
  this.opts = options || {}
}

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


function Group (item, key) {
  this.first = item
  this.last = item
  this.key = key
  this.count = 1
  this.items = [item]
}

Group.prototype.add = function (item) {
  this.count += 1
  this.last = item
  this.items.push(item)
  return this
}

module.exports = Grouper


