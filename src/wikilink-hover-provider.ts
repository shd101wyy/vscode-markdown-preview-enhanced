import { extractBlockIds, findFragmentTargetLine, matter } from 'crossnote';
import * as path from 'path';
import * as vscode from 'vscode';
import NotebooksManager from './notebooks-manager';

/**
 * Editor-side hover preview for `[[Note]]`, `[[Note#Heading]]`,
 * `[[Note^block]]`, `[[Note#Heading^block]]`, and the embed forms
 * (`![[…]]`).  When the cursor is over a wikilink, we read the
 * target file, slice out the relevant fragment (full file, heading
 * section, or block), and return it as a MarkdownString.
 *
 * Entirely a UX layer — all parsing reuses crossnote helpers
 * (`extractBlockIds`, `extractHeadings`, `findFragmentTargetLine`)
 * so the same rules that drive rendering and click navigation also
 * drive the hover.
 */
export class WikilinkHoverProvider implements vscode.HoverProvider {
  constructor(private readonly notebooksManager?: NotebooksManager) {}

  // Match a wikilink `[[…]]` or `![[…]]` whose body has no closing
  // brackets — we use this to find the wikilink containing the
  // cursor position.  Group 1 captures the body (everything between
  // `[[` and `]]`).
  private static readonly WIKILINK_RE = /!?\[\[([^\]]+)\]\]/g;

  // How many characters of the target file to show in the hover when
  // the wikilink has no fragment.  Generous enough for a paragraph
  // but capped so a long note doesn't blow up the hover.
  private static readonly NOTE_PREVIEW_LIMIT = 1200;

  // How many lines of context to include around a heading / block
  // hit before stopping at the next heading of equal-or-higher level.
  private static readonly SECTION_LINE_LIMIT = 30;

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const lineText = document.lineAt(position.line).text;

    // Find the wikilink whose range covers the hovered character
    let bodyMatch: RegExpExecArray | null = null;
    let bodyStart = -1;
    let bodyEnd = -1;
    WikilinkHoverProvider.WIKILINK_RE.lastIndex = 0;
    for (
      let m = WikilinkHoverProvider.WIKILINK_RE.exec(lineText);
      m !== null;
      m = WikilinkHoverProvider.WIKILINK_RE.exec(lineText)
    ) {
      const start = m.index;
      const end = start + m[0].length;
      if (position.character >= start && position.character <= end) {
        bodyMatch = m;
        bodyStart = start;
        bodyEnd = end;
        break;
      }
    }
    if (!bodyMatch) return undefined;

    const body = bodyMatch[1];
    // body shape: "Note", "Note#Heading", "Note^abc", "Note#Heading^abc",
    //             "Note|alias", or any of the above with an alias
    const beforePipe = body.split('|')[0].trim();
    if (!beforePipe) return undefined;

    // Pick out target / heading / block parts
    const blockIdx = beforePipe.indexOf('^');
    const hashIdx = beforePipe.indexOf('#');
    let noteName = beforePipe;
    let fragment = '';
    if (blockIdx !== -1 || hashIdx !== -1) {
      const splitAt =
        hashIdx !== -1 && (blockIdx === -1 || hashIdx < blockIdx)
          ? hashIdx
          : blockIdx;
      noteName = beforePipe.slice(0, splitAt).trim();
      fragment = beforePipe.slice(splitAt + (splitAt === hashIdx ? 1 : 0));
      // Keep ^ when it's the only marker so findFragmentTargetLine
      // can match.
      if (splitAt === blockIdx && fragment[0] !== '^') {
        fragment = '^' + fragment;
      }
    }
    if (!noteName) return undefined;

    const targetUri = await this.resolveNoteUri(document, noteName);
    if (!targetUri) {
      return new vscode.Hover(
        new vscode.MarkdownString(`*Note not found:* \`${noteName}\``),
        new vscode.Range(position.line, bodyStart, position.line, bodyEnd),
      );
    }

    let content: string;
    try {
      const buf = await vscode.workspace.fs.readFile(targetUri);
      content = new TextDecoder().decode(buf);
    } catch {
      return undefined;
    }

    const previewMarkdown = this.buildPreview(content, fragment);
    if (!previewMarkdown) return undefined;

    const md = new vscode.MarkdownString(previewMarkdown);
    md.supportHtml = false;
    md.isTrusted = false;
    md.appendMarkdown(
      `\n\n---\n[Open ${path.basename(targetUri.fsPath)}](${targetUri.toString()})`,
    );
    return new vscode.Hover(
      md,
      new vscode.Range(position.line, bodyStart, position.line, bodyEnd),
    );
  }

  private buildPreview(content: string, fragment: string): string {
    if (!fragment) {
      // No fragment — show the file's leading content (skip front
      // matter and an optional H1 title).
      return this.previewFileHead(content);
    }

    const blockMatch = fragment.match(/\^([a-zA-Z0-9_-]+)$/);
    if (blockMatch) {
      const wanted = blockMatch[1];
      const blocks = extractBlockIds(content);
      const found = blocks.find((b) => b.id === wanted);
      if (found) {
        return `> ${found.body}\n\n— *block \`^${found.id}\`*`;
      }
      return this.formatNotFound('Block', `^${wanted}`, wanted, blocks);
    }

    // Heading reference — section under that heading.
    const targetLine = findFragmentTargetLine(content, fragment);
    if (targetLine < 0) {
      return `*Heading not found:* \`#${fragment}\``;
    }
    return this.previewSection(content, targetLine);
  }

  /**
   * Build a "Block reference not found" message that, where possible,
   * suggests the closest existing IDs ("did you mean …").  Helps the
   * user spot typos and stale block-references without leaving the
   * editor.
   */
  private formatNotFound(
    label: string,
    display: string,
    wanted: string,
    blocks: Array<{ id: string; body: string }>,
  ): string {
    if (blocks.length === 0) {
      return `*${label} reference not found:* \`${display}\` (no blocks defined in target note)`;
    }
    const ranked = rankByCloseness(
      wanted,
      blocks.map((b) => b.id),
    );
    const top = ranked.slice(0, Math.min(5, ranked.length));
    const suggestions = top.map((id) => `\`^${id}\``).join(', ');
    const tail =
      ranked.length > top.length
        ? ` (+${ranked.length - top.length} more)`
        : '';
    return `*${label} reference not found:* \`${display}\`\n\n*Did you mean:* ${suggestions}${tail}`;
  }

  private previewFileHead(content: string): string {
    const stripped = matter(content).content;
    const truncated =
      stripped.length > WikilinkHoverProvider.NOTE_PREVIEW_LIMIT
        ? stripped.slice(0, WikilinkHoverProvider.NOTE_PREVIEW_LIMIT) + '\n\n…'
        : stripped;
    return truncated;
  }

  private previewSection(content: string, headingLine: number): string {
    const lines = content.split('\n');
    const headingMatch = lines[headingLine].match(/^(#{1,6})\s+(.*)$/);
    if (!headingMatch) return lines.slice(headingLine).slice(0, 30).join('\n');
    const startLevel = headingMatch[1].length;

    // Walk forward, stopping at the next heading of equal-or-higher
    // (smaller-or-equal `#` count) level, or after the line cap.
    const out: string[] = [];
    for (
      let i = headingLine;
      i < lines.length && out.length < WikilinkHoverProvider.SECTION_LINE_LIMIT;
      i++
    ) {
      if (i !== headingLine) {
        const m = lines[i].match(/^(#{1,6})\s/);
        if (m && m[1].length <= startLevel) break;
      }
      out.push(lines[i]);
    }
    // Strip trailing blank lines for a tidier hover.
    while (out.length && !out[out.length - 1].trim()) out.pop();
    if (
      out.length === WikilinkHoverProvider.SECTION_LINE_LIMIT &&
      headingLine + out.length < lines.length
    ) {
      out.push('', '…');
    }
    return out.join('\n');
  }

  private async resolveNoteUri(
    document: vscode.TextDocument,
    noteName: string,
  ): Promise<vscode.Uri | undefined> {
    // Resolve the notebook (if any) up front so both the primary
    // resolver path and the typo-recovery fallback can reuse its
    // configured `wikiLinkTargetFileExtension`.
    let notebook:
      | Awaited<ReturnType<NotebooksManager['getNotebook']>>
      | undefined;
    if (this.notebooksManager) {
      try {
        notebook = await this.notebooksManager.getNotebook(document.uri);
      } catch {
        // No notebook for this URI (untitled doc, scratch buffer).
      }
    }
    const defaultExt = notebook?.config.wikiLinkTargetFileExtension || '.md';
    const ext = path.extname(noteName);
    const fileName = ext ? noteName : `${noteName}${defaultExt}`;

    // Preferred path: delegate to the notebook's own resolver so
    // hover honours `wikiLinkResolution` (relative/shortest/absolute)
    // and lands on the same target the rendered preview points to.
    if (notebook) {
      const rootFsPath = notebook.notebookPath.fsPath;
      const currentRelPath = path.relative(rootFsPath, document.uri.fsPath);
      const resolvedRel = notebook.resolveWikilink(fileName, currentRelPath);
      const resolvedUri = vscode.Uri.file(path.join(rootFsPath, resolvedRel));
      try {
        await vscode.workspace.fs.stat(resolvedUri);
        return resolvedUri;
      } catch {
        // Resolver returned a path that doesn't exist on disk — fall
        // through to workspace-wide search so the hover can still
        // surface a likely target (typo recovery / files outside the
        // notebook index).
      }
    }

    // Fallback: same-dir first, then a workspace-wide basename
    // search.  Uses the same `defaultExt` resolved above so notebooks
    // configured with `.markdown` / `.qmd` / etc. stay consistent.
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
    const baseName = path.basename(fileName);
    const matches = await vscode.workspace.findFiles(
      `**/${baseName}`,
      '**/node_modules/**',
      1,
    );
    return matches[0];
  }
}

/**
 * Sort `candidates` from most- to least-similar to `wanted`.  Uses
 * Levenshtein distance with two cheap shortcuts:
 *   - case-insensitive comparison
 *   - candidates that contain `wanted` as a substring rank above
 *     candidates that don't (typo-vs-shortened-name disambiguation)
 *
 * Exported for unit testing.
 */
export function rankByCloseness(
  wanted: string,
  candidates: string[],
): string[] {
  const wantedLower = wanted.toLowerCase();
  const scored = candidates.map((id) => {
    const lower = id.toLowerCase();
    const contains = lower.includes(wantedLower) ? 0 : 1;
    return { id, contains, distance: levenshtein(wantedLower, lower) };
  });
  scored.sort(
    (a, b) =>
      a.contains - b.contains ||
      a.distance - b.distance ||
      a.id.localeCompare(b.id),
  );
  return scored.map((s) => s.id);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // Single-row DP, O(min(a,b)) memory, O(a*b) time — fine for tag
  // and block-id sets which are tiny.
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
