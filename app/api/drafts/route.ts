import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { listDrafts } from '@/lib/data/drafts';

export const runtime = 'nodejs';

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const drafts = await listDrafts(userId);
  return NextResponse.json({ drafts });
}
