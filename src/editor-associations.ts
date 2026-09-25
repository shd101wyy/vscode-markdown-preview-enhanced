export const MPE_CUSTOM_EDITOR_VIEW_TYPE = 'markdown-preview-enhanced';

/**
 * `globalState` key listing the `workbench.editorAssociations` patterns this
 * extension wrote itself (for `previewMode: "Previews Only"`).
 */
export const OWNED_EDITOR_ASSOCIATIONS_KEY =
  'markdown-preview-enhanced.ownedEditorAssociations';

export interface EditorAssociationsInput {
  current: { [pattern: string]: string };
  previewsOnly: boolean;
  markdownFileExtensions: string[];
  owned: string[];
}

export interface EditorAssociationsResult {
  associations: { [pattern: string]: string };
  owned: string[];
  changed: boolean;
}

/**
 * Compute the next `workbench.editorAssociations` value for the current
 * `previewMode`.
 *
 * In "Previews Only" mode every markdown extension is mapped to the custom
 * editor, and those patterns are remembered as owned. Outside that mode only
 * owned patterns are removed: a `"*.md": "markdown-preview-enhanced"` entry
 * the user added by hand is left alone, instead of being wiped on every
 * activation (vscode-mpe#2429).
 */
export function computeEditorAssociations({
  current,
  previewsOnly,
  markdownFileExtensions,
  owned,
}: EditorAssociationsInput): EditorAssociationsResult {
  const wanted = previewsOnly
    ? markdownFileExtensions.map((ext) => `*${ext}`)
    : [];
  const associations = { ...current };
  owned.forEach((pattern) => {
    if (
      !wanted.includes(pattern) &&
      associations[pattern] === MPE_CUSTOM_EDITOR_VIEW_TYPE
    ) {
      delete associations[pattern];
    }
  });
  wanted.forEach((pattern) => {
    associations[pattern] = MPE_CUSTOM_EDITOR_VIEW_TYPE;
  });
  return {
    associations,
    owned: wanted,
    changed: JSON.stringify(associations) !== JSON.stringify(current),
  };
}
