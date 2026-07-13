import { ChatMessage, CompleteOptions } from '../types';
import { sseChunks } from './sse';
import { fetchWithRetry } from './http';

/**
 * A single caller for every OpenAI-compatible chat API.
 * Groq, OpenRouter and OpenAI all share this request/response shape,
 * so we only differ by base URL, key and (optionally) extra headers.
 */
export interface OpenAIArgs {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  opts?: CompleteOptions;
  extraHeaders?: Record<string, string>;
}

export class ProviderError extends Error {
  constructor(readonly status: number, message: string) {
    super(`AI provider (${status}): ${message}`);
    this.name = 'ProviderError';
  }
  /** Busy or rate-limited: a sibling model may still have headroom. */
  get shouldTryAnotherModel(): boolean {
    return this.status === 503 || this.status === 500 || this.status === 502 || this.status === 429;
  }
}

async function post(args: OpenAIArgs, stream: boolean): Promise<Response> {
  const { baseUrl, apiKey, model, messages, opts, extraHeaders } = args;
  const res = await fetchWithRetry(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(extraHeaders || {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 1500,
      ...(stream ? { stream: true } : {}),
    }),
    signal: opts?.signal,
  });
  if (!res.ok) {
    const raw = await res.text();
    let message = raw.slice(0, 300);
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error?.message) message = parsed.error.message;
    } catch { /* keep the raw body */ }
    throw new ProviderError(res.status, message);
  }
  return res;
}

export async function openAICompatibleComplete(args: OpenAIArgs): Promise<string> {
  const res = await post(args, false);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

export async function openAICompatibleOpenStream(args: OpenAIArgs): Promise<Response> {
  const res = await post(args, true);
  if (!res.body) throw new ProviderError(502, 'no stream body');
  return res;
}

export async function* openAICompatibleReadStream(res: Response): AsyncGenerator<string> {
  for await (const data of sseChunks(res.body!)) {
    if (data === '[DONE]') return;
    let parsed: any;
    try { parsed = JSON.parse(data); } catch { continue; }
    if (parsed?.error?.message) throw new Error(`AI provider: ${parsed.error.message}`);
    const delta = parsed?.choices?.[0]?.delta?.content;
    if (delta) yield delta as string;
  }
}
