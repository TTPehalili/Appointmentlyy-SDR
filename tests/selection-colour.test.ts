import { describe, it } from 'node:test';
import assert from 'node:assert';
// Run with: node --test tests/selection-colour.test.ts (Node 22.18+ strips the types itself).
// Imported by URL so Node gets the .ts extension it needs while tsc keeps checking the types.
type SelectionModule = typeof import('../src/lib/selectionColour');
const mod: SelectionModule = await import(new URL('../src/lib/selectionColour.ts', import.meta.url).href);
const { DEFAULT_SELECTION, SELECTION_BOOT_SCRIPT, SELECTION_PRESETS, buildSelectionCss, checkSelectionColour, cleanSelection, contrastRatio, mixHex } = mod;

const solidSoft = (tokens: { '--selected-soft': string }, surface: string) => {
  const m = tokens['--selected-soft'].match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  if (!m) return tokens['--selected-soft'];
  const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
  return mixHex(surface, hex, Number(m[4]));
};

describe('selection colour derivation', () => {
  for (const theme of ['light', 'dark'] as const) {
    const surface = theme === 'light' ? '#FFFFFF' : '#1C1917';
    for (const p of SELECTION_PRESETS[theme]) {
      it(`${theme} preset ${p.label} passes every check`, () => {
        const c = checkSelectionColour(p.hex, theme);
        assert.ok(c.ok, `${p.hex}: ${c.message}`);
        assert.ok(contrastRatio(c.tokens['--selected'], surface) >= 3);
        assert.ok(contrastRatio(c.tokens['--selected'], c.tokens['--selected-fg']) >= 4.5);
        assert.ok(contrastRatio(c.tokens['--selected-soft-fg'], solidSoft(c.tokens, surface)) >= 4.5);
        assert.ok(contrastRatio(c.tokens['--selected-soft-fg'], surface) >= 4.5);
      });
    }
  }

  it('light hover is darker, dark hover is lighter', () => {
    const l = checkSelectionColour('#2563EB', 'light');
    const d = checkSelectionColour('#3B82F6', 'dark');
    assert.ok(contrastRatio(l.tokens['--selected-hover'], '#FFFFFF') > contrastRatio('#2563EB', '#FFFFFF'));
    assert.ok(contrastRatio(d.tokens['--selected-hover'], '#000000') > contrastRatio('#3B82F6', '#000000'));
  });

  it('soft is a 14% tint in light and 22% alpha in dark', () => {
    assert.strictEqual(checkSelectionColour('#2563EB', 'light').tokens['--selected-soft'], mixHex('#2563EB', '#FFFFFF', 0.86));
    assert.strictEqual(checkSelectionColour('#10B981', 'dark').tokens['--selected-soft'], 'rgba(16, 185, 129, 0.22)');
  });

  it('picks white or near-black text, whichever contrasts more', () => {
    assert.strictEqual(checkSelectionColour('#2563EB', 'light').tokens['--selected-fg'], '#FFFFFF');
    assert.strictEqual(checkSelectionColour('#FAFAF9', 'dark').tokens['--selected-fg'], '#1C1917');
    assert.strictEqual(checkSelectionColour('#10B981', 'dark').tokens['--selected-fg'], '#1C1917');
  });

  it('rejects colours that vanish on the theme surface', () => {
    const light = checkSelectionColour('#F5F5F4', 'light');
    assert.strictEqual(light.ok, false);
    assert.match(light.message, /Too light to see on a white background/);
    const dark = checkSelectionColour('#1C1917', 'dark');
    assert.strictEqual(dark.ok, false);
    assert.match(dark.message, /Too dark to see in dark mode/);
  });

  it('rejects fills where neither white nor black text reaches 4.5:1', () => {
    // Mid-grey: >= 3:1 on white but text tops out around 4.3:1 either way.
    const c = checkSelectionColour('#808080', 'light');
    assert.ok(c.ratios.fill >= 3);
    assert.strictEqual(c.ok, false);
  });
});

describe('cleanSelection', () => {
  it('accepts strict #RRGGBB, drops defaults and blanks', () => {
    assert.deepStrictEqual(cleanSelection({ light: '#2563eb', dark: '' }), { ok: true, value: { light: '#2563EB' } });
    assert.deepStrictEqual(cleanSelection({ light: DEFAULT_SELECTION.light, dark: DEFAULT_SELECTION.dark }), { ok: true, value: {} });
    assert.deepStrictEqual(cleanSelection(null), { ok: true, value: {} });
  });
  it('rejects bad hex and failing colours', () => {
    assert.strictEqual(cleanSelection({ light: '#abc' }).ok, false);
    assert.strictEqual(cleanSelection({ light: 'blue' }).ok, false);
    const r = cleanSelection({ light: '#F5F5F4' });
    assert.ok(!r.ok && /Too light/.test(r.error));
  });
});

describe('buildSelectionCss', () => {
  it('is empty for defaults', () => {
    assert.strictEqual(buildSelectionCss({}), '');
    assert.strictEqual(buildSelectionCss({ light: DEFAULT_SELECTION.light }), '');
  });
  it('scopes light and dark rules', () => {
    const css = buildSelectionCss({ light: '#2563EB', dark: '#10B981' });
    assert.match(css, /:root:not\(\[data-theme="dark"\]\)\{--selected:#2563EB;/);
    assert.match(css, /@media screen\{:root\[data-theme="dark"\],:root \[data-theme="dark"\]\{--selected:#10B981;/);
  });
  it('keeps the white treatment in dark panels unless the colour shows on ink-950', () => {
    // Navy is ~1.9:1 on ink-950: dark panels keep the white treatment from globals.css.
    assert.doesNotMatch(buildSelectionCss({ light: '#1E3A8A' }), /bg-inverse/);
    // Blue is ~3.9:1 on ink-950: dark panels use its dark-surface variant.
    assert.match(buildSelectionCss({ light: '#2563EB' }), /:root:root:not\(\[data-theme="dark"\]\) :is\(\.bg-inverse, \.bg-ink-950, \.bg-ink-900\)\{--selected:#2563EB;/);
  });
  it('generated CSS passes the boot script whitelist', () => {
    const css = buildSelectionCss({ light: '#9810FA', dark: '#FAFAF9' });
    const src = SELECTION_BOOT_SCRIPT.match(/new RegExp\('(.+?)'\)/)![1].replace(/\\\\/g, '\\');
    assert.ok(new RegExp(src).test(css));
    assert.ok(!new RegExp(src).test('</style><script>alert(1)</script>'));
  });
});
