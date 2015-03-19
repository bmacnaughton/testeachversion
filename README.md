# alltheversions

Do you just *love* it when dependencies make breaking changes in a patch release? Do you live for the mystery and intrigue of never quite knowing if a deploy will blow up in production? Then this is probably not the module for you!

With `alltheversions`, you can run your test suite against--you guessed it--all the versions of your dependencies. You simply create a versions spec file to define what modules and version ranges you want to test against, along with what task you want to run for that particular module--the default being `npm test`.

### Usage

Basic usage is as simple as running `alltheversions` in the command line. However, there are some useful options, including:

- -c, --config - Look for version spec file in different location
- -m, --module - Only run version tests for the specified module
- -v, --verbose - Include stdout of test runs in output

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
