/**
 * Lightweight markdown block splitter for incremental translation.
 *
 * A "block" is a chunk of markdown separated from its neighbors by a blank
 * line, with two exceptions that must not be split on internal blank lines:
 *   - fenced code blocks (``` / ~~~)
 *   - YAML front matter (the leading `---` ... `---` block)
 *
 * The splitter is a small line-by-line state machine — no AST, no markdown-it
 * dependency — so it is cheap to run on every translation request.
 */

import * as CryptoJS from 'crypto-js';

/**
 * Split `markdown` into top-level blocks. Each returned string is a
 * self-contained chunk of markdown (a paragraph, heading, list, code fence,
 * front matter, etc.). Blank lines between blocks are not included in the
 * blocks themselves; block order is preserved.
 *
 * Trailing whitespace/newlines on the whole input are dropped, but internal
 * whitespace within a block is preserved verbatim.
 */
export function splitMarkdownBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  // Normalize line endings; drop a trailing newline so it doesn't create a
  // spurious empty final block.
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  // Remove a single trailing empty line caused by a final '\n'.
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  let i = 0;
  // --- YAML front matter (only valid at the very start of the file) ---
  if (lines.length >= 2 && lines[0].trim() === '---') {
    // Find the closing `---` (or `...`). Stop at end of file if none.
    let end = 1;
    while (
      end < lines.length &&
      lines[end].trim() !== '---' &&
      lines[end].trim() !== '...'
    ) {
      end++;
    }
    if (end < lines.length) {
      // Include the closing fence.
      blocks.push(lines.slice(0, end + 1).join('\n'));
      i = end + 1;
    } else {
      // No closing fence — treat the whole thing as front matter (degenerate).
      blocks.push(lines.slice(0).join('\n'));
      i = lines.length;
    }
  }

  let current: string[] = [];
  let inFence = false;
  let fenceMarker = ''; // the opening fence string, e.g. "```" or "~~~"

  const flush = () => {
    if (current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inFence) {
      current.push(line);
      // Closing fence: a line whose leading run of fence chars equals the
      // opening marker (allow trailing info string / whitespace).
      if (fenceMatch(line, fenceMarker)) {
        inFence = false;
        fenceMarker = '';
        flush();
      }
      continue;
    }

    // Opening fence?
    const fence = openingFence(trimmed);
    if (fence) {
      // A blank line ends the previous block before the fence starts.
      flush();
      current.push(line);
      inFence = true;
      fenceMarker = fence;
      continue;
    }

    // Blank line outside a fence = block boundary.
    if (trimmed === '') {
      flush();
      continue;
    }

    current.push(line);
  }
  flush();
  return blocks;
}

/**
 * Detect an opening code fence at the start of a (trimmed) line.
 * Returns the fence marker string ("```" or "~~~" with its char run) if this
 * line opens a fence, otherwise ''.
 */
function openingFence(trimmedLine: string): string {
  if (trimmedLine.length < 3) {
    return '';
  }
  const ch = trimmedLine[0];
  if (ch !== '`' && ch !== '~') {
    return '';
  }
  let run = '';
  for (let k = 0; k < trimmedLine.length && trimmedLine[k] === ch; k++) {
    run += ch;
  }
  // At least 3 fence chars. For ``` an info string may follow; for ~~~ too.
  return run.length >= 3 ? run : '';
}

/**
 * Does `line` close the fence opened with `fenceMarker`? A closing fence is a
 * line that starts with the same run of fence chars (>=3) and nothing else
 * (ignoring trailing whitespace).
 */
function fenceMatch(line: string, fenceMarker: string): boolean {
  const trimmed = line.trimStart();
  if (trimmed.length < fenceMarker.length) {
    return false;
  }
  const ch = fenceMarker[0];
  let run = 0;
  for (let k = 0; k < trimmed.length && trimmed[k] === ch; k++) {
    run++;
  }
  // Closing fence: the run must be >= the opening run and the rest must be
  // whitespace only (no info string on a closing fence).
  if (run < fenceMarker.length) {
    return false;
  }
  for (let k = run; k < trimmed.length; k++) {
    if (trimmed[k] !== ' ' && trimmed[k] !== '\t') {
      return false;
    }
  }
  return true;
}

/**
 * Stable short hash for a block, used as the cache key. SHA-256, truncated.
 */
export function hashBlock(block: string): string {
  // crypto-js (not node:crypto): this module must also work in the web
  // extension bundle, where the node polyfill maps node:crypto to an empty
  // module (review on #2353).
  return CryptoJS.SHA256(block).toString().slice(0, 16);
}
