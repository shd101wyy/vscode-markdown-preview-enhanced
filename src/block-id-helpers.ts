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

/**
 * Parse the text on the current line up to the cursor and decide
 * whether the user is typing a `#tag` in body text (i.e. NOT inside
 * a `[[…]]` wikilink — that's heading context handled by
 * parseHeadingTriggerContext).
 *
 * Returns `{ partial }` or `null`.  `partial` is the characters typed
 * after `#`; the caller filters the tag list against it.
 *
 * Suppresses on lines that are JUST `#` / `##` / … / `######` (i.e.
 * the user is starting an ATX heading).  In that state, popping a tag
 * list would race with the imminent `space` keypress — and VS Code's
 * `editor.acceptSuggestionOnCommitCharacter` defaults to true, which
 * would *insert* a tag instead of starting a heading.
 *
 * For `#tag` at the very start of a line (e.g. a tags-only line in a
 * frontmatter-style file), users can manually trigger via
 * Ctrl+Space — the heading-vs-tag ambiguity at line start can't be
 * resolved on the `#` keystroke alone.
 */
export function parseTagTriggerContext(
  textBeforeCursor: string,
): { partial: string } | null {
  // Heading-marker line: only `#`s typed so far, with optional
  // trailing space.
  if (/^#{1,6}\s?$/.test(textBeforeCursor)) return null;

  // Don't match inside `[[…]]` — that's heading completion territory.
  // We approximate by looking for an unclosed `[[` on the line; this
  // is the same trick parseHeadingTriggerContext uses (negated).
  if (/\[\[[^\]]*$/.test(textBeforeCursor)) return null;

  // The tag itself: preceded by start-of-line OR a non-word
  // delimiter, then `#`, then valid tag chars.  Mirrors the regex
  // used in transformer.ts for the rendering side.
  const match = textBeforeCursor.match(
    /(?:^|[\s,.;:!?()[\]{}'"\\])#([\w-/]*)$/,
  );
  if (!match) return null;
  return { partial: match[1] };
}
