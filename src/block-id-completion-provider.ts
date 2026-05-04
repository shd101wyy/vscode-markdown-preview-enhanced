import * as path from 'path';
import * as vscode from 'vscode';
import {
  extractBlockIds,
  extractHeadings,
  parseBlockIdTriggerContext,
  parseHeadingTriggerContext,
} from './block-id-helpers';

/**
 * Wikilink fragment completion.  Two trigger contexts inside `[[…]]`:
 *
 *   - `^block-id`  (typed by the user as `[[Note^…]]` or
 *                   `[[Note#Heading^…]]`):  list every ` ^id` marker in
 *                   the target note with the block's own content as the
 *                   detail.
 *   - `#heading`   (typed as `[[Note#…]]`, no `^` in the fragment yet):
 *                   list every heading in the target note.  The label
 *                   shows the heading text (with `#` prefix per level
 *                   so the user sees structure); the inserted text is
 *                   the HeadingIdGenerator slug — that's what the
 *                   click resolver matches against.
 *
 * Activated on Markdown files only.  No-op when the cursor isn't in
 * one of the two contexts above.
 */
export class WikilinkCompletionProvider
  implements vscode.CompletionItemProvider
{
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const before = document
      .lineAt(position.line)
      .text.substring(0, position.character);

    // Block-id context takes precedence: `[[Note#Heading^abc` ends in
    // `^…` and matches BOTH regexes if we only checked heading first,
    // so we evaluate block-id first.
    const blockCtx = parseBlockIdTriggerContext(before);
    if (blockCtx) {
      return this.completeBlocks(document, blockCtx.noteName, blockCtx.partial);
    }
    const headingCtx = parseHeadingTriggerContext(before);
    if (headingCtx) {
      return this.completeHeadings(
        document,
        headingCtx.noteName,
        headingCtx.partial,
      );
    }
    return undefined;
  }

  private async completeBlocks(
    document: vscode.TextDocument,
    noteName: string,
    partial: string,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const content = await this.readNote(document, noteName);
    if (content === null) return undefined;

    const items: vscode.CompletionItem[] = [];
    for (const { id, body } of extractBlockIds(content)) {
      if (partial && !id.toLowerCase().startsWith(partial.toLowerCase())) {
        continue;
      }
      const item = new vscode.CompletionItem(
        `^${id}`,
        vscode.CompletionItemKind.Reference,
      );
      item.insertText = id; // `^` is already typed
      item.detail = truncate(body);
      item.documentation = new vscode.MarkdownString(body);
      item.sortText = String(items.length).padStart(5, '0');
      items.push(item);
    }
    return items;
  }

  private async completeHeadings(
    document: vscode.TextDocument,
    noteName: string,
    partial: string,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const content = await this.readNote(document, noteName);
    if (content === null) return undefined;

    const items: vscode.CompletionItem[] = [];
    const partialLower = partial.toLowerCase();
    for (const { level, text, slug } of extractHeadings(content)) {
      // Filter against the slug (what the user is actually typing) and
      // also the heading text — typing the readable heading and then
      // selecting still feels right even though we insert the slug.
      if (
        partial &&
        !slug.toLowerCase().startsWith(partialLower) &&
        !text.toLowerCase().includes(partialLower)
      ) {
        continue;
      }
      // Use the slug as the label so the popup matches what gets
      // inserted; show the heading text in the detail.
      const item = new vscode.CompletionItem(
        slug,
        vscode.CompletionItemKind.Reference,
      );
      item.insertText = slug; // `#` is already typed
      item.detail = `${'#'.repeat(level)} ${truncate(text)}`;
      item.documentation = new vscode.MarkdownString(
        `${'#'.repeat(level)} ${text}`,
      );
      item.sortText = String(items.length).padStart(5, '0');
      items.push(item);
    }
    return items;
  }

  private async readNote(
    document: vscode.TextDocument,
    noteName: string,
  ): Promise<string | null> {
    const targetUri = await this.resolveNoteUri(document, noteName);
    if (!targetUri) return null;
    try {
      const buf = await vscode.workspace.fs.readFile(targetUri);
      return new TextDecoder().decode(buf);
    } catch {
      return null;
    }
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

function truncate(s: string, n: number = 80): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
