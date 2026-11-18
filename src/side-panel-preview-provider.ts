import * as path from 'path';
import * as vscode from 'vscode';
import { supportsSecondarySidebar } from './auto-preview-filter';
import {
  PreviewProvider,
  dispatchPreviewWebviewMessage,
} from './preview-provider';
import { getEditorActiveCursorLine, isMarkdownFile } from './utils';

export const SIDE_PANEL_VIEW_ID = 'markdown-preview-enhanced.sidePanelView';
export const SIDE_PANEL_LEGACY_VIEW_ID =
  'markdown-preview-enhanced.sidePanelViewLegacy';
export const SIDE_PANEL_LOCKED_CONTEXT =
  'markdown-preview-enhanced.sidePanelLocked';
export const SIDE_PANEL_HAS_SOURCE_CONTEXT =
  'markdown-preview-enhanced.sidePanelHasSource';
export const DOES_NOT_SUPPORT_SECONDARY_SIDEBAR_CONTEXT =
  'markdown-preview-enhanced.doesNotSupportSecondarySidebar';

interface PendingSidePanelOpenRequest {
  sourceUri: vscode.Uri;
  document: vscode.TextDocument;
  cursorLine?: number;
  forceRefresh?: boolean;
}

export class SidePanelPreviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = SIDE_PANEL_VIEW_ID;

  private webviewView: vscode.WebviewView | undefined;
  private currentSourceUri: vscode.Uri | undefined;
  private currentDocument: vscode.TextDocument | undefined;
  private currentProvider: PreviewProvider | undefined;
  private hasRenderedCurrentSource = false;
  private locked = false;
  private pendingOpenRequest: PendingSidePanelOpenRequest | undefined;
  private openSequence = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly isExcludedDocument?: (
      document: vscode.TextDocument,
    ) => boolean,
  ) {
    void this.syncContextKeys();
  }

  public isLocked(): boolean {
    return this.locked;
  }

  public hasSource(): boolean {
    return !!this.currentSourceUri;
  }

  public isVisible(): boolean {
    return !!this.webviewView?.visible;
  }

  public getCurrentSourceUri(): vscode.Uri | undefined {
    return this.currentSourceUri;
  }

  public getActiveViewId(): string {
    return supportsSecondarySidebar(vscode.version)
      ? SIDE_PANEL_VIEW_ID
      : SIDE_PANEL_LEGACY_VIEW_ID;
  }

  public async setLocked(locked: boolean): Promise<void> {
    this.locked = locked;
    this.updateDescription();
    await this.syncContextKeys();
  }

  public async toggleLock(): Promise<boolean> {
    await this.setLocked(!this.locked);
    return this.locked;
  }

  public async openPreview({
    sourceUri,
    document,
    cursorLine,
    preserveFocus = true,
    forceRefresh = false,
  }: {
    sourceUri: vscode.Uri;
    document: vscode.TextDocument;
    cursorLine?: number;
    preserveFocus?: boolean;
    forceRefresh?: boolean;
  }): Promise<void> {
    const requestId = ++this.openSequence;

    if (!this.webviewView) {
      this.pendingOpenRequest = {
        sourceUri,
        document,
        cursorLine,
        forceRefresh,
      };
      this.currentSourceUri = sourceUri;
      this.currentDocument = document;
      this.hasRenderedCurrentSource = false;
      await this.syncContextKeys();
      await vscode.commands.executeCommand(`${this.getActiveViewId()}.focus`, {
        preserveFocus,
      });
      return;
    }

    this.webviewView.show?.(preserveFocus);

    if (
      !forceRefresh &&
      this.hasRenderedCurrentSource &&
      this.currentSourceUri?.toString() === sourceUri.toString()
    ) {
      this.currentDocument = document;
      this.updateDescription();
      if (typeof cursorLine === 'number' && this.currentProvider) {
        await this.currentProvider.postMessageToPreview(sourceUri, {
          command: 'changeTextEditorSelection',
          line: cursorLine,
          forced: true,
        });
      }
      return;
    }

    const provider = await PreviewProvider.getPreviewContentProvider(
      sourceUri,
      this.context,
    );
    if (requestId !== this.openSequence || !this.webviewView) {
      return;
    }

    if (this.currentProvider && this.currentProvider !== provider) {
      this.currentProvider.detachSidePanelView(this.webviewView);
    }

    this.currentProvider = provider;
    this.currentSourceUri = sourceUri;
    this.currentDocument = document;
    this.hasRenderedCurrentSource = false;
    this.updateDescription();
    await this.syncContextKeys();

    await provider.initSidePanelPreview({
      webviewView: this.webviewView,
      sourceUri,
      document,
      cursorLine,
    });

    if (
      requestId === this.openSequence &&
      this.webviewView &&
      this.currentSourceUri?.toString() === sourceUri.toString()
    ) {
      this.hasRenderedCurrentSource = true;
    }
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
  ): Promise<void> {
    this.webviewView = webviewView;

    webviewView.webview.onDidReceiveMessage(
      (message) => {
        dispatchPreviewWebviewMessage(message, () => this.currentSourceUri);
      },
      null,
      this.context.subscriptions,
    );

    webviewView.onDidDispose(
      () => {
        if (this.currentProvider && this.webviewView) {
          this.currentProvider.detachSidePanelView(this.webviewView);
        }
        if (this.webviewView === webviewView) {
          this.webviewView = undefined;
          this.hasRenderedCurrentSource = false;
        }
      },
      null,
      this.context.subscriptions,
    );

    const pending = this.pendingOpenRequest;
    this.pendingOpenRequest = undefined;
    if (pending) {
      await this.openPreview({
        ...pending,
        preserveFocus: true,
      });
      return;
    }

    if (this.currentSourceUri) {
      try {
        const document =
          this.currentDocument ??
          (await vscode.workspace.openTextDocument(this.currentSourceUri));
        await this.openPreview({
          sourceUri: this.currentSourceUri,
          document,
          preserveFocus: true,
          forceRefresh: true,
        });
        return;
      } catch {
        await this.clearPreview();
        return;
      }
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isMarkdownFile(activeEditor.document)) {
      await this.openPreview({
        sourceUri: activeEditor.document.uri,
        document: activeEditor.document,
        cursorLine: getEditorActiveCursorLine(activeEditor),
        preserveFocus: true,
      });
      return;
    }

    this.updateDescription();
    await this.syncContextKeys();
    this.renderEmptyState();
  }

  public async handleSourcePossiblyClosed(): Promise<void> {
    if (this.locked || !this.currentSourceUri) {
      return;
    }

    if (this.isUriOpenInTabs(this.currentSourceUri)) {
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (
      activeEditor &&
      isMarkdownFile(activeEditor.document) &&
      !this.isExcludedDocument?.(activeEditor.document) &&
      activeEditor.document.uri.toString() !== this.currentSourceUri.toString()
    ) {
      await this.openPreview({
        sourceUri: activeEditor.document.uri,
        document: activeEditor.document,
        cursorLine: getEditorActiveCursorLine(activeEditor),
        preserveFocus: true,
      });
      return;
    }

    await this.clearPreview();
  }

  public async clearPreview(): Promise<void> {
    this.openSequence++;
    this.pendingOpenRequest = undefined;
    if (this.currentProvider && this.webviewView) {
      this.currentProvider.detachSidePanelView(this.webviewView);
    }
    this.currentProvider = undefined;
    this.currentSourceUri = undefined;
    this.currentDocument = undefined;
    this.hasRenderedCurrentSource = false;
    this.updateDescription();
    this.renderEmptyState();
    await this.syncContextKeys();
  }

  public async refresh(): Promise<void> {
    if (!this.currentSourceUri) {
      return;
    }
    if (this.currentProvider && this.hasRenderedCurrentSource) {
      this.currentProvider.refreshPreview(this.currentSourceUri);
      return;
    }
    const document =
      this.currentDocument ??
      (await vscode.workspace.openTextDocument(this.currentSourceUri));
    await this.openPreview({
      sourceUri: this.currentSourceUri,
      document,
      preserveFocus: true,
      forceRefresh: true,
    });
  }

  public async openSourceInEditor(): Promise<void> {
    if (!this.currentSourceUri) {
      return;
    }
    const document = await vscode.workspace.openTextDocument(
      this.currentSourceUri,
    );
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.Active,
    });
  }

  public async popOutToEditorTab(): Promise<void> {
    if (!this.currentSourceUri) {
      return;
    }
    const document =
      this.currentDocument ??
      (await vscode.workspace.openTextDocument(this.currentSourceUri));
    const activeEditor = vscode.window.activeTextEditor;
    const cursorLine =
      activeEditor?.document.uri.toString() === this.currentSourceUri.toString()
        ? getEditorActiveCursorLine(activeEditor)
        : undefined;
    const provider = await PreviewProvider.getPreviewContentProvider(
      this.currentSourceUri,
      this.context,
    );
    await provider.initPreview({
      sourceUri: this.currentSourceUri,
      document,
      cursorLine,
      viewOptions: {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      },
    });
  }

  private isUriOpenInTabs(targetUri: vscode.Uri): boolean {
    const targetFsPath = targetUri.fsPath;
    const targetStr = targetUri.toString();
    const matches = (uri: vscode.Uri | undefined): boolean =>
      !!uri &&
      (uri.toString() === targetStr ||
        (targetUri.scheme === 'file' &&
          uri.scheme === 'file' &&
          uri.fsPath === targetFsPath));

    const tabGroups = vscode.window.tabGroups?.all ?? [];
    for (const group of tabGroups) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (
          typeof vscode.TabInputText === 'function' &&
          input instanceof vscode.TabInputText &&
          matches(input.uri)
        ) {
          return true;
        }
        if (
          typeof vscode.TabInputTextDiff === 'function' &&
          input instanceof vscode.TabInputTextDiff &&
          (matches(input.original) || matches(input.modified))
        ) {
          return true;
        }
        if (
          typeof vscode.TabInputCustom === 'function' &&
          input instanceof vscode.TabInputCustom &&
          matches(input.uri)
        ) {
          return true;
        }
      }
    }

    if (
      tabGroups.length === 0 &&
      (vscode.window.visibleTextEditors ?? []).some((editor) =>
        matches(editor.document?.uri),
      )
    ) {
      return true;
    }

    return false;
  }

  private async syncContextKeys(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      DOES_NOT_SUPPORT_SECONDARY_SIDEBAR_CONTEXT,
      !supportsSecondarySidebar(vscode.version),
    );
    await vscode.commands.executeCommand(
      'setContext',
      SIDE_PANEL_LOCKED_CONTEXT,
      this.locked,
    );
    await vscode.commands.executeCommand(
      'setContext',
      SIDE_PANEL_HAS_SOURCE_CONTEXT,
      !!this.currentSourceUri,
    );
  }

  private updateDescription(): void {
    if (!this.webviewView) {
      return;
    }
    if (!this.currentSourceUri) {
      this.webviewView.description = '';
      return;
    }
    const baseName = path.basename(
      this.currentSourceUri.fsPath || this.currentSourceUri.path,
    );
    this.webviewView.description = this.locked
      ? `[Locked] ${baseName}`
      : baseName;
  }

  private renderEmptyState(): void {
    if (!this.webviewView) {
      return;
    }
    const title = this.escapeHtml(vscode.l10n.t('No Markdown preview open'));
    const subtitle = this.escapeHtml(
      vscode.l10n.t(
        'Open a Markdown document or run "Open Preview in Side Panel" to view it here.',
      ),
    );
    this.webviewView.webview.options = {
      enableScripts: false,
      localResourceRoots: [],
    };
    this.webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body {
      margin: 0;
      padding: 24px 16px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 48px);
      box-sizing: border-box;
      text-align: center;
    }
    .empty-state {
      max-width: 280px;
      line-height: 1.5;
    }
    .empty-state-title {
      font-weight: 600;
      margin-bottom: 6px;
    }
    .empty-state-subtitle {
      color: var(--vscode-descriptionForeground);
      font-size: 0.92em;
    }
  </style>
</head>
<body>
  <div class="empty-state">
    <div class="empty-state-title">${title}</div>
    <div class="empty-state-subtitle">${subtitle}</div>
  </div>
</body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
