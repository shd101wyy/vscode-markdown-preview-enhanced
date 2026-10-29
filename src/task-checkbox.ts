/**
 * Render `[ ]`, `[x]`, and `[X]` as checkboxes anywhere on a line, and
 * toggle the exact source token a click refers to.
 *
 * This matches Obsidian's Table Checkbox Renderer: a table cell (or any
 * other spot on the line) can hold several checkboxes, and each click
 * updates that occurrence. `[X]` is included because GFM and the existing
 * list-item checkboxes already treat it as checked. Markers such as
 * `[/]` and `[-]` are left as text — they are not task markers in that
 * plugin or in GFM, and a single character in brackets shows up in
 * ordinary prose.
 */

const TASK_MARKER = /^[ xX]$/;

interface ScanState {
  inMath: boolean;
  inComment: boolean;
}

interface Fence {
  char: string;
  len: number;
}

/**
 * Replace task markers in `markdown` with checkbox `<input>` elements.
 * The source file is not changed; `data-checkbox-offset` is the index of
 * `[` on that source line so a click can edit the right token.
 */
export function renderTaskCheckboxes(markdown: string): string {
  if (!markdown) {
    return markdown;
  }

  let out = '';
  let i = 0;
  let lineNo = 0;
  let fence: Fence | null = null;
  let inFrontMatter = false;
  let frontDelim: string | null = null;
  const state: ScanState = { inMath: false, inComment: false };

  while (i <= markdown.length) {
    const nl = markdown.indexOf('\n', i);
    const end = nl === -1 ? markdown.length : nl;
    let lineEnd = end;
    let newline = '';
    if (nl !== -1) {
      if (lineEnd > i && markdown[lineEnd - 1] === '\r') {
        lineEnd -= 1;
        newline = '\r\n';
      } else {
        newline = '\n';
      }
    }
    const line = markdown.slice(i, lineEnd);
    lineNo += 1;

    if (lineNo === 1 && /^(---|\+\+\+)[ \t]*$/.test(line)) {
      inFrontMatter = true;
      frontDelim = line.trim();
      out += line + newline;
    } else if (inFrontMatter) {
      if (frontDelim && line.trim() === frontDelim) {
        inFrontMatter = false;
      }
      out += line + newline;
    } else if (fence) {
      if (isClosingFence(line, fence)) {
        fence = null;
      }
      out += line + newline;
    } else {
      const opened = openingFence(line);
      if (opened) {
        fence = opened;
        out += line + newline;
      } else {
        out += transformLine(line, lineNo, state) + newline;
      }
    }

    if (nl === -1) {
      break;
    }
    i = nl + 1;
  }

  return out;
}

/**
 * Toggle the task marker at `offset` (the index of `[`).
 * `[ ]` becomes `[x]`; `[x]` and `[X]` become `[ ]`.
 * Without `offset`, the first `[ ]` on the line is checked, or the first
 * `[x]`/`[X]` is cleared — the historical list-item behavior.
 * Returns undefined when nothing on the line matches.
 */
export function toggleTaskCheckboxLine(
  line: string,
  offset?: number,
): string | undefined {
  if (offset !== undefined) {
    if (!Number.isInteger(offset) || offset < 0 || offset + 3 > line.length) {
      return undefined;
    }
    const token = line.slice(offset, offset + 3);
    if (!isTaskToken(token)) {
      return undefined;
    }
    const next = token[1] === 'x' || token[1] === 'X' ? '[ ]' : '[x]';
    return line.slice(0, offset) + next + line.slice(offset + 3);
  }

  const unchecked = line.indexOf('[ ]');
  if (unchecked >= 0) {
    return line.slice(0, unchecked) + '[x]' + line.slice(unchecked + 3);
  }
  const checked = line.search(/\[[xX]\]/);
  if (checked >= 0) {
    return line.slice(0, checked) + '[ ]' + line.slice(checked + 3);
  }
  return undefined;
}

function isTaskToken(token: string): boolean {
  return (
    token.length === 3 &&
    token[0] === '[' &&
    token[2] === ']' &&
    TASK_MARKER.test(token[1])
  );
}

function openingFence(line: string): Fence | null {
  const match = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) {
    return null;
  }
  if (match[1][0] === '`' && match[2].includes('`')) {
    return null;
  }
  return { char: match[1][0], len: match[1].length };
}

function isClosingFence(line: string, fence: Fence): boolean {
  const match = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  if (!match) {
    return false;
  }
  return match[1][0] === fence.char && match[1].length >= fence.len;
}

function isEscaped(line: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && line[i] === '\\'; i--) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

/** A checkbox that sits where a GFM task-list marker sits, so list CSS applies. */
function isLeadingTask(line: string, index: number): boolean {
  return /^(?:[ \t]{0,3}>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+$/.test(
    line.slice(0, index),
  );
}

function checkboxHtml(
  lineNo: number,
  offset: number,
  marker: string,
  leading: boolean,
): string {
  const classes = ['task-list-item-checkbox', 'mpe-task-checkbox'];
  if (leading) {
    classes.push('mpe-task-checkbox-leading');
  }
  const checked = marker === 'x' || marker === 'X';
  const state = marker === ' ' ? 'blank' : marker;
  return `<input type="checkbox" class="${classes.join(' ')}" data-source-line="${lineNo}" data-checkbox-offset="${offset}" data-task-state="${state}"${checked ? ' checked' : ''}>`;
}

function transformLine(line: string, lineNo: number, state: ScanState): string {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (state.inComment) {
      if (line.startsWith('-->', i)) {
        state.inComment = false;
        out += '-->';
        i += 3;
        continue;
      }
      out += line[i];
      i += 1;
      continue;
    }
    if (state.inMath) {
      if (line.startsWith('$$', i)) {
        state.inMath = false;
        out += '$$';
        i += 2;
        continue;
      }
      out += line[i];
      i += 1;
      continue;
    }
    if (line[i] === '`') {
      let len = 1;
      while (line[i + len] === '`') {
        len += 1;
      }
      const ticks = '`'.repeat(len);
      const closer = line.indexOf(ticks, i + len);
      if (closer === -1) {
        out += line.slice(i);
        break;
      }
      const end = closer + len;
      out += line.slice(i, end);
      i = end;
      continue;
    }
    if (line.startsWith('<!--', i)) {
      const end = line.indexOf('-->', i + 4);
      if (end === -1) {
        state.inComment = true;
        out += line.slice(i);
        break;
      }
      out += line.slice(i, end + 3);
      i = end + 3;
      continue;
    }
    if (line.startsWith('$$', i)) {
      state.inMath = true;
      out += '$$';
      i += 2;
      continue;
    }
    if (line[i] === '<' && /[A-Za-z/!]/.test(line[i + 1] ?? '')) {
      const end = line.indexOf('>', i + 2);
      if (end === -1) {
        out += line.slice(i);
        break;
      }
      out += line.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (
      line[i] === '[' &&
      i + 2 < line.length &&
      line[i + 2] === ']' &&
      TASK_MARKER.test(line[i + 1])
    ) {
      const next = line[i + 3];
      const prev = line[i - 1];
      if (
        next === '(' ||
        next === ']' ||
        next === ':' ||
        prev === '!' ||
        prev === '[' ||
        prev === ']' ||
        isEscaped(line, i)
      ) {
        out += line[i];
        i += 1;
        continue;
      }
      out += checkboxHtml(lineNo, i, line[i + 1], isLeadingTask(line, i));
      i += 3;
      continue;
    }
    out += line[i];
    i += 1;
  }
  return out;
}
