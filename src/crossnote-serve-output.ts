/**
 * Helpers for reading the output of a `crossnote serve --json` child
 * process. Kept free of `vscode` imports (unlike crossnote-server.ts) so
 * unit tests can bundle this file standalone — same rationale as
 * block-id-helpers.ts.
 */

export interface CrossnoteServeListeningEvent {
  event: 'listening';
  url: string;
  port: number;
  host: string;
  rootDirectories: string[];
  vscode: boolean;
}

/**
 * Extract the `{"event":"listening",...}` line that `crossnote serve --json`
 * prints on stdout once the server is up. Other output (render warnings and
 * the like go to stderr anyway) is ignored; only complete JSON objects that
 * describe a listening event count.
 */
export function parseListeningLine(
  output: string,
): CrossnoteServeListeningEvent | null {
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) {
      continue;
    }
    try {
      const parsed = JSON.parse(
        trimmed,
      ) as Partial<CrossnoteServeListeningEvent>;
      if (parsed.event === 'listening' && typeof parsed.url === 'string') {
        return parsed as CrossnoteServeListeningEvent;
      }
    } catch {
      // Not a JSON line — ignore.
    }
  }
  return null;
}
