/**
 * Display mapping for pipeline stage colours.
 *
 * Stage colours are stored (in STAGE_COLOR_PALETTE and in each workspace's saved
 * stages) as legacy Tailwind palette classes. Those stored values are data and stay
 * unchanged; this maps them to brand tokens at render time so every stage dot uses
 * the brand's categorical order (brand guide 2.5).
 */
const DOT: Record<string, string> = {
  'bg-zinc-300': 'bg-ink-300',
  'bg-zinc-400': 'bg-ink-400',
  'bg-sky-500': 'bg-ink-900',
  'bg-indigo-500': 'bg-ink-700',
  'bg-amber-500': 'bg-warning-400',
  'bg-violet-500': 'bg-chart-6',
  'bg-emerald-500': 'bg-success-500',
  'bg-rose-500': 'bg-danger-700',
};

const NAME: Record<string, string> = {
  'Zinc (Neutral)': 'Grey (Neutral)',
  'Sky (Active)': 'Ink (Active)',
  'Indigo (Proposal)': 'Slate (Proposal)',
};

export function stageDotClass(dotColor: string | undefined): string {
  if (!dotColor) return 'bg-ink-400';
  return DOT[dotColor] ?? dotColor;
}

/** Palette option label as shown to users (the stored name is unchanged). */
export function stagePaletteLabel(name: string): string {
  return NAME[name] ?? name;
}
