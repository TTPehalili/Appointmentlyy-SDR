'use client';

/**
 * Emoji picker for team chat (no dependency): search by name, Recently used, categories, and full
 * keyboard use (arrows move through the grid, Enter picks, Esc closes). The caller positions it;
 * it closes itself on Esc and on a click outside (ignoring clicks on `anchor`, its trigger).
 */
import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EMOJI_CATEGORIES, emojiEntry, normalizeEmoji, searchEmoji, shortcodeOf, type EmojiEntry } from '@/lib/emoji';

const RECENT_KEY = 'appy_chat_emoji_recent';
const RECENT_MAX = 16;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map(normalizeEmoji).filter((e): e is string => !!e))].slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** Move an emoji to the front of Recently used (composer inserts and reactions both count). */
export function rememberEmoji(emoji: string) {
  const e = normalizeEmoji(emoji);
  if (!e) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, RECENT_MAX)));
  } catch {
    // Private mode or storage full: Recently used is a nice-to-have.
  }
}

interface Section {
  id: string;
  label: string;
  icon: string;
  emojis: EmojiEntry[];
}

/** Arrow-key target by on-screen position, so Up/Down go to the button visually above/below. */
function neighbour(buttons: HTMLElement[], from: HTMLElement, key: string): HTMLElement | null {
  const i = buttons.indexOf(from);
  if (key === 'ArrowRight') return buttons[i + 1] ?? null;
  if (key === 'ArrowLeft') return i > 0 ? buttons[i - 1] : null;
  const r = from.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const down = key === 'ArrowDown';
  let bestRowTop: number | null = null;
  let best: HTMLElement | null = null;
  let bestDx = Infinity;
  for (const b of buttons) {
    const br = b.getBoundingClientRect();
    if (down ? br.top <= r.top + 4 : br.top >= r.top - 4) continue;
    if (bestRowTop === null || (down ? br.top < bestRowTop - 4 : br.top > bestRowTop + 4)) {
      bestRowTop = br.top;
      best = b;
      bestDx = Math.abs(br.left + br.width / 2 - cx);
    } else if (Math.abs(br.top - bestRowTop) <= 4) {
      const dx = Math.abs(br.left + br.width / 2 - cx);
      if (dx < bestDx) {
        best = b;
        bestDx = dx;
      }
    }
  }
  return best;
}

export function EmojiPicker({
  onPick,
  onClose,
  title,
  anchor,
  className,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Shown above the search, e.g. "React to Riley's message". */
  title?: string;
  /** The button that opened the picker: clicks on it don't count as "outside". */
  anchor?: React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const root = React.useRef<HTMLDivElement>(null);
  const grid = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [q, setQ] = React.useState('');
  const [recent] = React.useState(readRecent);
  const [active, setActive] = React.useState<EmojiEntry | null>(null);
  const [tab, setTab] = React.useState<string>(recent.length ? 'recent' : EMOJI_CATEGORIES[0].id);
  const searchId = React.useId();

  const results = React.useMemo(() => (q.trim() ? searchEmoji(q, 96) : null), [q]);
  const sections: Section[] = React.useMemo(() => {
    const recentEntries = recent.map((e) => emojiEntry(e)).filter((e): e is EmojiEntry => !!e);
    return [
      ...(recentEntries.length ? [{ id: 'recent', label: 'Recently used', icon: '🕘', emojis: recentEntries }] : []),
      ...EMOJI_CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.icon, emojis: c.emojis })),
    ];
  }, [recent]);

  // Focus the search on devices with a keyboard; on touch screens that would cover half the picker.
  React.useEffect(() => {
    const touch = window.matchMedia('(hover: none)').matches;
    if (!touch) searchRef.current?.focus();
  }, []);

  React.useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (root.current?.contains(t) || anchor?.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onClose, anchor]);

  const buttons = () => Array.from(grid.current?.querySelectorAll<HTMLElement>('[data-emoji]') ?? []);

  const pick = (emoji: string) => {
    rememberEmoji(emoji);
    onPick(emoji);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Keep Esc from also closing the chat drawer (a native <dialog>).
      e.preventDefault();
      e.stopPropagation();
      onClose();
      // Focus goes back to the button that opened the picker.
      anchor?.current?.focus();
      return;
    }
    const target = e.target as HTMLElement;
    if (target === searchRef.current) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        buttons()[0]?.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const first = results?.[0];
        if (first) pick(first.emoji);
      }
      return;
    }
    if (!target.dataset.emoji) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const list = buttons();
      const next = neighbour(list, target, e.key);
      if (next) next.focus();
      else if (e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && list.indexOf(target) === 0)) searchRef.current?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons()[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const list = buttons();
      list[list.length - 1]?.focus();
    }
  };

  const jumpTo = (id: string) => {
    setQ('');
    setTab(id);
    requestAnimationFrame(() => {
      const g = grid.current;
      const el = g?.querySelector<HTMLElement>(`[data-section="${id}"]`);
      if (g && el) g.scrollTop = el.offsetTop;
    });
  };

  const onScroll = () => {
    const g = grid.current;
    if (!g || results) return;
    const els = Array.from(g.querySelectorAll<HTMLElement>('[data-section]'));
    let cur = els[0]?.dataset.section ?? tab;
    for (const el of els) if (el.offsetTop <= g.scrollTop + 8) cur = el.dataset.section ?? cur;
    if (cur !== tab) setTab(cur);
  };

  const cell = (e: EmojiEntry, key: string) => (
    <button
      key={key}
      type="button"
      data-emoji={e.emoji}
      aria-label={e.name}
      title={`${e.name}  :${shortcodeOf(e)}:`}
      onClick={() => pick(e.emoji)}
      onMouseEnter={() => setActive(e)}
      onFocus={() => setActive(e)}
      className="focus-ring flex aspect-square w-full items-center justify-center rounded-md text-[22px] leading-none transition-colors duration-100 hover:bg-subtle focus-visible:bg-subtle"
    >
      <span aria-hidden>{e.emoji}</span>
    </button>
  );

  return (
    <div
      ref={root}
      role="dialog"
      aria-label={title ?? 'Emoji picker'}
      onKeyDown={onKeyDown}
      className={cn('flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-lg border border-line bg-surface text-fg shadow-lg', className)}
    >
      {title && <p className="truncate border-b border-line px-3 pb-2 pt-2.5 text-small font-medium text-fg-secondary">{title}</p>}
      <div className="p-2 pb-1">
        <label htmlFor={searchId} className="sr-only">
          Search emoji
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" aria-hidden />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search emoji"
            aria-label="Search emoji"
            autoComplete="off"
            spellCheck={false}
            className="focus-ring h-8 w-full rounded-md border border-line-strong bg-surface pl-8 pr-2 text-body text-fg placeholder:text-fg-tertiary"
          />
        </div>
      </div>
      {!results && (
        <div className="flex gap-0.5 border-b border-line px-2 pb-1" role="toolbar" aria-label="Emoji categories">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jumpTo(s.id)}
              aria-label={s.label}
              aria-pressed={tab === s.id}
              title={s.label}
              className={cn(
                'focus-ring flex h-8 flex-1 items-center justify-center rounded-md border-b-2 text-base leading-none transition-colors duration-100',
                tab === s.id ? 'border-selected bg-selected-soft text-selected-soft-fg' : 'border-transparent opacity-70 hover:bg-subtle hover:opacity-100',
              )}
            >
              <span aria-hidden>{s.icon}</span>
            </button>
          ))}
        </div>
      )}
      <div ref={grid} onScroll={onScroll} className="relative h-[min(15rem,38dvh)] overflow-y-auto overscroll-contain px-2 py-1">
        {results ? (
          results.length ? (
            <div className="grid grid-cols-8 gap-0.5 pt-1" role="group" aria-label={`Emoji matching ${q.trim()}`}>
              {results.map((e) => cell(e, e.emoji))}
            </div>
          ) : (
            <p className="px-1 py-6 text-center text-small text-fg-tertiary">No emoji match &ldquo;{q.trim()}&rdquo;.</p>
          )
        ) : (
          sections.map((s) => (
            <div key={s.id} data-section={s.id} role="group" aria-label={s.label}>
              <p className="sticky top-0 z-[1] bg-surface px-1 pb-1 pt-1.5 text-caption font-medium text-fg-tertiary">{s.label}</p>
              <div className="grid grid-cols-8 gap-0.5">{s.emojis.map((e) => cell(e, `${s.id}:${e.emoji}`))}</div>
            </div>
          ))
        )}
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line px-3 text-small text-fg-secondary">
        {active ? (
          <>
            <span className="text-lg leading-none" aria-hidden>
              {active.emoji}
            </span>
            <span className="truncate">{active.name}</span>
            <span className="ml-auto hidden truncate text-caption text-fg-tertiary sm:inline">:{shortcodeOf(active)}:</span>
          </>
        ) : (
          <span className="truncate text-fg-tertiary">Arrow keys to move · Enter to pick · Esc to close</span>
        )}
      </div>
    </div>
  );
}
