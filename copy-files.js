/**
 * Copy files from
 * - ./node_modules/@shd101wyy/mume/out/dependencies/. to ./mume/dependencies/
 * - ./node_modules/@shd101wyy/mume/out/styles/.       to ./mume/styles/
 * - ./node_modules/@shd101wyy/mume/out/webview/.      to ./mume/webview/
 */
const fs = require('fs');

const copyData = [
  {
    source: './node_modules/@shd101wyy/mume/out/dependencies/',
    target: './mume/dependencies/',
  },
  {
    source: './node_modules/@shd101wyy/mume/out/styles/',
    target: './mume/styles/',
  },
  {
    source: './node_modules/@shd101wyy/mume/out/webview/',
    target: './mume/webview/',
  },
];

// Delete ./mume directory
if (fs.existsSync('./mume')) {
  fs.rmdirSync('./mume', { recursive: true });
}

// Make source directories
copyData.forEach(data => {
  fs.mkdirSync(data.target, { recursive: true });
});

// Copy directories
copyData.forEach(data => {
  fs.cpSync(data.source, data.target, { recursive: true });
});

console.log('Copy files done.');
