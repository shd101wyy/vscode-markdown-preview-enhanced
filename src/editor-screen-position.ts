/**
 * Screen positions in a text editor, for scroll sync: where the cursor sits
 * in the viewport, and where to scroll so a position lands at a given
 * height. See editor-screen-rows.ts for how wrapped rows are worked out.
 */
import * as vscode from 'vscode';
import {
  positionAtScreenRow,
  positionRowsAbove,
  RowStarts,
  screenRowOf,
  VisibleRange,
  visibleRowCount,
  WrapColumnEstimator,
  WrapOptions,
  wrapLine,
} from './editor-screen-rows';

type WrappingIndent = NonNullable<WrapOptions['wrappingIndent']>;

const estimators = new WeakMap<
  vscode.TextEditor,
  { key: string; estimator: WrapColumnEstimator }
>();

/**
 * Wrap options of the editor, or undefined when its wrap column can't be
 * known yet (`editor.wordWrap: "on"` before the first usable sample).
 */
function getWrapOptions(editor: vscode.TextEditor): WrapOptions | undefined {
  const config = vscode.workspace.getConfiguration('editor', editor.document);
  const wordWrap = config.get<string>('wordWrap', 'off');
  const wordWrapColumn = config.get<number>('wordWrapColumn', 80);
  const wrappingIndent = config.get<WrappingIndent>('wrappingIndent', 'same');
  const tabSize =
    typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 4;

  if (wordWrap === 'wordWrapColumn') {
    return { column: wordWrapColumn, tabSize, wrappingIndent };
  }

  // The column depends on the editor's width (or word wrap was toggled with
  // Alt+Z): infer it from where the viewport's rows start.
  const maxColumn = wordWrap === 'bounded' ? wordWrapColumn : undefined;
  const key = `${maxColumn}:${tabSize}:${wrappingIndent}`;
  let entry = estimators.get(editor);
  if (!entry || entry.key !== key) {
    entry = {
      key,
      estimator: new WrapColumnEstimator(maxColumn, {
        tabSize,
        wrappingIndent,
      }),
    };
    estimators.set(editor, entry);
  }
  for (const range of editor.visibleRanges) {
    const { line, character } = range.start;
    entry.estimator.observe(editor.document.lineAt(line).text, character);
  }
  const column = entry.estimator.column;
  if (column !== undefined) {
    return { column, tabSize, wrappingIndent };
  }
  return wordWrap === 'off'
    ? { column: Infinity, tabSize, wrappingIndent }
    : undefined;
}

interface ScreenLayout {
  rowStarts: RowStarts;
  ranges: VisibleRange[];
  rowCount: number;
}

function getScreenLayout(editor: vscode.TextEditor): ScreenLayout | undefined {
  const options = getWrapOptions(editor);
  if (!options || !editor.visibleRanges.length) {
    return undefined;
  }
  const { document } = editor;
  const cache = new Map<number, number[]>();
  const rowStarts: RowStarts = (line) => {
    if (line < 0 || line >= document.lineCount) {
      return [0];
    }
    let starts = cache.get(line);
    if (!starts) {
      starts = wrapLine(document.lineAt(line).text, options);
      cache.set(line, starts);
    }
    return starts;
  };
  const ranges = editor.visibleRanges.map(({ start, end }) => ({
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  }));
  const rowCount = visibleRowCount(rowStarts, ranges);
  return rowCount ? { rowStarts, ranges, rowCount } : undefined;
}

/**
 * How far down the viewport the position's row is (0 = top, 1 = bottom),
 * measured at the middle of the row.
 */
export function getScreenRatio(
  editor: vscode.TextEditor,
  position: vscode.Position,
): number | undefined {
  const layout = getScreenLayout(editor);
  if (!layout) {
    return undefined;
  }
  const row = screenRowOf(layout.rowStarts, layout.ranges, position);
  return row === undefined ? undefined : (row + 0.5) / layout.rowCount;
}

/**
 * The position at the start of the viewport's middle row, and its ratio.
 */
export function getCenterPosition(
  editor: vscode.TextEditor,
): { position: vscode.Position; ratio: number } | undefined {
  const layout = getScreenLayout(editor);
  if (!layout) {
    return undefined;
  }
  const row = Math.floor(layout.rowCount / 2);
  const center = positionAtScreenRow(layout.rowStarts, layout.ranges, row);
  if (!center) {
    return undefined;
  }
  return {
    position: new vscode.Position(center.line, center.character),
    ratio: (row + 0.5) / layout.rowCount,
  };
}

/**
 * The position to reveal at the top of the viewport so that `position`
 * lands `ratio` of the way down it.
 */
export function getTopPositionForRatio(
  editor: vscode.TextEditor,
  position: vscode.Position,
  ratio: number,
): vscode.Position | undefined {
  const layout = getScreenLayout(editor);
  if (!layout) {
    return undefined;
  }
  const rows = Math.min(
    Math.max(Math.round(ratio * layout.rowCount - 0.5), 0),
    layout.rowCount - 1,
  );
  const top = positionRowsAbove(layout.rowStarts, position, rows);
  return new vscode.Position(top.line, top.character);
}
