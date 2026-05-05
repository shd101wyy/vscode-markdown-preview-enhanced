import { findFragmentTargetLine, matter } from 'crossnote';
import * as path from 'path';
import * as vscode from 'vscode';
import NotebooksManager from './notebooks-manager';
import { createMissingMarkdownNote } from './utils';

/**
 * Editor-side `Follow link` (alt+click / Ctrl+click) for wikilinks.
 *
 * VSCode's built-in markdown link provider already handles
 * `[text](./Note.md)` — alt+click opens (or for the missing case,
 * pops up the standard "file not found" UI).  But the source text
 * `[[Note]]` / `![[Note]]` / `[[Note#Heading]]` / `[[Note^block]]`
 * isn't recognised by VSCode as a link, so alt+click does nothing.
 *
 * We register a `DocumentLinkProvider` that scans the source for
 * those wikilink shapes and returns one `DocumentLink` per match,
 * each with a `command:` URI as `target`.  When the user alt+clicks,
 * VSCode invokes the command which:
 *   - resolves the wikilink target relative to the current note
 *     (same rules as the hover/click resolver),
 *   - creates the file if missing and the extension matches a
 *     configured `markdownFileExtensions` entry (Obsidian-style
 *     click-to-create),
 *   - opens the document and, if the link carried a `#heading` or
 *     `^block` fragment, jumps to the matching line.
 *
 * Standard `[text](url)` markdown links are intentionally left to
 * VSCode's built-in provider — we only emit links for wikilinks.
 */
export class WikilinkDocumentLinkProvider
  implements vscode.DocumentLinkProvider
{
  // Match a wikilink `[[…]]` or `![[…]]` whose body has no closing
  // brackets.  Group 1 captures the body (everything between `[[`
  // and `]]`).  Mirrors WikilinkHoverProvider.WIKILINK_RE so the
  // hover preview range and the alt+click range agree.
  private static readonly WIKILINK_RE = /!?\[\[([^\]]+)\]\]/g;

  // The notebooksManager argument is here so the provider's
  // constructor signature mirrors `WikilinkHoverProvider` and stays
  // ready for future use (e.g. resolving links via the cached
  // `notebook.notes` map instead of `findFiles`); the actual
  // resolution lives in `openWikilinkTarget` and reads it via the
  // command-handler argument.
  constructor(_notebooksManager?: NotebooksManager) {}

  public provideDocumentLinks(
    document: vscode.TextDocument,
  ): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    WikilinkDocumentLinkProvider.WIKILINK_RE.lastIndex = 0;
    for (
      let m = WikilinkDocumentLinkProvider.WIKILINK_RE.exec(text);
      m !== null;
      m = WikilinkDocumentLinkProvider.WIKILINK_RE.exec(text)
    ) {
      const body = m[1];
      // body shape: "Note", "Note#Heading", "Note^abc",
      // "Note#Heading^abc", "alias|Note", "Note|alias", or any of
      // those with leading ! for embed.  Strip the alias half (we
      // route by target name, not display).
      const beforePipe = body.split('|')[0].trim();
      if (!beforePipe) continue;

      // Range covers the whole `[[…]]` (or `![[…]]`) so VSCode
      // shows the full match as the clickable region.
      const start = document.positionAt(m.index);
      const end = document.positionAt(m.index + m[0].length);
      const range = new vscode.Range(start, end);

      // Encode the wikilink body into a `command:` URI so
      // alt+click invokes our handler with the source-document URI
      // (so we can resolve relative paths) plus the wikilink body.
      const args = [document.uri.toString(), beforePipe];
      const target = vscode.Uri.parse(
        `command:_crossnote.openWikilinkTarget?${encodeURIComponent(
          JSON.stringify(args),
        )}`,
      );

      const link = new vscode.DocumentLink(range, target);
      // Tooltip shown in the alt+click hover.  Plain string so
      // VSCode shows it verbatim.
      link.tooltip = `Follow wikilink: ${beforePipe}`;
      links.push(link);
    }
    return links;
  }
}

/**
 * Command handler invoked by `Follow link` on a wikilink.  Mirrors
 * the preview-side click handler in `extension-common.ts`: resolve
 * the target, auto-create if missing, open in an editor, and jump
 * to the fragment line if any.
 *
 * Args: `[sourceUriString, wikilinkBody]` where `wikilinkBody` is
 * the inside of `[[…]]` with the alias half already stripped.
 */
export async function openWikilinkTarget(
  sourceUriString: string,
  wikilinkBody: string,
  notebooksManager?: NotebooksManager,
): Promise<void> {
  const sourceUri = vscode.Uri.parse(sourceUriString);

  // Split out heading / block fragments from the link target — same
  // rules `WikilinkHoverProvider.provideHover` uses, so the hover
  // tooltip and the click destination agree.
  const blockIdx = wikilinkBody.indexOf('^');
  const hashIdx = wikilinkBody.indexOf('#');
  let noteName = wikilinkBody;
  let fragment = '';
  if (blockIdx !== -1 || hashIdx !== -1) {
    const splitAt =
      hashIdx !== -1 && (blockIdx === -1 || hashIdx < blockIdx)
        ? hashIdx
        : blockIdx;
    noteName = wikilinkBody.slice(0, splitAt).trim();
    fragment = wikilinkBody.slice(splitAt + (splitAt === hashIdx ? 1 : 0));
    if (splitAt === blockIdx && fragment[0] !== '^') {
      fragment = '^' + fragment;
    }
  }
  if (!noteName) return;

  const targetUri = await resolveWikilinkUri(
    sourceUri,
    noteName,
    notebooksManager,
  );
  if (!targetUri) {
    vscode.window.showErrorMessage(
      `Could not resolve wikilink: [[${wikilinkBody}]]`,
    );
    return;
  }

  // Obsidian-style click-to-create: write a stub if the file
  // doesn't exist and the extension matches `markdownFileExtensions`.
  // Returns false (no-op) for non-markdown URIs and existing files.
  await createMissingMarkdownNote(targetUri);

  let doc: vscode.TextDocument;
  try {
    doc = await vscode.workspace.openTextDocument(targetUri);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Could not open file: ${path.basename(targetUri.fsPath)}`,
    );
    console.error('openWikilinkTarget: openTextDocument failed', error);
    return;
  }

  const editor = await vscode.window.showTextDocument(doc, {
    preview: false,
    viewColumn: vscode.ViewColumn.Active,
  });

  // Jump to the fragment line if one was specified.  Strip
  // front-matter the same way the renderer does so line numbers
  // match what `findFragmentTargetLine` returns.
  if (fragment) {
    const text = matter(doc.getText()).content;
    const targetLine = findFragmentTargetLine(text, fragment);
    if (targetLine >= 0) {
      const sel = new vscode.Selection(targetLine, 0, targetLine, 0);
      editor.selection = sel;
      editor.revealRange(sel, vscode.TextEditorRevealType.InCenter);
    }
  }
}

/**
 * Resolve a wikilink note name to an absolute URI.  First tries
 * sibling-of-source-document (the common Obsidian case where notes
 * sit alongside each other in a flat folder); falls back to a
 * workspace-wide basename search; finally to a sibling-relative
 * URI even if the file doesn't exist (so the auto-create path can
 * write it next to the source note).
 *
 * The default extension comes from the notebook's
 * `wikiLinkTargetFileExtension` config — same source the renderer
 * uses, so click and render resolve the same target.
 */
async function resolveWikilinkUri(
  sourceUri: vscode.Uri,
  noteName: string,
  notebooksManager?: NotebooksManager,
): Promise<vscode.Uri | undefined> {
  const ext = path.extname(noteName);
  let defaultExt = '.md';
  if (notebooksManager) {
    try {
      const notebook = await notebooksManager.getNotebook(sourceUri);
      defaultExt = notebook.config.wikiLinkTargetFileExtension || '.md';
    } catch {
      // Fall back to .md if the notebook can't be resolved (test
      // scaffolds, untitled docs, etc.).
    }
  }
  const fileName = ext ? noteName : `${noteName}${defaultExt}`;
  const sameDir = vscode.Uri.joinPath(
    vscode.Uri.parse(path.dirname(sourceUri.toString(true)) + '/'),
    fileName,
  );
  // Prefer sibling-of-source-document.  Try existence; fall back to
  // workspace-wide basename search if the sibling isn't there.
  try {
    await vscode.workspace.fs.stat(sameDir);
    return sameDir;
  } catch {
    // fall through to workspace search
  }
  const baseName = path.basename(fileName);
  const matches = await vscode.workspace.findFiles(
    `**/${baseName}`,
    '**/node_modules/**',
    1,
  );
  if (matches.length > 0) {
    return matches[0];
  }
  // No match anywhere — return the sibling URI so the caller can
  // auto-create it next to the source note.  This is the
  // Obsidian-style behaviour: clicking a not-yet-existing wikilink
  // creates it in the same folder as the linking note.
  return sameDir;
}
