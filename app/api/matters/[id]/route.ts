import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { getMatterFull, updateMatter, deleteMatter, matterFootprint, type MatterColumns } from '@/lib/data/matters';
import { audit } from '@/lib/data/audit';
import { matterUpdateSchema, parseFacts } from '@/lib/validation/matter';
import { renderCauseTitle } from '@/lib/legal/causeTitle';
import { draftPrefill } from '@/lib/legal/matterContext';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const matter = await getMatterFull(userId, id);
  if (!matter) return NextResponse.json({ error: 'Matter not found' }, { status: 404 });

  return NextResponse.json({
    matter,
    causeTitle: renderCauseTitle(matter.parties_list),
    // What the drafting form shows instead of asking for it again.
    prefill: draftPrefill(matter),
    // What a delete would take with it — shown in the confirmation.
    footprint: await matterFootprint(userId, id),
  });
}

/** Used for the filing/tracking details an advocate fills in after opening the matter. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await getMatterFull(userId, id);
  if (!existing) return NextResponse.json({ error: 'Matter not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = matterUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

  const { facts: rawFacts, ...columns } = parsed.data;
  const patch: MatterColumns = { ...columns };

  if (rawFacts) {
    // Facts are merged, not replaced: a PATCH from the "filing details" step must
    // not wipe the facts captured during intake.
    const typeCode = columns.matter_type_code ?? existing.matter_type_code;
    try {
      patch.facts = { ...existing.facts, ...parseFacts(typeCode, rawFacts) };
    } catch (err) {
      if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? 'Invalid facts' }, { status: 400 });
      throw err;
    }
  }

  const matter = await updateMatter(userId, id, patch);
  await audit({ userId, action: 'matter.update', entity: 'matter', entityId: id, meta: { fields: Object.keys(patch) } });

  return NextResponse.json({ ok: true, matter });
}

/**
 * Closes a matter file for good.
 *
 * Parties and uploaded documents go with it. Drafts, signature requests and
 * review sessions are detached rather than destroyed — a signed document and
 * its audit trail must outlive the folder it was filed in.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const matter = await getMatterFull(userId, id);
  if (!matter) return NextResponse.json({ error: 'Matter not found' }, { status: 404 });

  const footprint = await matterFootprint(userId, id);
  await deleteMatter(userId, id);
  await audit({ userId, action: 'matter.delete', entity: 'matter', entityId: id, meta: { title: matter.title, footprint } });

  return NextResponse.json({ ok: true, footprint });
}
