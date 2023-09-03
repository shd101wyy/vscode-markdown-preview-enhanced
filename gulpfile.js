/**
 * Delete ./crossnote directory
 * Then copy files from
 * - ./node_modules/crossnote/out/dependencies/. to ./crossnote/dependencies/
 * - ./node_modules/crossnote/out/styles/.       to ./crossnote/styles/
 * - ./node_modules/crossnote/out/webview/.      to ./crossnote/webview/
 */
const gulp = require('gulp');
const fs = require('fs');

gulp.task('copy-files', cb => {
  // Delete ./crossnote directory
  if (fs.existsSync('./crossnote')) {
    fs.rmdirSync('./crossnote', { recursive: true });
  }

  // Copy files
  gulp
    .src('./node_modules/crossnote/out/dependencies/**/*')
    .pipe(gulp.dest('./crossnote/dependencies/'));
  gulp
    .src('./node_modules/crossnote/out/styles/**/*')
    .pipe(gulp.dest('./crossnote/styles/'));
  gulp
    .src('./node_modules/crossnote/out/webview/**/*')
    .pipe(gulp.dest('./crossnote/webview/'));

  console.log('Copy files done.');

  cb();
});
