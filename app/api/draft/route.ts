import { NextRequest, NextResponse } from 'next/server';
import { complete, ChatMessage } from '@/lib/ai';
import { currentUserId } from '@/lib/session';
import { createDraft, addDraftVersion, saveCitations } from '@/lib/data/drafts';
import { verifyText } from '@/lib/legal/verifier';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    docType, client, opposite, amount, dates,
    language = 'English', instructions = '', matterId = null, templateId = null,
  } = body || {};

  const system: ChatMessage = {
    role: 'system',
    content:
      `You are an expert Indian advocate's drafting assistant. Draft formal legal documents in correct Indian court format. ` +
      `Be precise and professional. When you rely on a statute or judgment, wrap the citation in double square brackets like [[Section 138 of the NI Act, 1881]] so the app can verify it. ` +
      `Write the entire document in ${language}. Never invent case citations you are unsure about.`,
  };
  const user: ChatMessage = {
    role: 'user',
    content:
      `Draft: ${docType}\nClient (sender): ${client}\nOpposite party: ${opposite}\nAmount: ₹${amount}\nKey dates: ${dates}\n` +
      (instructions ? `Extra instructions: ${instructions}\n` : '') +
      `Produce a complete, ready-to-send draft.`,
  };

  const result = await complete([system, user], {
    intent: 'draft',
    payload: { docType, client, opposite, amount, dates, language },
    temperature: 0.3,
  });

  // Citation verifier — every [[...]] claim resolved against the statute
  // registry / library before the draft reaches the UI (plan §5.2).
  const verifierReport = await verifyText(result.text || '');

  // Persist draft + version + citations for the signed-in user (best-effort).
  let draftId: string | undefined;
  try {
    const userId = await currentUserId();
    if (userId && result.text) {
      const saved = await createDraft(userId, {
        docType,
        title: `${docType}${client ? ' — ' + client : ''}`,
        body: result.text,
        language,
        provider: result.provider,
        matterId,
        templateId,
        intake: { client, opposite, amount, dates, instructions },
        meta: { mock: result.mock },
      });
      draftId = saved.id;
      const version = await addDraftVersion(saved.id, {
        content: result.text,
        source: 'ai',
        provider: result.provider,
        verifierReport,
      });
      await saveCitations(version.id, verifierReport);
      await audit({
        userId,
        action: 'draft.create',
        entity: 'draft',
        entityId: saved.id,
        meta: { docType, provider: result.provider, verifier: { passed: verifierReport.passed, failed: verifierReport.failed } },
      });
    }
  } catch (err) {
    console.error('Failed to persist draft:', (err as Error).message);
  }

  return NextResponse.json({ ...result, draftId, verifierReport });
}
