import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { getDraft, listDraftVersions, deleteDraft, renameDraft, addDraftVersion, saveCitations } from '@/lib/data/drafts';
import { verifyText } from '@/lib/legal/verifier';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

/** One draft, with its full version history — what the editor opens. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const draft = await getDraft(userId, id);
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

  return NextResponse.json({ draft, versions: await listDraftVersions(id) });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  /** A human edit. Saved as a new version so the AI/human authorship stays legible. */
  body: z.string().max(200_000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const draft = await getDraft(userId, id);
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

  const { title, body } = parsed.data;
  if (title) await renameDraft(userId, id, title);

  let verifierReport;
  if (body !== undefined && body !== draft.body) {
    verifierReport = await verifyText(body);
    const version = await addDraftVersion(id, { content: body, source: 'human', provider: null, verifierReport });
    await saveCitations(version.id, verifierReport);
    await audit({ userId, action: 'draft.edit', entity: 'draft', entityId: id, meta: { version: version.version_no } });
  }

  return NextResponse.json({ ok: true, verifierReport });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const draft = await getDraft(userId, id);
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

  await deleteDraft(userId, id);
  await audit({ userId, action: 'draft.delete', entity: 'draft', entityId: id, meta: { title: draft.title } });
  return NextResponse.json({ ok: true });
}
