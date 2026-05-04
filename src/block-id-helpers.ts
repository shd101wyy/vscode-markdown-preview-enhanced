/**
 * Pure helpers used by BlockIdCompletionProvider.  Kept in a separate
 * file from the provider class itself so that:
 *
 *   1. The unit tests can require/bundle them without pulling in the
 *      `vscode` module (which only exists at extension-host runtime).
 *   2. The regex / boundary logic — the part that's easiest to get
 *      wrong — is testable in isolation.
 */

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
