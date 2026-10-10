import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { updateHighlightNote, deleteHighlightNote } from '@/lib/data/library';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

const schema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ highlightId: string; noteId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { noteId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });

  const ok = await updateHighlightNote(userId, noteId, parsed.data.body);
  if (!ok) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ highlightId: string; noteId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { highlightId, noteId } = await params;
  const ok = await deleteHighlightNote(userId, noteId);
  if (!ok) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  await audit({ userId, action: 'highlight.note_delete', entity: 'highlight', entityId: highlightId, meta: { noteId } });
  return NextResponse.json({ ok: true });
}

