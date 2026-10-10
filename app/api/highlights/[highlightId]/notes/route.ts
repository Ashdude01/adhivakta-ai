import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { addHighlightNote } from '@/lib/data/library';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

const schema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ highlightId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { highlightId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });

  try {
    const note = await addHighlightNote(userId, highlightId, parsed.data.body);
    await audit({ userId, action: 'highlight.note_add', entity: 'highlight', entityId: highlightId });
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}

