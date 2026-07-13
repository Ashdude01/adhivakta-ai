import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { getUserById, updateUserProfile } from '@/lib/data/users';

export const runtime = 'nodejs';

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { password_hash, ...safe } = user;
  return NextResponse.json({ user: safe });
}

// Empty strings from the form become null so blank letterhead fields clear the
// column rather than storing "".
const clearable = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  firm_name: clearable(120),
  phone: clearable(40),
  avatar_url: clearable(500),
  theme: z.string().trim().max(40).nullable().optional(),

  designation: z.string().trim().min(1).max(60).optional(),
  enrolment_no: clearable(60),
  bar_council: clearable(120),
  office_address: clearable(400),
  city: clearable(80),
  state: clearable(80),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Pincode must be 6 digits')
    .transform((v) => v)
    .nullable().optional()
    .or(z.literal('').transform(() => null)),
  alt_phone: clearable(40),
});

export async function PUT(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  }

  try {
    const user = await updateUserProfile(userId, parsed.data);
    const { password_hash, ...safe } = user;
    return NextResponse.json({ ok: true, user: safe });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
