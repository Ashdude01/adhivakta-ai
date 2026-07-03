import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getUserByEmail, createUser } from '@/lib/data/users';
import { audit, recordConsent } from '@/lib/data/audit';

export const runtime = 'nodejs';

const schema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(200),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
      { status: 400 },
    );
  }

  const { name, email, password } = parsed.data;

  try {
    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { ok: false, error: 'An account with this email already exists.' },
        { status: 409 },
      );
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = await createUser({ name, email, passwordHash });
    // DPDP: versioned account consent recorded at signup (plan §10.2).
    await recordConsent(user.id, 'account');
    await audit({ userId: user.id, action: 'user.register', entity: 'user', entityId: user.id });
    return NextResponse.json({ ok: true, id: user.id });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message || 'Could not create account.' },
      { status: 500 },
    );
  }
}
