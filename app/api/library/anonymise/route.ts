import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { anonymise } from '@/lib/legal/anonymiser';

export const runtime = 'nodejs';

const schema = z.object({ text: z.string().min(40).max(200_000) });

// Step 1 of the contribution pipeline: run the PII anonymiser and return the
// redacted text + report for the contributor to confirm (plan §6.3).
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Provide the full draft text (at least 40 characters).' }, { status: 400 });
  }

  const { anonymisedText, report } = anonymise(parsed.data.text);
  return NextResponse.json({ anonymisedText, report });
}
