# Markdown Preview Enhanced

Trying hard to port [Markdown Preview Enhanced for Atom](https://github.com/shd101wyy/markdown-preview-enhanced) to vscode.

First time to write typescript, and it is awesome. I think I will write all my web projects in TypeScript from now on.  


## Features

Right now only 20% done:   

* Basic preview 
    * <kbd>ctrl-shift-m</kbd> to `Open Preview`
* Scroll sync partially done
* Support KaTeX and MathJax
* Support mermaid, PlantUML, viz.js 

For more features that will be supported in the future, check [Markdown Preview Enhanced for atom](https://shd101wyy.github.io/markdown-preview-enhanced/#/).

### Progress so far
* Done supporting `mermaid`, `PlantUML` and `viz.js`.
* Done supporting `[TOC]`.  
* Done supporting `MathJax` and `KaTeX`.
* Done sidebar TOC.  
* Done supporting front matter.

## Requirements

TODO

## My Questions
It would be great if you can answer my following questions to help develop this extension.  
1. Is the a `onDidChangeScrollTop` function for `TextEditor` in vscode. So that I can track the change of scrollTop position of the text editor.  
1. Can I manually set the `scrollTop` of `TextEditor`?
1. How to programmatically close my preview by `uri`? I tried to implement the `Toggle Preview` command but failed because I don't know how to close a preview. So now only `Open Preview` is provided.  

## Extension Settings

Search `markdown-preview-enhanced` in settings.  

## Known Issues

TODO

## Release Notes

TODO