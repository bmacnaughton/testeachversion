# testeachversion

`testeachversion` runs your test suite against each versions of the packages you depend on. You create a versions spec file to define what modules and version ranges you want to test against, along with what task you want to run for that particular module. The default is `npm test`.

### Usage

Basic usage is as simple as running `alltheversions` in the command line. However, there are some useful options, including:

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

If task is omitted from a module entry, it will default to `npm test`, and omitting range will default it to `*`.

### History

This is based on Stephen Belanger's `alltheversions`. I have learned much from his code.
