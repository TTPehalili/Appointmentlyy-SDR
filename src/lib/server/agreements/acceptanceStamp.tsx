/**
 * Server only. "Mode B" for v2 custom proposals (DESIGN_SPEC §3 C15): at completion, both signatures are also
 * placed on the proposal's own Acceptance page, in the boxes the template reserved (the shared geometry in
 * lib/agreements/proposalV2Geometry). The stamp is one transparent overlay page drawn with react-pdf (the same
 * Inter and Great Vibes files as the document, no new dependency) and laid onto the LAST page of the original
 * by finalPdf. Only the final PDF is stamped: the original stays frozen and its SHA-256 keeps verifying.
 *
 * Anything unexpected (another template, not signable, page size not the document's) means no stamp (Mode A:
 * the Execution page and Certificate alone), logged, never a failed completion.
 */
import { Document, Image, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import { FONT_FAMILY, SCRIPT_FONT_FAMILY, registerAgreementFonts } from '@/lib/agreements/templates/pdf/fonts';
import { fmtManila, type Envelope } from '@/lib/agreements/envelope';
import { CUSTOM_PROPOSAL_V2_ID, docOfValuesV2, stripMarkers } from '@/lib/agreements/customProposalV2';
import { acceptanceGeometry, pageSizeOf, type AcceptanceColumn } from '@/lib/agreements/proposalV2Geometry';

const INK900 = '#1C1917';
const INK600 = '#57534D';
const INK500 = '#79716B';
const TNUM = { fontFeatureSettings: ['tnum'] } as Record<string, unknown>;

export interface StampResult {
  overlay: Uint8Array;
  /** 0-based index of the stamped page in the original (its last page). */
  pageIndex: number;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const ellipsis = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

interface Party {
  printed: string;
  typedName: string;
  typedTitle: string;
  signedAt: string;
  png: Uint8Array | null;
  caption: string;
}

/** Break anywhere: a long name without spaces must not run past its box. */
const anywhere = (word: string) => Array.from(word);

/**
 * One line of stamped text, CLIPPED to its box: the signer types their own name and title, so nothing they type
 * can be drawn outside it (into the other party's card or over the date line), whatever its length or characters.
 */
function Line({ x, y, w, h, style, children }: { x: number; y: number; w: number; h: number; style: Record<string, unknown>; children: string }) {
  return (
    <View style={{ position: 'absolute', left: x, top: y, width: w, height: h, overflow: 'hidden' }}>
      <Text hyphenationCallback={anywhere} style={{ width: w, maxLines: 1, textOverflow: 'ellipsis', ...style }}>{children}</Text>
    </View>
  );
}

function Column({ col, p }: { col: AcceptanceColumn; p: Party }) {
  const signedAs = norm(p.typedName) && norm(p.typedName) !== norm(p.printed) ? ellipsis(`Signed as ${p.typedName}${p.typedTitle ? `, ${p.typedTitle}` : ''}`, 60) : '';
  return (
    <>
      {p.png ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
        <Image
          src={{ data: Buffer.from(p.png), format: 'png' }}
          style={{ position: 'absolute', left: col.sigImage.x, top: col.sigImage.y, width: col.sigImage.w, height: col.sigImage.h, objectFit: 'contain', objectPosition: 'left bottom' }}
        />
      ) : (
        <Line x={col.sigImage.x} y={col.sigLineY - 30} w={col.sigBox.w} h={30} style={{ fontFamily: SCRIPT_FONT_FAMILY, fontSize: 22, lineHeight: 1.2, color: INK900 }}>{ellipsis(p.typedName, 40)}</Line>
      )}
      <Line x={col.captionRight.x} y={col.captionRight.y} w={col.captionRight.w} h={col.captionRight.h} style={{ textAlign: 'right', fontFamily: FONT_FAMILY, fontSize: 9, lineHeight: 1.33, color: INK500 }}>{p.caption}</Line>
      {signedAs ? <Line x={col.signedAs.x} y={col.signedAs.y} w={col.signedAs.w} h={col.signedAs.h} style={{ fontFamily: FONT_FAMILY, fontSize: 9, lineHeight: 1.33, color: INK600 }}>{signedAs}</Line> : null}
      <Line x={col.dateBox.x} y={col.dateBox.y + 6} w={col.dateBox.w} h={col.dateBox.h - 6} style={{ fontFamily: FONT_FAMILY, fontSize: 9.75, lineHeight: 1.2, color: INK900, ...TNUM }}>{`${fmtManila(p.signedAt)} (Asia/Manila)`}</Line>
    </>
  );
}

/** The overlay for an envelope's final PDF, or null (no stamp: Mode A). */
export async function buildAcceptanceStamp(
  e: Envelope,
  original: Uint8Array,
  signerPng: Uint8Array | null,
  ownerPng: Uint8Array | null,
  completedAt: string,
): Promise<StampResult | null> {
  try {
    if (e.templateId !== CUSTOM_PROPOSAL_V2_ID || e.templateMeta?.action !== 'sign' || !e.signer || !e.ownerSignature) return null;
    const doc = docOfValuesV2(e.fieldValues);
    if (!doc.settings.signable) return null;
    const src = await PDFDocument.load(original, { updateMetadata: false });
    const pageIndex = src.getPageCount() - 1;
    const { width, height } = src.getPage(pageIndex).getSize();
    const key = pageSizeOf(width, height);
    if (!key || key !== doc.settings.pageSize) {
      console.warn(`[agreements] acceptance stamp skipped for ${e.id}: last page ${width}x${height} is not the document's ${doc.settings.pageSize}`);
      return null;
    }
    const g = acceptanceGeometry(key);
    const client: Party = {
      printed: stripMarkers(doc.cover.preparedFor.name),
      typedName: e.signer.name,
      typedTitle: e.signer.title,
      signedAt: e.signer.signedAt,
      png: signerPng,
      caption: 'Verified by one-time code',
    };
    const owner: Party = {
      printed: stripMarkers(doc.cover.preparedBy.name),
      typedName: e.ownerSignature.name,
      typedTitle: e.ownerSignature.title,
      signedAt: e.ownerSignature.signedAt,
      png: ownerPng,
      caption: 'Countersigned',
    };
    const envLine = `Envelope ${e.id} · executed ${fmtManila(completedAt)} (Asia/Manila) · audit trail on page ${src.getPageCount() + 1}`;
    registerAgreementFonts();
    const buf = await renderToBuffer(
      <Document creator="Appointmentlyy Agreements" producer="Appointmentlyy Agreements">
        <Page size={[width, height]}>
          <View style={{ position: 'absolute', left: 0, top: 0, width, height }}>
            <Column col={g.client} p={client} />
            <Column col={g.owner} p={owner} />
            <Text style={{ position: 'absolute', left: g.envelope.x, top: g.envelope.y, width: g.envelope.w, fontFamily: FONT_FAMILY, fontSize: 9, lineHeight: 1.33, color: INK600, ...TNUM }}>{envLine}</Text>
          </View>
        </Page>
      </Document>,
    );
    return { overlay: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), pageIndex };
  } catch (err) {
    console.warn(`[agreements] acceptance stamp skipped for ${e.id}:`, err instanceof Error ? err.message : 'error');
    return null;
  }
}
