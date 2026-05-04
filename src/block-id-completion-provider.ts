import * as path from 'path';
import * as vscode from 'vscode';
import {
  extractBlockIds,
  extractHeadings,
  parseBlockIdTriggerContext,
  parseHeadingTriggerContext,
  parseNoteTriggerContext,
  parseTagTriggerContext,
} from './block-id-helpers';
import NotebooksManager from './notebooks-manager';

/**
 * Wikilink fragment + body-text `#tag` completion.  Trigger contexts:
 *
 *   - Note name   (`[[…` or `![[…`):  list workspace markdown files.
 *                   Embed (`![[`) also includes common image
 *                   extensions.
 *   - `#heading`  (`[[Note#…`):  list headings in the target note;
 *                   inserts the HeadingIdGenerator slug so it matches
 *                   how crossnote resolves clicks.
 *   - `^block-id` (`[[Note^…` or `[[Note#H^…`):  list ` ^id` markers
 *                   in the target note with the block body as detail.
 *   - `#tag`      (in body text, NOT inside `[[…]]`):  list tags
 *                   already used anywhere in the notebook.
 *                   Suppressed at line start when only `#`s have been
 *                   typed (heading-marker workflow).
 *
 * Activated on Markdown files only.  No-op when the cursor isn't in
 * one of the contexts above.
 */
export class WikilinkCompletionProvider
  implements vscode.CompletionItemProvider
{
  constructor(private readonly notebooksManager?: NotebooksManager) {}
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
    // `#tag` in body text — uses crossnote's TagReferenceMap so the
    // suggestion list matches the tags actually present in the
    // notebook.
    const tagCtx = parseTagTriggerContext(before);
    if (tagCtx) {
      return this.completeTags(document, tagCtx.partial);
    }
    return undefined;
  }

  private async completeTags(
    document: vscode.TextDocument,
    partial: string,
  ): Promise<vscode.CompletionItem[] | undefined> {
    if (!this.notebooksManager) return undefined;
    let tags: string[];
    try {
      tags = await this.notebooksManager.getAllTags(document.uri);
    } catch {
      return undefined;
    }
    if (tags.length === 0) return undefined;

    const partialLower = partial.toLowerCase();
    const items: vscode.CompletionItem[] = [];
    for (const tag of tags.sort()) {
      if (partial && !tag.toLowerCase().startsWith(partialLower)) continue;
      const item = new vscode.CompletionItem(
        `#${tag}`,
        vscode.CompletionItemKind.Keyword,
      );
      item.insertText = tag; // `#` is already typed
      // filterText so vscode's substring filter still keeps the item
      // visible while the user is typing partial chars.
      item.filterText = `#${tag}`;
      items.push(item);
    }
    return items;
  }

  private async completeNotes(
    document: vscode.TextDocument,
    partial: string,
    isEmbed: boolean,
  ): Promise<vscode.CompletionItem[] | undefined> {
    // Markdown files: read from the notebook's already-loaded notes
    // map (kept current by the file watcher) instead of re-scanning
    // the workspace on every keystroke.  This is the difference
    // between O(notes) and a fresh `vscode.workspace.findFiles` call
    // each time, which matters on large notebooks.
    const mdFiles = await this.listMarkdownFiles(document);
    const markdownExts = await this.getMarkdownExtensions(document);
    // Images aren't tracked by the notebook, so we still go through
    // findFiles — but only when the user is in `![[…` embed context.
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
      const isMarkdown = markdownExts.includes(ext);
      // Drop the markdown extension in the inserted text — matches
      // what users typically write (and what crossnote's
      // wikiLinkTargetFileExtension auto-applies on the way back in).
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

  /**
   * Markdown files in the active document's notebook, fetched from
   * the cached `notes` map.  Falls back to a workspace-wide
   * `findFiles` if no NotebooksManager is available or if notebook
   * init fails (e.g. no workspace folder), so completion still works
   * in edge cases.
   */
  private async listMarkdownFiles(
    document: vscode.TextDocument,
  ): Promise<vscode.Uri[]> {
    if (this.notebooksManager) {
      try {
        const entries = await this.notebooksManager.getMarkdownFiles(
          document.uri,
        );
        return entries.map((e) => e.uri);
      } catch {
        // fall through to findFiles
      }
    }
    // Glob across every extension the user has configured (default
    // includes `.md`, `.markdown`, `.mdown`, `.rmd`, `.qmd`, `.mdx`,
    // …).  Fallback to `.md` if we have no notebook config to read.
    const exts = await this.getMarkdownExtensions(document);
    const extsNoDot = exts
      .map((e) => e.replace(/^\./, ''))
      .filter((e) => e.length > 0);
    const glob =
      extsNoDot.length === 1
        ? `**/*.${extsNoDot[0]}`
        : `**/*.{${extsNoDot.join(',')}}`;
    return vscode.workspace.findFiles(glob, '**/node_modules/**', 500);
  }

  /**
   * Configured markdown file extensions for the active document's
   * notebook (e.g. `['.md', '.markdown', '.mdx']`).  Falls back to
   * `['.md']` when no NotebooksManager is available.
   */
  private async getMarkdownExtensions(
    document: vscode.TextDocument,
  ): Promise<string[]> {
    if (!this.notebooksManager) return ['.md'];
    try {
      const notebook = await this.notebooksManager.getNotebook(document.uri);
      const exts = notebook.config.markdownFileExtensions;
      return exts && exts.length > 0 ? exts : ['.md'];
    } catch {
      return ['.md'];
    }
  }

  /**
   * The wikilink-target extension to append when a `[[Note]]` doesn't
   * already specify one.  Falls back to `.md` when no NotebooksManager
   * is available.
   */
  private async getDefaultWikilinkExtension(
    document: vscode.TextDocument,
  ): Promise<string> {
    if (!this.notebooksManager) return '.md';
    try {
      const notebook = await this.notebooksManager.getNotebook(document.uri);
      return notebook.config.wikiLinkTargetFileExtension || '.md';
    } catch {
      return '.md';
    }
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
    const defaultExt = await this.getDefaultWikilinkExtension(document);
    const fileName = ext ? noteName : `${noteName}${defaultExt}`;

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
