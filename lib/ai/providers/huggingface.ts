import { ChatMessage, CompleteOptions } from '../types';

/** Hugging Face Inference API (free tier) — simple text-generation call. */
export async function huggingFaceComplete(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  opts?: CompleteOptions;
}): Promise<string> {
  const { apiKey, model, messages, opts } = args;
  const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n') + '\n\nASSISTANT:';
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { temperature: opts?.temperature ?? 0.4, max_new_tokens: opts?.maxTokens ?? 800, return_full_text: false },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HuggingFace error (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  if (Array.isArray(data)) return (data[0]?.generated_text || '').trim();
  return (data?.generated_text || '').toString().trim();
}
