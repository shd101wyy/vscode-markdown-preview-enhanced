import type * as vscode from 'vscode';

type CustomEditorProviderOptions = NonNullable<
  Parameters<typeof vscode.window.registerCustomEditorProvider>[2]
>;

/**
 * Keep custom-editor previews alive while their tab is hidden so their DOM and
 * exact scroll position survive a tab switch.
 */
export const customEditorProviderOptions: CustomEditorProviderOptions = {
  webviewOptions: {
    retainContextWhenHidden: true,
  },
};
