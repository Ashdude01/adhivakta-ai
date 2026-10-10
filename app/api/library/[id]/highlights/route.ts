import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { createHighlight, listHighlightsForItem, listLibraryItemBlocks } from '@/lib/data/library';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const highlights = await listHighlightsForItem(userId, id);
  return NextResponse.json({ highlights });
}

const createSchema = z
  .object({
    blockId: z.string().uuid(),
    startOffset: z.number().int().min(0),
    endOffset: z.number().int().min(1),
    quoteText: z.string().trim().min(1).max(4000),
    matterId: z.string().uuid().nullable().optional(),
    color: z.string().trim().max(20).optional(),
  })
  .refine((d) => d.endOffset > d.startOffset, { message: 'endOffset must be greater than startOffset' });

/** Creates a highlight from a text selection. The sidebar then lets the user add notes/links to it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  const input = parsed.data;

  // The selection must actually belong to this judgment's own blocks —
  // otherwise a stale/forged blockId could anchor a highlight to the wrong document.
  const blocks = await listLibraryItemBlocks(id);
  if (!blocks.some((b) => b.id === input.blockId)) {
    return NextResponse.json({ error: 'That text block does not belong to this item.' }, { status: 400 });
  }

  const highlight = await createHighlight(userId, {
    libraryItemId: id,
    blockId: input.blockId,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    quoteText: input.quoteText,
    matterId: input.matterId ?? null,
    color: input.color,
  });

  await audit({ userId, action: 'highlight.create', entity: 'highlight', entityId: highlight.id, meta: { libraryItemId: id } });
  return NextResponse.json({ ok: true, highlight });
}
