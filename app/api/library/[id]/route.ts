import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { getLibraryItem, listLibraryItemBlocks, listHighlightsForItem } from '@/lib/data/library';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

/**
 * Judgment/draft detail: the full row, its paragraph blocks (only present for
 * AWS-ingested judgments — see supabase/migrations/0007), and — if the caller
 * is logged in — that user's own highlights (private per user) on this item.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getLibraryItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const blocks = await listLibraryItemBlocks(id);

  const userId = await currentUserId();
  const highlights = userId ? await listHighlightsForItem(userId, id) : [];

  if (userId) {
    await audit({ userId, action: 'library.view', entity: 'library_item', entityId: id, meta: { title: item.title } });
  }

  return NextResponse.json({ item, blocks, highlights, loggedIn: !!userId });
}
