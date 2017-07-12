# Markdown Preview Enhanced

  
This extension is powered by [Mume](https://github.com/shd101wyy/mume).  

Trying hard to port [Markdown Preview Enhanced for Atom](https://github.com/shd101wyy/markdown-preview-enhanced) to vscode.

Below is a demo of the Atom version.  
[Website for Atom (outdated)](https://shd101wyy.github.io/markdown-preview-enhanced/#/).  
![](https://user-images.githubusercontent.com/1908863/26898176-a5cad7fc-4b90-11e7-9d8c-74f85f28f133.gif)

## Features
* <kbd>ctrl-shift-m</kbd> for `Markdown Preview Enhanced: Open Preview` command.  
* <kbd>ctrl-shift-i</kbd> for `Markdown Preview Enhanced: Image Helper` command.    
    * Support uploading images to either `imgur` or `sm.ms`.  
![Screen Shot 2017-06-15 at 1.31.01 AM](https://ooo.0o0.ooo/2017/06/15/59422aa748341.png)  
* <kbd>shift-enter</kbd> for `Markdown Preview Enhanced: Run Code Chunk` command.  
* <kbd>ctrl-shift-enter</kbd> for `Markdown Preview Enhanced: Run All Code Chunks` command.  
* `Markdown Preview Enhanced: Customize CSS`    
* `Markdown Preview Enhanced: Create TOC`  
* `Markdown Preview Enhanced: Open Mermaid Config`
* `Markdown Preview Enhanced: Open MathJax Config`  
* `Markdown Preview Enhanced: Open PhantomJS Config`
* `Markdown Preview Enhanced: Open Welcome Page`
* `Markdown Preview Enhanced: Extend Parser`
* `Markdown Preview Enhanced: Insert New Slide`  
* `Markdown Preview Enhanced: Insert Table`  
* `Markdown Preview Enhanced: Insert Page Break`  
* `Markdown Preview Enhanced: Show Uploaded Images`


* **Right Click** at the Preview to see the contextmenu  

![Screen Shot 2017-06-15 at 1.36.32 AM](https://ooo.0o0.ooo/2017/06/15/59422b1ab3931.png)

For more features that will be supported in the future, check [Markdown Preview Enhanced for atom](https://shd101wyy.github.io/markdown-preview-enhanced/#/).

## Extension Settings

Search `markdown-preview-enhanced` in settings.  

For example, `"markdown-preview-enhanced.previewTheme": "gothic.css"` renders Gothic preview theme:  
![Screen Shot 2017-07-11 at 1.49.54 AM](https://ooo.0o0.ooo/2017/07/11/59647528501b0.png)

## Porting Progress
## July 11, 2017
* [x] Migrate **core library** out from this extension to [Mume](https://github.com/shd101wyy/mume). In the future the mpe both vscode and atom will share the same core.
* [x] Support Task List (TODO) for pandoc parser. Added click event for checkbox.    
* [ ] Wavedrom support.  
* [ ] Add `Welcome page`.  
* [x] Add preview themes: `Medium`, `None`.
* [x] Add `Markdown Preview Enhanced: Extend Parser` command. 
* [x] Fix issue [#17](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/17#issuecomment-314016606).  

## July 4, 2017
* Done [PhantomJS export](./docs/phantomjs.md).  
* Done [pandoc parser](https://shd101wyy.github.io/markdown-preview-enhanced/#/pandoc?id=pandoc-parser) support.  
* Added `Gothic`, `Newsprint`, and `Night` preview themes.  

## June 20, 2017
* Done [Pandoc export](https://shd101wyy.github.io/markdown-preview-enhanced/#/pandoc-pdf). (Not tested).  
* Done Markdown(GFM) export. (Not tested)   
* Done [TOC](https://shd101wyy.github.io/markdown-preview-enhanced/#/toc) implementation.   
    > The vscode version is newer than the atom version.   
    > To ignore a heading from TOC, you need to set `{ignore: true}`.  
    > To add class and id, you need to set `{id:"...", class:"..."}`.  
* Done Code Chunk implementation. Added two more options `modify_source` and `run_on_save`. Please check [this doc](./docs/code-chunk.md) for more information.   
* Done [Customize CSS](https://shd101wyy.github.io/markdown-preview-enhanced/#/customize-css) support.  
* Done `mermaid` configuration supoort.    
* Done `MathJax` configuration support.   
* Done `line-numbers`. Simply add `line-numbers` to code block(chunk) `class`.  

![](https://ooo.0o0.ooo/2017/06/20/594939ec162d9.png)

## June 16, 2017
* Done supporting [eBook export](https://shd101wyy.github.io/markdown-preview-enhanced/#/ebook).  
* [@import](https://shd101wyy.github.io/markdown-preview-enhanced/#/file-imports) 70% done. Now support importing every external files except `.js` and `.pdf` files.  
* Done implementing refresh button in preview.  
* [Code Chunk](https://shd101wyy.github.io/markdown-preview-enhanced/#/code-chunk) implementation is now 60% done. LaTeX and JavaScript don't work yet.    
Please note that Code Chunk of [Markdown Preview Enhanced for Atom](https://shd101wyy.github.io/markdown-preview-enhanced/#/code-chunk) is outdated. The syntax of the vscode version is the newest. You need to have `cmd` set to declare a code chunk.  


![](https://ooo.0o0.ooo/2017/06/17/5944a2b03d954.png)  

## June 14, 2017
* Scroll sync is partially done.
* Done supporting `mermaid`, `PlantUML` and `viz.js` (GraphViz). 
* Done supporting `[TOC]`.  
* Done supporting `MathJax` and `KaTeX`.
* Done sidebar TOC.  
* Done back to top button.  
* Done supporting front matter.
* Done supporting `reveal.js` presentation mode. Try inserting `<!-- slide -->` to your markdown.  
* Done `Open in Browser`. 
* Done HTML export.  
* Done `prince` PDF export.  
* Done `Image Helper`.  
* Done supporting single preview.  

## My Questions
It would be great if you can answer my following questions to help develop this extension.  
1. Is there a `onDidChangeScrollTop` function for `TextEditor` in vscode. So that I can track the change of scrollTop position of the text editor.  
1. Can I manually set the `scrollTop` of `TextEditor`?
1. How to programmatically close my preview by `uri`? I tried to implement the `Toggle Preview` command but failed because I don't know how to close a preview. So now only `Open Preview` is provided.  
1. How do I programmatically close the a `Preview` by `vscode.Uri`?  