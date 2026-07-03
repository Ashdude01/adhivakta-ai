import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { currentUserId } from '@/lib/session';
import { getDraft, listDraftVersions, updateDraftStatus } from '@/lib/data/drafts';
import { audit } from '@/lib/data/audit';

export const runtime = 'nodejs';

// Court-format DOCX export (plan §5.2): A4, 1.5 line spacing, wide margins.
// Blocks export while the latest version has unresolved citation failures,
// unless the lawyer consciously overrides (override is audit-logged).

const CLAIM_RE = /\[\[([^\]]+)\]\]/g;

function courtDocx(title: string, body: string): Document {
  const clean = body.replace(CLAIM_RE, '$1');
  const paragraphs = clean.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    const isHeading =
      trimmed.length > 0 && trimmed.length < 80 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
    return new Paragraph({
      alignment: isHeading ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
      spacing: { line: 360, after: 120 }, // 1.5 spacing
      children: [new TextRun({ text: line, bold: isHeading, size: 24, font: 'Times New Roman' })],
    });
  });

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1440, right: 1440, bottom: 1440, left: 2160 }, // wide left margin for binding
          },
        },
        children: paragraphs,
      },
    ],
  });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { draftId, format = 'docx', override = false, text, title } = body || {};

  let content: string = text || '';
  let docTitle: string = title || 'Draft';

  if (draftId) {
    const draft = await getDraft(userId, draftId);
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    content = draft.body || content;
    docTitle = draft.title || docTitle;

    const versions = await listDraftVersions(draftId);
    const latest = versions[0];
    const failed = latest?.verifier_report?.failed ?? 0;
    if (failed > 0 && !override) {
      return NextResponse.json(
        {
          error: 'unverified_citations',
          message: `${failed} citation(s) could not be verified. Resolve them or export with an explicit override.`,
          verifierReport: latest?.verifier_report,
        },
        { status: 409 },
      );
    }
    if (failed > 0 && override) {
      await audit({
        userId, action: 'draft.override_export', entity: 'draft', entityId: draftId,
        meta: { failed, reason: 'lawyer override of unverified citations' },
      });
    }
    await updateDraftStatus(userId, draftId, 'exported');
  }

  if (!content) return NextResponse.json({ error: 'Nothing to export' }, { status: 400 });

  await audit({ userId, action: 'draft.export', entity: 'draft', entityId: draftId ?? undefined, meta: { format } });

  const safeName = docTitle.replace(/[^\w\d\- ]+/g, '').slice(0, 60) || 'draft';

  if (format === 'docx') {
    const buffer = await Packer.toBuffer(courtDocx(docTitle, content));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeName}.docx"`,
      },
    });
  }

  // plain-text fallback
  return new NextResponse(content.replace(CLAIM_RE, '$1'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}.txt"`,
    },
  });
}
