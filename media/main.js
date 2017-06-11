// markdown-preview-enhanced-view controller

'use strict'

console.log('Hello Controller');
console.log(typeof(path))

	window.addEventListener('message', (event)=> {
    console.log(JSON.stringify(event))
    console.log(event.data.type)
    console.log(event.data.line)
  }, false);