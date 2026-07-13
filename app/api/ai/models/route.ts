import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { listAvailableModels } from '@/lib/ai';

export const runtime = 'nodejs';

/**
 * The model picker's options: only providers whose key is set in the
 * environment. Signed-in only, and it returns provider ids and model ids —
 * never a key, never which env var it came from.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ providers: listAvailableModels() });
}
