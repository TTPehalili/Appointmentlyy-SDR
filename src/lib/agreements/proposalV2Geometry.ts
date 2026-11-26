/**
 * Page frames and the fixed Acceptance-page geometry of the v2 custom proposal (DESIGN_SPEC §2, §3 C15), in PDF
 * points with a TOP-LEFT origin. Shared by the template (which reserves the boxes) and the completion stamp
 * (which draws the signatures into them), so the two can never drift apart. Browser + server safe.
 */
export const PAGE_SIZES = {
  letter: { w: 612, h: 792 },
  a4: { w: 595.28, h: 841.89 },
} as const;

export type PageSizeKey = keyof typeof PAGE_SIZES;

export const FRAME_V2 = { top: 60, side: 48, bottom: 72, headerTop: 39, firstGap: 16.5 } as const;

/** Footer rule and the continued-note gutter, measured from the page bottom (same numbers on Letter and A4). */
export const footerTop = (h: number) => h - 54;
export const gutterTop = (h: number) => h - 70.5;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AcceptanceColumn {
  card: Rect;
  label: Rect;
  sigBox: Rect;
  /** Where a signature image is fitted (3:1), bottom-left, 2 pt above the line. */
  sigImage: Rect;
  sigLineY: number;
  captionLeft: Rect;
  captionRight: Rect;
  name: Rect;
  title: Rect;
  signedAs: Rect;
  dateBox: Rect;
  dateLineY: number;
  /** Baseline of the stamped date text. */
  dateBaseline: number;
  dateCaption: Rect;
}

export interface AcceptanceGeometry {
  page: { w: number; h: number };
  eyebrow: Rect;
  title: Rect;
  lead: Rect;
  client: AcceptanceColumn;
  owner: AcceptanceColumn;
  note: Rect;
  envelope: Rect;
  band: Rect;
}

/** The Acceptance page for a page size (Letter: the spec's numbers exactly; A4: same top-anchored frame, narrower cards). */
export function acceptanceGeometry(size: PageSizeKey): AcceptanceGeometry {
  const { w: W, h: H } = PAGE_SIZES[size];
  const side = FRAME_V2.side;
  const content = W - side * 2;
  const gap = 12;
  const cardW = (content - gap) / 2;
  const inner = cardW - 33; // padding 16.5 each side
  const col = (x: number): AcceptanceColumn => {
    const ix = x + 16.5;
    return {
      card: { x, y: 198, w: cardW, h: 219 },
      label: { x: ix, y: 214.5, w: inner, h: 12 },
      sigBox: { x: ix, y: 234, w: inner, h: 48 },
      sigImage: { x: ix, y: 234, w: 138, h: 46 },
      sigLineY: 282,
      captionLeft: { x: ix, y: 287.25, w: inner / 2, h: 12 },
      captionRight: { x: ix, y: 287.25, w: inner, h: 12 },
      name: { x: ix, y: 312.75, w: inner, h: 15.75 },
      title: { x: ix, y: 328.5, w: inner, h: 13.5 },
      signedAs: { x: ix, y: 343.5, w: inner, h: 12 },
      dateBox: { x: ix, y: 363, w: inner, h: 21 },
      dateLineY: 384,
      dateBaseline: 378.5,
      dateCaption: { x: ix, y: 388.5, w: inner, h: 12 },
    };
  };
  const bandH = 203.25;
  return {
    page: { w: W, h: H },
    eyebrow: { x: side, y: 76.5, w: content, h: 12 },
    title: { x: side, y: 94.5, w: content, h: 25.5 },
    lead: { x: side, y: 129, w: Math.min(420, content), h: 52.5 },
    client: col(side),
    owner: col(side + cardW + gap),
    note: { x: side, y: 432, w: content, h: 30 },
    envelope: { x: side, y: 465, w: content, h: 12 },
    band: { x: 0, y: H - bandH, w: W, h: bandH },
  };
}

/** Which page size a PDF page is (within 1 pt), or null. */
export function pageSizeOf(w: number, h: number): PageSizeKey | null {
  for (const [k, v] of Object.entries(PAGE_SIZES) as [PageSizeKey, { w: number; h: number }][]) if (Math.abs(v.w - w) < 1 && Math.abs(v.h - h) < 1) return k;
  return null;
}
