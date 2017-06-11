// markdown-preview-enhanced-view controller
(function() {

  console.log('init webview')
  const settings = JSON.parse(document.getElementById('vscode-markdown-preview-enhanced-data').getAttribute('data-settings'));
  console.log(settings)

	window.addEventListener('message', (event)=> {
    console.log(JSON.stringify(event))
    console.log(event.data.type)
    console.log(event.data.line)
  }, false);

  window.parent.postMessage({ 
    command: 'did-click-link', // <= this has to be `did-click-link` to post message
    data: `command:_markdown-preview-enhanced.revealLine?${JSON.stringify([settings.fsPath])}`
  }, 'file://')
})()
