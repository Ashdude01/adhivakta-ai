export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage { role: ChatRole; content: string; }

export interface CompleteOptions {
  temperature?: number;
  maxTokens?: number;
  /** Used by the mock provider to pick a smart offline behaviour. */
  intent?: 'draft' | 'chat' | 'review' | 'generic';
  /** Structured data for the mock provider (offline mode). */
  payload?: any;
}

export interface CompleteResult {
  text: string;
  provider: string;
  model: string;
  mock: boolean;
}
