## Anouncement
I think I have finished porting [Markdown Preview Enhanced for Atom](https://atom.io/packages/markdown-preview-enhanced) successfully to VS Code. Cheers :) 


## 0.1.9
* Upgraded [mume](https://github.com/shd101wyy/mume) to version `0.1.3`.  
    * Fixed pandoc export bug.
    * Fixed markdown export bug. Added `ignore_from_front_matter` option in `markdown` field. Removed `front_matter` option from `markdown` field.  
    * Added `latexEngine` and `enableExtendedTableSyntax` config options. Now supporting merging table cells (disabled by default. Could be enabled from settings). 
    [#479](https://github.com/shd101wyy/markdown-preview-enhanced/issues/479), [#133](https://github.com/shd101wyy/markdown-preview-enhanced/issues/133).    

    ![screen shot 2017-07-15 at 8 16 45 pm](https://user-images.githubusercontent.com/1908863/28243710-945e3004-699a-11e7-9a5f-d74f6c944c3b.png)
* Fixed html export bug.  

## 0.1.8

* Upgraded [mume](https://github.com/shd101wyy/mume) to version `0.1.2`.  
    * Switched the default markdown parser from `remarkable` to `markdown-it`.  
    * Fixed pandoc export front-matter not included bug.  
    * Fixed `bash` language highlighting bug. 
    * Fixed phantomjs export task list bug.   
    * Upgraded `webview.ts` script for preview. Now both Atom and VS Code versions share the same preview logic.  
    * Removed several redundandent dependencies.  
* Added several new code block themes. 
