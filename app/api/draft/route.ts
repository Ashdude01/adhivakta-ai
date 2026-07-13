import { NextRequest, NextResponse } from 'next/server';
import { streamComplete, ChatMessage, type StreamResult } from '@/lib/ai';
import { currentUserId } from '@/lib/session';
import { createDraft, addDraftVersion, saveCitations, getDraft } from '@/lib/data/drafts';
import { verifyText } from '@/lib/legal/verifier';
import { buildMatterContext, draftPrefill } from '@/lib/legal/matterContext';
import { buildAdvocateContext, type AdvocateContext } from '@/lib/legal/advocateContext';
import { noticeInstructions } from '@/lib/legal/noticeStandards';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

const SYSTEM_RULES =
  `You are an expert Indian advocate's drafting assistant. Draft formal legal documents in correct Indian court format. ` +
  `Be precise and professional. When you rely on a statute or judgment, wrap the citation in double square brackets like [[Section 138 of the NI Act, 1881]] so the app can verify it. ` +
  `Never invent case citations you are unsure about. ` +
  `Output only the document text — no preamble, no commentary, no markdown code fences.`;

interface Body {
  docType?: string;
  matterId?: string | null;
  language?: string;
  instructions?: string;
  provider?: string;
  model?: string;
  /** Fallback particulars for a draft not filed under a matter. */
  client?: string; opposite?: string; amount?: string; dates?: string;
  /** Revision mode: an existing draft, and what to do to it. */
  draftId?: string | null;
  baseText?: string;
  selection?: string;
  command?: string;
}

export async function POST(req: NextRequest) {
  const body: Body = await req.json().catch(() => ({}));
  const {
    docType = 'Legal document', language = 'English', instructions = '',
    matterId = null, provider, model, draftId = null,
    baseText = '', selection = '', command = '',
  } = body;

  const userId = await currentUserId();

  // When the draft belongs to a matter, the matter is the authority on who the
  // parties are and what happened. The form's own fields are only a fallback for
  // one-off drafts that were never filed under a matter.
  const [context, advocate] = await Promise.all([
    userId && matterId ? buildMatterContext(userId, matterId) : Promise.resolve(null),
    userId ? buildAdvocateContext(userId) : Promise.resolve(null),
  ]);
  const facts = context
    ? draftPrefill(context.matter)
    : { client: body.client ?? '', opposite: body.opposite ?? '', amount: body.amount ?? '', dates: body.dates ?? '' };

  const messages = command && baseText
    ? reviseMessages({ context, advocate, docType, language, baseText, selection, command })
    : draftMessages({ context, advocate, docType, language, instructions, facts });

  // Connect before opening the SSE response, so a dead key or a retired model
  // becomes an honest HTTP error instead of a stream that yields nothing.
  let stream: StreamResult;
  try {
    stream = await streamComplete(messages, {
      intent: 'draft',
      payload: { docType, ...facts, language },
      temperature: 0.3,
      maxTokens: 3000,
      provider, model,
      signal: req.signal,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      send('meta', { provider: stream.provider, model: stream.model, mock: stream.mock, fellBack: stream.fellBack });

      let full = '';
      try {
        for await (const delta of stream.deltas) {
          full += delta;
          send('delta', { text: delta });
        }
      } catch (err) {
        // Report and stop. Never swap in demo text mid-document: the advocate
        // would have no way to tell which paragraphs the model actually wrote.
        send('error', { message: (err as Error).message, partial: full.length > 0 });
        controller.close();
        return;
      }

      if (req.signal.aborted) { controller.close(); return; }

      const cleaned = stripFences(full);
      const verifierReport = await verifyText(cleaned);

      let savedId: string | undefined;
      try {
        if (userId && cleaned) savedId = await persist({ userId, draftId, cleaned, docType, language, facts, instructions, matterId, provider: stream.provider, verifierReport, fromMatter: Boolean(context) });
      } catch (err) {
        console.error('Failed to persist draft:', (err as Error).message);
      }

      send('done', { draftId: savedId ?? draftId, verifierReport, text: cleaned });
      controller.close();
    },
  });

  return new Response(sse, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function draftMessages(args: {
  context: Awaited<ReturnType<typeof buildMatterContext>>;
  advocate: AdvocateContext | null;
  docType: string; language: string; instructions: string;
  facts: { client: string; opposite: string; amount: string; dates: string };
}): ChatMessage[] {
  const { context, advocate, docType, language, instructions, facts } = args;
  const notice = noticeInstructions(docType);
  return [
    { role: 'system', content: `${SYSTEM_RULES}${notice ? `\n\n${notice}` : ''} Write the entire document in ${language}.` },
    {
      role: 'user',
      content: [
        advocate?.promptBlock,
        context?.promptBlock,
        `Draft: ${docType}`,
        !context && facts.client && `Client (sender): ${facts.client}`,
        !context && facts.opposite && `Opposite party: ${facts.opposite}`,
        !context && facts.amount && `Amount: ₹${facts.amount}`,
        !context && facts.dates && `Key dates: ${facts.dates}`,
        context && 'Use the cause title and party descriptions exactly as given in the matter context above.',
        instructions && `Extra instructions: ${instructions}`,
        'Produce a complete, ready-to-send draft.',
      ].filter(Boolean).join('\n'),
    },
  ];
}

/**
 * Revision mode. The model is given the document it is editing and told to
 * return the whole thing back — returning only the changed passage would leave
 * the client guessing where to splice it.
 */
function reviseMessages(args: {
  context: Awaited<ReturnType<typeof buildMatterContext>>;
  advocate: AdvocateContext | null;
  docType: string; language: string; baseText: string; selection: string; command: string;
}): ChatMessage[] {
  const { context, advocate, docType, language, baseText, selection, command } = args;
  const scoped = selection.trim();
  return [
    {
      role: 'system',
      content:
        `${SYSTEM_RULES} Write the entire document in ${language}. ` +
        `You are revising an existing draft. Return the COMPLETE revised document, not a fragment and not a description of your changes. ` +
        `Preserve every part you were not asked to change, verbatim.`,
    },
    {
      role: 'user',
      content: [
        advocate?.promptBlock,
        context?.promptBlock,
        `Document type: ${docType}`,
        scoped
          ? `Apply this instruction to the passage between <<< and >>> only, leaving the rest untouched:\n${command}\n\nPassage:\n<<<\n${scoped}\n>>>`
          : `Apply this instruction to the whole document: ${command}`,
        '',
        'Current draft:',
        baseText,
      ].filter(Boolean).join('\n'),
    },
  ];
}

/** Models like to wrap prose in ```; the court does not. */
function stripFences(text: string): string {
  const fenced = text.trim().match(/^```(?:\w+)?\r?\n([\s\S]*?)\r?\n?```$/);
  return (fenced ? fenced[1] : text).trim();
}

async function persist(args: {
  userId: string; draftId: string | null; cleaned: string; docType: string; language: string;
  facts: { client: string }; instructions: string; matterId: string | null; provider: string;
  verifierReport: Awaited<ReturnType<typeof verifyText>>; fromMatter: boolean;
}): Promise<string> {
  const { userId, draftId, cleaned, docType, language, facts, instructions, matterId, provider, verifierReport, fromMatter } = args;

  // A revision appends a version to the draft it revised; a fresh generation
  // opens a new draft. Either way the version history stays complete.
  let id = draftId ?? undefined;
  if (id) {
    const existing = await getDraft(userId, id);
    if (!existing) id = undefined;
  }
  if (!id) {
    const saved = await createDraft(userId, {
      docType,
      title: `${docType}${facts.client ? ' — ' + facts.client : ''}`,
      body: cleaned,
      language,
      provider,
      matterId,
      intake: { ...facts, instructions, from_matter: fromMatter },
      meta: { from_matter: fromMatter },
    });
    id = saved.id;
  }

  const version = await addDraftVersion(id, {
    content: cleaned,
    source: draftId ? 'ai-command' : 'ai',
    provider,
    verifierReport,
  });
  await saveCitations(version.id, verifierReport);
  await audit({
    userId,
    action: draftId ? 'draft.revise' : 'draft.create',
    entity: 'draft',
    entityId: id,
    meta: { docType, provider, matterId, verifier: { passed: verifierReport.passed, failed: verifierReport.failed } },
  });
  return id;
}
