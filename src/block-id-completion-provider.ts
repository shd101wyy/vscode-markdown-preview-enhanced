import * as path from 'path';
import * as vscode from 'vscode';
import {
  extractBlockIds,
  parseBlockIdTriggerContext,
} from './block-id-helpers';

/**
 * Block-id completion for `[[Note^…]]` and `[[Note#Heading^…]]` wikilinks.
 *
 * When the user types `^` inside a wikilink targeting some Note, look up
 * the target file in the workspace, scan it for ` ^id` markers, and
 * offer them as completions.  The completion `detail` is the block's
 * own content (truncated) so the user can pick by what the block says
 * rather than memorising opaque IDs.
 *
 * Trigger: typing `^` inside `[[` ... `]]`.  Activated on Markdown files
 * only.  No-op when the cursor isn't in a wikilink-with-note context.
 */
export class BlockIdCompletionProvider
  implements vscode.CompletionItemProvider
{
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const lineText = document.lineAt(position.line).text;
    const before = lineText.substring(0, position.character);
    const ctx = parseBlockIdTriggerContext(before);
    if (!ctx) return undefined;

    const { noteName, partial } = ctx;

    const targetUri = await this.resolveNoteUri(document, noteName);
    if (!targetUri) return undefined;

    let content: string;
    try {
      const buf = await vscode.workspace.fs.readFile(targetUri);
      content = new TextDecoder().decode(buf);
    } catch {
      return undefined;
    }

    const items: vscode.CompletionItem[] = [];
    const blocks = extractBlockIds(content);
    for (const { id, body } of blocks) {
      if (partial && !id.toLowerCase().startsWith(partial.toLowerCase())) {
        continue;
      }
      const item = new vscode.CompletionItem(
        `^${id}`,
        vscode.CompletionItemKind.Reference,
      );
      item.insertText = id; // `^` is already typed — only emit the id
      item.detail = body.length > 80 ? body.slice(0, 77) + '…' : body;
      item.documentation = new vscode.MarkdownString(body);
      // Preserve source order so the popup matches the order in the
      // target file.
      item.sortText = String(items.length).padStart(5, '0');
      items.push(item);
    }

    return items;
  }

  /**
   * Resolve a wikilink note name (e.g. "README", "subdir/Notes",
   * "Notes.md") to a file URI in the workspace.  Tries the directory
   * of the active document first, then a workspace-wide search.
   */
  private async resolveNoteUri(
    document: vscode.TextDocument,
    noteName: string,
  ): Promise<vscode.Uri | undefined> {
    const ext = path.extname(noteName);
    const fileName = ext ? noteName : `${noteName}.md`;

    // Same directory as the current document
    if (document.uri.scheme === 'file') {
      const sameDir = vscode.Uri.file(
        path.join(path.dirname(document.uri.fsPath), fileName),
      );
      try {
        await vscode.workspace.fs.stat(sameDir);
        return sameDir;
      } catch {
        // fall through
      }
    }

    // Workspace search
    const baseName = path.basename(fileName);
    const matches = await vscode.workspace.findFiles(
      `**/${baseName}`,
      undefined,
      1,
    );
    return matches[0];
  }
}
