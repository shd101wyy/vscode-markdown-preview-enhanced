// markdown-preview-enhanced-view controller
(function() {

console.log('init webview')
// const settings = JSON.parse(document.getElementById('vscode-markdown-preview-enhanced-data').getAttribute('data-settings'));
// console.log(settings)

/**
 * this is the element with class `markdown-preview-enhanced`
 */
let previewElement = null,
    config = {},
    scrollMap = null

function onLoad() {
  previewElement = document.getElementsByClassName('markdown-preview-enhanced')[0]
  config = JSON.parse(document.getElementById('vscode-markdown-preview-enhanced-data').getAttribute('data-config'))

  console.log(document.getElementsByTagName('html')[0].innerHTML)
  console.log(JSON.stringify(config))
}

function renderMermaid() {
  const mermaid = window['mermaid'] // window.mermaid doesn't work, has to be written as window['mermaid']
  mermaid.init(null, '.mermaid')
}

function renderMathJax() {
  if (config['mathRenderingOption'] === 'MathJax') {
    const MathJax = window['MathJax']
    window['MathJax'].Hub.Queue(
      ['Typeset', MathJax.Hub, previewElement], 
      ()=> scrollMap = null)
  }
}

function updateHTML(html) {
  previewElement.innerHTML = html
  renderMermaid()
  renderMathJax()
}

window.addEventListener('message', (event)=> {
  console.log('receive message: ')
  const data = event.data 
  if (data && data.type === 'update-html') {
    updateHTML(data.html)
  }
}, false);

/*
window.parent.postMessage({ 
  command: 'did-click-link', // <= this has to be `did-click-link` to post message
  data: `command:_markdown-preview-enhanced.revealLine?${JSON.stringify([settings.fsPath])}`
}, 'file://')
*/

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onLoad);
} else {
  onLoad();
}



})()
