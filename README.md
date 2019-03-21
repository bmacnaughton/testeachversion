# testeachversion

`testeachversion` runs your test suite against each versions of the packages you depend on. You create a config file specifying the versions of the modules/packages you want to test, the version range(s) for each, and the task you want to run. You should use the `VersionSpec` class to define your config file. N.B. VersionSpec does no error checking at this time so you probably want to keep the config file straightforward and simple.

```
const VersionSpec = require('testeachversion').VersionSpec

const packages = module.exports = []

packages.push(new VersionSpec('ap', {task: 'node index.js'}))

```


### Usage

Basic usage is as simple as running `testeachversion` from the command line after creating a config file containing the `VersionSpec`s. `testeachversion` is located in the `./node_modules/.bin/` directory and is linked to `./node_modules/testeachversion/lib/bin.js`. It will look for the config file using the path `./test/versions.js`.

There are some useful options, including:

- -c, --config - Look for version spec file in different location
- -p, --package - Only run version tests for the specified package
- -V, --verbose - Include additional output from test runs
- -s, --suppress - Set `-s false` to output errors to terminal
- -v, --version - Show the version and exit

### Interpreting the results

Two logs are generated - a summary log and a details log. The details log contains the output from each test run and can be used to better understand how and why specific tests failed. The summary log is in JSON format and captures the tests that were skipped, passed, and failed. It can be interpreted using `humanize-log.js` (which is linked as `node_modules/.bin/humanize`).

`humanize path [...path]` for each file or directory specified by `path` will select the summary json files and output each package's tests that passed.

`humanize path [...path] -a` will output each package's skips, passes, and fails.


### Versions File

A typical versions spec file looks something like this:

```
VersionSpec = require('testeachversion').VersionSpec

module.exports = [
  VersionSpec('express', {ranges: '^4.0.0', task: 'gulp test:express'}),
  VersionSpec('redis', {ranges: '>= 0.8.0', task: 'gulp test:redis'}),
  VersionSpec('vision', {
    task: 'gulp test:vision',
    ranges: [
      {range: '>= 4.0.0 < 5.0.0', dependencies: ['hapi@16']},
      {range: '>= 5.0.0', dependencies: ['hapi@17']}
    ]
  })
]
```

Ranges are tested using `semver`.

Defaults:

task: `'false'`
range: `'*'`
timeout: `60000` (not used currently)

It is possible to specify dependencies that will be used for the matching range. `testeachversion` will install
the dependencies for the range but will not iterate through all matching versions of the dependencies, just the
latest for each dependency. E.g., for the `vision` test the latest version of `hapi v16` will be used for each
`v4` version of `vision`.

The `example/` directory contains an example version file.


### History

Version 8 is a major rearchitecture for better internal organization.
- allows testing of node builtin modules, e.g., `fs` which are have only one version and are already installed.
- enables function tests again
- provides a VersionSpec class for use in config files
- adds testing
- fixes various bugs

Breaking changes:
- version file format - requires using VersionSpec class to construct entries
- reporter interface is completely new (and not well defined)
- function names and classes are new (only an issue if using the undocumented API - most common use is via `lib/bin.js`)


Version 7 of testeachversion removes babel and as such requires node version 6+.


This is based on Stephen Belanger's `alltheversions`.
