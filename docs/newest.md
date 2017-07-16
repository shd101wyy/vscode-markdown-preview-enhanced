## Anouncement
I think I have finished porting [Markdown Preview Enhanced for Atom](https://atom.io/packages/markdown-preview-enhanced) successfully to VS Code. Cheers :) 


## 0.1.9
* Upgraded [mume](https://github.com/shd101wyy/mume) to version `0.1.3`.  
    * Fixed pandoc export bug on Windows.
    * Fixed markdown export bug. Added `ignore_from_front_matter` option in `markdown` field. Removed `front_matter` option from `markdown` field.  
    * Added `latexEngine` and `enableExtendedTableSyntax` config options. Now supporting merging table cells (disabled by default. Could be enabled from settings). 
    [#479](https://github.com/shd101wyy/markdown-preview-enhanced/issues/479), [#133](https://github.com/shd101wyy/markdown-preview-enhanced/issues/133).    

    ![screen shot 2017-07-15 at 8 16 45 pm](https://user-images.githubusercontent.com/1908863/28243710-945e3004-699a-11e7-9a5f-d74f6c944c3b.png)
    * Supported `export_on_save` front-matter that exports files when you save your markdown file. However, `phantomjs`, `prince`, `pandoc`, `ebook` are not recommended for `export_on_save` because it's too slow.  

    eg:
    ```javascript
    ---
    export_on_save:
        html: true
        markdown: true
        prince: true
        phantomjs: true // or "pdf" | "jpeg" | "png" | ["pdf", ...] 
        pandoc: true
        ebook: true // or "epub" | "mobi" | "html" | "pdf" | array
    ---
    ```        
    * Added `embed_svg` front-matter option for HTML export, which is enabled by default. 
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
