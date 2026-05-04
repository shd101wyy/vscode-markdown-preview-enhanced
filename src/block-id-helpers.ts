/**
 * MPE-side trigger-context parsers for wikilink autocomplete.  These
 * are about the EDITOR cursor position; the corresponding content
 * helpers (`extractBlockIds`, `extractHeadings`,
 * `findFragmentTargetLine`) live in crossnote and are re-exported
 * below for convenience.
 *
 * Trigger contexts inside `[[…]]`:
 *   - `^block-id`   list ` ^id` markers in the target note
 *   - `#heading`    list headings in the target note
 *   - `[[` / `![[`  list note files in the workspace
 */
export { extractBlockIds, extractHeadings } from 'crossnote';

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
