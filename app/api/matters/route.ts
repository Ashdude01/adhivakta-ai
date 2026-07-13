import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { listMatters, createMatter, type PartyInput } from '@/lib/data/matters';
import { audit } from '@/lib/data/audit';
import { getMatterType } from '@/lib/legal/matterTypes';
import { matterCreateSchema, parseFacts } from '@/lib/validation/matter';

export const runtime = 'nodejs';

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const matters = await listMatters(userId);
  return NextResponse.json({ matters });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = matterCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: issueMessage(parsed.error) }, { status: 400 });

  const { facts: rawFacts, parties, ...columns } = parsed.data;

  let facts: Record<string, unknown>;
  try {
    facts = parseFacts(columns.matter_type_code, rawFacts);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: issueMessage(err) }, { status: 400 });
    throw err;
  }

  // The registry is the source of truth for the type's label, badge, statute and
  // practice area, so the client cannot disagree with it.
  const type = getMatterType(columns.matter_type_code);
  const derived = type
    ? {
        matter_type: type.label,
        practice_area: columns.practice_area ?? type.practiceArea,
        code: columns.code ?? type.shortCode,
        act: columns.act ?? type.act,
        section: columns.section ?? type.section,
        subtitle: columns.subtitle ?? [type.label, columns.court].filter(Boolean).join(' · '),
      }
    : {};

  const matter = await createMatter(userId, {
    ...columns,
    ...derived,
    facts,
    status: columns.status ?? 'active',
    tag: columns.tag ?? 'New',
    tag_class: columns.tag_class ?? 't-brand',
    parties: parties as PartyInput[] | undefined,
  });

  await audit({
    userId,
    action: 'matter.create',
    entity: 'matter',
    entityId: matter.id,
    meta: { title: matter.title, matter_type_code: columns.matter_type_code, parties: parties?.length ?? 0 },
  });

  return NextResponse.json({ ok: true, matter });
}

function issueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid input';
  const where = issue.path.filter((p) => typeof p !== 'number').join('.');
  return where ? `${where}: ${issue.message}` : issue.message;
}
