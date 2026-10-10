import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { deleteHighlightLink } from '@/lib/data/library';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ highlightId: string; linkId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { highlightId, linkId } = await params;
  const ok = await deleteHighlightLink(userId, linkId);
  if (!ok) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  await audit({ userId, action: 'highlight.link_delete', entity: 'highlight', entityId: highlightId, meta: { linkId } });
  return NextResponse.json({ ok: true });
}

