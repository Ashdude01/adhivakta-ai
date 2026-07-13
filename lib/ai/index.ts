import 'server-only';
import { ChatMessage, CompleteOptions, CompleteResult, ProviderInfo } from './types';
import { mockComplete } from './providers/mock';
import { geminiComplete, geminiOpenStream, geminiReadStream } from './providers/gemini';
import { huggingFaceComplete } from './providers/huggingface';
import {
  openAICompatibleComplete, openAICompatibleOpenStream, openAICompatibleReadStream,
} from './providers/openai-compatible';
import {
  configuredProviders, defaultProvider, resolveSelection, fallbackModels, type ProviderDef,
} from './providers';

export type { ChatMessage, CompleteOptions, CompleteResult, ProviderInfo, ModelOption } from './types';

/**
 * The model picker's data. Only providers whose API key is present in the
 * environment appear — an advocate cannot select a model this deployment has
 * no key for, and the response never carries the keys themselves.
 */
export function listAvailableModels(): ProviderInfo[] {
  const active = defaultProvider();
  return configuredProviders().map((p) => ({
    id: p.id,
    label: p.label,
    models: p.models,
    defaultModel: p.defaultModel,
    active: p.id === active.id,
  }));
}

function shouldTryAnotherModel(err: unknown): boolean {
  return Boolean((err as { shouldTryAnotherModel?: boolean })?.shouldTryAnotherModel);
}

async function callProvider(def: ProviderDef, model: string, apiKey: string | undefined, messages: ChatMessage[], opts?: CompleteOptions): Promise<string> {
  switch (def.kind) {
    case 'gemini':
      return geminiComplete({ apiKey: apiKey!, model, messages, opts });
    case 'openai-compatible':
      return openAICompatibleComplete({
        baseUrl: def.baseUrl!, apiKey: apiKey!, model, messages, opts,
        extraHeaders: def.extraHeaders?.(),
      });
    case 'huggingface':
      return huggingFaceComplete({ apiKey: apiKey!, model, messages, opts });
    default:
      return mockComplete(messages, opts);
  }
}

/** Opens a token stream, or throws. Never begins reading. */
async function openStream(def: ProviderDef, model: string, apiKey: string | undefined, messages: ChatMessage[], opts?: CompleteOptions): Promise<Response | null> {
  switch (def.kind) {
    case 'gemini':
      return geminiOpenStream({ apiKey: apiKey!, model, messages, opts });
    case 'openai-compatible':
      return openAICompatibleOpenStream({
        baseUrl: def.baseUrl!, apiKey: apiKey!, model, messages, opts,
        extraHeaders: def.extraHeaders?.(),
      });
    default:
      // Hugging Face's inference API has no token stream we rely on, and the
      // mock has nothing to stream from — both produce the whole text at once.
      return null;
  }
}

function readStream(def: ProviderDef, res: Response): AsyncGenerator<string> {
  return def.kind === 'gemini' ? geminiReadStream(res) : openAICompatibleReadStream(res);
}

async function* oneShotStream(def: ProviderDef, model: string, apiKey: string | undefined, messages: ChatMessage[], opts?: CompleteOptions): AsyncGenerator<string> {
  const text = await callProvider(def, model, apiKey, messages, opts);
  // Hand it over in pieces anyway, so the client's progressive rendering path
  // is the only path and never rots.
  for (const piece of text.match(/[\s\S]{1,240}/g) ?? []) {
    if (opts?.signal?.aborted) return;
    yield piece;
  }
}

/**
 * The single entry point used by every API route.
 * Always resolves to *some* response — never throws to the user;
 * on provider failure it degrades gracefully to the mock provider.
 */
export async function complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<CompleteResult> {
  const { def, model, apiKey, pinned } = resolveSelection(opts?.provider, opts?.model);

  if (def.kind === 'mock') {
    return { text: mockComplete(messages, opts), provider: 'mock', model: 'demo', mock: true };
  }

  const candidates = pinned ? [model] : [model, ...fallbackModels(def, model)];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const text = await callProvider(def, candidate, apiKey, messages, opts);
      if (!text) throw new Error('Empty response');
      return { text, provider: def.id, model: candidate, mock: false };
    } catch (err) {
      lastError = err;
      if (!shouldTryAnotherModel(err)) break;   // a real failure; another model won't help
    }
  }

  return {
    text: mockComplete(messages, opts) + `\n\n(Note: live AI provider "${def.id}" failed — showing demo output. ${(lastError as Error).message})`,
    provider: `${def.id}->mock`,
    model: 'demo',
    mock: true,
  };
}

export interface StreamResult {
  provider: string;
  model: string;
  mock: boolean;
  /** True when the requested model was busy and a sibling answered instead. */
  fellBack: boolean;
  deltas: AsyncGenerator<string>;
}

/**
 * Streaming counterpart of `complete()`.
 *
 * Connects before returning, so the model actually writing the document is
 * known — and reported — before the first token reaches the browser. If the
 * chosen model is overloaded, a free sibling takes over; anything else (a
 * retired model, an exhausted quota, a bad key) throws, because switching
 * models would not fix it.
 *
 * Deliberately does NOT degrade to the mock: a draft that starts streaming real
 * text and then silently swaps to a canned template mid-document would be
 * indistinguishable from the model having written it.
 */
export async function streamComplete(messages: ChatMessage[], opts?: CompleteOptions): Promise<StreamResult> {
  const { def, model, apiKey, pinned } = resolveSelection(opts?.provider, opts?.model);

  if (def.kind === 'mock' || def.kind === 'huggingface') {
    return {
      provider: def.id,
      model: def.kind === 'mock' ? 'demo' : model,
      mock: def.kind === 'mock',
      fellBack: false,
      deltas: oneShotStream(def, model, apiKey, messages, opts),
    };
  }

  const candidates = pinned ? [model] : [model, ...fallbackModels(def, model)];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const res = await openStream(def, candidate, apiKey, messages, opts);
      return {
        provider: def.id,
        model: candidate,
        mock: false,
        fellBack: candidate !== model,
        deltas: readStream(def, res!),
      };
    } catch (err) {
      lastError = err;
      if (!shouldTryAnotherModel(err)) break;
    }
  }
  throw lastError;
}

export function activeProviderInfo() {
  const def = defaultProvider();
  return { provider: def.id, model: def.defaultModel, configured: def.kind !== 'mock' };
}
