/**
 * Pure helpers used by WikilinkCompletionProvider.  Kept in a separate
 * file from the provider class itself so that:
 *
 *   1. The unit tests can require/bundle them without pulling in the
 *      `vscode` module (which only exists at extension-host runtime).
 *   2. The regex / boundary logic — the part that's easiest to get
 *      wrong — is testable in isolation.
 *
 * Two trigger contexts are supported inside `[[…]]` wikilinks:
 *   - `^block-id`  → list ` ^id` markers in the target note.
 *   - `#heading`   → list headings in the target note (with their
 *                    HeadingIdGenerator slugs as the actual completion
 *                    insertText, since that's what the resolver in
 *                    findFragmentTargetLine matches against).
 */
import { HeadingIdGenerator } from 'crossnote';

/**
 * Parse the text on the current line up to the cursor and decide
 * whether we're inside a `[[Note^…]]` (or `[[Note#Heading^…]]`)
 * wikilink.  Returns the target note name and any block-id characters
 * already typed after the `^`, or `null` if the cursor isn't in that
 * context.
 */
export function parseBlockIdTriggerContext(
  textBeforeCursor: string,
): { noteName: string; partial: string } | null {
  const match = textBeforeCursor.match(
    /\[\[([^\]|#^]+)(?:#[^\]|^]*)?\^([\w-]*)$/,
  );
  if (!match) return null;
  const noteName = match[1].trim();
  if (!noteName) return null;
  return { noteName, partial: match[2] };
}

/**
 * Find every `^id` block marker in `text` and return a list of
 * `{ id, body }` objects in source order — `body` is the line content
 * with the trailing ` ^id` stripped.  Used by the completion provider
 * for the popup labels and previews.
 */
export function extractBlockIds(
  text: string,
): Array<{ id: string; body: string }> {
  const out: Array<{ id: string; body: string }> = [];
  const seen = new Set<string>();
  // ` ^id` (whitespace before, end of line) — the form crossnote's
  // transformer produces and the `Copy Block Reference` command writes.
  const re = /\s\^([a-zA-Z0-9_-]+)\s*$/;
  for (const line of text.split('\n')) {
    const m = re.exec(line);
    if (!m) continue;
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ id: m[1], body: line.slice(0, m.index).trim() });
  }
  return out;
}

/**
 * Parse the text on the current line up to the cursor and decide
 * whether we're inside a `[[Note#…]]` heading-fragment context (i.e.
 * after `#` but BEFORE any `^` — the latter means we're in block mode
 * and `parseBlockIdTriggerContext` should match instead).
 *
 * Returns `{ noteName, partial }` or `null`.  `partial` is whatever the
 * user has typed after the `#`, used to filter the suggestion list.
 */
export function parseHeadingTriggerContext(
  textBeforeCursor: string,
): { noteName: string; partial: string } | null {
  // [[<note>#<partial>]] where <partial> contains no `^` (otherwise we
  // are in block-id context, handled by parseBlockIdTriggerContext).
  const match = textBeforeCursor.match(/\[\[([^\]|#^]+)#([^\]|^]*)$/);
  if (!match) return null;
  const noteName = match[1].trim();
  if (!noteName) return null;
  return { noteName, partial: match[2] };
}

/**
 * Parse the text on the current line up to the cursor and decide
 * whether we're inside a freshly-opened `[[…` (wikilink) or `![[…`
 * (wikilink embed) — i.e. the user has typed `[[` or `![[` and is
 * about to write a note name.
 *
 * Returns `{ partial, isEmbed }` or `null`.  `partial` is whatever
 * the user has typed for the note name so far; `isEmbed` is true for
 * `![[` so the caller can prefer image/PDF suggestions if it wants.
 *
 * Bails out as soon as the partial would contain `]`, `|`, `#`, or
 * `^` — those signal a different completion context (closing,
 * alias, heading, or block-id).
 */
export function parseNoteTriggerContext(
  textBeforeCursor: string,
): { partial: string; isEmbed: boolean } | null {
  const match = textBeforeCursor.match(/(!?)\[\[([^\]|#^]*)$/);
  if (!match) return null;
  return { partial: match[2], isEmbed: match[1] === '!' };
}

/**
 * Extract every ATX heading (`# Title`, `## Subtitle`, …) from a
 * markdown source and return `{ level, text, slug }` triples in source
 * order.  `slug` is what crossnote's HeadingIdGenerator produces — i.e.
 * the value the click resolver matches against — so the caller should
 * use it as the completion insertText.
 *
 * Skips lines inside fenced code blocks (``` … ``` or ~~~ … ~~~) since
 * `# foo` inside a code block isn't a real heading.
 */
export function extractHeadings(
  text: string,
): Array<{ level: number; text: string; slug: string }> {
  const out: Array<{ level: number; text: string; slug: string }> = [];
  const headingIdGenerator = new HeadingIdGenerator();
  const lines = text.split('\n');
  let inFence = false;
  let fenceMarker = '';
  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker[0]; // ` or ~
      } else if (marker[0] === fenceMarker) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }
    if (inFence) continue;
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!headingMatch) continue;
    const level = headingMatch[1].length;
    const headingText = headingMatch[2]
      // Strip a trailing `{...}` block-attribute span, the same way
      // crossnote's curly-bracket-attributes plugin does, so the slug
      // matches what crossnote actually generates.
      .replace(/\s*\{[^}]+\}\s*$/, '')
      .trim();
    if (!headingText) continue;
    const slug = headingIdGenerator.generateId(headingText);
    out.push({ level, text: headingText, slug });
  }
  return out;
}
