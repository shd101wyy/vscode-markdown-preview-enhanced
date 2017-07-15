## Anouncement
I think I have finished porting [Markdown Preview Enhanced for Atom](https://atom.io/packages/markdown-preview-enhanced) successfully to VS Code. Cheers :) 


## 0.1.8

* Upgraded [mume](https://github.com/shd101wyy/mume) to version `0.1.2`.  
    * Switched the default markdown parser from `remarkable` to `markdown-it`.  
    * Fixed pandoc export front-matter not included bug.  
    * Fixed `bash` language highlighting bug. 
    * Fixed phantomjs export task list bug.   
    * Upgraded `webview.ts` script for preview. Now both Atom and VS Code versions share the same preview logic.  
    * Removed several redundandent dependencies.  
* Added several new code block themes. 
