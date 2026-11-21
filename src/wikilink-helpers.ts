/**
 * Pure helpers shared by the editor-side wikilink modules (the
 * document-link provider and the hover provider).  Kept free of
 * `vscode`/notebook imports so bundling either provider stays light.
 */

/**
 * Pick the target half of a wikilink body that may carry a `|` alias
 * pipe, mirroring how crossnote's `processWikilink` picks it: the
 * default style is `[[target|display]]`, while
 * `useGitHubStylePipedLink` flips it to `[[display|target]]`
 * (#2479).  A body without a pipe is returned trimmed as-is.
 */
export function wikilinkTargetHalf(
  body: string,
  useGitHubStylePipedLink: boolean,
): string {
  const splits = body.split('|');
  if (splits.length === 1) {
    return splits[0].trim();
  }
  return (useGitHubStylePipedLink ? splits[1] : splits[0]).trim();
}

export interface WikilinkTargetParts {
  /** The note the link names; empty for a same-file `[[#fragment]]`. */
  noteName: string;
  /** `#heading` content (no `#`) or `^block-id` (with the `^`). */
  fragment: string;
}

/**
 * Split a wikilink's target (already the config-selected pipe half) into
 * its note name and `#heading`/`^block` fragment. Shared by the
 * document-link provider and the hover provider so a click and the hover
 * tooltip always agree on what a link addresses.
 */
export function splitWikilinkTarget(target: string): WikilinkTargetParts {
  const blockIdx = target.indexOf('^');
  const hashIdx = target.indexOf('#');
  if (blockIdx === -1 && hashIdx === -1) {
    return { noteName: target.trim(), fragment: '' };
  }
  const splitAt =
    hashIdx !== -1 && (blockIdx === -1 || hashIdx < blockIdx)
      ? hashIdx
      : blockIdx;
  const noteName = target.slice(0, splitAt).trim();
  let fragment = target.slice(splitAt + (splitAt === hashIdx ? 1 : 0)).trim();
  // Keep ^ when the block marker is the split point so block matching
  // (findFragmentTargetLine, extractBlockIds) can see it.
  if (splitAt === blockIdx && fragment && fragment[0] !== '^') {
    fragment = '^' + fragment;
  }
  return { noteName, fragment };
}
