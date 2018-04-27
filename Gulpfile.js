require('babel/register')
var gulp = require('gulp')
var babel = require('gulp-babel')
var mocha = require('gulp-mocha')
var filter = require('gulp-filter')
var chmod = require('gulp-chmod')

gulp.task('test', ['build'], function () {
  require('should')
  return gulp.src('test/**/*.js', { read: false })
    .pipe(mocha({
      reporter: 'spec',
      require: ['should']
    }))
})

gulp.task('versions', function (cb) {
  var ATV = require('./dist')
  var spec = require('./dist/reporters/spec')
  ATV.testWithVersions({
    name: 'bluebird',
    range: '2.x'
  }, spec({
    verbose: true
  })).then(cb.bind(null, null), cb)
})

gulp.task('build', function () {
  var f = filter('lib/bin.js', {restore: true})
  return gulp.src('lib/**/*.js')
    .pipe(babel())
    .pipe(f)
    .pipe(chmod(0o755))
    .pipe(f.restore)
    .pipe(gulp.dest('dist'))
})

gulp.task('watch', function () {
  gulp.watch('lib/**/*.js', [
    'build'
  ])

  //*
  //gulp.watch([
  //  'dist/**/*.js',
  //  'test/**/*.js'
  //], [
  //  'test'
  //])
  // */
})

gulp.task('default', [
  'watch'
])
