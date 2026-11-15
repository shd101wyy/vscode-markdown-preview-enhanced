/**
 * Parse a link fragment that addresses source lines instead of a heading,
 * e.g. `[Key](src/main.ts#L100)` or the bare `[Key](src/main.ts#100)`.
 *
 * Supported forms (line numbers are 1-based, like GitHub and VS Code's
 * built-in preview):
 *   #L12  #12        → the single line 12
 *   #L12-L15 #L12-15 #12-L15 #12-15 → the line range 12..15
 *
 * A null return means the fragment is not a line reference and should be
 * resolved as a heading / block id instead.
 */

export interface LineFragmentTarget {
  /** 0-based first line to reveal */
  startLine: number;
  /** 0-based last line of the range, inclusive (== startLine for single lines) */
  endLine: number;
}

const LINE_FRAGMENT_RE = /^L?(\d+)(?:-L?(\d+))?$/i;

export function parseLineFragment(fragment: string): LineFragmentTarget | null {
  const found = fragment.match(LINE_FRAGMENT_RE);
  if (!found) {
    return null;
  }
  // `#L0` clamps to the first line, matching the previous /^L(\d+)/ handling.
  const startLine = Math.max(0, parseInt(found[1], 10) - 1);
  const endLine = found[2]
    ? Math.max(0, parseInt(found[2], 10) - 1)
    : startLine;
  return { startLine, endLine: Math.max(endLine, startLine) };
}
