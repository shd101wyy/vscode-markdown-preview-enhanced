## Anouncement 
I will be busy hunting jobs (August & September), so I won't have time to implement new features for this extension.     
The updates in the following two months will be bug fixes only.  

## 0.2.3
* The old feature [WaveDrom diagram](https://shd101wyy.github.io/markdown-preview-enhanced/#/diagrams?id=wavedrom) is now supported again.
* The doc of customization css is updated, please [check it here](https://shd101wyy.github.io/markdown-preview-enhanced/#/customize-css).
* Sidebar TOC is now supported in HTML export, and it is enabled by default.
  ![screen shot 2017-08-05 at 8 50 16 pm](https://user-images.githubusercontent.com/1908863/28999904-c40b56b6-7a1f-11e7-9a9e-ab2e19a82b41.png)

  You can configure the sidebar TOC by front-matter. For more information, please check [this doc](https://shd101wyy.github.io/markdown-preview-enhanced/#/html?id=configuration).
* Upgraded [mume](https://github.com/shd101wyy/mume) to version [0.1.7](https://github.com/shd101wyy/mume/blob/master/CHANGELOG.md).

## 0.2.2  
* Deprecated the old way of defining attribtues (still supported but not recommened) [#529](https://github.com/shd101wyy/markdown-preview-enhanced/issues/529). Now attributes should be defined like below in order to be compatible with the pandoc parser:  

        {#identifier .class .class key=value key=value}


    And here are a few changes:  

        # Hi {#id .class1 .class2}

        Show `line-numbers`
        ```javascript {.line-numbers}
        x = 1
        ```

        ```python {cmd=true output="markdown"}
        print("**Hi there**")
        ```

        <!-- slide vertical=true .slide-class1 .slide-class2 #slide-id -->

        \@import "test.png" {width=50% height=30%}
* Added a few more preview themes.  
* Supported [vega](https://vega.github.io/vega/) and [vega-lite](https://vega.github.io/vega-lite/). [#524](https://github.com/shd101wyy/markdown-preview-enhanced/issues/524).   

    * Code block with `vega` notation will be rendered by [vega](https://vega.github.io/vega/).  
    * Code block with `vega-lite` notation will be rendered by [vega-lite](https://vega.github.io/vega-lite/).  
    * Both `JSON` and `YAML` inputs are supported.

    ![screen shot 2017-07-28 at 7 59 58 am](https://user-images.githubusercontent.com/1908863/28718265-d023e1c2-736a-11e7-8678-a29704f3a23c.png)

    You can also [@import](https://shd101wyy.github.io/markdown-preview-enhanced/#/file-imports) a `JSON` or `YAML` file as `vega` diagram, for example:  

<pre>
    \@import "your_vega_source.json" {as:"vega"}
    \@import "your_vega_lite_source.json" {as:"vega-lite"}
</pre>

* Supported [ditaa](https://github.com/stathissideris/ditaa).  
  ditaa can convert diagrams drawn using ascii art ('drawings' that contain characters that resemble lines like | / - ), into proper bitmap graphics. (**Java** is required to be installed)         

  `ditaa` is intergrated with [code chunk](https://shd101wyy.github.io/markdown-preview-enhanced/#/code-chunk), for example:  
<pre>
  ```ditaa {cmd=true args=["-E"]}
  +--------+   +-------+    +-------+
  |        | --+ ditaa +--> |       |
  |  Text  |   +-------+    |diagram|
  |Document|   |!magic!|    |       |
  |     {d}|   |       |    |       |
  +---+----+   +-------+    +-------+
      :                         ^
      |       Lots of work      |
      +-------------------------+
  ```
</pre>

> <kbd>shift-enter</kbd> to run code chunk.  
> set `{hide=true}` to hide code block.  
> set `{run_on_save=true}` to render ditaa when you save the markdown file.  

![screen shot 2017-07-28 at 8 11 15 am](https://user-images.githubusercontent.com/1908863/28718626-633fa18e-736c-11e7-8a4a-915858dafff6.png)



## 0.2.0, 0.2.1
* Upgraded [mume](https://github.com/shd101wyy/mume) to version `0.1.5`.
    * Fixed header id bug [#516](https://github.com/shd101wyy/markdown-preview-enhanced/issues/516).  
    * Fixed `enableExtendedTableSyntax` bug.  
    * Fixed `MathJax` init error.  
    * Fixed plain text code block font size issue.  
    * Fixed `transformMarkdown` function `Maximum call stack size exceeded` issue [515](https://github.com/shd101wyy/markdown-preview-enhanced/issues/515), [#517](https://github.com/shd101wyy/markdown-preview-enhanced/issues/517).  
    * Fixed `webview.ts` `clickTagA` action bug [503](https://github.com/shd101wyy/markdown-preview-enhanced/issues/503).   
 

