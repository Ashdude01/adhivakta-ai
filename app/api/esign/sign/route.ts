import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserId } from '@/lib/session';
import { getDraft } from '@/lib/data/drafts';
import { courtPdf } from '@/lib/legal/courtPdf';
import { affixSignature } from '@/lib/legal/signPdf';
import { checkEligibility } from '@/lib/esign/scheduleOne';
import { createEsignRequest, addEsignEvent } from '@/lib/data/esign';
import { storeBytesAsDocument } from '@/lib/data/documents';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

const schema = z.object({
  draftId: z.string().uuid().optional(),
  matterId: z.string().uuid().nullable().optional(),
  documentName: z.string().trim().max(200).optional(),
  signerName: z.string().trim().min(2).max(160),
  designation: z.string().trim().max(80).optional(),
  place: z.string().trim().max(120).optional(),
  imageDataUrl: z.string().startsWith('data:image/').max(2_000_000).optional(),
  typedName: z.string().trim().max(160).optional(),
});

/**
 * Manual (affixed) electronic signing.
 *
 * Turns the draft into a court-format PDF, stamps the signature onto it, and
 * returns the signed PDF. When the draft is filed under a matter, the signed
 * copy is also stored in the matter folder. A signed document that fails the IT
 * Act Schedule I check is refused before anything is produced.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  const { draftId, matterId, signerName, designation, place, imageDataUrl, typedName } = parsed.data;

  if (!imageDataUrl && !typedName?.trim()) {
    return NextResponse.json({ error: 'Draw or type your signature first.' }, { status: 400 });
  }

  // Build the document to sign. For now the source is a draft; an uploaded PDF
  // could be signed the same way once the flow supports picking one.
  let title = parsed.data.documentName || 'Document';
  let body = '';
  if (draftId) {
    const draft = await getDraft(userId, draftId);
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    title = parsed.data.documentName || draft.title || draft.doc_type || 'Document';
    body = draft.body ?? '';
  }
  if (!body.trim()) return NextResponse.json({ error: 'Nothing to sign — the document is empty.' }, { status: 400 });

  // IT Act Schedule I: some documents cannot be e-signed at all.
  const elig = checkEligibility(title);
  if (!elig.eligible) {
    await audit({ userId, action: 'esign.blocked', entity: 'document', meta: { documentName: title, reason: elig.reason } });
    return NextResponse.json({ ok: false, status: 'blocked', message: elig.reason }, { status: 400 });
  }

  const base = await courtPdf(title, body);
  const signed = await affixSignature(base, { signerName, designation, place, imageDataUrl, typedName });

  const fileName = `${title.replace(/[^\w\d\- ]+/g, '').slice(0, 50) || 'document'} (signed).pdf`;

  // Record the request, and file the signed copy under the matter when there is one.
  let documentId: string | undefined;
  try {
    let signaturePath: string | null = null;
    if (matterId) {
      const doc = await storeBytesAsDocument(userId, matterId, {
        fileName, bytes: signed.bytes, mimeType: 'application/pdf', kind: 'signed',
        description: `Signed by ${signerName} on ${new Date(signed.signedAt).toLocaleDateString('en-IN')}`,
      });
      documentId = doc.id;
      signaturePath = doc.storage_path;
    }
    const request = await createEsignRequest(userId, {
      documentName: title, method: 'manual', status: 'signed',
      signers: [{ name: signerName, method: 'manual' }],
      signatureUrl: signaturePath, signedAt: signed.signedAt, matterId: matterId ?? null,
      eligibilityReport: elig as unknown as Record<string, unknown>,
    });
    await addEsignEvent(request.id, 'request.created', { method: 'manual', signer: signerName });
    await addEsignEvent(request.id, 'document.signed', { at: signed.signedAt, sourceHash: signed.sourceHash });
    await audit({
      userId, action: 'esign.sign', entity: 'esign_request', entityId: request.id,
      meta: { documentName: title, method: 'manual', matterId, documentId },
    });
  } catch (err) {
    console.error('Failed to persist manual signature:', (err as Error).message);
  }

  return new NextResponse(new Uint8Array(signed.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'X-Esign-Status': 'signed',
      ...(documentId ? { 'X-Document-Id': documentId } : {}),
    },
  });
}
