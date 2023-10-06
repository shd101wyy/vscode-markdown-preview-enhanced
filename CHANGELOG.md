# Changelog

For releases, please visit the [project releases page](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/releases).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
