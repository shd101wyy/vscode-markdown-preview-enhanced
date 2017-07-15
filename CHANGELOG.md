## v0.1.7 
* New design for prensentation mode. Multiple revealjs presentation themes are provided.  
* Added `Welcome Page`.  
* Update `Mume` to version `0.1.0`.  

## v0.1.6 
* [ ] Separate **core library** out from this extension.
* [x] Support Task List (TODO) for pandoc parser. Added click event for checkbox.    
* [ ] Wavedrom support.  
* [ ] Add `Welcome page`.  
* [x] Add preview themes: `Medium`, `None`.
* [x] Add `Markdown Preview Enhanced: Extend Parser` command. 
* [ ] Fix issue [#17](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/17#issuecomment-314016606).  

## July 4, 2017
*Basically finished porting.*   

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
