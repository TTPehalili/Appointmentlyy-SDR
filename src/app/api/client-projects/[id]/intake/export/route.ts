import { NextRequest, NextResponse } from 'next/server';
import { PRIVATE_HEADERS } from '@/lib/server/agreements/core';
import { cpFail, ownerProject } from '@/lib/server/clientProjects/http';
import { ownerIntake } from '@/lib/server/clientProjects/intakeOwner';
import { answerText, csvLine, type TableRow } from '@/lib/clientProjects/intake';

type Ctx = { params: Promise<{ id: string }> };
/** A UTF-8 byte-order mark, so spreadsheet apps read the CSV as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/**
 * GET /api/client-projects/:id/intake/export?format=csv|json   (owner only)
 * The Client data export: every request's latest submitted answers (one row per field; tables,
 * one row per cell), the status of every item, and the file list with sha256 hashes. CSV cells are neutralised (a leading = + - @ is
 * prefixed so a spreadsheet never runs it). Always a download.
 */
export async function GET(req: NextRequest, c: Ctx) {
  const { id } = await c.params;
  const o = await ownerProject(req, id, 'read');
  if (o instanceof NextResponse) return o;
  const format = req.nextUrl.searchParams.get('format') === 'json' ? 'json' : 'csv';
  try {
    const d = await ownerIntake(o.project);
    const latest = (rid: string) => d.submissions.filter((x) => x.requestId === rid).sort((a, b) => b.version - a.version)[0] ?? null;
    const safeKey = o.project.key.replace(/[^A-Z0-9]/g, '');
    const headers = (type: string, ext: string) => ({ ...PRIVATE_HEADERS, 'Content-Type': type, 'Content-Disposition': `attachment; filename="${safeKey}-client-data.${ext}"`, 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' });
    if (format === 'json') {
      const body = {
        project: { key: o.project.key, clientName: o.project.clientName, exportedAt: new Date().toISOString() },
        workspace: d.tenantCode,
        company: d.company,
        items: d.requests.map((r) => {
          const s = latest(r.id);
          return { key: r.key, title: r.title, kind: r.kind, status: r.unified, clientStatus: r.clientLabel, version: r.version, latest: s ? { version: s.version, status: s.status, submittedBy: s.actor, submittedAt: s.submittedAt, answers: s.answers, files: s.files.map((f) => ({ name: f.name, size: f.size, mime: f.mime, sha256: f.sha256 })), reviewNote: s.reviewNote, applied: s.applied } : null, state: r.state };
        }),
        files: d.files.map((f) => ({ name: f.name, size: f.size, mime: f.mime, sha256: f.sha256, at: f.createdAt })),
      };
      return new NextResponse(JSON.stringify(body, null, 2), { status: 200, headers: headers('application/json; charset=utf-8', 'json') });
    }
    const lines = [csvLine(['item', 'title', 'status', 'version', 'submitted_by', 'submitted_at', 'field', 'row', 'column', 'value'])];
    for (const r of d.requests) {
      const s = latest(r.id);
      if (!s || !r.schema) {
        lines.push(csvLine([r.key, r.title, r.clientLabel, '', '', '', '', '', '', '']));
        continue;
      }
      const name = (fid: string) => s.files.find((f) => f.id === fid)?.name ?? fid;
      for (const f of r.schema.fields) {
        const v = s.answers[f.key];
        if (f.type === 'table' && Array.isArray(v)) {
          (v as TableRow[]).forEach((row, i) => (f.columns ?? []).forEach((col) => lines.push(csvLine([r.key, r.title, r.clientLabel, s.version, s.actor.replace(/^client:/, ''), s.submittedAt, f.label, i + 1, col.label, row[col.key] ?? '']))));
        } else lines.push(csvLine([r.key, r.title, r.clientLabel, s.version, s.actor.replace(/^client:/, ''), s.submittedAt, f.label, '', '', answerText(f, v, name)]));
      }
    }
    lines.push('', csvLine(['file', 'size', 'type', 'sha256', 'uploaded_at']));
    for (const f of d.files) lines.push(csvLine([f.name, f.size, f.mime, f.sha256, f.createdAt]));
    return new NextResponse(`${BOM}${lines.join('\r\n')}\r\n`, { status: 200, headers: headers('text/csv; charset=utf-8', 'csv') });
  } catch (err) {
    return cpFail(err, 'intake export');
  }
}
