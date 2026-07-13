import { NextRequest, NextResponse } from 'next/server';
import { currentUserId } from '@/lib/session';
import { getEsignRequest, listEsignEventsFor, deleteEsignRequest } from '@/lib/data/esign';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

/** One signature request with its event trail. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const request = await getEsignRequest(userId, id);
  if (!request) return NextResponse.json({ error: 'Signature request not found' }, { status: 404 });

  return NextResponse.json({ request, events: await listEsignEventsFor(id) });
}

/**
 * Withdraws a pending request. A signed one is refused: it is the proof the
 * document was executed, and its IT Act eligibility decision is a compliance
 * artefact that must outlive the matter.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const request = await getEsignRequest(userId, id);
  if (!request) return NextResponse.json({ error: 'Signature request not found' }, { status: 404 });

  if (request.status === 'signed') {
    return NextResponse.json(
      { error: 'A signed document cannot be deleted — it is the record that it was executed.' },
      { status: 409 },
    );
  }

  // esign_events cascade with the row, so the withdrawal is recorded in the
  // append-only audit log instead — the only trail that survives a delete.
  await deleteEsignRequest(userId, id);
  await audit({ userId, action: 'esign.withdraw', entity: 'esign_request', entityId: id, meta: { documentName: request.document_name } });
  return NextResponse.json({ ok: true });
}
