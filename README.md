# Markdown Preview Enhanced

Trying hard to port [Markdown Preview Enhanced for Atom](https://github.com/shd101wyy/markdown-preview-enhanced) to vscode.

First time to write typescript, and it is awesome. I think I will write all my web projects in TypeScript from now on.  

Below is a demo of the Atom version.   

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
* `Markdown Preview Enhanced: Insert New Slide`  
* `Markdown Preview Enhanced: Insert Table`  
* `Markdown Preview Enhanced: Insert Page Break`  


* **Right Click** at the Preview to see the contextmenu  

![Screen Shot 2017-06-15 at 1.36.32 AM](https://ooo.0o0.ooo/2017/06/15/59422b1ab3931.png)

For more features that will be supported in the future, check [Markdown Preview Enhanced for atom](https://shd101wyy.github.io/markdown-preview-enhanced/#/).


## Requirements

TODO

## My Questions
It would be great if you can answer my following questions to help develop this extension.  
1. Is there a `onDidChangeScrollTop` function for `TextEditor` in vscode. So that I can track the change of scrollTop position of the text editor.  
1. Can I manually set the `scrollTop` of `TextEditor`?
1. How to programmatically close my preview by `uri`? I tried to implement the `Toggle Preview` command but failed because I don't know how to close a preview. So now only `Open Preview` is provided.  
1. How do I programmatically close the a `Preview` by `vscode.Uri`?  

## Extension Settings

Search `markdown-preview-enhanced` in settings.  

## Known Issues

TODO

## Release Notes

TODO