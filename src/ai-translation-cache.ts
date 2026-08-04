import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { globalConfigPath } from './utils';

const CACHE_DIR_NAME = 'ai-translation-cache';
// Bump when TRANSLATE_SYSTEM_PROMPT in ai-translator.ts changes, to invalidate
// all cached translations produced under the old prompt.
const SYSTEM_PROMPT_VERSION = 'translate-to-chinese-v1';

function cacheDir(): string {
  return path.join(globalConfigPath, CACHE_DIR_NAME);
}

function ensureCacheDir(): string {
  const dir = cacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Compute a stable cache key for a translation request.
 * Inputs: the source markdown, the provider id, the model id, and a
 * system-prompt version tag (so changing the prompt invalidates the cache).
 */
export function computeTranslationCacheKey(
  markdown: string,
  provider: string,
  model: string,
): string {
  const hash = crypto
    .createHash('sha256')
    .update(SYSTEM_PROMPT_VERSION)
    .update('\0')
    .update(provider)
    .update('\0')
    .update(model)
    .update('\0')
    .update(markdown)
    .digest('hex');
  return hash.slice(0, 16);
}

export interface CachedTranslation {
  /** The translated markdown (fed back into crossnote's preview pipeline). */
  markdown: string;
  provider: string;
  model: string;
  createdAt: number;
  sourceBytes: number;
}

/** Read a cached translation. Returns undefined on miss / read error. */
export function getCachedTranslation(
  key: string,
): CachedTranslation | undefined {
  try {
    const dir = cacheDir();
    const mdPath = path.join(dir, `${key}.md`);
    if (!fs.existsSync(mdPath)) {
      return undefined;
    }
    const markdown = fs.readFileSync(mdPath, 'utf8');
    let meta: Partial<CachedTranslation> = {};
    try {
      const metaPath = path.join(dir, `${key}.meta.json`);
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      // meta is optional; ignore parse errors
    }
    return {
      markdown,
      provider: meta.provider ?? '',
      model: meta.model ?? '',
      createdAt: meta.createdAt ?? 0,
      sourceBytes: meta.sourceBytes ?? 0,
    };
  } catch {
    return undefined;
  }
}

/** Write a translation to the cache. Best-effort: errors are swallowed. */
export function setCachedTranslation(
  key: string,
  markdown: string,
  provider: string,
  model: string,
  sourceBytes: number,
): void {
  try {
    const dir = ensureCacheDir();
    fs.writeFileSync(path.join(dir, `${key}.md`), markdown, 'utf8');
    const meta = {
      provider,
      model,
      createdAt: Date.now(),
      sourceBytes,
    };
    fs.writeFileSync(
      path.join(dir, `${key}.meta.json`),
      JSON.stringify(meta, null, 2),
      'utf8',
    );
  } catch {
    // Cache is best-effort; never break translation on a write failure.
  }
}

// ---------------------------------------------------------------------------
// Block-level cache (incremental translation)
// ---------------------------------------------------------------------------

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
