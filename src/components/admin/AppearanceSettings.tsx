'use client';

import * as React from 'react';
import { Check, Lock, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { apiJson, refreshServerIdentity } from '@/lib/authClient';
import {
  DEFAULT_SELECTION,
  PREVIEW_THEME_VARS,
  SELECTION_PRESETS,
  MIN_FILL_CONTRAST,
  MIN_TEXT_CONTRAST,
  applySelection,
  checkSelectionColour,
  parseHex,
  type SelectionCheck,
  type SelectionColours,
  type SelectionPreset,
  type SelectionTheme,
} from '@/lib/selectionColour';
import { Badge, Button, Field, FilterChip, InlineError, Input, PageHeader, SegmentedControl, Skeleton, Switch, Tabs, useToast } from '@/components/ui';

const THEMES: SelectionTheme[] = ['light', 'dark'];
const TITLE: Record<SelectionTheme, string> = { light: 'Light theme', dark: 'Dark theme' };

interface AppearanceResponse {
  selection: SelectionColours;
  brandColor: string | null;
  canEdit: boolean;
}

const fetchAppearance = () => apiJson<AppearanceResponse>('/api/tenant/appearance');

/** What a theme's input means for storage: undefined = platform default. */
function stored(input: string, theme: SelectionTheme): string | undefined {
  const hex = parseHex(input);
  return hex && hex !== DEFAULT_SELECTION[theme] ? hex : undefined;
}

const fromSaved = (s: SelectionColours): Record<SelectionTheme, string> => ({
  light: s.light ?? DEFAULT_SELECTION.light,
  dark: s.dark ?? DEFAULT_SELECTION.dark,
});

/**
 * Admin › Appearance: the colour of selected states (toggles, segmented controls, tabs, chips,
 * selected rows, active nav) for this workspace, separately for light and dark theme. Saved on the
 * workspace's branding, so it applies to every member on every device.
 */
export default function AppearanceSettings() {
  const toast = useToast();
  const [loaded, setLoaded] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [saved, setSaved] = React.useState<SelectionColours>({});
  const [brandColor, setBrandColor] = React.useState<string | null>(null);
  const [canEdit, setCanEdit] = React.useState(false);
  const [input, setInput] = React.useState<Record<SelectionTheme, string>>(fromSaved({}));
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');

  const apply = React.useCallback((r: Awaited<ReturnType<typeof fetchAppearance>>) => {
    if (!r.success) {
      setLoadError(r.error || 'Could not load the appearance settings.');
    } else {
      setLoadError('');
      setSaved(r.selection ?? {});
      setInput(fromSaved(r.selection ?? {}));
      setBrandColor(parseHex(r.brandColor));
      setCanEdit(Boolean(r.canEdit));
    }
    setLoaded(true);
  }, []);
  const load = React.useCallback(() => fetchAppearance().then(apply), [apply]);

  React.useEffect(() => {
    let live = true;
    void fetchAppearance().then((r) => {
      if (live) apply(r);
    });
    return () => {
      live = false;
    };
  }, [apply]);

  const checks = React.useMemo(
    () => ({ light: checkSelectionColour(input.light, 'light'), dark: checkSelectionColour(input.dark, 'dark') }),
    [input],
  );

  const dirty = THEMES.some((t) => stored(input[t], t) !== saved[t]);
  const valid = THEMES.every((t) => checks[t].ok || (parseHex(input[t]) === DEFAULT_SELECTION[t]));
  const atDefault = THEMES.every((t) => stored(input[t], t) === undefined);

  const save = async () => {
    setSaving(true);
    setSaveError('');
    const r = await apiJson<{ selection: SelectionColours }>('/api/tenant/appearance', {
      method: 'PUT',
      body: { light: stored(input.light, 'light') ?? null, dark: stored(input.dark, 'dark') ?? null },
    });
    setSaving(false);
    if (!r.success) {
      setSaveError(r.error || 'Could not save the appearance.');
      return;
    }
    const next = r.selection ?? {};
    setSaved(next);
    setInput(fromSaved(next));
    applySelection(next); // this tab now; ThemeSync keeps it after the identity refresh
    void refreshServerIdentity();
    toast({ message: 'Selection colours saved. Everyone in this workspace sees them next time they open the app.' });
  };

  if (!loaded) {
    return (
      <div className="w-full max-w-[1200px] px-4 py-6 md:px-8" aria-busy="true" aria-label="Loading appearance">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="mt-2 h-5 w-2/3" />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full max-w-[1200px] px-4 py-6 md:px-8">
        <PageHeader title="Appearance" description="The colour of selected toggles, tabs, chips, rows and menu items." />
        <InlineError message={loadError} onRetry={() => void load()} />
      </div>
    );
  }

  const ro = !canEdit;

  return (
    <div className="w-full max-w-[1200px] px-4 py-6 md:px-8" data-testid="appearance-settings">
      <PageHeader
        title="Appearance"
        description="The colour of selected toggles, tabs, chips, rows and menu items, for everyone here."
      />
      {ro && (
        <p className="mb-4 flex items-center gap-2 rounded-md bg-subtle px-3 py-2 text-small text-fg-secondary">
          <Lock className="size-3.5" aria-hidden />
          View only. Ask an admin to change it.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {THEMES.map((theme) => (
          <ThemeColumn
            key={theme}
            theme={theme}
            value={input[theme]}
            check={checks[theme]}
            savedCustom={Boolean(saved[theme])}
            brandColor={brandColor}
            readOnly={ro}
            onChange={(v) => {
              setSaveError('');
              setInput((cur) => ({ ...cur, [theme]: v }));
            }}
          />
        ))}
      </div>

      {saveError && <InlineError className="mt-4" message={saveError} />}

      {!ro && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4" data-testid="appearance-actions">
          <Button variant="primary" loading={saving} disabled={!dirty || !valid} onClick={() => void save()} data-testid="appearance-save">
            Save
          </Button>
          <Button
            variant="ghost"
            icon={<RotateCcw />}
            disabled={atDefault || saving}
            onClick={() => {
              setSaveError('');
              setInput(fromSaved({}));
            }}
            data-testid="appearance-reset"
          >
            Reset to default
          </Button>
          <span className="text-small text-fg-tertiary">
            {!valid ? 'Fix the colours marked in red to save.' : dirty ? 'Unsaved changes.' : 'All changes saved.'}
          </span>
        </div>
      )}
    </div>
  );
}

function ThemeColumn({
  theme,
  value,
  check,
  savedCustom,
  brandColor,
  readOnly,
  onChange,
}: {
  theme: SelectionTheme;
  value: string;
  check: SelectionCheck;
  savedCustom: boolean;
  brandColor: string | null;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  const hex = parseHex(value);
  const presets: (SelectionPreset & { isDefault?: boolean })[] = [
    ...SELECTION_PRESETS[theme].map((p) => ({ ...p, isDefault: p.hex === DEFAULT_SELECTION[theme] })),
    ...(brandColor ? [{ id: 'brand', label: 'Brand', hex: brandColor }] : []),
  ];
  const isDefault = hex === DEFAULT_SELECTION[theme];
  const ok = check.ok || isDefault;
  const inputId = `selection-${theme}-hex`;
  const surfaceLabel = theme === 'light' ? 'Fill on white' : 'Fill on dark surface';

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-surface p-4 md:p-5" aria-labelledby={`selection-${theme}-title`} data-testid={`selection-${theme}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`selection-${theme}-title`} className="text-h3 text-fg">
          {TITLE[theme]}
        </h2>
        <Badge tone={savedCustom ? 'brand' : 'neutral'}>{savedCustom ? 'Custom' : 'Platform default'}</Badge>
      </div>

      <div role="radiogroup" aria-label={`${TITLE[theme]} presets`} className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const sel = hex === p.hex;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={sel}
              disabled={readOnly}
              onClick={() => onChange(p.hex)}
              data-testid={`swatch-${theme}-${p.id}`}
              className={cn(
                'focus-ring inline-flex h-9 items-center gap-2 rounded-full border bg-surface pl-1.5 pr-3 text-body transition-colors duration-150 disabled:cursor-default',
                sel ? 'border-fg font-medium text-fg ring-1 ring-fg' : 'border-line-strong text-fg-secondary hover:text-fg',
              )}
            >
              <span aria-hidden className="size-6 shrink-0 rounded-full border border-line-strong" style={{ background: p.hex }} />
              {p.label}
              {p.isDefault && <span className="text-caption text-fg-tertiary">Default</span>}
              {sel && <Check className="size-3.5" aria-hidden />}
            </button>
          );
        })}
      </div>

      <Field label="Custom colour" htmlFor={inputId} hint="A 6-digit hex colour, like #2563EB.">
        <div className="flex gap-2">
          <input
            type="color"
            aria-label={`${TITLE[theme]} colour picker`}
            value={(hex ?? DEFAULT_SELECTION[theme]).toLowerCase()}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="focus-ring h-9 w-12 shrink-0 cursor-pointer rounded-md border border-line-strong bg-surface p-1 disabled:cursor-default"
          />
          <Input
            id={inputId}
            mono
            value={value}
            maxLength={7}
            readOnly={readOnly}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => onChange(e.target.value.trim())}
            aria-invalid={!ok || undefined}
            data-testid={inputId}
          />
        </div>
      </Field>

      <div className="flex flex-col gap-1.5" data-testid={`selection-${theme}-contrast`} data-ok={ok ? 'true' : 'false'}>
        {hex && (
          <ul className="flex flex-col gap-1">
            <Ratio label={surfaceLabel} value={check.ratios.fill} min={MIN_FILL_CONTRAST} />
            <Ratio label="Text on fill" value={check.ratios.text} min={MIN_TEXT_CONTRAST} />
            <Ratio label="Selected row text" value={check.ratios.softText} min={MIN_TEXT_CONTRAST} />
          </ul>
        )}
        {!ok && (
          <p role="alert" className="text-small font-medium text-danger-fg" data-testid={`selection-${theme}-error`}>
            {check.message}
          </p>
        )}
      </div>

      <div>
        <p className="pb-2 text-group text-fg-tertiary">Preview</p>
        <Preview theme={theme} tokens={check.tokens} />
      </div>
    </section>
  );
}

function Ratio({ label, value, min }: { label: string; value: number; min: number }) {
  const pass = value >= min;
  return (
    <li className="flex items-center gap-2 text-small">
      {pass ? <Check className="size-3.5 shrink-0 text-success-fg" aria-hidden /> : <X className="size-3.5 shrink-0 text-danger-fg" aria-hidden />}
      <span className="text-fg-secondary">{label}</span>
      <span className="font-medium tabular-nums text-fg">{value.toFixed(1)}:1</span>
      <span className="text-fg-tertiary">needs {min}:1</span>
      <span className="sr-only">{pass ? 'pass' : 'fail'}</span>
    </li>
  );
}

const NAV = ['Home', 'Dialer', 'Pipeline'];
const ROWS = [
  { name: 'Priya Raman', company: 'Northwind BPO' },
  { name: 'Julian Vance', company: 'Apex Support' },
  { name: 'Mara Lopez', company: 'Harbor CX' },
];

/** Mini app panel forced to one theme, wherever it sits, showing every selected state. */
function Preview({ theme, tokens }: { theme: SelectionTheme; tokens: SelectionCheck['tokens'] }) {
  const [mode, setMode] = React.useState('real');
  const [tab, setTab] = React.useState('overview');
  const [on, setOn] = React.useState(true);
  const [row, setRow] = React.useState(0);
  const style = { ...PREVIEW_THEME_VARS[theme], ...tokens } as React.CSSProperties;

  return (
    <div data-theme={theme} style={style} className="overflow-hidden rounded-lg border border-line bg-app text-fg" data-testid={`selection-preview-${theme}`}>
      <div className="flex flex-col sm:flex-row">
        <nav aria-label="Preview navigation" className="flex gap-px overflow-x-auto border-b border-line p-2 sm:w-32 sm:shrink-0 sm:flex-col sm:border-b-0 sm:border-r">
          {NAV.map((n) => {
            const active = n === 'Dialer';
            return (
              <span
                key={n}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-8 shrink-0 items-center rounded-md px-2 text-body',
                  active ? 'bg-selected-soft font-medium text-selected-soft-fg' : 'text-fg-secondary',
                )}
              >
                {n}
              </span>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-3 bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              size="sm"
              label="Calling mode (preview)"
              value={mode}
              onChange={setMode}
              items={[
                { value: 'real', label: 'Real phone' },
                { value: 'ai', label: 'AI demo' },
              ]}
            />
            <label className="flex items-center gap-2 text-small text-fg-secondary">
              <Switch checked={on} onCheckedChange={setOn} label="Auto-dial (preview)" />
              Auto-dial
            </label>
          </div>
          <Tabs
            label="Lead sections (preview)"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'overview', label: 'Overview' },
              { value: 'activity', label: 'Activity' },
              { value: 'notes', label: 'Notes' },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <FilterChip label="Status" value="Hot" active />
            <FilterChip label="Owner" value="Anyone" />
          </div>
          <div className="overflow-hidden rounded-md border border-line" role="listbox" aria-label="Leads (preview)">
            {ROWS.map((r, i) => {
              const sel = i === row;
              return (
                <div
                  key={r.name}
                  role="option"
                  aria-selected={sel}
                  tabIndex={0}
                  onClick={() => setRow(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setRow(i);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-2 border-b border-line px-3 py-2 text-body last:border-b-0',
                    sel ? 'bg-selected-soft' : 'hover:bg-subtle',
                  )}
                >
                  <span className={cn('truncate', sel ? 'font-medium text-selected-soft-fg' : 'text-fg')}>{r.name}</span>
                  <span className="truncate text-small text-fg-secondary">{r.company}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
