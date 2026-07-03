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

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  firm_name: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  bar_council_id: z.string().trim().max(60).nullable().optional(),
  avatar_url: z.string().trim().max(500).nullable().optional(),
  theme: z.string().trim().max(40).nullable().optional(),
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
