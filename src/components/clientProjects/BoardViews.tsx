'use client';

/**
 * Kanban (status columns, the default view) and Roadmap (phase columns), with real drag and drop.
 *
 * Drag and drop is native pointer events (no library): mouse and pen start after a 5 px move; touch
 * starts after a 250 ms press (so a swipe still scrolls the board), and while dragging the page does
 * not scroll. The drop target is found under the pointer (columns carry data-cp-col, cards
 * data-drag-id), the board scrolls sideways near its edges, and Escape cancels. Every card also has a
 * keyboard "Move to…" menu that does the same moves. The parent applies a move optimistically and
 * rolls it back if the server refuses.
 */
import * as React from 'react';
import { ArrowRightLeft, Plus } from 'lucide-react';
import { Button, EmptyState, Menu, SegmentedControl, type MenuItem } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  DEFAULT_WIP,
  DELIVERABLE_LIST,
  PHASES,
  PHASE_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  type Label,
  type OwnerTaskView,
  type Person,
  type Phase,
  type TaskStatus,
  type WipLimits,
} from '@/lib/clientProjects/types';
import { StatusGlyph, TaskCard } from '@/components/clientProjects/shared';

export interface MoveRequest {
  status?: TaskStatus;
  /** The card to land before, or null for the end of the column. Omitted: no reorder. */
  beforeId?: string | null;
  phase?: Phase;
}

// ------------------------------------------------------------------ the drag engine

interface DragState {
  id: string;
  x: number;
  y: number;
  offX: number;
  offY: number;
  w: number;
  target: { col: string; beforeId: string | null } | null;
}

function useBoardDrag(onDrop: (id: string, col: string, beforeId: string | null) => void) {
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const pending = React.useRef<{ id: string; x: number; y: number; el: HTMLElement; touch: boolean; timer: number | null } | null>(null);
  const scroller = React.useRef<HTMLElement | null>(null);
  const dropRef = React.useRef(onDrop);
  dropRef.current = onDrop;

  const set = (d: DragState | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const targetAt = (x: number, y: number, id: string): DragState['target'] => {
    const el = document.elementFromPoint(x, y);
    const col = el?.closest<HTMLElement>('[data-cp-col]');
    if (!col) return null;
    const cards = [...col.querySelectorAll<HTMLElement>('[data-drag-id]')].filter((c) => c.dataset.dragId !== id);
    const before = cards.find((c) => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return { col: col.dataset.cpCol as string, beforeId: before?.dataset.dragId ?? null };
  };

  React.useEffect(() => {
    const begin = (x: number, y: number) => {
      const p = pending.current;
      if (!p) return;
      const r = p.el.getBoundingClientRect();
      scroller.current = p.el.closest<HTMLElement>('[data-cp-scroll]');
      document.body.classList.add('cp-dragging');
      set({ id: p.id, x, y, offX: x - r.left, offY: y - r.top, w: r.width, target: targetAt(x, y, p.id) });
    };
    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      const d = dragRef.current;
      if (!d) {
        const far = Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (p.touch) {
          // Moving before the long press is a scroll: give it back to the browser.
          if (far > 8) cancel();
          return;
        }
        if (far > 5) begin(e.clientX, e.clientY);
        return;
      }
      const sc = scroller.current;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (e.clientX < r.left + 40) sc.scrollLeft -= 14;
        else if (e.clientX > r.right - 40) sc.scrollLeft += 14;
      }
      set({ ...d, x: e.clientX, y: e.clientY, target: targetAt(e.clientX, e.clientY, d.id) });
    };
    const finish = (drop: boolean) => {
      const d = dragRef.current;
      if (pending.current?.timer) window.clearTimeout(pending.current.timer);
      pending.current = null;
      document.body.classList.remove('cp-dragging');
      if (d) {
        // The click that follows a drag must not open the card.
        const swallow = (ev: Event) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 50);
        set(null);
        if (drop && d.target) dropRef.current(d.id, d.target.col, d.target.beforeId);
      }
    };
    const cancel = () => finish(false);
    const onUp = () => finish(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current) cancel();
    };
    // While a card is being dragged with a finger, the page must not scroll under it.
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  const handleProps = (id: string, enabled: boolean) =>
    enabled
      ? {
          'data-drag-id': id,
          onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
            if (e.button !== 0 || (e.target as HTMLElement).closest('[data-no-drag]')) return;
            const touch = e.pointerType === 'touch';
            const el = e.currentTarget;
            pending.current = { id, x: e.clientX, y: e.clientY, el, touch, timer: null };
            if (touch) {
              pending.current.timer = window.setTimeout(() => {
                const p = pending.current;
                if (!p || p.id !== id) return;
                const r = el.getBoundingClientRect();
                scroller.current = el.closest<HTMLElement>('[data-cp-scroll]');
                document.body.classList.add('cp-dragging');
                navigator.vibrate?.(8);
                set({ id, x: p.x, y: p.y, offX: p.x - r.left, offY: p.y - r.top, w: r.width, target: targetAt(p.x, p.y, id) });
              }, 250);
            }
          },
        }
      : { 'data-card-id': id };

  return { drag, handleProps };
}

function DragOverlay({ drag, render }: { drag: DragState | null; render: (id: string) => React.ReactNode }) {
  if (!drag) return null;
  return (
    <div aria-hidden data-testid="cp-drag-overlay" className="pointer-events-none fixed z-50" style={{ left: drag.x - drag.offX, top: drag.y - drag.offY, width: drag.w }}>
      {render(drag.id)}
    </div>
  );
}

/** Where the card will land: a slot at card height (SPEC "placeholder slot"). */
const DropSlot = () => <div aria-hidden data-testid="cp-drop-line" className="cp-slot h-11" />;

/** Screen-reader announcements for moves ("STA-7 moved to In progress"). */
export function useAnnounce(): [string, (s: string) => void] {
  const [msg, setMsg] = React.useState('');
  return [msg, (s: string) => setMsg((m) => (m === s ? `${s} ` : s))];
}

// ------------------------------------------------------------------ columns

/**
 * FLIP (design SPEC section 9, "siblings reflow"): after a render that moved cards inside a column, each
 * moved card starts at its old place and glides to the new one (transform only, 220 ms). Off with reduced motion.
 */
function useFlip(list: React.RefObject<HTMLDivElement | null>, order: string) {
  const last = React.useRef(new Map<string, DOMRect>());
  React.useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const now = new Map<string, DOMRect>();
    const cards = [...el.querySelectorAll<HTMLElement>('[data-drag-id],[data-card-id]')];
    for (const c of cards) now.set(c.dataset.dragId || c.dataset.cardId || '', c.getBoundingClientRect());
    if (!reduce) {
      for (const c of cards) {
        const id = c.dataset.dragId || c.dataset.cardId || '';
        const was = last.current.get(id);
        const is = now.get(id);
        if (!was || !is) continue;
        const dx = was.left - is.left;
        const dy = was.top - is.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        c.style.transition = 'none';
        c.style.transform = `translate(${dx}px, ${dy}px)`;
        void c.offsetHeight;
        c.style.transition = 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)';
        c.style.transform = '';
        c.addEventListener('transitionend', () => (c.style.transition = ''), { once: true });
      }
    }
    last.current = now;
  }, [list, order]);
}

const COL_NAME: Record<TaskStatus, string> = { todo: 'todo', in_progress: 'doing', blocked: 'blocked', done: 'done' };
const EMPTY_TEXT: Record<string, [string, string]> = {
  todo: ['Nothing to do', 'New and planned cards land here.'],
  in_progress: ['Nothing in progress', 'Drag a card here when work starts.'],
  blocked: ['Nothing blocked', 'Cards waiting on a dependency or on the client land here.'],
  done: ['Nothing done yet', 'Finished cards land here.'],
};

function Column({
  col,
  title,
  status,
  tasks,
  drag,
  droppable,
  limit,
  render,
}: {
  col: string;
  title: string;
  status?: TaskStatus;
  tasks: OwnerTaskView[];
  drag: DragState | null;
  droppable: boolean;
  limit?: number;
  render: (t: OwnerTaskView) => React.ReactNode;
}) {
  const over = Boolean(limit && tasks.length > limit);
  const isTarget = droppable && drag?.target?.col === col;
  const listRef = React.useRef<HTMLDivElement>(null);
  useFlip(listRef, tasks.map((t) => t.id).join(','));
  const done = tasks.filter((t) => t.status === 'done').length;
  const empty = status ? EMPTY_TEXT[status] : null;
  return (
    <section
      aria-label={title}
      data-testid="cp-column"
      data-col={status ? COL_NAME[status] : col}
      {...(droppable ? { 'data-cp-col': col } : {})}
      className={cn('cp-col flex min-w-0 flex-col', isTarget && 'is-target')}
    >
      <header className="cp-col-head">
        {status && <StatusGlyph status={status} />}
        <h3 className="truncate">{title}</h3>
        <span className="cp-count" data-n={tasks.length} data-testid="cp-col-count">
          <span key={tasks.length}>{status ? tasks.length : `${done}/${tasks.length}`}</span>
        </span>
        {limit ? (
          <span className={cn('cp-wip', !over && 'bg-transparent text-fg-tertiary')} data-testid={over ? 'cp-wip-warning' : 'cp-wip'} title={over ? `Over the soft limit of ${limit}` : `Soft limit ${limit}`}>
            limit {limit}
            {over && <span className="sr-only"> (over the limit)</span>}
          </span>
        ) : null}
      </header>
      <div className="cp-list" ref={listRef}>
        {tasks.map((t) => (
          <React.Fragment key={t.id}>
            {isTarget && drag?.target?.beforeId === t.id && <DropSlot />}
            {render(t)}
          </React.Fragment>
        ))}
        {isTarget && drag?.target?.beforeId === null && <DropSlot />}
        {tasks.length === 0 &&
          (empty ? (
            <p className="cp-col-empty">
              <b>{empty[0]}</b>
              {empty[1]}
            </p>
          ) : (
            <p className="px-1 pb-2 text-small text-fg-tertiary">{droppable ? 'Drop a card here.' : 'No cards.'}</p>
          ))}
      </div>
    </section>
  );
}

const columnOrder = (a: OwnerTaskView, b: OwnerTaskView) => a.sort - b.sort || a.num - b.num;
const bySchedule = (a: OwnerTaskView, b: OwnerTaskView) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.sort - b.sort;

interface ViewProps {
  tasks: OwnerTaskView[];
  /** Every card (unfiltered), to compute "move up / down" within the full column. */
  allTasks: OwnerTaskView[];
  people: Person[];
  labels: Label[];
  onOpen: (t: OwnerTaskView) => void;
  onMove: (t: OwnerTaskView, req: MoveRequest) => void;
  onLoadSop?: () => void;
  empty: boolean;
}

function EmptyBoard({ onLoadSop }: { onLoadSop?: () => void }) {
  return (
    <EmptyState
      icon={<Plus />}
      title="No cards yet"
      description="Load the onboarding SOP, add a card, or upload the signed documents under Documents & AI."
      action={
        onLoadSop ? (
          <Button variant="primary" onClick={onLoadSop} data-testid="cp-load-sop">
            Load SOP cards
          </Button>
        ) : undefined
      }
    />
  );
}

function moveMenu(t: OwnerTaskView, items: MenuItem[]) {
  return (
    <span data-no-drag>
      <Menu
        label={`Move ${t.key} to…`}
        items={items}
        trigger={(p) => (
          <button type="button" {...p} aria-label={`Move ${t.key} to…`} data-testid="cp-move-menu" className="focus-ring relative z-10 inline-flex size-6 items-center justify-center rounded-sm text-fg-tertiary opacity-70 hover:bg-subtle hover:text-fg group-hover:opacity-100 focus-visible:opacity-100">
            <ArrowRightLeft className="size-3.5" aria-hidden />
          </button>
        )}
      />
    </span>
  );
}

// ------------------------------------------------------------------ Kanban

export type Swimlane = 'none' | 'phase' | 'assignee';

export function KanbanView({ tasks, allTasks, people, labels, onOpen, onMove, onLoadSop, empty, wip, swimlane, filtered, onClearFilters }: ViewProps & { wip?: WipLimits; swimlane: Swimlane; filtered?: boolean; onClearFilters?: () => void }) {
  const byId = React.useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const { drag, handleProps } = useBoardDrag((id, col, beforeId) => {
    const t = byId.get(id);
    if (!t) return;
    const status = col.split('|').pop() as TaskStatus;
    const column = allTasks.filter((x) => x.status === status && x.id !== id).sort(columnOrder);
    // Dropped back where it was: nothing to do.
    const idx = beforeId === null ? column.length : column.findIndex((x) => x.id === beforeId);
    const wasBefore = t.status === status ? allTasks.filter((x) => x.status === status).sort(columnOrder).findIndex((x) => x.id === id) : -1;
    if (status === t.status && idx === wasBefore) return;
    onMove(t, { status, beforeId });
  });
  if (empty) return <EmptyBoard onLoadSop={onLoadSop} />;
  const limits = wip ?? DEFAULT_WIP;
  if (filtered && !tasks.length)
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-line bg-surface p-6" data-testid="cp-no-match">
        <p className="text-body-strong text-fg">No cards match these filters</p>
        {onClearFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    );

  const menuFor = (t: OwnerTaskView): MenuItem[] => {
    const col = allTasks.filter((x) => x.status === t.status).sort(columnOrder);
    const i = col.findIndex((x) => x.id === t.id);
    return [
      ...TASK_STATUSES.filter((s) => s !== t.status).map((s) => ({ label: `Move to ${STATUS_LABEL[s]}`, onSelect: () => onMove(t, { status: s, beforeId: null }) })),
      ...(i > 0 ? [{ label: 'Move up', onSelect: () => onMove(t, { status: t.status, beforeId: col[i - 1].id }) }] : []),
      ...(i >= 0 && i < col.length - 1 ? [{ label: 'Move down', onSelect: () => onMove(t, { status: t.status, beforeId: col[i + 2]?.id ?? null }) }] : []),
    ];
  };
  const card = (t: OwnerTaskView) => (
    <TaskCard key={t.id} task={t} onOpen={onOpen} people={people} labels={labels} showStatus={false} dragging={drag?.id === t.id} menu={moveMenu(t, menuFor(t))} {...handleProps(t.id, true)} />
  );

  const lanes: { key: string; title: string; tasks: OwnerTaskView[] }[] =
    swimlane === 'phase'
      ? [...PHASES.map((ph) => ({ key: ph, title: PHASE_LABEL[ph], tasks: tasks.filter((t) => t.phase === ph && t.type !== 'defect') })), { key: 'defects', title: 'UAT defects', tasks: tasks.filter((t) => t.type === 'defect') }]
      : swimlane === 'assignee'
        ? [...people.map((p) => ({ key: p.id, title: `${p.name}${p.side === 'client' ? ' (client)' : ''}`, tasks: tasks.filter((t) => t.assigneeId === p.id) })), { key: 'none', title: 'Unassigned', tasks: tasks.filter((t) => !t.assigneeId || !people.some((p) => p.id === t.assigneeId)) }]
        : [{ key: 'all', title: '', tasks }];

  return (
    <div className="flex flex-col gap-5" data-testid="cp-kanban" data-swimlane={swimlane}>
      {lanes
        .filter((l) => swimlane === 'none' || l.tasks.length)
        .map((lane) => (
          <div key={lane.key} className="flex flex-col gap-2" data-testid="cp-lane">
            {lane.title && <h3 className="cp-lane-title text-small font-medium text-fg-secondary">{lane.title}</h3>}
            <div data-cp-scroll className="cp-board -mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-4 md:overflow-visible md:px-0 [&>section]:w-[86%] [&>section]:shrink-0 [&>section]:snap-start md:[&>section]:w-auto">
              {TASK_STATUSES.map((s) => {
                const list = lane.tasks.filter((t) => t.status === s).sort(columnOrder);
                return <Column key={s} col={`${lane.key}|${s}`} title={STATUS_LABEL[s]} status={s} tasks={list} drag={drag} droppable limit={swimlane === 'none' ? limits[s] || undefined : undefined} render={card} />;
              })}
            </div>
          </div>
        ))}
      <DragOverlay drag={drag} render={(id) => (byId.get(id) ? <TaskCard task={byId.get(id) as OwnerTaskView} onOpen={() => undefined} people={people} labels={labels} showStatus={false} ghost /> : null)} />
    </div>
  );
}

// ------------------------------------------------------------------ Roadmap

export function RoadmapView({ tasks, allTasks, people, labels, onOpen, onMove, onLoadSop, empty }: ViewProps) {
  const [group, setGroup] = React.useState('phase');
  const byId = React.useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const { drag, handleProps } = useBoardDrag((id, col) => {
    const t = byId.get(id);
    if (!t || t.type === 'defect' || col === t.phase || !(PHASES as readonly string[]).includes(col)) return;
    onMove(t, { phase: col as Phase });
  });
  const road = tasks.filter((t) => t.type !== 'defect');
  const defects = tasks.filter((t) => t.type === 'defect').sort(bySchedule);
  const byPhase = group === 'phase';
  const columns = byPhase
    ? [...PHASES.map((ph) => ({ col: ph as string, title: PHASE_LABEL[ph], tasks: road.filter((t) => t.phase === ph).sort(bySchedule), droppable: true })), ...(defects.length ? [{ col: 'defects', title: 'UAT defects', tasks: defects, droppable: false }] : [])]
    : [...DELIVERABLE_LIST.map(([ref, name]) => ({ col: ref, title: `${ref} ${name}`, tasks: tasks.filter((t) => t.deliverableRef === ref).sort(bySchedule), droppable: false })), { col: 'general', title: 'General', tasks: tasks.filter((t) => !t.deliverableRef).sort(bySchedule), droppable: false }].filter((c) => c.tasks.length);
  const card = (t: OwnerTaskView) => {
    const movable = byPhase && t.type !== 'defect';
    return (
      <TaskCard
        key={t.id}
        task={t}
        onOpen={onOpen}
        people={people}
        labels={labels}
        dragging={drag?.id === t.id}
        menu={movable ? moveMenu(t, PHASES.filter((ph) => ph !== t.phase).map((ph) => ({ label: `Move to ${PHASE_LABEL[ph]}`, onSelect: () => onMove(t, { phase: ph }) }))) : undefined}
        {...handleProps(t.id, movable)}
      />
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-small text-fg-secondary">Group by</span>
        <SegmentedControl label="Group by" size="sm" value={group} onChange={setGroup} items={[{ value: 'phase', label: 'Phase' }, { value: 'deliverable', label: 'Deliverable' }]} />
        {byPhase && <span className="hidden text-caption text-fg-tertiary md:inline">Drag a card to another phase. Its due date stays unless you re-date it.</span>}
      </div>
      {empty ? (
        <EmptyBoard onLoadSop={onLoadSop} />
      ) : (
        <div
          data-cp-scroll
          className={byPhase ? 'cp-board grid items-start gap-3 md:grid-cols-2 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none' : '-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 max-md:flex-col md:-mx-8 md:px-8 [&>section]:md:w-[272px] [&>section]:md:shrink-0'}
          data-testid="cp-board"
          data-group={group}
        >
          {columns.map((c) => (
            <Column key={c.col} col={c.col} title={c.title} tasks={c.tasks} drag={drag} droppable={c.droppable} render={card} />
          ))}
        </div>
      )}
      <DragOverlay drag={drag} render={(id) => (byId.get(id) ? <TaskCard task={byId.get(id) as OwnerTaskView} onOpen={() => undefined} people={people} labels={labels} ghost /> : null)} />
    </div>
  );
}
