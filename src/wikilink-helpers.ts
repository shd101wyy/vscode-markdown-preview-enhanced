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
