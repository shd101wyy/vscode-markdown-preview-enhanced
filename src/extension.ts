// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { utility } from 'crossnote';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { initExtensionCommon } from './extension-common';
import { getAllPreviewProviders } from './preview-provider';
import { getGlobalConfigPath } from './utils';

let editorScrollDelay = Date.now();

// hide default vscode markdown preview buttons if necessary
const hideDefaultVSCodeMarkdownPreviewButtons = vscode.workspace
  .getConfiguration('markdown-preview-enhanced')
  .get<boolean>('hideDefaultVSCodeMarkdownPreviewButtons');
if (hideDefaultVSCodeMarkdownPreviewButtons) {
  vscode.commands.executeCommand(
    'setContext',
    'hasCustomMarkdownPreview',
    true,
  );
}

// this method is called when your extension iopenTextDocuments activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Watch the file changes in global config directory.
  fs.watch(getGlobalConfigPath(), async (eventType, fileName) => {
    if (
      eventType === 'change' &&
      [
        'style.less',
        'mermaid.json',
        'mathjax_v3.json',
        'katex.json',
        'parser.js',
      ].includes(fileName ?? '')
    ) {
      const providers = getAllPreviewProviders();
      providers.forEach(provider => {
        provider.refreshAllPreviews();
      });
    }
  });

  // Init the extension-common module
  initExtensionCommon(context);

  function customizeCSS() {
    const globalStyleLessFile = utility.addFileProtocol(
      path.resolve(getGlobalConfigPath(), './style.less'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(globalStyleLessFile),
    );
  }

  function openMermaidConfig() {
    const mermaidConfigFilePath = utility.addFileProtocol(
      path.resolve(getGlobalConfigPath(), './mermaid.json'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(mermaidConfigFilePath),
    );
  }

  function openMathJaxConfig() {
    const mathjaxConfigFilePath = utility.addFileProtocol(
      path.resolve(getGlobalConfigPath(), './mathjax_v3.json'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(mathjaxConfigFilePath),
    );
  }

  function openKaTeXConfig() {
    const katexConfigFilePath = utility.addFileProtocol(
      path.resolve(getGlobalConfigPath(), './katex.json'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(katexConfigFilePath),
    );
  }

  function extendParser() {
    const parserConfigPath = utility.addFileProtocol(
      path.resolve(getGlobalConfigPath(), './parser.js'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(parserConfigPath),
    );
  }

  function showUploadedImages() {
    const imageHistoryFilePath = utility.addFileProtocol(
      path.resolve(getGlobalConfigPath(), './image_history.md'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(imageHistoryFilePath),
    );
  }

  function clickTagA(uri, href) {
    href = decodeURIComponent(href);
    href = href
      .replace(/^vscode\-resource:\/\//, '')
      .replace(/^vscode\-webview\-resource:\/\/(.+?)\//, '')
      .replace(/^file\/\/\//, 'file:///')
      .replace(
        /^https:\/\/file\+\.vscode-resource.vscode-cdn.net\//,
        'file:///',
      )
      .replace(
        /^https?:\/\/(.+?)\.vscode-webview-test.com\/vscode-resource\/file\/+/,
        'file:///',
      )
      .replace(/^https?:\/\/file(.+?)\.vscode-webview\.net\/+/, 'file:///');
    if (
      ['.pdf', '.xls', '.xlsx', '.doc', '.ppt', '.docx', '.pptx'].indexOf(
        path.extname(href),
      ) >= 0
    ) {
      utility.openFile(href);
    } else if (href.match(/^file:\/\/\//)) {
      // openFilePath = href.slice(8) # remove protocol
      let openFilePath = utility.addFileProtocol(
        href, // .replace(/(\s*)[\#\?](.+)$/, ""),
      );
      openFilePath = decodeURI(openFilePath);
      const fileUri = vscode.Uri.parse(openFilePath);

      // determine from link fragment to which line to jump
      let line = -1;
      const found = fileUri.fragment.match(/^L(\d+)/);
      if (found) {
        line = parseInt(found[1], 10);
        if (line > 0) {
          line = line - 1;
        }
      }

      // find if there is already opened such file
      // and remember in which view column it is
      let col = vscode.ViewColumn.One;
      tgrLoop: for (const tabGroup of vscode.window.tabGroups.all) {
        for (const tab of tabGroup.tabs) {
          if (tab.input instanceof vscode.TabInputText) {
            if (tab.input.uri.path === fileUri.path) {
              col = tabGroup.viewColumn;
              break tgrLoop;
            }
          }
        }
      }

      // open file if needed, if not we will use already opened editor
      // (by specifying view column in which it is already shown)

      if (fs.existsSync(fileUri.fsPath)) {
        vscode.workspace.openTextDocument(fileUri.path).then(doc => {
          vscode.window.showTextDocument(doc, col).then(editor => {
            // if there was line fragment, jump to line
            if (line >= 0) {
              let viewPos = vscode.TextEditorRevealType.InCenter;
              if (editor.selection.active.line === line) {
                viewPos = vscode.TextEditorRevealType.InCenterIfOutsideViewport;
              }
              const sel = new vscode.Selection(line, 0, line, 0);
              editor.selection = sel;
              editor.revealRange(sel, viewPos);
            }
          });
        });
      } else {
        vscode.commands.executeCommand(
          'vscode.open',
          fileUri,
          vscode.ViewColumn.One,
        );
      }
    } else {
      utility.openFile(href);
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.customizeCss',
      customizeCSS,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openMermaidConfig',
      openMermaidConfig,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openMathJaxConfig',
      openMathJaxConfig,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openKaTeXConfig',
      openKaTeXConfig,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.extendParser',
      extendParser,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.showUploadedImages',
      showUploadedImages,
    ),
  );

  // context.subscriptions.push(vscode.commands.registerCommand('_crossnote.cacheSVG', cacheSVG))

  context.subscriptions.push(
    vscode.commands.registerCommand('_crossnote.clickTagA', clickTagA),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_crossnote.showUploadedImageHistory',
      showUploadedImages,
    ),
  );
}
