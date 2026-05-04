import * as path from 'path';
import * as vscode from 'vscode';
import {
  extractBlockIds,
  extractHeadings,
  parseBlockIdTriggerContext,
  parseHeadingTriggerContext,
  parseNoteTriggerContext,
} from './block-id-helpers';

/**
 * Wikilink fragment completion.  Three trigger contexts inside `[[…]]`:
 *
 *   - Note name   (typed as `[[…` or `![[…` — start of a wikilink or
 *                   wikilink embed):  list every Markdown file in the
 *                   workspace.  Embed (`![[`) also includes common
 *                   image extensions.
 *   - `#heading`   (typed as `[[Note#…]]`, no `^` in the fragment yet):
 *                   list every heading in the target note.  The label
 *                   shows the heading text (with `#` prefix per level
 *                   so the user sees structure); the inserted text is
 *                   the HeadingIdGenerator slug — that's what the
 *                   click resolver matches against.
 *   - `^block-id`  (typed by the user as `[[Note^…]]` or
 *                   `[[Note#Heading^…]]`):  list every ` ^id` marker in
 *                   the target note with the block's own content as the
 *                   detail.
 *
 * Activated on Markdown files only.  No-op when the cursor isn't in
 * one of the contexts above.
 */
export class WikilinkCompletionProvider
  implements vscode.CompletionItemProvider
{
  // Lower-cased image extensions to also include in the suggestion
  // list when the user is in `![[…` embed context.  Markdown is always
  // included regardless.
  private static readonly EMBED_IMAGE_EXTS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.webp',
    '.bmp',
    '.avif',
  ]);

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
    // Note-name context (`[[…` / `![[…`) only matches when the partial
    // hasn't already turned into a fragment context — i.e. there is no
    // `#` or `^` after the `[[` yet.
    const noteCtx = parseNoteTriggerContext(before);
    if (noteCtx) {
      return this.completeNotes(document, noteCtx.partial, noteCtx.isEmbed);
    }
    return undefined;
  }

  private async completeNotes(
    document: vscode.TextDocument,
    partial: string,
    isEmbed: boolean,
  ): Promise<vscode.CompletionItem[] | undefined> {
    // Cap at a sensible upper bound so very large workspaces don't make
    // the popup feel sluggish.  vscode's quick-pick in practice scrolls
    // beyond ~200 items poorly anyway.
    const mdFiles = await vscode.workspace.findFiles(
      '**/*.md',
      '**/node_modules/**',
      500,
    );
    const imageFiles = isEmbed
      ? await vscode.workspace.findFiles(
          '**/*.{png,jpg,jpeg,gif,svg,webp,bmp,avif}',
          '**/node_modules/**',
          500,
        )
      : [];

    const partialLower = partial.toLowerCase();
    const items: vscode.CompletionItem[] = [];
    const currentPath =
      document.uri.scheme === 'file' ? document.uri.fsPath : '';
    const seen = new Set<string>();

    const addItem = (fileUri: vscode.Uri) => {
      if (fileUri.fsPath === currentPath) return;
      const baseName = path.basename(fileUri.fsPath);
      const ext = path.extname(baseName).toLowerCase();
      const isMarkdown = ext === '.md';
      // Drop the .md extension in the inserted text — it's the
      // crossnote default and matches what users typically write.
      // For images and other types, keep the full filename.
      const insertText = isMarkdown ? path.basename(baseName, ext) : baseName;
      const label = insertText;
      const dedupeKey = `${fileUri.fsPath}|${insertText}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      if (
        partial &&
        !label.toLowerCase().includes(partialLower) &&
        !path.dirname(fileUri.fsPath).toLowerCase().includes(partialLower)
      ) {
        return;
      }

      const item = new vscode.CompletionItem(
        label,
        isMarkdown
          ? vscode.CompletionItemKind.File
          : vscode.CompletionItemKind.Reference,
      );
      item.insertText = insertText;
      item.detail = vscode.workspace.asRelativePath(fileUri);
      item.documentation = new vscode.MarkdownString(
        isEmbed ? `Embed \`![[${insertText}]]\`` : `Link \`[[${insertText}]]\``,
      );
      // Markdown files first, then images; alphabetical within each.
      item.sortText = `${isMarkdown ? '0' : '1'}-${label.toLowerCase()}`;
      items.push(item);
    };

    for (const file of mdFiles) addItem(file);
    for (const file of imageFiles) {
      const ext = path.extname(file.fsPath).toLowerCase();
      if (WikilinkCompletionProvider.EMBED_IMAGE_EXTS.has(ext)) {
        addItem(file);
      }
    }

    return items;
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
