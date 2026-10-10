import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import {
  searchLibrary, contributeDraft, createContribution, linkContributionToItem,
  awardCredit, findDuplicateDraft,
} from '@/lib/data/library';
import { anonymise } from '@/lib/legal/anonymiser';
import { audit, recordConsent } from '@/lib/data/audit';

export const runtime = 'nodejs';

/**
 * Search + filter for the Case Library panel. All params are optional —
 * called with none of them, this returns the most recent 24 items, same as
 * the old unfiltered list used to (just paginated now, since the corpus can
 * run into the thousands after a bulk ingest).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kindRaw = sp.get('kind');
  const kind = kindRaw === 'judgment' || kindRaw === 'draft' ? kindRaw : undefined;
  const limit = Number(sp.get('limit')) || undefined;
  const offset = Number(sp.get('offset')) || undefined;

  // Multi-select court filter: repeated ?court=X&court=Y, or one comma-separated ?courts=X,Y.
  const courtsList = [
    ...sp.getAll('court'),
    ...(sp.get('courts')?.split(',').map((c) => c.trim()).filter(Boolean) ?? []),
  ];

  const yearFromRaw = Number(sp.get('yearFrom'));
  const yearToRaw = Number(sp.get('yearTo'));
  const sortRaw = sp.get('sort');
  const sort = sortRaw === 'cited' || sortRaw === 'year' || sortRaw === 'recent' ? sortRaw : undefined;

  const { items, total } = await searchLibrary({
    q: sp.get('q') ?? undefined,
    kind,
    courts: courtsList.length > 0 ? courtsList : undefined,
    excludeCourt: sp.get('excludeCourt') ?? undefined,
    yearFrom: Number.isFinite(yearFromRaw) && yearFromRaw > 0 ? yearFromRaw : undefined,
    yearTo: Number.isFinite(yearToRaw) && yearToRaw > 0 ? yearToRaw : undefined,
    tag: sp.get('tag') ?? undefined,
    sort,
    limit,
    offset,
  });
  return NextResponse.json({ items, total });
}

const currentYear = new Date().getFullYear();

const schema = z.object({
  kind: z.enum(['judgment', 'draft']).default('draft'),
  title: z.string().trim().min(3).max(200),
  court: z.string().trim().max(120).optional(),
  citation: z.string().trim().max(120).optional(),
  year: z.number().int().min(1950).max(currentYear).optional(),
  outcome: z.string().trim().max(60).optional(),
  excerpt: z.string().trim().max(800).optional(),
  tags: z.array(z.string().trim().max(40)).max(12).optional(),
  // full contribution pipeline fields (drafts only — optional for metadata-only additions)
  anonymisedText: z.string().max(200_000).optional(),
  rawText: z.string().max(200_000).optional(),
  confirmedRedactions: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  }
  const input = parsed.data;

  // Judgments are public documents a lawyer is logging manually — no PII in a
  // published judgment, so they skip the anonymiser pipeline entirely and go
  // straight in, same as a metadata-only draft contribution.
  if (input.kind === 'judgment' || !input.anonymisedText) {
    const item = await contributeDraft(userId, input);
    await audit({ userId, action: 'library.contribute', entity: 'library_item', entityId: item.id, meta: { title: item.title, mode: input.kind === 'judgment' ? 'judgment' : 'metadata' } });
    return NextResponse.json({ ok: true, item });
  }

  // Full pipeline (plan §6.3): contributor must have confirmed the redactions.
  if (!input.confirmedRedactions) {
    return NextResponse.json({ error: 'Please review and confirm the redactions first.' }, { status: 400 });
  }

  // DPDP: explicit per-purpose consent recorded for community sharing.
  await recordConsent(userId, 'contribution');

  // Automated moderation gate: duplicate + residual-PII checks.
  const duplicate = await findDuplicateDraft(input.title);
  const residual = anonymise(input.anonymisedText).report;
  const status: 'pending' | 'approved' = duplicate || residual.length > 0 ? 'pending' : 'approved';

  const contribution = await createContribution(userId, {
    title: input.title,
    rawText: input.rawText ?? input.anonymisedText,
    anonymisedText: input.anonymisedText,
    piiReport: residual,
    court: input.court,
    tags: input.tags,
    outcome: input.outcome,
    status,
  });

  if (status === 'pending') {
    await audit({
      userId, action: 'library.contribution_held', entity: 'contribution', entityId: contribution.id,
      meta: { duplicate, residualPii: residual.length },
    });
    return NextResponse.json({
      ok: true,
      held: true,
      reason: duplicate
        ? 'A draft with this title already exists — held for moderation.'
        : `The automated check still found ${residual.length} possible identifier(s) — held for moderation. Nothing is published until it passes.`,
    });
  }

  const item = await contributeDraft(userId, {
    title: input.title,
    court: input.court,
    citation: input.citation,
    year: input.year,
    tags: input.tags,
    outcome: input.outcome,
    excerpt: input.excerpt ?? input.anonymisedText.slice(0, 240),
    fullText: input.anonymisedText,
  });
  await linkContributionToItem(contribution.id, item.id);
  await awardCredit(userId, 'library contribution', item.id);
  await audit({ userId, action: 'library.contribute', entity: 'library_item', entityId: item.id, meta: { title: item.title, mode: 'full', contributionId: contribution.id } });

  return NextResponse.json({ ok: true, item, creditsAwarded: 1 });
}
