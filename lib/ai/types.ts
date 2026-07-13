export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string; }

export interface CompleteOptions {
  temperature?: number;
  maxTokens?: number;
  /** Used by the mock provider to pick a smart offline behaviour. */
  intent?: 'draft' | 'chat' | 'review' | 'generic';
  /** Structured data for the mock provider (offline mode). */
  payload?: any;
  /** Per-request override. Ignored unless the provider has a key configured. */
  provider?: string;
  /** Per-request override. Ignored unless the model belongs to the provider. */
  model?: string;
  /** Aborts an in-flight stream when the reader goes away. */
  signal?: AbortSignal;
}

export interface CompleteResult {
  text: string;
  provider: string;
  model: string;
  mock: boolean;
}

export interface ModelOption {
  id: string;
  label: string;
  /** 'free' models run on the provider's free tier; 'paid' need billing enabled. */
  tier: 'free' | 'paid';
}

/** What the model picker renders. Never carries an API key. */
export interface ProviderInfo {
  id: string;
  label: string;
  models: ModelOption[];
  defaultModel: string;
  /** True when this is the provider a request with no override would land on. */
  active: boolean;
}
