import { ChatMessage, CompleteOptions } from '../types';

/** Google Gemini (free tier). Translates chat messages to Gemini's format. */
export async function geminiComplete(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  opts?: CompleteOptions;
}): Promise<string> {
  const { apiKey, model, messages, opts } = args;
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: { temperature: opts?.temperature ?? 0.4, maxOutputTokens: opts?.maxTokens ?? 1500 },
      }),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini error (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('').trim() || '';
}
