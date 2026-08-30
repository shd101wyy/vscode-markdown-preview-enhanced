import * as fs from 'node:fs';
import * as path from 'node:path';
import { globalConfigPath } from './utils';

// Block-level translation cache (incremental translation).
//
// There is deliberately no whole-document cache: `translateIncrementally`
// already assembles an unchanged document from the block cache with zero
// API calls, so a document-level entry would duplicate that fast path
// (see the review discussion on #2353).

const CACHE_DIR_NAME = 'ai-translation-cache';
const BLOCKS_DIR_NAME = 'blocks';
// Soft cap on the number of cached blocks. When exceeded, the oldest blocks
// (by lastAccess) are evicted. Tuned for "lots of small edits over time"
// without unbounded disk growth.
const MAX_BLOCKS = 5000;

function blocksDir(): string {
  return path.join(globalConfigPath, CACHE_DIR_NAME, BLOCKS_DIR_NAME);
}

function ensureBlocksDir(): string {
  const dir = blocksDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

interface BlockMeta {
  provider: string;
  model: string;
  lastAccess: number;
}

/**
 * Read a cached translated block. Returns undefined on miss / read error.
 * Touches `lastAccess` on hit (best-effort) for LRU eviction.
 */
export function getBlockTranslation(blockHash: string): string | undefined {
  try {
    const dir = blocksDir();
    const mdPath = path.join(dir, `${blockHash}.md`);
    if (!fs.existsSync(mdPath)) {
      return undefined;
    }
    const markdown = fs.readFileSync(mdPath, 'utf8');
    // Best-effort lastAccess bump — never block a hit on a meta write failure.
    try {
      const metaPath = path.join(dir, `${blockHash}.meta.json`);
      let meta: BlockMeta = {
        provider: '',
        model: '',
        lastAccess: Date.now(),
      };
      try {
        meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf8')) };
      } catch {
        // meta missing/invalid — keep defaults
      }
      meta.lastAccess = Date.now();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
    } catch {
      // ignore
    }
    return markdown;
  } catch {
    return undefined;
  }
}

/**
 * Write a translated block to the cache, then evict oldest blocks if the
 * total count exceeds MAX_BLOCKS. Best-effort: errors are swallowed.
 */
export function setBlockTranslation(
  blockHash: string,
  translatedBlock: string,
  provider: string,
  model: string,
): void {
  try {
    const dir = ensureBlocksDir();
    fs.writeFileSync(
      path.join(dir, `${blockHash}.md`),
      translatedBlock,
      'utf8',
    );
    const meta: BlockMeta = { provider, model, lastAccess: Date.now() };
    fs.writeFileSync(
      path.join(dir, `${blockHash}.meta.json`),
      JSON.stringify(meta, null, 2),
      'utf8',
    );
    evictOldBlocks(dir);
  } catch {
    // Cache is best-effort.
  }
}

/**
 * LRU eviction: if the number of `*.md` files in the blocks dir exceeds
 * MAX_BLOCKS, delete the oldest (by meta.lastAccess, falling back to file
 * mtime) until back under the cap. Best-effort.
 */
function evictOldBlocks(dir: string): void {
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    if (files.length <= MAX_BLOCKS) {
      return;
    }
    // Collect lastAccess (or mtime fallback) per block.
    const entries: { hash: string; lastAccess: number }[] = [];
    for (const f of files) {
      const hash = f.slice(0, -3); // strip ".md"
      let lastAccess = 0;
      try {
        const meta = JSON.parse(
          fs.readFileSync(path.join(dir, `${hash}.meta.json`), 'utf8'),
        ) as BlockMeta;
        lastAccess = meta.lastAccess ?? 0;
      } catch {
        // fall back to mtime
      }
      if (lastAccess === 0) {
        try {
          lastAccess = fs.statSync(path.join(dir, f)).mtimeMs;
        } catch {
          lastAccess = 0;
        }
      }
      entries.push({ hash, lastAccess });
    }
    entries.sort((a, b) => a.lastAccess - b.lastAccess);
    const toEvict = entries.slice(0, entries.length - MAX_BLOCKS);
    for (const e of toEvict) {
      try {
        fs.unlinkSync(path.join(dir, `${e.hash}.md`));
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(path.join(dir, `${e.hash}.meta.json`));
      } catch {
        // ignore
      }
    }
  } catch {
    // eviction is best-effort
  }
}
