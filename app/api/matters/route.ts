import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { listMatters, createMatter } from '@/lib/data/matters';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const matters = await listMatters(userId);
  return NextResponse.json({ matters });
}

const schema = z.object({
  title: z.string().trim().min(2).max(160),
  code: z.string().trim().max(8).optional(),
  subtitle: z.string().trim().max(200).optional(),
  court: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
  tag: z.string().trim().max(40).optional(),
  tag_class: z.string().trim().max(40).optional(),
  color: z.string().trim().max(40).optional(),
  matter_type: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  parties: z.object({
    client: z.string().trim().max(160).optional(),
    opposite: z.string().trim().max(160).optional(),
  }).optional(),
  key_dates: z.record(z.string().trim().max(60)).optional(),
});

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
  }
  const matter = await createMatter(userId, parsed.data);
  await audit({ userId, action: 'matter.create', entity: 'matter', entityId: matter.id, meta: { title: matter.title } });
  return NextResponse.json({ ok: true, matter });
}
