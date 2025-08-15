# Changelog

For releases, please visit the [project releases page](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/releases).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.19] - 2025-08-15

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.15](https://github.com/shd101wyy/crossnote/releases/tag/0.9.15).

### Changes

- Add `markdown-preview-enhanced.liveUpdateDebounceMs` setting to control the live update debounce time in milliseconds. Default is `300ms`.
- Allow to disable auto-preview config for specific URI schemes. Fixed the issue [#604](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/604) by @alonsorobots.

### Bug fixes

- Fixed splitting logic to handle diagrams starting with `<svg>` correctly [crossnote#376](https://github.com/shd101wyy/crossnote/issues/376) by @shiftdownet.

### Updates

- Updated `katex` version to the latest `0.16.22`.
- Updated `mermaid` version to the latest `11.9.0`.

## [0.8.18] - 2025-03-16

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.13](https://github.com/shd101wyy/crossnote/releases/tag/0.9.14).

### Bug fixes

- Fixed the build for vscode-web caused by prismjs.

## [0.8.17] - 2025-03-16

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.13](https://github.com/shd101wyy/crossnote/releases/tag/0.9.13).

### Bug fixes

- Fixed a bug of bundling caused by importing the [sharp](https://www.npmjs.com/package/sharp) package.

## [0.8.16] - 2025-03-16

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.12](https://github.com/shd101wyy/crossnote/releases/tag/0.9.12).

### Changes

- Use [sharp](https://www.npmjs.com/package/sharp) to convert svg element to png file if `imageMagickPath` is empty. [crossnote#366](https://github.com/shd101wyy/crossnote/issues/366)

### Updates

- Updated `mermaid` version to the latest `11.5.0`.
- Updated `katex` version to the latest `0.16.21`.
- Updated `prismjs` version to the latest `1.30.0`.
- Updated `bit-field` version to the latest `1.9.0`.

### Bug fixes

- Fixed the import the crossnote as nodejs esm module. [crossnote#357](https://github.com/shd101wyy/crossnote/issues/357)
- Fixed a bug of using `enableExtendedTableSyntax`. [crossnote#369](https://github.com/shd101wyy/crossnote/issues/369)

## [0.8.15] - 2024-09-07

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.11](https://github.com/shd101wyy/crossnote/releases/tag/0.9.11).

### Changes

- Enabled the preview zen mode by default.

### Updates

- Updated `mermaid` version to the latest `11.4.0`.

## [0.8.14] - 2024-09-07

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.10](https://github.com/shd101wyy/crossnote/releases/tag/0.9.10).

### Changes

- Added `.mdx` to the default `markdownFileExtensions`.

### Updates

- Updated `mermaid` version to the latest `11.1.1`.
- Updated `katex` version to the latest `v0.16.11`.

### Bug fixes

- Fixed a scroll sync bug.

## [0.8.13] - 2024-03-18

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.9](https://github.com/shd101wyy/crossnote/releases/tag/0.9.9).

### Bug fixes

- Fixed [a bug of link redirection in preview](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1951) by @byte-clown
- Fixed [Long sidebarToc does not display completely](https://github.com/shd101wyy/crossnote/pull/354) by @moonlitusun
- Removed the `text` as the default language selector for code block.

### Chore

- Updated [flake.nix](./flake.nix) and node.js to 20.

## [0.8.12] - 2024-03-10

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.8](https://github.com/shd101wyy/crossnote/releases/tag/0.9.8).

### New features

- @moonlitusun sidebarToc supports local caching

### Updates

- @oneWaveAdrian updated the `mermaid` version to the latest `10.9.0`.

### Bug fixes

- Fixed [[BUG] #tag is treated as Header 1](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1937)
- Fixed [[BUG] toml code block support is not very good](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1920)
- Fixed [[BUG] If URL encoding is used, the preview cannot be displayed.](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1934)

## [0.8.11] - 2023-12-10

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.7](https://github.com/shd101wyy/crossnote/releases/tag/0.9.7).

### New features

- Added `enablePreviewZenMode` option and reorganized the right-click context menu.

  ![image](https://github.com/shd101wyy/crossnote/assets/1908863/26e2237e-c6e2-433e-a063-6de2c01a64bb)

### Bug fixes

- Fixed rendering `vega-lite` in `Reveal.js` slide: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1880
- Removed one github-dark background css attribute: https://github.com/shd101wyy/crossnote/issues/344

## [0.8.10] - 2023-10-26

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.6](https://github.com/shd101wyy/crossnote/releases/tag/0.9.6).

### Changes

- Updated mermaid.js to the latest version 10.6.0.

### Bug fixes

- Fixed importing file with spaces in the path: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1857
- Fixed a bug of updating the vscode `workbench.editorAssociations`: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1860

## [0.8.9] - 2023-10-23

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.5](https://github.com/shd101wyy/crossnote/releases/tag/0.9.5).

### Bug fixes

- Fixed of bug of rendering the KaTeX math expression: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1853

## [0.8.8] - 2023-10-22

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.4](https://github.com/shd101wyy/crossnote/releases/tag/0.9.4).

### New features

- Updated [fontawesome](https://fontawesome.com/) from version 4.7 to version 6.4.2 (Free).  
  A list of available icons can be found at: https://kapeli.com/cheat_sheets/Font_Awesome.docset/Contents/Resources/Documents/index
- Updated WaveDrom to the latest version 3.3.0.

### Changes

- Changed the markdown parser process to be like below. We removed the `onWillTransformMarkdown` and `onDidTransformMarkdown` hooks as these two caused the confusion.

  ```markdown
  markdown
  ↓
  `onWillParseMarkdown(markdown)`
  ↓
  markdown
  ↓
  **crossnote markdown transformer**
  ↓
  markdown
  ↓
  **markdown-it or pandoc renderer**
  ↓
  html
  ↓
  `onDidParseMarkdown(html)`
  ↓
  html, and then rendered in the preview
  ```

- (Beta) Supported to export the selected element in preview to .png file and copy the blob to the clipboard:

  ![image](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/assets/1908863/046759d8-6d89-4f41-8420-b863d2094fe7)

### Bug fixes

- Fixed a bug of importing files that contains empty heading: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1840
- Fixed a bug of rendering inline math in image name: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1846
- Fixed a bug of parsing inline code: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1848

## [0.8.7] - 2023-10-15

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.2](https://github.com/shd101wyy/crossnote/releases/tag/0.9.2) and version [0.9.3](https://github.com/shd101wyy/crossnote/releases/tag/0.9.3).

### New features

- Added `ID` button to copy the element id to clipboard:

  ![Screenshot from 2023-10-15 15-34-27](https://github.com/shd101wyy/crossnote/assets/1908863/ede91390-3cca-4b83-8e30-33027bf0a363)

- Supported to import section of markdown by header id:

  ```markdown
  @import "test.md#header-id"

  or

  ![](test.md#header-id)

  or

  ![[test#header-id]]
  ```

### Bug fixes

- URL fragments on image links do not load: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1837
- Supported matplotlib-type preview for other Python tools like `pipenv`: https://github.com/shd101wyy/crossnote/issues/332
- Fixed jump to header from link like `[link](test.md#header-id)`.
- Better handling of source map for importing files.

## [0.8.6] - 2023-10-14

This MPE version reduced the VS Code version requirement to 1.70.0 or above.

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.9.0](https://github.com/shd101wyy/crossnote/releases/tag/0.9.0) and [0.9.1](https://github.com/shd101wyy/crossnote/releases/tag/0.9.1).

### New features

- Added two more syntaxes to import files in addition to the `@import` syntax. Please note that these syntaxes only work on new lines. For example, they won't work within list items.
  - Use the image syntax but with other file extensions:
    ```markdown
    ![](path/to/file.md)
    ![](path/to/test.py){.line-numbers}
    ![](path/to/test.js){code_block=true}
    ```
  - Use the wikilink syntax but with other file extensions:
    ```markdown
    ![[file]]
    ![[path/to/test.py]]{.line-numbers}
    ![[path/to/test.js]]{code_block=true}
    ```

### Bug fixes

- Fixed a header id generation bug https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1833
- Fixed parsing block attributes from curly bracket when `enableTypographer` is enabled https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1823
- Fixed the bug of not rendering the `@import` file:
  - https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1832
  - https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1834
- Fixed rendering `vega` and `vega-lite`. Also fixed `interactive=true` attribute for `vega`.

## [0.8.5] - 2023-10-10

Please note this version requires VS Code 1.82.0 or above.

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.8.24](https://github.com/shd101wyy/crossnote/releases/tag/0.8.24).

### Bug fixes

- Improved the handling of `[toc]`: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1825
- Supported to set env variables in paths of configuration: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1826
- Fixed the footer style: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1822
- Fixed the bug of generating the header id: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1827
- Fixed the bug of `@import` files that contains unicode characters: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1823
- Now use node.js 18 for the project.

## [0.8.4] - 2023-10-10

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.8.23](https://github.com/shd101wyy/crossnote/releases/tag/0.8.23).

### Bug fixes

- Fixed exporting reveal.js presentation.

## [0.8.3] - 2023-10-10

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.8.22](https://github.com/shd101wyy/crossnote/releases/tag/0.8.22).

### Bug fixes

- Fixed a bug of loading image https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1819
- Fixed a bug of parsing slides https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1818

## [0.8.2] - 2023-10-09

Special Thanks to [@mavaddat](https://github.com/mavaddat) for creating the awesome extension logo for MPE in this [pull request](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/pull/1808) 🎉 We finally have a beautiful logo for MPE.

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.8.20](https://github.com/shd101wyy/crossnote/releases/tag/0.8.20) and [0.8.21](https://github.com/shd101wyy/crossnote/releases/tag/0.8.21).

### New features

- Supported prefix in front of Kroki diagram types https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1785.  
  So now all diagrams below will get rendered using Kroki:

  ````markdown
  ```kroki-plantuml
  @startuml
  A -> B
  @enduml
  ```

  ```plantuml {kroki=true}
  @startuml
  A -> B
  @enduml
  ```
  ````

- Improved the source map handling for `@import "..."` syntax.

### Bug fixes

- Exporting files no longer includes the source map.
- Fixed some Reveal.js presentation related bugs:
  - https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1815
  - https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1814
- Both the `style.less` from `Markdown Preview Enhanced: Customize Css (Global)` and the `style.less` from `Markdown Preview Enhanced: Customize Css (Workspace)` will now be loaded. The `style.less` from `Markdown Preview Enhanced: Customize Css (Workspace)` will have higher priority.
- Fixed the bug where deleting config files from workspace did not update the preview.

## [0.8.1] - 2023-10-06

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.8.19](https://github.com/shd101wyy/crossnote/releases/tag/0.8.19).

### Changes

- Deprecated the `processWikiLink` in `parser.js`. Now `crossnote` handles how we process the wiki link.  
  We also added two more options:
  - `wikiLinkTargetFileExtension`: The file extension of the target file. Default is `md`. For example:
    - `[[test]]` will be transformed to `[test](test.md)`
    - `[[test.md]]` will be transformed to `[test](test.md)`
    - `[[test.pdf]]` will be transformed to `[test](test.pdf)` because it has a file extension.
  - `wikiLinkTargetFileNameChangeCase`: How we transform the file name. Default is `none` so we won't change the file name.  
    A list of available options can be found at: https://shd101wyy.github.io/crossnote/types/WikiLinkTargetFileNameChangeCase.html

### Bug fixes

- Reverted the markdown transformer and deleted the logic of inserting anchor elements as it's causing a lot of problems.  
  The in-preview editor is not working as expected. So we now hide its highlight lines and elements feature if the markdown file failed to generate the correct source map.
- Fixed the bug that global custom CSS is not working.

## [0.8.0] - 2023-10-05

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.8.17](https://github.com/shd101wyy/crossnote/releases/tag/0.8.17) then version [0.8.18](https://github.com/shd101wyy/crossnote/releases/tag/0.8.18).

### New features

- 📝 Supported in-preview editor that allows you to edit the markdown file directly in the preview 🎉.  
  This feature is currently in beta.  
  When the editor is open, you can press `ctrl+s` or `cmd+s` to save the markdown file. You can also press `esc` to close the editor.
- Deprecated the VS Code setting `markdown-preview-enhanced.singlePreview`.  
  Now replaced by `markdown-preview-enhanced.previewMode`:

  - **Single Preview** (_default_)  
    Only one preview will be shown for all editors.
  - **Multiple Previews**  
    Multiple previews will be shown. Each editor has its own preview.
  - **Previews Only** 🆕  
    No editor will be shown. Only previews will be shown. You can use the in-preview editor to edit the markdown.

    🔔 Please note that enable this option will automatically modify the `workbench.editorAssociations` setting to make sure the markdown files are opened in the custom editor for preview.

- Added two new VS Code commands `Markdown Preview Enhanced: Customize Preview Html Head (Workspace)` and `Markdown Preview Enhanced: Customize Preview Html Head (Global)`, which will open the `head.html` file for you to customize the `<head>` of the preview.

- Supported to set attribute to image and link, e.g.:

  ```markdown
  ![](path/to/image.png){width=100 height=100}
  ```

- Improved the markdown transformer to better insert anchors for scroll sync and highlight lines and elements.  
  Added more tests for the markdown transformer to make sure it works as expected.
- Added the reading time estimation in the preview footer ⏲️.
- Added `Edit Markdown` menu item to the context menu of the preview, which offers two options:
  - **Open VS Code Editor**
    Open the markdown file in VS Code editor.
  - **Open In-preview Editor**
    Open the markdown file in the in-preview editor.
- Updated the mermaid version to the latest `10.5.0`
- Updated the `katex` version to `0.16.9`.
- Added the API website: https://shd101wyy.github.io/crossnote/

### Bug fixes

- Fixed the font size of the `github-dark.css` code block theme.
- Fixed the anchor jump bugs: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1790
- Fixed list item style bug: https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1789
- Fixed a data race bug that caused the preview to hang.

## [0.7.10] - 2023-09-24

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.8.16](https://github.com/shd101wyy/crossnote/releases/tag/0.8.16)

### New features

- Added `head.html` config file to allow you to include custom HTML in the `<head>` of the preview.
  This could be useful for adding custom CSS or JavaScript to the preview.

### Bug fixes

- Fixed the `none.css` preview theme bug https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1778.
- Fixed the bug of copying texts in preview https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1775.
- Added `<code>` in `<pre>` while rendering code blocks in preview.

## [0.7.9] - 2023-09-17

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.8.15](https://github.com/shd101wyy/crossnote/releases/tag/0.8.15)

### New features

- Added the `includeInHeader` option, which allows you to include custom HTML in the `<head>` of the preview.
  This could be useful for adding custom CSS or JavaScript to the preview.

### Bug fixes

- Fixed the bug of missing the backlinks on the `vue.css` theme.
- Fixed the back to top button. https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1769

## [0.7.8] - 2023-09-15

Updated [crossnote](https://github.com/shd101wyy/crossnote) to version [0.8.14](https://github.com/shd101wyy/crossnote/releases/tag/0.8.14)

### New features

- (Beta) Added the [bitfield](https://github.com/wavedrom/bitfield) diagram support. Supported both `bitfield` and `bit-field` code fences. https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1749
  ````
  ```bitfield {vspace=100}
  [
    {name: 'IPO',   bits: 8},
    {               bits: 7},
    {name: 'BRK',   bits: 5, type: 4},
    {name: 'CPK',   bits: 1},
    {name: 'Clear', bits: 3, type: 5},
    {               bits: 8}
  ]
  ```
  ````

### Bug fixes

- Fixed the `vue.css` theme bug that caused the missing scroll bar in the preview. Also fixed a context menu bug for selecting the `vue.css` theme.

## [0.7.7] - 2023-09-15

### Updated to crossnote 0.8.13

https://github.com/shd101wyy/crossnote/releases/tag/0.8.13

#### Bug fixes

- Fixed rendering MathJax in preview https://github.com/shd101wyy/crossnote/pull/311.
- Fixed the preview background color https://github.com/shd101wyy/crossnote/pull/312.
- Added error message when failed to parse the YAML front-matter. Also escaped the HTML rendered in the front-matter table in preview. https://github.com/shd101wyy/crossnote/pull/312.

## [0.7.6] - 2023-09-14

Fixed the extension for https://vscode.dev.
Will migrate vsce publish to GitHub action.

## [0.7.5] - 2023-09-14

Fixed reading file as base64

## [0.7.4] - 2023-09-14

### New features 🆕

1. Complete rewrite of the webview, and improved the UI. 🌐💅
2. Backlinks supported in the preview. Clicking the bottom right link icon will display the backlinks. This feature is currently in beta and might not be stable yet.  
   If you want the backlinks to be always on in the preview, you can enable the setting:

   ```
   "markdown-preview-enhanced.alwaysShowBacklinksInPreview": true,
   ```

3. Updated [reveal.js](https://revealjs.com/) to the latest `4.6.0`.

### Bug fixes 🐛

1. 🐞 [Issue 1752](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1752)

### Future plan 📋

We will further improve the markdown-it parser ~~and we might remove the pandoc parser support~~. You can still use the pandoc export. This will not be affected. 📝✂️

We will add in-preview editing capability in the future. 🖋️

We will also add the backlinks graph view. 📈

## [0.7.3] - 2023-09-06

### New features 🆕

- ⭐ Added `markdown-preview-enhanced.markdownFileExtensions` config that allows users to specify the file extensions for preview.
- 🌟 Supported pandoc-like code blocks, for example:

  ````
  ``` {.python}
  def add(x, y):
    return x + y
  ```

  ``` {.mermaid}
  graph LR
  A --> B
  ```
  ````

  The first class in the `{...}` will be regarded as the `language`.

### Bug fixes 🐞

- :bug: [Single preview bug](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1740)

### MISC 🛠️

- Refactored some [crossnote](https://github.com/shd101wyy/crossnote) code.

## [0.7.2] - 2023-09-05

**0.7.2** is a breaking update! And yes, it might break many things and introduce more bugs. But don't worry, we'll fix them! 😅

### What's new? 🚀

- MPE is now available on [VSCode for the Web](https://vscode.dev) 🥇 Yes, you can now use MPE in your browser. But some features are limited, like exporting files and code chunks, which are disabled in the browser environment. I am writing this CHANGELOG right now in [vscode.dev](https://vscode.dev) using the MPE extension 😃.

  ![image](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/assets/1908863/9222fc77-6bf2-4fd6-bc94-bd8c1953bc24)

- The `mume` library, which powers MPE, is now renamed as [crossnote](https://github.com/shd101wyy/crossnote). This is a complete refactor of the project. We will support more features like backlinks and in-preview editor in the future.
  - Now you can have a `.crossnote` directory for configuring the MPE extension for your workspace. In VSCode, running the command `Markdown Preview Enhanced: Customize CSS (Workspace)` will automatically generate several configuration files for you. There is also a global `.crossnote` directory located at `~/.crossnote` if you are using Windows, or `$XDG_CONFIG_HOME/.crossnote` or `~/.local/state/crossnote` if you are using \*nix. The global configuration has lower priority than the workspace one. 🛠️

### Bug Fixes 🐛

- Fixed [Issue 1736](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1736)
- Fixed [Issue 1737](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/1737) 🚗

## [0.7.1] - 2023-09-02

- Fixed the puppeteer export: https://github.com/shd101wyy/mume/pull/299
- Replaced BabyParse with PapaParse: https://github.com/shd101wyy/mume/pull/298

## [0.7.0] - 2023-09-01

- 🆕 Added `editor-light`, `editor-dark`, `system-light`, `system-dark` class names to the preview panel.
- ✨ Reduced the size of the bundled vscode MPE extension from 40mb to 8mb.
- ➕ Supported to configure: `markdown-preview-enhanced.mathjaxV3ScriptSrc`, `markdown-preview-enhanced.plantumlJarPath`, and `markdown-preview-enhanced.krokiServer`.
- 🔰 Updated [@shd101wyy/mume](https://github.com/shd101wyy/mume) to version [0.7.8](https://github.com/shd101wyy/mume/pull/297).

  - :robot: Completely refactored the `mume` project. It's not done yet, but it's a good start. The next release will be a major release.
    - 🎉 Now use the esbuild to bundle the project.
    - 🎉 Better support of both commonjs and esm.
    - 🔧 Replaced tslint with eslint.
  - :newspaper: Removed the `plantuml.jar` file from the `mume` project. Now you need to download the plantuml.jar file manually from [here](https://plantuml.com/download).
    - If you are using `mume`, you will need to pass `plantumlJarPath` to the `mume.init({})`.
    - If you are using VSCode, you can set the `markdown-preview-enhanced.plantumlJarPath` option in the VSCode settings.
  - 🗑 Removed `ditaa.jar` file from the `mume` project. Also removed the native support of rendering ditaa diagrams. But you can now use [Kroki](https://kroki.io/) to render the `ditaa` diagrams.
  - 🗑 Removed rendering the `js-sequence-diagram` and `flowchart.js` charts.
  - 🎉 Updated `MathJax` to **V3**. `MathJax` V2 is no longer supported.
  - 🎉 Added [Kroki](https://kroki.io/) support to render diagrams. This is a beta feature. For example:

    ````
    ```ditaa {kroki=true}
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
    ````

  - 🎉 Updated `mermaid` to version `10.4.0`, and supported rendering [zenuml](https://mermaid.js.org/syntax/zenuml.html) chart using `mermaid`.
  - 🎉 Updated `vega` to the latest version `5.25.0`.
  - 🎉 Updated `vega-lite` to the latest version `5.14.1`.
  - 🎉 Updated `cheerio` to the latest version `1.0.0-rc.12`.
  - 🎉 Updated `prismjs` to the latest version `0.12.9`.
  - 🎉 Updated `viz.js` to the latest version `3.1.0`.
