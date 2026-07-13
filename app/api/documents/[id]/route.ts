import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { getDocument, signedUrlFor, deleteDocument } from '@/lib/data/documents';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

/**
 * Mints a short-lived signed URL for a private object, after checking the
 * caller owns it. The bucket is private precisely so that this check is the
 * only way in — nothing is reachable by guessing a path.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const document = await getDocument(userId, id);
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const url = await signedUrlFor(document);
  await audit({ userId, action: 'document.view', entity: 'matter_document', entityId: id, meta: { file: document.file_name } });
  return NextResponse.json({ url, fileName: document.file_name, mimeType: document.mime_type });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const document = await getDocument(userId, id);
  if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  await deleteDocument(userId, id);
  await audit({ userId, action: 'document.delete', entity: 'matter_document', entityId: id, meta: { file: document.file_name } });
  return NextResponse.json({ ok: true });
}
