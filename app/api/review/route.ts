import { NextRequest, NextResponse } from 'next/server';
import { complete, ChatMessage } from '@/lib/ai';
import { currentUserId } from '@/lib/session';
import { createReviewSession, saveChunks, saveSummary } from '@/lib/data/review';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { context = '', filename = 'document', matterId = null } = body || {};

  const system: ChatMessage = {
    role: 'system',
    content:
      `You are an Indian legal document-review assistant. Summarise the document, list the parties, the key issues/arguments, ` +
      `important dates (a short timeline), and flag any risks or contradictions. Cite page/paragraph references. Be structured and concise.`,
  };
  const user: ChatMessage = { role: 'user', content: `Review "${filename}":\n\n${context.slice(0, 12000)}` };

  const result = await complete([system, user], { intent: 'review', payload: { context }, temperature: 0.2 });

  // Persist session + chunk-index the document for grounded chat (best-effort).
  let sessionId: string | undefined;
  try {
    const userId = await currentUserId();
    if (userId && context.trim()) {
      const session = await createReviewSession(userId, { filename, context, matterId });
      sessionId = session.id;
      const chunks = await saveChunks(session.id, context);
      await saveSummary(session.id, result.text);
      await audit({
        userId, action: 'review.create', entity: 'review_session', entityId: session.id,
        meta: { filename, chunks, matterId },
      });
    }
  } catch (err) {
    console.error('Failed to persist review session:', (err as Error).message);
  }

  return NextResponse.json({ ...result, sessionId });
}
