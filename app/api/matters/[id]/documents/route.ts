import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { getMatter } from '@/lib/data/matters';
import { listDocuments, uploadDocument, DOCUMENT_KINDS, type DocumentKind } from '@/lib/data/documents';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await getMatter(userId, id))) return NextResponse.json({ error: 'Matter not found' }, { status: 404 });

  return NextResponse.json({ documents: await listDocuments(userId, id) });
}

/** Multipart upload straight to the private bucket. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await getMatter(userId, id))) return NextResponse.json({ error: 'Matter not found' }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Attach a file' }, { status: 400 });
  }

  const rawKind = String(form?.get('kind') ?? 'other');
  const kind = (DOCUMENT_KINDS as readonly string[]).includes(rawKind) ? (rawKind as DocumentKind) : 'other';
  const description = String(form?.get('description') ?? '').trim().slice(0, 500) || undefined;

  try {
    const document = await uploadDocument(userId, id, { file, kind, description });
    await audit({
      userId, action: 'document.upload', entity: 'matter_document', entityId: document.id,
      meta: { matterId: id, file: document.file_name, kind, bytes: document.size_bytes },
    });
    return NextResponse.json({ ok: true, document });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
