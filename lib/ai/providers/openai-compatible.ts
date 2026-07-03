import { ChatMessage, CompleteOptions } from '../types';

/**
 * A single caller for every OpenAI-compatible chat API.
 * Groq, OpenRouter and OpenAI all share this request/response shape,
 * so we only differ by base URL, key and (optionally) extra headers.
 */
export async function openAICompatibleComplete(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  opts?: CompleteOptions;
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  const { baseUrl, apiKey, model, messages, opts, extraHeaders } = args;
  const res = await fetch(`${baseUrl}/chat/completions`, {
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
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI provider error (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}
