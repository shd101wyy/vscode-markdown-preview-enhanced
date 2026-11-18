import * as path from 'path';

export interface AutoPreviewExclusionOptions {
  readonly scheme: string;
  readonly fileName: string;
  readonly exclusionSchemes: readonly string[];
  readonly exclusionPatterns: readonly string[];
}

export interface AutoPreviewRoutingInput {
  readonly excluded: boolean;
  readonly automaticallyShowPreviewInSidePanel: boolean;
  readonly automaticallyShowPreviewOfMarkdownBeingEdited: boolean;
  readonly sidePanelVisible: boolean;
  readonly sidePanelHasSource: boolean;
  readonly sidePanelLocked: boolean;
}

export interface AutoPreviewRoutingDecision {
  readonly openOrUpdateSidePanel: boolean;
  readonly allowSplitEditorAutoOpen: boolean;
}

/**
 * Return whether an active Markdown document should be skipped by auto-preview
 * based on URI scheme prefixes and case-insensitive filename wildcard patterns.
 */
export function isExcludedFromAutoPreview({
  scheme,
  fileName,
  exclusionSchemes,
  exclusionPatterns,
}: AutoPreviewExclusionOptions): boolean {
  for (const excludedScheme of exclusionSchemes) {
    if (scheme.startsWith(excludedScheme)) {
      return true;
    }
  }

  const baseName = path.basename(fileName);
  return exclusionPatterns.some((pattern) => {
    if (typeof pattern !== 'string') {
      return false;
    }
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(baseName);
  });
}

/**
 * Decide how an active Markdown editor switch routes between the Side Panel
 * preview and the split-editor preview.
 */
export function resolveAutoPreviewRouting({
  excluded,
  automaticallyShowPreviewInSidePanel,
  automaticallyShowPreviewOfMarkdownBeingEdited,
  sidePanelVisible,
  sidePanelHasSource,
  sidePanelLocked,
}: AutoPreviewRoutingInput): AutoPreviewRoutingDecision {
  if (excluded) {
    return {
      openOrUpdateSidePanel: false,
      allowSplitEditorAutoOpen: false,
    };
  }

  if (automaticallyShowPreviewInSidePanel) {
    return {
      // Suppress duplicate split-editor auto-previews while Side Panel auto-preview is enabled.
      openOrUpdateSidePanel: !sidePanelLocked,
      allowSplitEditorAutoOpen: false,
    };
  }

  return {
    openOrUpdateSidePanel:
      sidePanelVisible && sidePanelHasSource && !sidePanelLocked,
    allowSplitEditorAutoOpen: automaticallyShowPreviewOfMarkdownBeingEdited,
  };
}

/**
 * VS Code introduced `viewsContainers.secondarySidebar` in 1.106; older
 * hosts (down to `engines.vscode: ^1.82.0`) fall back to the Activity Bar.
 */
export function supportsSecondarySidebar(vscodeVersion: string): boolean {
  const match = /^(\d+)\.(\d+)/.exec(vscodeVersion);
  if (!match) {
    return true;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 106);
}
