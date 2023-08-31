/**
 * Copy files from
 * - ./node_modules/@shd101wyy/mume/dependencies/. to ./mume/dependencies/
 * - ./node_modules/@shd101wyy/mume/styles/.       to ./mume/styles/
 * - ./node_modules/@shd101wyy/mume/out/webview/.  to ./mume/out/webview/
 */
const fs = require('fs');
const path = require('path');

const copyData = [
  {
    source: './node_modules/@shd101wyy/mume/dependencies/',
    target: './mume/dependencies/',
  },
  {
    source: './node_modules/@shd101wyy/mume/styles/',
    target: './mume/styles/',
  },
  {
    source: './node_modules/@shd101wyy/mume/out/webview/',
    target: './mume/out/webview/',
  },
];

// Delete ./mume directory
fs.rmdirSync('./mume', { recursive: true });

// Make source directories
copyData.forEach(data => {
  fs.mkdirSync(data.target, { recursive: true });
});

// Copy directories
copyData.forEach(data => {
  fs.cpSync(data.source, data.target, { recursive: true });
});
