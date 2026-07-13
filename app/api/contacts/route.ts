import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { listContacts, createContact } from '@/lib/data/contacts';
import { audit } from '@/lib/data/audit';
import { contactInputSchema } from '@/lib/validation/matter';

export const runtime = 'nodejs';

/** Address book, so a returning client is picked rather than retyped. */
export async function GET(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q') ?? undefined;
  const contacts = await listContacts(userId, q);
  return NextResponse.json({ contacts });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = contactInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

  const contact = await createContact(userId, parsed.data);
  await audit({ userId, action: 'contact.create', entity: 'contact', entityId: contact.id, meta: { name: contact.full_name } });

  return NextResponse.json({ ok: true, contact });
}
