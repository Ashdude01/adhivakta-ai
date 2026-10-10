import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { updateHighlightMatter, deleteHighlight } from '@/lib/data/library';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

const patchSchema = z.object({ matterId: z.string().uuid().nullable() });

/** File (or un-file) a highlight under one of the user's matters. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ highlightId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { highlightId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });

  const ok = await updateHighlightMatter(userId, highlightId, parsed.data.matterId);
  if (!ok) return NextResponse.json({ error: 'Highlight not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

/** Removes a highlight and (via cascade) its notes and links. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ highlightId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { highlightId } = await params;
  const ok = await deleteHighlight(userId, highlightId);
  if (!ok) return NextResponse.json({ error: 'Highlight not found' }, { status: 404 });

  await audit({ userId, action: 'highlight.delete', entity: 'highlight', entityId: highlightId });
  return NextResponse.json({ ok: true });
}

