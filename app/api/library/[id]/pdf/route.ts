import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { getLibraryItem, getLibraryItemPdfUrl } from '@/lib/data/library';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

/**
 * Mints a short-lived URL to download this judgment's PDF — from our own
 * mirror in Supabase Storage when it exists, falling back to the original
 * (public, anonymous-read) AWS dataset URL otherwise. Same shape as the
 * existing /api/documents/[id] route: JSON with a `url`, not a redirect, so
 * the client decides whether to open it in a new tab or trigger a download.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const item = await getLibraryItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const pdf = await getLibraryItemPdfUrl(item);
  if (!pdf) return NextResponse.json({ error: 'No PDF is available for this item.' }, { status: 404 });

  await audit({ userId, action: 'library.pdf_download', entity: 'library_item', entityId: id, meta: { mirror: pdf.isMirror } });
  return NextResponse.json({ url: pdf.url, isMirror: pdf.isMirror });
}
