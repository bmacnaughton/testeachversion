# testeachversion

`testeachversion` runs your test suite against each versions of the packages you depend on. You create a versions spec file to define what modules and version ranges you want to test against, along with what task you want to run for that particular module. The default is `npm test`.

### Usage

Basic usage is as simple as running `testeachversion` from the command line after creating a `versions` file. The `versions` file is `required` so it can be JSON or an executable module that provides an array of objects.

There are some useful options, including:

- -c, --config - Look for version spec file in different location
- -m, --module - Only run version tests for the specified module
- -v, --verbose - Include stdout of test runs in output

(-v is currently being reworked and -s (suppress errors) is being added.)

### Versions File

A typical versions spec file looks something like this:

```
[
  {
    "name": "express",
    "range": "~4.0.0",
    "task": "gulp test:express"
  },
  {
    "name": "redis",
    "range": ["0.10.x","^0.12.0"],
    "task": "gulp test:redis"
  },
]
```

The default for `task` is `npm test`; for `range` it is `*`.

Semver is used to test the ranges.

### History

This is based on Stephen Belanger's `alltheversions`. I learned much from his code.
