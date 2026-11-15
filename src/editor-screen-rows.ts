/**
 * Works out where text sits on screen in a word-wrapped editor. VS Code does
 * not expose wrapped rows to extensions, so this lays lines out the way the
 * editor's monospace wrapping does: break after whitespace and punctuation,
 * never before a space, hard-break words longer than a row, and indent
 * continuation rows like the line itself.
 *
 * Pure: no `vscode` import, so it runs under plain mocha.
 */

export interface Position {
  line: number;
  character: number;
}

export interface VisibleRange {
  start: Position;
  end: Position;
}

export interface WrapOptions {
  /** Characters per row; Infinity when the editor does not wrap. */
  column: number;
  tabSize: number;
  /** `editor.wrappingIndent`. */
  wrappingIndent?: 'none' | 'same' | 'indent' | 'deepIndent';
}

// Monaco's default `editor.wordWrapBreakAfterCharacters` and
// `editor.wordWrapBreakBeforeCharacters`.
const BREAK_AFTER = new Set(
  ' \t})]?|/&.,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣',
);
const BREAK_BEFORE = new Set('([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋');

function isFullWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

function isIdeographic(code: number): boolean {
  return (
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

function charWidth(text: string, i: number, column: number, tabSize: number) {
  const code = text.charCodeAt(i);
  if (code === 9) {
    return tabSize - (column % tabSize);
  }
  if (code >= 0xdc00 && code <= 0xdfff) {
    // Low surrogate: the pair was counted at its high surrogate.
    return 0;
  }
  return isFullWidth(code) ? 2 : 1;
}

function canBreakBefore(text: string, i: number): boolean {
  const ch = text[i];
  if (ch === ' ') {
    return false;
  }
  const prev = text[i - 1];
  return (
    (BREAK_AFTER.has(prev) && !BREAK_AFTER.has(ch)) ||
    (!BREAK_BEFORE.has(prev) && BREAK_BEFORE.has(ch)) ||
    isIdeographic(text.charCodeAt(i - 1)) ||
    isIdeographic(text.charCodeAt(i))
  );
}

function continuationIndent(text: string, options: WrapOptions): number {
  if (!options.wrappingIndent || options.wrappingIndent === 'none') {
    return 0;
  }
  let indent = 0;
  let i = 0;
  for (; i < text.length && (text[i] === ' ' || text[i] === '\t'); i++) {
    indent += charWidth(text, i, indent, options.tabSize);
  }
  if (i === text.length) {
    return 0;
  }
  if (options.wrappingIndent === 'indent') {
    indent += options.tabSize;
  } else if (options.wrappingIndent === 'deepIndent') {
    indent += 2 * options.tabSize;
  }
  return indent + 2 > options.column ? 0 : indent;
}

/**
 * Start character of each screen row of a line. The first is always 0.
 */
export function wrapLine(text: string, options: WrapOptions): number[] {
  const starts = [0];
  const { column, tabSize } = options;
  if (!isFinite(column) || column <= 0) {
    return starts;
  }
  const indent = continuationIndent(text, options);
  let rowStart = 0;
  let lastBreak = -1;
  let visible = 0;

  for (let i = 0; i < text.length; i++) {
    if (i > rowStart && canBreakBefore(text, i)) {
      lastBreak = i;
    }
    let width = charWidth(text, i, visible, tabSize);
    if (visible + width > column && i > rowStart && text[i] !== ' ') {
      const breakAt = lastBreak > rowStart ? lastBreak : i;
      starts.push(breakAt);
      rowStart = breakAt;
      lastBreak = -1;
      visible = indent;
      // Re-lay the carried-over text on the new row.
      for (let j = breakAt; j <= i; j++) {
        if (j > breakAt && canBreakBefore(text, j)) {
          lastBreak = j;
        }
        if (j < i) {
          visible += charWidth(text, j, visible, tabSize);
        }
      }
      width = charWidth(text, i, visible, tabSize);
    }
    visible += width;
  }
  return starts;
}

/**
 * Row of a line, from `wrapLine`, that `character` falls on.
 */
export function rowOfCharacter(starts: number[], character: number): number {
  let row = 0;
  while (row + 1 < starts.length && starts[row + 1] <= character) {
    row++;
  }
  return row;
}

export type RowStarts = (line: number) => number[];

/** Row of a visible range's end, which is exclusive at a row boundary. */
function endRow(rowStarts: RowStarts, end: Position): number {
  return rowOfCharacter(rowStarts(end.line), Math.max(end.character - 1, 0));
}

/**
 * Screen rows of each visible line, top to bottom, as [line, firstRow,
 * lastRow] with rows numbered within the line.
 */
function* visibleRows(
  rowStarts: RowStarts,
  ranges: readonly VisibleRange[],
): Generator<[number, number, number]> {
  for (const { start, end } of ranges) {
    for (let line = start.line; line <= end.line; line++) {
      const rows = rowStarts(line).length;
      const first =
        line === start.line
          ? rowOfCharacter(rowStarts(line), start.character)
          : 0;
      const last = line === end.line ? endRow(rowStarts, end) : rows - 1;
      if (last >= first) {
        yield [line, first, last];
      }
    }
  }
}

/** Number of screen rows the visible ranges cover. */
export function visibleRowCount(
  rowStarts: RowStarts,
  ranges: readonly VisibleRange[],
): number {
  let count = 0;
  for (const [, first, last] of visibleRows(rowStarts, ranges)) {
    count += last - first + 1;
  }
  return count;
}

/**
 * Screen row of a position counted from the top of the viewport, or
 * undefined when it is scrolled out of view.
 */
export function screenRowOf(
  rowStarts: RowStarts,
  ranges: readonly VisibleRange[],
  position: Position,
): number | undefined {
  let count = 0;
  for (const [line, first, last] of visibleRows(rowStarts, ranges)) {
    if (line === position.line) {
      const row = rowOfCharacter(rowStarts(line), position.character);
      return row >= first && row <= last ? count + row - first : undefined;
    }
    count += last - first + 1;
  }
  return undefined;
}

/** Start position of the `row`th screen row of the viewport. */
export function positionAtScreenRow(
  rowStarts: RowStarts,
  ranges: readonly VisibleRange[],
  row: number,
): Position | undefined {
  let count = 0;
  let lastSeen: Position | undefined;
  for (const [line, first, last] of visibleRows(rowStarts, ranges)) {
    const starts = rowStarts(line);
    if (row - count <= last - first) {
      return { line, character: starts[first + row - count] };
    }
    count += last - first + 1;
    lastSeen = { line, character: starts[last] };
  }
  return lastSeen;
}

/**
 * Start position of the screen row `rows` rows above the row of `position`,
 * stopping at the top of the document. Folded lines are not accounted for.
 */
export function positionRowsAbove(
  rowStarts: RowStarts,
  position: Position,
  rows: number,
): Position {
  let line = position.line;
  let row = rowOfCharacter(rowStarts(line), position.character) - rows;
  while (row < 0 && line > 0) {
    line--;
    row += rowStarts(line).length;
  }
  return { line, character: rowStarts(line)[Math.max(row, 0)] };
}

const MIN_COLUMN = 10;
const MAX_COLUMN = 500;

/**
 * Infers the wrap column of an editor whose column depends on its width
 * (`editor.wordWrap: "on"` or `"bounded"`, or word wrap toggled with
 * Alt+Z). Each time the viewport's top row starts partway into a line, that
 * offset is a real row start; the columns that wrap the line there stay
 * candidates. A sample no candidate explains (the editor was resized) starts
 * over from that sample.
 */
export class WrapColumnEstimator {
  private candidates: number[] | undefined;

  constructor(
    private readonly maxColumn = MAX_COLUMN,
    private readonly options: Omit<WrapOptions, 'column'> = { tabSize: 4 },
  ) {}

  /** Records that a screen row of the line `text` starts at `character`. */
  observe(text: string, character: number): void {
    if (character <= 0 || character >= text.length) {
      return;
    }
    const explains = (column: number) =>
      wrapLine(text, { ...this.options, column }).includes(character);
    const kept = this.candidates?.filter(explains);
    if (kept && kept.length) {
      this.candidates = kept;
      return;
    }
    const all: number[] = [];
    for (let column = MIN_COLUMN; column <= this.maxColumn; column++) {
      if (explains(column)) {
        all.push(column);
      }
    }
    this.candidates = all.length ? all : undefined;
  }

  /** The likeliest column, or undefined before any usable sample. */
  get column(): number | undefined {
    const candidates = this.candidates;
    return candidates
      ? candidates[Math.floor((candidates.length - 1) / 2)]
      : undefined;
  }
}
