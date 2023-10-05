// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { utility } from 'crossnote';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { initExtensionCommon } from './extension-common';
import { PreviewProvider } from './preview-provider';
import { globalConfigPath } from './utils';

// this method is called when your extension openTextDocuments activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  try {
    if (!fs.existsSync(globalConfigPath)) {
      fs.mkdirSync(globalConfigPath, { recursive: true });
    }
    // Watch the file changes in global config directory.
    fs.watch(globalConfigPath, async (eventType, fileName) => {
      if (
        eventType === 'change' &&
        ['style.less', 'config.js', 'parser.js', 'head.html'].includes(
          fileName ?? '',
        )
      ) {
        PreviewProvider.notebooksManager?.updateAllNotebooksConfig();
      }
    });
  } catch (error) {
    console.error(error);
  }

  // Init the extension-common module
  await initExtensionCommon(context);

  function customizeCSS() {
    const globalStyleLessFile = utility.addFileProtocol(
      path.resolve(globalConfigPath, './style.less'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(globalStyleLessFile),
    );
  }

  function openConfigScript() {
    const configScriptPath = utility.addFileProtocol(
      path.resolve(globalConfigPath, './config.js'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(configScriptPath),
    );
  }

  function extendParser() {
    const parserConfigPath = utility.addFileProtocol(
      path.resolve(globalConfigPath, './parser.js'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(parserConfigPath),
    );
  }

  function customizePreviewHtmlHead() {
    const headHtmlPath = utility.addFileProtocol(
      path.resolve(globalConfigPath, './head.html'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(headHtmlPath),
    );
  }

  function showUploadedImages() {
    const imageHistoryFilePath = utility.addFileProtocol(
      path.resolve(globalConfigPath, './image_history.md'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(imageHistoryFilePath),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.customizeCss',
      customizeCSS,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'markdown-preview-enhanced.openConfigScript',
      openConfigScript,
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
      'markdown-preview-enhanced.customizePreviewHtmlHead',
      customizePreviewHtmlHead,
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
    vscode.commands.registerCommand(
      '_crossnote.showUploadedImageHistory',
      showUploadedImages,
    ),
  );
}
