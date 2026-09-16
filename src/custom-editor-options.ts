import type * as vscode from 'vscode';

type CustomEditorProviderOptions = NonNullable<
  Parameters<typeof vscode.window.registerCustomEditorProvider>[2]
>;

/**
 * Keep custom-editor previews alive while their tab is hidden so their DOM and
 * exact scroll position survive a tab switch, and give them the webview find
 * widget (`cmd`/`ctrl+F`) — the regular preview panel enables it via its panel
 * options; without the flag here, searching in Previews-Only mode silently did
 * nothing (vscode-mpe#2412).
 */
export const customEditorProviderOptions: CustomEditorProviderOptions = {
  webviewOptions: {
    enableFindWidget: true,
    retainContextWhenHidden: true,
  },
};
