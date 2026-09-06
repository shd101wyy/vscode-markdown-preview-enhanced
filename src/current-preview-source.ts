export interface PreviewSourceState<TSource> {
  readonly active: boolean;
  readonly sourceUri: TSource | undefined;
}

export interface SourceUriLike {
  readonly scheme: string;
  readonly fsPath: string;
  with(change: { query?: string; fragment?: string }): SourceUriLike;
  toString(): string;
}

/**
 * Return the source for the only focused preview.
 *
 * Multiple active previews are treated as ambiguous instead of guessing which
 * one the user intended. An active preview without a rendered source is also
 * unresolved.
 */
export function resolveActivePreviewSource<TSource>(
  states: Iterable<PreviewSourceState<TSource>>,
): TSource | undefined {
  let activeState: PreviewSourceState<TSource> | undefined;

  for (const state of states) {
    if (!state.active) {
      continue;
    }
    if (activeState) {
      return undefined;
    }
    activeState = state;
  }

  return activeState?.sourceUri;
}

/**
 * Format a source URI without treating remote or virtual resources as local
 * filesystem paths.
 *
 * The query and fragment are dropped so that a link followed inside the
 * preview yields the source resource itself, matching what `fsPath` returns
 * for `file:` URIs.
 */
export function formatPreviewSourcePath(sourceUri: SourceUriLike): string {
  if (sourceUri.scheme === 'file') {
    return sourceUri.fsPath;
  }
  return sourceUri.with({ query: '', fragment: '' }).toString();
}
