import { notFound } from 'next/navigation';
import JudgmentDetail from '@/components/JudgmentDetail';
import { getLibraryItem, listLibraryItemBlocks, listHighlightsForItem } from '@/lib/data/library';
import { currentUserId } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LibraryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getLibraryItem(id);
  if (!item) notFound();

  const [blocks, userId] = await Promise.all([listLibraryItemBlocks(id), currentUserId()]);
  const highlights = userId ? await listHighlightsForItem(userId, id) : [];

  // JudgmentDetail owns the whole page (header, actions, document, sidebar) —
  // the title/court/citation need to stay in sync with the action buttons and
  // only appear once, which is easiest to get right in one client component.
  return <JudgmentDetail item={item} blocks={blocks} initialHighlights={highlights} loggedIn={!!userId} />;
}
