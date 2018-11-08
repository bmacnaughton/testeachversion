# testeachversion

`testeachversion` runs your test suite against each versions of the packages you depend on. You create a versions spec file to define what modules and version ranges you want to test against, along with what task you want to run for that particular module. The default is `npm test`.

### Usage

Basic usage is as simple as running `testeachversion` from the command line after creating a `versions` file. The `versions` file is `required` so it can be JSON or an executable module that provides an array of objects.

There are some useful options, including:

- -c, --config - Look for version spec file in different location
- -m, --module - Only run version tests for the specified module
- -v, --verbose - Include additional output from test runs
- -s, --suppress - Set `-s false` to output errors to terminal

### Interpreting the results

Two logs are generated - a summary log and a details log. The details log contains the output from each test run and can be used to better understand how and why specific tests failed. The summary log is in JSON format and captures the tests that were skipped, passed, and failed. It can be interpreted using `humanize-log.js` (which is linked as `node_modules/.bin/humanize`).

`humanize path [...path]` for each file or directory specified by `path` will select the summary json files and output each package's tests that passed.

`humanize path [...path] -a` will output each package's skips, passes, and fails.

These generate the information that goes into the node version-probes spreadsheet.


### Versions File

A typical versions spec file looks something like this:

```
[
  {
    "version": 1,               // version 1 is implied if missing
    "name": "express",
    "range": "^4.0.0",
    "task": "gulp test:express"
  },
  {
    "name": "redis",
    "range": ">= 0.8.0",
    "task": "gulp test:redis",
  },
  {
    "version": 2,
    "name": "vision",
    "task": "gulp test:vision",
    "ranges": [
      {
        "range": ">= 4.0.0 < 5.0.0",
        "dependencies: ["hapi@16"]
      }, {
        "range": ">= 5.0.0",
        "dependencies": ["hapi@17"]
      }
    ]
  }
]
```

The default for `version` is `1`; `task` is `npm test`; `range` is `*`.

Version 2 definitions specify dependencies that will be used for the matching range. testeachversion
will not iterate through all the versions of the dependencies, just the latest for each dependency. E.g.,
in the `vision` test the latest version of `hapi` v16 will be used for each v4 version of `vision`.

The `example/` directory contains an example version file.

Semver is used to test the ranges.

### History

Version 7 of testeachversion removes babel and as such requires node version 6+.

This is based on Stephen Belanger's `alltheversions`. I learned much from his code.
