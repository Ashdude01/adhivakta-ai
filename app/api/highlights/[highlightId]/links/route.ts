import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { addHighlightLink } from '@/lib/data/library';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

/**
 * Three link kinds (plan decision, confirmed with the user earlier): an
 * outside URL, another judgment/draft already in this library, or one of the
 * user's own matters/drafts. Exactly one target field per kind — mirrors the
 * CHECK constraint on highlight_links in supabase/migrations/0008.
 */
const schema = z.discriminatedUnion('linkType', [
  z.object({
    linkType: z.literal('external'),
    label: z.string().trim().max(120).optional(),
    externalUrl: z.string().trim().url().max(2000),
  }),
  z.object({
    linkType: z.literal('library_item'),
    label: z.string().trim().max(120).optional(),
    targetLibraryItemId: z.string().uuid(),
  }),
  z.object({
    linkType: z.literal('matter'),
    label: z.string().trim().max(120).optional(),
    targetMatterId: z.string().uuid(),
  }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ highlightId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { highlightId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  const input = parsed.data;

  try {
    const link = await addHighlightLink(userId, highlightId, {
      linkType: input.linkType,
      label: input.label ?? null,
      externalUrl: input.linkType === 'external' ? input.externalUrl : null,
      targetLibraryItemId: input.linkType === 'library_item' ? input.targetLibraryItemId : null,
      targetMatterId: input.linkType === 'matter' ? input.targetMatterId : null,
    });
    await audit({ userId, action: 'highlight.link_add', entity: 'highlight', entityId: highlightId, meta: { linkType: input.linkType } });
    return NextResponse.json({ ok: true, link });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}

