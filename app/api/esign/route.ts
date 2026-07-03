import { NextRequest, NextResponse } from 'next/server';
import { sendForSignature, methodStatus, EsignMethod, Signer } from '@/lib/esign';
import { checkEligibility } from '@/lib/esign/scheduleOne';
import { currentUserId } from '@/lib/session';
import { createEsignRequest, addEsignEvent } from '@/lib/data/esign';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === 'check') {
    return NextResponse.json(checkEligibility(body?.documentName || ''));
  }

  if (action === 'status') {
    const method = (body?.method || 'manual') as EsignMethod;
    return NextResponse.json({ method, ...methodStatus(method) });
  }

  if (action === 'send') {
    const elig = checkEligibility(body?.documentName || '');
    const userId = await currentUserId();
    if (!elig.eligible) {
      // Blocked decisions are compliance artefacts too (plan §8.1).
      await audit({
        userId, action: 'esign.blocked', entity: 'document',
        meta: { documentName: body?.documentName, reason: elig.reason },
      });
      return NextResponse.json({ ok: false, status: 'blocked', message: elig.reason }, { status: 400 });
    }
    const method = (body?.method || 'manual') as EsignMethod;
    const documentName = body?.documentName || 'document';
    const signers = (body?.signers || []) as Signer[];
    const matterId = body?.matterId || null;
    const result = await sendForSignature({
      method,
      documentName,
      signers,
      signatureDataUrl: body?.signatureDataUrl,
    });

    // Persist the signature request + event trail (best-effort).
    try {
      if (userId) {
        const request = await createEsignRequest(userId, {
          documentName,
          method,
          status: result.status,
          envelopeId: result.envelopeId ?? null,
          signers,
          signedAt: result.signedAt ?? null,
          matterId,
          eligibilityReport: elig as unknown as Record<string, unknown>,
        });
        await addEsignEvent(request.id, 'request.created', { method, signers: signers.length });
        if (result.status === 'signed') {
          await addEsignEvent(request.id, 'request.signed', { at: result.signedAt ?? new Date().toISOString() });
        }
        await audit({
          userId, action: 'esign.send', entity: 'esign_request', entityId: request.id,
          meta: { documentName, method, status: result.status },
        });
      }
    } catch (err) {
      console.error('Failed to persist e-sign request:', (err as Error).message);
    }

    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
