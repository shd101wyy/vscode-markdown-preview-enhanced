# Remote SSH Preview Test

This file tests that the markdown preview works correctly when connected
via **Remote SSH** from a Windows client to a Linux host ([#2224](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/issues/2224)).

## Steps to reproduce

1. Open this workspace on a **Linux remote** via VS Code Remote SSH from a **Windows** client
2. Open this file and trigger **Markdown Preview Enhanced: Open Preview to the Side**
3. Verify the preview renders without errors

## Expected behavior

- The preview renders normally below
- No `"notebookPath is not valid"` errors appear in the Extension Host log
  (open via **Developer: Show Logs...** → **Extension Host**)

## What was broken

When VS Code runs on a Windows client connected to a Linux remote, some
internal URIs use Windows-style paths (`file:///c%3A/Users/...`). The
`vscode-uri` library's `fsPath` strips the leading `/` for drive letters,
producing `c:/Users/...` — which `path.isAbsolute()` on Linux returns
`false` for. This caused `crossnote`'s `Notebook.init` to reject the
path, spamming errors continuously.

## Basic rendering check

The preview should render the following content correctly:

### Cross-file links (exercises path resolution)

These links trigger `getWorkspaceFolderUri` to resolve the notebook path.
**Test these on a Linux remote via Remote SSH from a Windows client.**

- Relative link: [basics](./basics.md)
- Relative link to subfolder: [CSV data](./data/sp500.csv)
- Parent-relative link: [README](../markdown/README.md)
- Wiki-link: [[basics]]
- Wiki-link with heading: [[test#overview]]

### File import (exercises notebook path + file system)

@import "./basics.md" {line_begin=0, line_end=5}

### Inline formatting

**Bold**, _italic_, ~~strikethrough~~, `inline code`

### List

- Item 1
- Item 2
  - Nested item

### Code block

```js
function hello() {
  console.log('Preview is working!');
}
```

### Math

$E = mc^2$

### Table

| Feature    | Status     |
| ---------- | ---------- |
| Preview    | ✅ Working |
| Remote SSH | ✅ Fixed   |

### Image (placeholder)

> If this renders as a blockquote, the preview is working.

---

_If you can see this rendered preview without errors in the Extension Host log, issue #2224 is fixed._
