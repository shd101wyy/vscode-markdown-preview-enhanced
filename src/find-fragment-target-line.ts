import { HeadingIdGenerator } from 'crossnote';

/**
 * Resolve a wikilink-style URL fragment to a 0-based line number in the
 * given markdown source.  Tries, in order:
 *   1. ^block-id reference (the LAST `^id` in the fragment, so that
 *      combined `Heading^id` falls through here first).  Matched
 *      against ` ^id` markers at end of line — i.e. the form
 *      crossnote's transformer produces.
 *   2. Heading slug — generated with the same HeadingIdGenerator as
 *      crossnote so anchors like `#Setup` line up.
 *
 * Returns -1 if no match.
 *
 * Pure helper (no vscode API) so it can be unit-tested without spinning
 * up an Extension Development Host.
 */
export function findFragmentTargetLine(text: string, fragment: string): number {
  if (!fragment) return -1;
  const lines = text.split('\n');

  const blockMatch = fragment.match(/\^([a-zA-Z0-9_-]+)$/);
  if (blockMatch) {
    const blockId = blockMatch[1];
    const re = new RegExp(`\\s\\^${blockId}\\s*$`);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        return i;
      }
    }
  }

  const headingIdGenerator = new HeadingIdGenerator();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^#+\s+/)) {
      const heading = line.replace(/^#+\s+/, '');
      const headingId = headingIdGenerator.generateId(heading);
      if (headingId === fragment) {
        return i;
      }
    }
  }
  return -1;
}
