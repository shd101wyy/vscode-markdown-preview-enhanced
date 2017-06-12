// markdown-preview-enhanced-view controller
(function() {

console.log('init webview')
// const settings = JSON.parse(document.getElementById('vscode-markdown-preview-enhanced-data').getAttribute('data-settings'));
// console.log(settings)

// copied from 'config.ts'
interface MarkdownConfig {
  breakOnSingleNewLine?: boolean,
  enableTypographer?: boolean,
  scrollSync?: boolean,
  mermaidTheme?: string,

  mathRenderingOption?: string,
  mathInlineDelimiters?: Array<string[]>,
  mathBlockDelimiters?: Array<string[]>,

  codeBlockTheme?: string,

  previewTheme?: string,
}

/**
 * this is the element with class `markdown-preview-enhanced`
 * the final html is rendered by that previewElement
 */
let previewElement = null

/**
 * tempPreviewElement is used to render html and then put the rendered html result to previewElement
 */
let tempPreviewElement = null

/**
 * This config is the same as the one defined in `config.ts` file
 */
let config:MarkdownConfig = {}

/**
 * markdown file URI 
 */
let sourceUri = null

/**
 * mpe URI
 */
let previewUri = null 

let scrollMap = null,
    totalLineCount = 0,
    previewScrollDelay = 0,
    editorScrollDelay = 0,
    scrollTimeout = null,
    presentationMode = false, 
    presentationZoom = 1,
    currentLine = -1

function onLoad() {
  previewElement = document.getElementsByClassName('markdown-preview-enhanced')[0]

  tempPreviewElement = document.createElement("div")
  tempPreviewElement.classList.add('markdown-preview-enhanced')
  tempPreviewElement.setAttribute('for', 'preview')
  document.body.insertBefore(tempPreviewElement, previewElement)

  /** load config */
  config = JSON.parse(document.getElementById('vscode-markdown-preview-enhanced-data').getAttribute('data-config'))
  sourceUri = config['sourceUri']
  previewUri = config['previewUri']
  currentLine = config['line'] || -1

  console.log(document.getElementsByTagName('html')[0].innerHTML)
  console.log(JSON.stringify(config))

  scrollMap = null
  previewElement.onscroll = scrollEvent
}

function renderMermaid() {
  return new Promise((resolve, reject)=> {
    const mermaid = window['mermaid'] // window.mermaid doesn't work, has to be written as window['mermaid']
    const mermaidGraphs = tempPreviewElement.getElementsByClassName('mermaid')
    mermaid.init(null, mermaidGraphs)
    // setTimeout(()=> resolve(), 5000)
    return resolve()
  })
}

function renderMathJax() {
  return new Promise((resolve, reject)=> {
    if (config['mathRenderingOption'] === 'MathJax') {
      const MathJax = window['MathJax']
      window['MathJax'].Hub.Queue(
        ['Typeset', MathJax.Hub, tempPreviewElement], 
        ()=> {
          scrollMap = null
          return resolve()
        })
    } else {
      return resolve()
    }
  })
}

async function initEvents() {
  await Promise.all([
    renderMathJax(), 
    renderMermaid()
  ])
  previewElement.innerHTML = tempPreviewElement.innerHTML
  tempPreviewElement.innerHTML = ""
}

function updateHTML(html) {
  // editorScrollDelay = Date.now() + 500
  previewScrollDelay = Date.now() + 500

  tempPreviewElement.innerHTML = html
  initEvents()
}

/**
 * Build offsets for each line (lines can be wrapped)
 * That's a bit dirty to process each line everytime, but ok for demo.
 * Optimizations are required only for big texts.
 * @return array
 */
function buildScrollMap():Array<number> {
  if (!totalLineCount) return null
  const _scrollMap = [],
        nonEmptyList = []
  
  for (let i = 0; i < totalLineCount; i++) {
    _scrollMap.push(-1)
  }

  nonEmptyList.push(0)
  _scrollMap[0] = 0

  // write down the offsetTop of element that has 'data-line' property to _scrollMap
  const lineElements = previewElement.getElementsByClassName('sync-line')

  for (let i = 0; i < lineElements.length; i++) {
    let el = lineElements[i]
    let t = el.getAttribute('data-line')
    if (!t) continue

    t = parseInt(t)
    if(!t) continue

    // this is for ignoring footnote scroll match
    if (t < nonEmptyList[nonEmptyList.length - 1])
      el.removeAttribute('data-line')
    else {
      nonEmptyList.push(t)

      let offsetTop = 0
      while (el && el !== previewElement) {
        offsetTop += el.offsetTop
        el = el.offsetParent
      }

      _scrollMap[t] = Math.round(offsetTop)
    }
  }

  nonEmptyList.push(totalLineCount)
  _scrollMap.push(previewElement.scrollHeight)

  let pos = 0
  for (let i = 0; i < totalLineCount; i++) {
    if (_scrollMap[i] !== -1) {
      pos++
      continue
    }

    let a = nonEmptyList[pos - 1]
    let b = nonEmptyList[pos]
    _scrollMap[i] = Math.round((_scrollMap[b] * (i - a) + _scrollMap[a] * (b - i)) / (b - a))
  }

  return _scrollMap  // scrollMap's length == screenLineCount (vscode can't get screenLineCount... sad)
}

function scrollEvent() { 
  if (!config.scrollSync) return

  if (!scrollMap) {
    scrollMap = buildScrollMap()
    return 
  }

  if ( Date.now() < previewScrollDelay ) return 
  previewSyncSource()
}

function previewSyncSource() {
  let scrollToLine

  if (previewElement.scrollTop === 0) {
    // editorScrollDelay = Date.now() + 100
    scrollToLine = 0

    window.parent.postMessage({ 
      command: 'did-click-link', // <= this has to be `did-click-link` to post message
      data: `command:_markdown-preview-enhanced.revealLine?${JSON.stringify([sourceUri, scrollToLine])}`
    }, 'file://')

    return 
  }

  let top = previewElement.scrollTop + previewElement.offsetHeight / 2

  if (presentationMode) {
    top = top / presentationZoom
  }

  // try to find corresponding screen buffer row
  if (!scrollMap) scrollMap = buildScrollMap()

  let i = 0
  let j = scrollMap.length - 1
  let count = 0
  let screenRow = -1 // the screenRow is the bufferRow in vscode.
  let mid 

  while (count < 20) {
    if (Math.abs(top - scrollMap[i]) < 20) {
      screenRow = i
      break
    } else if (Math.abs(top - scrollMap[j]) < 20) {
      screenRow = j
      break
    } else {
      mid = Math.floor((i + j) / 2)
      if (top > scrollMap[mid])
        i = mid
      else
        j = mid
    }
    count++
  }

  if (screenRow == -1)
    screenRow = mid

  scrollToLine = screenRow
  // console.log(scrollToLine)

  window.parent.postMessage({ 
    command: 'did-click-link', // <= this has to be `did-click-link` to post message
    data: `command:_markdown-preview-enhanced.revealLine?${JSON.stringify([sourceUri, scrollToLine])}`
  }, 'file://')

  // @scrollToPos(screenRow * @editor.getLineHeightInPixels() - @previewElement.offsetHeight / 2, @editor.getElement())
  // # @editor.getElement().setScrollTop

  // track currnet time to disable onDidChangeScrollTop
  // editorScrollDelay = Date.now() + 100
}

/**
 * scroll preview to match `line`
 * @param line: the buffer row of editor
 */
function scrollSyncToLine(line:number) {
  if (!scrollMap) scrollMap = buildScrollMap()

  /**
   * Since I am not able to access the viewport of the editor 
   * I used `golden section` here for scrollTop.  
   */
  scrollToPos(Math.max(scrollMap[line] - previewElement.offsetHeight * 0.372, 0))
}

/**
 * Smoothly scroll the previewElement to `scrollTop` position.  
 * @param scrollTop: the scrollTop position that the previewElement should be at
 */
function scrollToPos(scrollTop) {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
    scrollTimeout = null
  }

  if (scrollTop < 0) return 

  const delay = 10

  function helper(duration=0) {
    scrollTimeout = setTimeout(() => {
      if (duration <= 0) {
        previewScrollDelay = Date.now() + 500
        previewElement.scrollTop = scrollTop
        return
      }

      const difference = scrollTop - previewElement.scrollTop

      const perTick = difference / duration * delay

      // disable preview onscroll
      previewScrollDelay = Date.now() + 500

      previewElement.scrollTop += perTick
      if (previewElement.scrollTop == scrollTop) return 

      helper(duration-delay)
    }, delay)
  }

  const scrollDuration = 120
  helper(scrollDuration)
}

/**
 * It's unfortunate that I am not able to access the viewport.  
 * @param line 
 */
function scrollToRevealSourceLine(line) {
  if (!config.scrollSync || line == currentLine) {
    return 
  } else {
    currentLine = line
  }

  // disable preview onscroll
  previewScrollDelay = Date.now() + 500

  scrollSyncToLine(line)
}


function resizeEvent() {
  console.log('resize')
  scrollMap = null
}

window.addEventListener('message', (event)=> {
  const data = event.data 
  if (!data) return 
  
  console.log('receive message: ' + data.type)

  if (data.type === 'update-html') {
    totalLineCount = data.totalLineCount
    updateHTML(data.html)
  } else if (data.type === 'change-text-editor-selection') {
    const line = parseInt(data.line)
    scrollToRevealSourceLine(line)
  }
}, false);

window.addEventListener('resize', resizeEvent)

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
