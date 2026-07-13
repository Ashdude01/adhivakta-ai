import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { conflictCheck } from '@/lib/data/contacts';
import { audit } from '@/lib/data/audit';
import { conflictCheckSchema } from '@/lib/validation/matter';

export const runtime = 'nodejs';

/**
 * Has this advocate already acted for — or against — any of these people?
 *
 * Called from intake once the parties are named, before the matter is saved.
 * Every check is written to the audit log with its result: proving the check
 * happened, and when, is the point of running it.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = conflictCheckSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

  const hits = await conflictCheck(userId, parsed.data.names);

  await audit({
    userId,
    action: 'matter.conflict_check',
    entity: 'matter',
    meta: { names: parsed.data.names, hits: hits.length },
  });

  return NextResponse.json({ hits });
}
