import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { getMatter } from '@/lib/data/matters';
import { listDraftsByMatter } from '@/lib/data/drafts';

export const runtime = 'nodejs';

/** Drafts filed under a matter — for the e-sign document picker. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await getMatter(userId, id))) return NextResponse.json({ error: 'Matter not found' }, { status: 404 });

  return NextResponse.json({ drafts: await listDraftsByMatter(userId, id) });
}
