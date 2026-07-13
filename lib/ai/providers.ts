import 'server-only';
import type { ModelOption } from './types';

/**
 * The provider registry — the single place that knows which LLMs exist, which
 * of them this deployment can actually reach, and what to call by default.
 *
 * Model ids are curated rather than fetched live. Google's `ListModels` happily
 * returns models that then 404 with "no longer available to new users"
 * (gemini-2.5-flash does exactly that), so a live list would offer options that
 * cannot be used. Every id below was called with a real key before being added.
 */

export type ProviderKind = 'gemini' | 'openai-compatible' | 'huggingface' | 'mock';

export interface ProviderDef {
  id: string;
  label: string;
  kind: ProviderKind;
  /** Env var holding the API key. `null` for the offline mock. */
  envKey: string | null;
  /** Env var that overrides the default model, if the operator set one. */
  envModel?: string;
  baseUrl?: string;
  models: ModelOption[];
  defaultModel: string;
  extraHeaders?: () => Record<string, string>;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    envKey: 'GEMINI_API_KEY',
    envModel: 'GEMINI_MODEL',
    // Gemini 1.5 and 2.5 are retired for new API keys; 2.0 has a zero free-tier
    // quota. The Pro models exist but need billing — hence tier: 'paid'.
    models: [
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', tier: 'free' },
      { id: 'gemini-flash-latest', label: 'Gemini Flash (latest)', tier: 'free' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', tier: 'free' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', tier: 'free' },
      { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite (latest)', tier: 'free' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', tier: 'paid' },
      { id: 'gemini-pro-latest', label: 'Gemini Pro (latest)', tier: 'paid' },
    ],
    defaultModel: 'gemini-3.5-flash',
  },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai-compatible',
    envKey: 'GROQ_API_KEY',
    envModel: 'GROQ_MODEL',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tier: 'free' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fast)', tier: 'free' },
    ],
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    envKey: 'OPENROUTER_API_KEY',
    envModel: 'OPENROUTER_MODEL',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)', tier: 'free' },
      { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash (free)', tier: 'free' },
      { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', tier: 'paid' },
    ],
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    extraHeaders: () => ({
      'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
      'X-Title': 'Erolt AI',
    }),
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    envKey: 'OPENAI_API_KEY',
    envModel: 'OPENAI_MODEL',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', tier: 'paid' },
      { id: 'gpt-4o', label: 'GPT-4o', tier: 'paid' },
    ],
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    kind: 'huggingface',
    envKey: 'HUGGINGFACE_API_KEY',
    envModel: 'HUGGINGFACE_MODEL',
    models: [
      { id: 'mistralai/Mistral-7B-Instruct-v0.3', label: 'Mistral 7B Instruct', tier: 'free' },
    ],
    defaultModel: 'mistralai/Mistral-7B-Instruct-v0.3',
  },
  {
    id: 'mock',
    label: 'Demo (offline)',
    kind: 'mock',
    envKey: null,
    models: [{ id: 'demo', label: 'Offline templates', tier: 'free' }],
    defaultModel: 'demo',
  },
];

const MOCK = PROVIDERS.find((p) => p.id === 'mock')!;

export function providerById(id: string | undefined | null): ProviderDef | undefined {
  return id ? PROVIDERS.find((p) => p.id === id) : undefined;
}

export function apiKeyFor(def: ProviderDef): string | undefined {
  if (!def.envKey) return undefined;
  const key = process.env[def.envKey];
  return key && key.trim() ? key.trim() : undefined;
}

export function isConfigured(def: ProviderDef): boolean {
  return def.kind === 'mock' || Boolean(apiKeyFor(def));
}

/** Every provider this deployment can actually call, mock last. */
export function configuredProviders(): ProviderDef[] {
  return PROVIDERS.filter(isConfigured);
}

/**
 * The provider a request lands on when it names none.
 *
 * `AI_PROVIDER` is honoured when it is set — including `mock`, so an operator
 * can force offline mode with keys still in the file. When it is unset or names
 * a provider with no key, the first configured provider wins. The old code fell
 * back to mock in that case, which is why a valid GEMINI_API_KEY sat unused
 * behind the template's `AI_PROVIDER=mock`.
 */
export function defaultProvider(): ProviderDef {
  const requested = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (requested) {
    const def = providerById(requested);
    if (def && isConfigured(def)) return def;
  }
  return configuredProviders().find((p) => p.id !== 'mock') ?? MOCK;
}

/** The model to use for a provider: caller's choice, then env, then default. */
export function resolveModel(def: ProviderDef, requested?: string): string {
  if (requested && def.models.some((m) => m.id === requested)) return requested;
  const fromEnv = def.envModel ? process.env[def.envModel]?.trim() : undefined;
  // An operator who pins an unlisted model id knows what they are doing; a
  // client that asks for one does not, and is ignored above.
  if (fromEnv) return fromEnv;
  return def.defaultModel;
}

/**
 * Pick the provider + model for one request. A client may only choose among
 * providers that are configured — it can never make the server use a key that
 * does not exist, nor discover which keys do.
 *
 * `pinned` says the advocate named this exact model. A pinned model is never
 * silently swapped for another when the provider is busy: they asked for it,
 * they get it or they get the error.
 */
export function resolveSelection(requestedProvider?: string, requestedModel?: string): {
  def: ProviderDef;
  model: string;
  apiKey?: string;
  pinned: boolean;
} {
  const asked = providerById(requestedProvider);
  const def = asked && isConfigured(asked) ? asked : defaultProvider();
  const pinned = Boolean(requestedModel && def.models.some((m) => m.id === requestedModel));
  return { def, model: resolveModel(def, requestedModel), apiKey: apiKeyFor(def), pinned };
}

/**
 * Models to fall back to when the first choice answers "overloaded".
 * Free tier only — an automatic switch must never start billing someone.
 */
export function fallbackModels(def: ProviderDef, current: string): string[] {
  return def.models.filter((m) => m.tier === 'free' && m.id !== current).map((m) => m.id);
}
