/**
 * Delete ./crossnote directory
 * Then copy files from
 * - ./node_modules/crossnote/out/dependencies/. to ./crossnote/dependencies/
 * - ./node_modules/crossnote/out/styles/.       to ./crossnote/styles/
 * - ./node_modules/crossnote/out/webview/.      to ./crossnote/webview/
 * - ./node_modules/crossnote/out/server-app/.   to ./crossnote/server-app/
 */
const gulp = require('gulp');
const fs = require('fs');

gulp.task('clean-out', (cb) => {
  // Delete ./out folder
  if (fs.existsSync('./out')) {
    fs.rmSync('./out', { recursive: true });
  }
  cb();
});

gulp.task('copy-files', (cb) => {
  // Delete ./crossnote directory
  if (fs.existsSync('./crossnote')) {
    fs.rmSync('./crossnote', { recursive: true });
  }

  // Copy files (encoding: false prevents Gulp 5 from corrupting binary files like fonts)
  gulp
    .src('./node_modules/crossnote/out/dependencies/**/*', { encoding: false })
    .pipe(gulp.dest('./crossnote/dependencies/'));
  gulp
    .src('./node_modules/crossnote/out/styles/**/*', { encoding: false })
    .pipe(gulp.dest('./crossnote/styles/'));
  gulp
    .src('./node_modules/crossnote/out/webview/**/*', { encoding: false })
    .pipe(gulp.dest('./crossnote/webview/'));
  // server-app is the browser app of `crossnote serve` and (from crossnote
  // 0.9.37 on) the shell of the standalone wiki that buildStandaloneWiki
  // embeds. Without it the server app opens as a blank page: the shell HTML
  // loads but its script 404s.
  gulp
    .src('./node_modules/crossnote/out/server-app/**/*', { encoding: false })
    .pipe(gulp.dest('./crossnote/server-app/'));

  console.log('Copy files done.');

  cb();
});
