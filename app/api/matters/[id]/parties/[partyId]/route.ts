import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { removeParty } from '@/lib/data/matters';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

/**
 * Removes a party from the matter. The underlying contact stays in the address
 * book — it may appear in other matters, and it is what conflict checks search.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; partyId: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, partyId } = await params;
  try {
    await removeParty(userId, id, partyId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }

  await audit({ userId, action: 'matter.party_remove', entity: 'matter', entityId: id, meta: { partyId } });
  return NextResponse.json({ ok: true });
}
