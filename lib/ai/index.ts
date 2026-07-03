import { ChatMessage, CompleteOptions, CompleteResult } from './types';
import { mockComplete } from './providers/mock';
import { geminiComplete } from './providers/gemini';
import { huggingFaceComplete } from './providers/huggingface';
import { openAICompatibleComplete } from './providers/openai-compatible';

export type { ChatMessage, CompleteOptions, CompleteResult } from './types';

/** Catalogue of supported models — surfaced in Settings. */
export const AI_MODELS = [
  { id: 'mock',        label: 'Demo (offline)',      tier: 'free', env: null },
  { id: 'gemini',      label: 'Google Gemini',       tier: 'free', env: 'GEMINI_API_KEY' },
  { id: 'groq',        label: 'Groq · Meta Llama 3', tier: 'free', env: 'GROQ_API_KEY' },
  { id: 'openrouter',  label: 'OpenRouter',          tier: 'free', env: 'OPENROUTER_API_KEY' },
  { id: 'huggingface', label: 'Hugging Face',        tier: 'free', env: 'HUGGINGFACE_API_KEY' },
  { id: 'openai',      label: 'OpenAI GPT',          tier: 'paid', env: 'OPENAI_API_KEY' },
] as const;

function resolveProvider() {
  const provider = (process.env.AI_PROVIDER || 'mock').toLowerCase();
  const keyFor: Record<string, string | undefined> = {
    gemini: process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    huggingface: process.env.HUGGINGFACE_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  };
  // Fall back to mock if the chosen provider has no key configured.
  if (provider !== 'mock' && !keyFor[provider]) return { provider: 'mock', usableKey: undefined };
  return { provider, usableKey: keyFor[provider] };
}

/**
 * The single entry point used by every API route.
 * Always resolves to *some* response — never throws to the user;
 * on provider failure it degrades gracefully to the mock provider.
 */
export async function complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<CompleteResult> {
  const { provider, usableKey } = resolveProvider();

  if (provider === 'mock') {
    return { text: mockComplete(messages, opts), provider: 'mock', model: 'demo', mock: true };
  }

  try {
    let text = '';
    let model = '';
    switch (provider) {
      case 'gemini':
        model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        text = await geminiComplete({ apiKey: usableKey!, model, messages, opts });
        break;
      case 'groq':
        model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
        text = await openAICompatibleComplete({ baseUrl: 'https://api.groq.com/openai/v1', apiKey: usableKey!, model, messages, opts });
        break;
      case 'openrouter':
        model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
        text = await openAICompatibleComplete({
          baseUrl: 'https://openrouter.ai/api/v1', apiKey: usableKey!, model, messages, opts,
          extraHeaders: { 'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000', 'X-Title': 'Adhivakta AI' },
        });
        break;
      case 'openai':
        model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        text = await openAICompatibleComplete({ baseUrl: 'https://api.openai.com/v1', apiKey: usableKey!, model, messages, opts });
        break;
      case 'huggingface':
        model = process.env.HUGGINGFACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';
        text = await huggingFaceComplete({ apiKey: usableKey!, model, messages, opts });
        break;
      default:
        return { text: mockComplete(messages, opts), provider: 'mock', model: 'demo', mock: true };
    }
    if (!text) throw new Error('Empty response');
    return { text, provider, model, mock: false };
  } catch (err) {
    // graceful degrade
    return {
      text: mockComplete(messages, opts) + `\n\n(Note: live AI provider "${provider}" failed — showing demo output. ${(err as Error).message})`,
      provider: `${provider}->mock`,
      model: 'demo',
      mock: true,
    };
  }
}

export function activeProviderInfo() {
  const { provider } = resolveProvider();
  return { provider, configured: provider !== 'mock' };
}
