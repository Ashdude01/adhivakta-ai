import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { getMatter, attachParties, listMatterParties, type PartyInput } from '@/lib/data/matters';
import { partyInputSchema } from '@/lib/validation/matter';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await getMatter(userId, id))) return NextResponse.json({ error: 'Matter not found' }, { status: 404 });
  return NextResponse.json({ parties: await listMatterParties(id) });
}

/** Adds a party to an existing matter — a respondent impleaded later, say. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await getMatter(userId, id))) return NextResponse.json({ error: 'Matter not found' }, { status: 404 });

  const parsed = z.object({ parties: z.array(partyInputSchema).min(1).max(20) })
    .safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

  // party_no continues the existing numbering on each side, so a cause title
  // never gains a second "Respondent No. 1".
  const existing = await listMatterParties(id);
  const highest = existing.reduce<Record<string, number>>((acc, p) => {
    acc[p.side] = Math.max(acc[p.side] ?? 0, p.party_no);
    return acc;
  }, {});

  const seen: Record<string, number> = {};
  const parties = parsed.data.parties.map((p) => {
    seen[p.side] = (seen[p.side] ?? 0) + 1;
    return { ...p, party_no: p.party_no ?? (highest[p.side] ?? 0) + seen[p.side] };
  });

  try {
    await attachParties(userId, id, parties as PartyInput[]);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  await audit({ userId, action: 'matter.party_add', entity: 'matter', entityId: id, meta: { count: parties.length } });
  return NextResponse.json({ ok: true, parties: await listMatterParties(id) });
}
