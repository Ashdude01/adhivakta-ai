import { ChatMessage, CompleteOptions } from '../types';
import { sseChunks } from './sse';
import { fetchWithRetry } from './http';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiArgs {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  opts?: CompleteOptions;
}

/** Gemini takes the system prompt out-of-band and calls the assistant "model". */
function requestBody({ messages, opts }: Pick<GeminiArgs, 'messages' | 'opts'>) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  return {
    contents,
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    generationConfig: { temperature: opts?.temperature ?? 0.4, maxOutputTokens: opts?.maxTokens ?? 1500 },
  };
}

/**
 * Google returns the useful part of a failure in the body, not the status line:
 * a retired model is a 404 saying "no longer available to new users", and an
 * exhausted free tier is a 429. Surface that text — it is what tells the
 * advocate whether to switch model or wait.
 */
export class GeminiError extends Error {
  constructor(readonly status: number, message: string) {
    super(`Gemini (${status}): ${message}`);
    this.name = 'GeminiError';
  }

  /**
   * Worth asking a different model.
   *
   * 503/500 mean this model is swamped. 429 means its quota is gone — and on
   * Gemini's free tier the quota is *per model*, so a sibling often answers
   * where this one will not. Neither is worth retrying against the same model,
   * which is why the backoff in http.ts covers 5xx only.
   */
  get shouldTryAnotherModel(): boolean {
    return this.status === 503 || this.status === 500 || this.status === 429;
  }
}

async function fail(res: Response): Promise<never> {
  const raw = await res.text();
  let message = raw.slice(0, 300);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) message = parsed.error.message;
  } catch { /* keep the raw body */ }
  throw new GeminiError(res.status, message);
}

export async function geminiComplete(args: GeminiArgs): Promise<string> {
  const { apiKey, model, opts } = args;
  const res = await fetchWithRetry(`${BASE}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody(args)),
    signal: opts?.signal,
  });
  if (!res.ok) await fail(res);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('').trim() || '';
}

/**
 * Opens the stream. Split from the reading below so a failure to connect can
 * still be retried against a different model — once bytes are flowing, it is
 * too late to switch without duplicating text.
 */
export async function geminiOpenStream(args: GeminiArgs): Promise<Response> {
  const { apiKey, model, opts } = args;
  const res = await fetchWithRetry(`${BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody(args)),
    signal: opts?.signal,
  });
  if (!res.ok) await fail(res);
  if (!res.body) throw new GeminiError(502, 'no stream body');
  return res;
}

export async function* geminiReadStream(res: Response): AsyncGenerator<string> {
  for await (const data of sseChunks(res.body!)) {
    if (data === '[DONE]') return;
    let parsed: any;
    try { parsed = JSON.parse(data); } catch { continue; }
    if (parsed?.error?.message) throw new Error(`Gemini: ${parsed.error.message}`);
    const text = parsed?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
    if (text) yield text;
  }
}
