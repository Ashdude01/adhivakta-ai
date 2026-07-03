import { NextRequest, NextResponse } from 'next/server';
import { complete, ChatMessage } from '@/lib/ai';
import { currentUserId } from '@/lib/session';
import { addChatMessage, getReviewSession, searchChunks } from '@/lib/data/review';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { question, context = '', history = [], sessionId = null } = body || {};

  // Grounded retrieval (plan §7.2): when the document is indexed, answer only
  // from the retrieved chunks, with [¶ n] anchors the UI can show.
  let groundedContext = context;
  let citations: Array<{ seq: number }> = [];
  let usedRetrieval = false;

  const userId = await currentUserId();
  if (sessionId && userId && question) {
    try {
      const session = await getReviewSession(userId, sessionId);
      if (session) {
        const chunks = await searchChunks(sessionId, question);
        usedRetrieval = true;
        if (chunks.length === 0) {
          // honesty path: nothing in the document supports an answer
          const answer = `I could not find anything in "${session.filename ?? 'the document'}" that answers that. ` +
            `Try rephrasing, or ask about another part of the file.`;
          await addChatMessage(sessionId, 'user', question);
          await addChatMessage(sessionId, 'ai', answer, []);
          return NextResponse.json({ text: answer, provider: 'retrieval', model: 'fts', mock: false, citations: [] });
        }
        groundedContext = chunks.map((c) => `[¶ ${c.seq}]\n${c.text}`).join('\n\n');
        citations = chunks.map((c) => ({ seq: c.seq }));
      }
    } catch (err) {
      console.error('chunk retrieval failed, falling back to raw context:', (err as Error).message);
    }
  }

  const system: ChatMessage = {
    role: 'system',
    content:
      `You are a legal research assistant for an Indian advocate. Answer ONLY from the provided document context. ` +
      (usedRetrieval
        ? `Each context block starts with its paragraph anchor like [¶ 3] — cite these anchors for every point you make. `
        : `Cite the page or paragraph where you found each point. `) +
      `If the answer is not in the document, say so clearly. Be concise.`,
  };

  const msgs: ChatMessage[] = [system];
  if (groundedContext) msgs.push({ role: 'user', content: `DOCUMENT CONTEXT:\n${groundedContext.slice(0, 12000)}` });
  for (const h of history.slice(-6)) {
    if (h?.role && h?.content) msgs.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content });
  }
  msgs.push({ role: 'user', content: question || '' });

  const result = await complete(msgs, { intent: 'chat', payload: { question, context: groundedContext }, temperature: 0.2 });

  // Persist the exchange (best-effort).
  if (sessionId && userId) {
    try {
      await addChatMessage(sessionId, 'user', question);
      await addChatMessage(sessionId, 'ai', result.text, citations);
    } catch (err) {
      console.error('Failed to persist chat:', (err as Error).message);
    }
  }

  return NextResponse.json({ ...result, citations });
}
