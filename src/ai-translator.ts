import * as vscode from 'vscode';
import { getMPEConfig } from './config';

const API_KEY_SECRET_KEY = 'mpe.aiTranslation.apiKey';

let cachedContext: vscode.ExtensionContext | undefined;

// Diagnostic output channel for AI translation requests. View in the Output
// panel by selecting "MPE AI Translation". Lets you see every request, the
// stream deltas, and completion without needing webview DevTools (the LLM
// calls run in the Node extension host, so the webview Network panel never
// sees them).
let outputChannel: vscode.OutputChannel | undefined;
function log(msg: string): void {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('MPE AI Translation');
  }
  outputChannel.appendLine(msg);
}

export function setAiTranslatorContext(context: vscode.ExtensionContext) {
  cachedContext = context;
}

export async function getAiApiKey(): Promise<string | undefined> {
  if (!cachedContext) {
    throw new Error('AI translator context not initialized');
  }
  return cachedContext.secrets.get(API_KEY_SECRET_KEY);
}

export async function setAiApiKey(key: string): Promise<void> {
  if (!cachedContext) {
    throw new Error('AI translator context not initialized');
  }
  await cachedContext.secrets.store(API_KEY_SECRET_KEY, key.trim());
}

export async function clearAiApiKey(): Promise<void> {
  if (!cachedContext) {
    throw new Error('AI translator context not initialized');
  }
  await cachedContext.secrets.delete(API_KEY_SECRET_KEY);
}

/**
 * Prompt the user for an API key via VS Code input box and store it.
 * Used by the "Set API Key" command (Task 9).
 */
export async function promptAndStoreApiKey(): Promise<boolean> {
  const key = await vscode.window.showInputBox({
    prompt: 'Enter the API key for the AI translation provider',
    password: true,
    ignoreFocusOut: true,
  });
  if (!key) {
    return false;
  }
  await setAiApiKey(key);
  vscode.window.showInformationMessage('AI translation API key saved.');
  return true;
}

// pi-ai is ESM-only; load it lazily via dynamic import so the CJS bundle
// (esbuild) handles it correctly. PoC-verified.
type PiModels = {
  getModel(provider: string, id: string): { api: string } | undefined;
  stream(
    model: { api: string },
    context: { systemPrompt?: string; messages: unknown[] },
    options: { apiKey: string; signal?: AbortSignal },
  ): AsyncIterable<{ type: string; delta?: string }>;
};

let modelsPromise: Promise<PiModels> | undefined;

async function getModels(): Promise<PiModels> {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const { builtinModels } =
        await import('@earendil-works/pi-ai/providers/all');
      return builtinModels() as PiModels;
    })();
  }
  return modelsPromise;
}

const TRANSLATE_SYSTEM_PROMPT =
  'You are a professional translator. Translate the user markdown into Chinese. Output ONLY the translated markdown, preserving all markdown syntax, code blocks, and structure. Do not add explanations.';

export interface TranslateResult {
  ok: boolean;
  error?: string;
  /** The complete translated markdown. Present on success. */
  markdown?: string;
}

/**
 * Stream-translate `markdown` into Chinese markdown. Returns the complete
 * translated markdown on success. `signal` aborts the stream.
 *
 * v2 design: this returns raw translated markdown (not rendered HTML).
 * The caller feeds the translated markdown back into crossnote's normal
 * preview pipeline (initPreview), so TOC / line-numbers / exports all work
 * on the translated content. No per-chunk HTML rendering — the caller shows
 * a progress indicator while streaming, then re-renders once on completion.
 */
export async function streamTranslateDocument(args: {
  markdown: string;
  signal?: AbortSignal;
  /**
   * Optional callback fired periodically with the accumulated partial
   * translation while streaming (throttled). Used by the whole-document
   * streaming path to refresh the preview as text arrives.
   */
  onPartial?: (partial: string) => void;
}): Promise<TranslateResult> {
  const resolved = await resolveTranslationRequest();
  if ('error' in resolved) {
    log(`whole-document: resolve failed: ${resolved.error}`);
    return { ok: false, error: resolved.error };
  }
  log(`whole-document: starting (markdownBytes=${args.markdown.length})`);
  return runStream(resolved, args.markdown, args.signal, args.onPartial);
}

/**
 * Stream-translate a single markdown block. Used by the incremental
 * translation path: only changed blocks are re-translated, each as its own
 * API call, so the result aligns 1:1 with the input block (no cross-block
 * structure assumptions). `signal` aborts the stream.
 */
export async function streamTranslateBlock(args: {
  block: string;
  signal?: AbortSignal;
}): Promise<TranslateResult> {
  const resolved = await resolveTranslationRequest();
  if ('error' in resolved) {
    log(`per-block: resolve failed: ${resolved.error}`);
    return { ok: false, error: resolved.error };
  }
  log(`per-block: starting (blockBytes=${args.block.length})`);
  return runStream(resolved, args.block, args.signal);
}

/**
 * Shared resolution of provider/model/key/models. Returns either an error
 * string (for a non-configured / missing-key / missing-model case) or the
 * resolved stream runner inputs.
 */
async function resolveTranslationRequest(): Promise<
  | { error: string }
  | { models: PiModels; model: { api: string }; apiKey: string }
> {
  const providerId = getMPEConfig<string>('aiTranslationProvider') ?? '';
  const modelId = getMPEConfig<string>('aiTranslationModel') ?? '';
  if (!providerId || !modelId) {
    return {
      error:
        'AI translation is not configured. Set "markdown-preview-enhanced.aiTranslationProvider" and ".aiTranslationModel", then run "MPE: Set AI Translation API Key".',
    };
  }
  const apiKey = await getAiApiKey();
  if (!apiKey) {
    return {
      error:
        'AI translation API key not set. Run "MPE: Set AI Translation API Key" first.',
    };
  }

  let models: PiModels;
  try {
    models = await getModels();
  } catch (err) {
    return { error: `Failed to load AI provider: ${String(err)}` };
  }
  const model = models.getModel(providerId, modelId);
  if (!model) {
    return { error: `Model not found: ${providerId}/${modelId}` };
  }
  return { models, model, apiKey };
}

/**
 * Run a single translation stream for `content` against resolved inputs.
 * Shared by the whole-document and per-block paths. If `onPartial` is
 * provided, it is fired with the accumulated partial translation, throttled
 * to at most once per `PARTIAL_FLUSH_INTERVAL_MS` so callers can refresh a
 * preview without parsing markdown on every delta.
 */
const PARTIAL_FLUSH_INTERVAL_MS = 500;

async function runStream(
  resolved: { models: PiModels; model: { api: string }; apiKey: string },
  content: string,
  signal?: AbortSignal,
  onPartial?: (partial: string) => void,
): Promise<TranslateResult> {
  const requestId = Math.random().toString(36).slice(2, 8);
  log(
    `[${requestId}] request start, contentBytes=${content.length}, hasOnPartial=${!!onPartial}`,
  );
  let accumulated = '';
  let lastFlush = 0;
  let deltaCount = 0;
  let firstDeltaTime = 0;
  try {
    const stream = resolved.models.stream(
      resolved.model,
      {
        systemPrompt: TRANSLATE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content, timestamp: Date.now() }],
      },
      { apiKey: resolved.apiKey, signal },
    );
    for await (const event of stream) {
      if (signal?.aborted) {
        log(`[${requestId}] aborted by signal`);
        return { ok: true };
      }
      if (event.type === 'text_delta' && typeof event.delta === 'string') {
        if (deltaCount === 0) {
          firstDeltaTime = Date.now();
          log(`[${requestId}] first delta received`);
        }
        deltaCount++;
        accumulated += event.delta;
        if (onPartial) {
          const now = Date.now();
          if (now - lastFlush >= PARTIAL_FLUSH_INTERVAL_MS) {
            lastFlush = now;
            try {
              onPartial(accumulated);
            } catch {
              // best-effort: a refresh failure must not abort the stream
            }
          }
        }
      } else if (event.type === 'error') {
        const ev = event as unknown as {
          error?: { errorMessage?: string; stopReason?: string };
        };
        log(
          `[${requestId}] stream error: ${ev.error?.errorMessage ?? 'stream error'}`,
        );
        return { ok: false, error: ev.error?.errorMessage ?? 'stream error' };
      }
    }
    const elapsed = firstDeltaTime ? Date.now() - firstDeltaTime : 0;
    log(
      `[${requestId}] done, deltas=${deltaCount}, outBytes=${accumulated.length}, elapsed=${elapsed}ms`,
    );
    return { ok: true, markdown: accumulated };
  } catch (err) {
    if (signal?.aborted) {
      log(`[${requestId}] aborted (catch)`);
      return { ok: true };
    }
    log(`[${requestId}] exception: ${String(err)}`);
    return { ok: false, error: String(err) };
  }
}
