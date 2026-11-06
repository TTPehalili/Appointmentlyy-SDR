'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Download,
  Home,
  Inbox,
  ListPlus,
  Mail,
  Moon,
  Phone,
  Plus,
  Search,
  Sun,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  BoardColumn,
  BoardTemplate,
  Button,
  Card,
  CardBody,
  CardHeader,
  CanvasTemplate,
  Checkbox,
  Combobox,
  CommandPalette,
  DashboardTemplate,
  DataTable,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  FilterBar,
  FilterChip,
  IconButton,
  InlineError,
  Input,
  Kbd,
  ListTemplate,
  Menu,
  Meter,
  PageHeader,
  SegmentedControl,
  Select,
  SettingsNav,
  SettingsSection,
  SettingsTemplate,
  Skeleton,
  SplitTemplate,
  StatTile,
  StatusDot,
  StickySaveBar,
  Stepper,
  Switch,
  Tabs,
  Textarea,
  ToastProvider,
  Tooltip,
  WizardTemplate,
  useCommandShortcut,
  useToast,
  type Column,
  type CommandItem,
  type Tone,
} from '@/components/ui';

/* ---------- sample data ---------- */

interface Lead {
  id: string;
  name: string;
  title: string;
  company: string;
  status: { tone: Tone; label: string };
  owner: string;
  lastTouch: string;
  value: number;
}

const LEADS: Lead[] = [
  { id: '1', name: 'Adam Reyes', title: 'VP Operations', company: 'Taskus', status: { tone: 'success', label: 'Booked' }, owner: 'Maya Cruz', lastTouch: '2h ago', value: 48000 },
  { id: '2', name: 'Priya Natarajan', title: 'Head of CX', company: 'Telus Intl', status: { tone: 'warning', label: 'Callback' }, owner: 'Leo Tan', lastTouch: 'Yesterday', value: 32000 },
  { id: '3', name: 'Tom Becker', title: 'COO', company: 'Concentrix', status: { tone: 'neutral', label: 'New' }, owner: 'Maya Cruz', lastTouch: '3d ago', value: 76500 },
  { id: '4', name: 'Sofia Lim', title: 'Director, Workforce', company: 'Alorica', status: { tone: 'danger', label: 'Not interested' }, owner: 'Jon Park', lastTouch: '1w ago', value: 0 },
  { id: '5', name: 'Chris Olsen', title: 'VP Sales', company: 'TTEC', status: { tone: 'brand', label: 'In cadence' }, owner: 'Leo Tan', lastTouch: '5h ago', value: 21000 },
];

const money = (n: number) => (n ? `$${n.toLocaleString()}` : '–');

/* ---------- layout helpers ---------- */

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line py-10">
      <h2 className="text-h2 text-fg">{title}</h2>
      {description && <p className="mt-1 text-body text-fg-secondary">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:gap-6">
      {label && <span className="w-36 shrink-0 text-small text-fg-tertiary">{label}</span>}
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Frame({ label, height = 'h-[420px]', children }: { label: string; height?: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-small text-fg-tertiary">{label}</figcaption>
      <div className={`flex overflow-hidden rounded-lg border border-line-strong bg-app ${height}`}>{children}</div>
    </figure>
  );
}

const SWATCHES: { group: string; items: { name: string; cls: string; text?: string }[] }[] = [
  {
    group: 'Brand',
    items: [
      { name: 'brand-50', cls: 'bg-brand-50' },
      { name: 'brand-500', cls: 'bg-brand-500' },
      { name: 'brand-600', cls: 'bg-brand-600' },
      { name: 'brand-700', cls: 'bg-brand-700' },
    ],
  },
  {
    group: 'Ink',
    items: [
      { name: 'canvas', cls: 'bg-canvas' },
      { name: 'ink-100', cls: 'bg-ink-100' },
      { name: 'ink-200', cls: 'bg-ink-200' },
      { name: 'ink-300', cls: 'bg-ink-300' },
      { name: 'ink-400', cls: 'bg-ink-400' },
      { name: 'ink-500', cls: 'bg-ink-500' },
      { name: 'ink-600', cls: 'bg-ink-600' },
      { name: 'ink-700', cls: 'bg-ink-700' },
      { name: 'ink-800', cls: 'bg-ink-800' },
      { name: 'ink-900', cls: 'bg-ink-900' },
      { name: 'ink-950', cls: 'bg-ink-950' },
    ],
  },
  {
    group: 'Semantic',
    items: [
      { name: 'success-700', cls: 'bg-success-700' },
      { name: 'success-500', cls: 'bg-success-500' },
      { name: 'success-50', cls: 'bg-success-50' },
      { name: 'warning-700', cls: 'bg-warning-700' },
      { name: 'warning-400', cls: 'bg-warning-400' },
      { name: 'danger-700', cls: 'bg-danger-700' },
      { name: 'danger-50', cls: 'bg-danger-50' },
      { name: 'ai', cls: 'bg-ai' },
    ],
  },
  {
    group: 'Roles (switch with theme)',
    items: [
      { name: 'app', cls: 'bg-app' },
      { name: 'surface', cls: 'bg-surface' },
      { name: 'subtle', cls: 'bg-subtle' },
      { name: 'inverse', cls: 'bg-inverse' },
      { name: 'selected', cls: 'bg-selected' },
      { name: 'line', cls: 'bg-line' },
      { name: 'line-strong', cls: 'bg-line-strong' },
      { name: 'action', cls: 'bg-action' },
      { name: 'action-brand', cls: 'bg-action-brand' },
    ],
  },
  {
    group: 'Charts (in order)',
    items: [
      { name: 'chart-1', cls: 'bg-chart-1' },
      { name: 'chart-2', cls: 'bg-chart-2' },
      { name: 'chart-3', cls: 'bg-chart-3' },
      { name: 'chart-4', cls: 'bg-chart-4' },
      { name: 'chart-5', cls: 'bg-chart-5' },
      { name: 'chart-6', cls: 'bg-chart-6' },
    ],
  },
];

const TYPE: { token: string; cls: string; sample: string }[] = [
  { token: 'display · 30/36 · 700', cls: 'text-display', sample: 'Fill high-ticket seats' },
  { token: 'h1 · 24/32 · 650', cls: 'text-h1', sample: 'Contacts' },
  { token: 'h2 · 18/28 · 600', cls: 'text-h2', sample: 'Today’s meetings' },
  { token: 'h3 · 15/22 · 600', cls: 'text-h3', sample: 'Callbacks due' },
  { token: 'body · 14/20 · 400', cls: 'text-body', sample: '12 callbacks due today. Start with Adam at Taskus.' },
  { token: 'body-strong · 14/20 · 550', cls: 'text-body-strong', sample: 'Adam Reyes' },
  { token: 'small · 13/18 · 400', cls: 'text-small text-fg-secondary', sample: 'Last touch 2 hours ago' },
  { token: 'caption · 12/16 · 500', cls: 'text-caption text-fg-tertiary', sample: 'Last touch' },
  { token: 'kpi · 28/32 · 650 tnum', cls: 'text-kpi tabular-nums', sample: '1,760' },
  { token: 'mono (numbers, IDs, code)', cls: 'font-mono text-small', sample: '+1 (415) 555-0132 · lead_8f2c91' },
];

/* ---------- page ---------- */

export default function DesignPage() {
  return (
    <ToastProvider>
      <React.Suspense fallback={null}>
        <DesignGallery />
      </React.Suspense>
    </ToastProvider>
  );
}

function DesignGallery() {
  const toast = useToast();
  // Allow /design?theme=dark for screenshots and review links.
  const initialTheme = useSearchParams().get('theme') === 'dark' ? 'dark' : 'light';
  const [theme, setTheme] = React.useState<'light' | 'dark'>(initialTheme);
  const [tab, setTab] = React.useState('all');
  const [segment, setSegment] = React.useState('week');
  const [search, setSearch] = React.useState('');
  const [density, setDensity] = React.useState<'comfortable' | 'compact'>('comfortable');
  const [drawerLead, setDrawerLead] = React.useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [owner, setOwner] = React.useState<string | null>('maya');
  const [notify, setNotify] = React.useState(true);
  const [settingsTab, setSettingsTab] = React.useState('general');
  const [dirty, setDirty] = React.useState(false);
  const [step, setStep] = React.useState(1);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  React.useEffect(() => () => void (document.documentElement.dataset.theme = 'light'), []);

  const openPalette = React.useCallback(() => setPaletteOpen(true), []);
  useCommandShortcut(openPalette);

  const commands: CommandItem[] = [
    { id: 'home', group: 'Pages', label: 'Home', icon: <Home />, onRun: () => toast({ message: 'Opened Home' }) },
    { id: 'inbox', group: 'Pages', label: 'Inbox', icon: <Inbox />, hint: 'G I', onRun: () => toast({ message: 'Opened Inbox' }) },
    { id: 'contacts', group: 'Pages', label: 'Contacts', icon: <Users />, onRun: () => toast({ message: 'Opened Contacts' }) },
    ...LEADS.map((l) => ({
      id: `lead-${l.id}`,
      group: 'Leads',
      label: `${l.name} · ${l.company}`,
      icon: <Phone />,
      keywords: l.title,
      onRun: () => toast({ message: `Calling ${l.name}` }),
    })),
    { id: 'new-list', group: 'Actions', label: 'Build a lead list', icon: <ListPlus />, onRun: () => toast({ message: 'Lead Finder opened' }) },
  ];

  const rows = LEADS.filter((l) => `${l.name} ${l.company}`.toLowerCase().includes(search.toLowerCase()));

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (l) => (
        <div className="flex items-center gap-3">
          <Avatar name={l.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-body-strong text-fg">{l.name}</p>
            <p className="truncate text-small text-fg-tertiary">{l.title}</p>
          </div>
        </div>
      ),
    },
    { key: 'company', header: 'Company', cell: (l) => l.company },
    { key: 'status', header: 'Status', cell: (l) => <StatusDot tone={l.status.tone} label={l.status.label} /> },
    { key: 'owner', header: 'Owner', cell: (l) => <span className="text-fg-secondary">{l.owner}</span> },
    { key: 'last', header: 'Last touch', cell: (l) => <span className="text-fg-secondary">{l.lastTouch}</span> },
    { key: 'value', header: 'Value', align: 'right', cell: (l) => money(l.value) },
  ];

  return (
    <div className="min-h-dvh bg-app text-fg">
      <div className="sticky top-0 z-30 border-b border-line bg-app/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-2">
            <span className="text-h3 text-fg">Appointmentlyy design system</span>
            <Badge>Phase 1</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" icon={<Search />} onClick={openPalette} shortcut="⌘K">
              Search
            </Button>
            <SegmentedControl
              label="Theme"
              size="sm"
              value={theme}
              onChange={(v) => setTheme(v as 'light' | 'dark')}
              items={[
                { value: 'light', label: <><Sun className="size-3.5" aria-hidden /> Light</> },
                { value: 'dark', label: <><Moon className="size-3.5" aria-hidden /> Dark</> },
              ]}
            />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        <PageHeader
          title="Components"
          description="Every primitive and template from the redesign spec, built on brand tokens only."
          secondaryActions={<Button variant="secondary" icon={<Download />}>Export tokens</Button>}
          primaryAction={<Button variant="brand" icon={<Phone />}>Start calling</Button>}
        />

        <Section id="color" title="Color" description="80% canvas and surface, 15% ink, at most 5% crimson. Role tokens flip with the theme.">
          <div className="flex flex-col gap-6">
            {SWATCHES.map((g) => (
              <div key={g.group}>
                <p className="mb-2 text-small text-fg-tertiary">{g.group}</p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-11">
                  {g.items.map((s) => (
                    <div key={s.name} className="flex flex-col gap-1.5">
                      <div className={`h-12 rounded-md border border-line ${s.cls}`} />
                      <span className="truncate text-caption text-fg-secondary">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="type" title="Typography" description="Inter for everything; JetBrains Mono only for numbers, IDs and code. Sentence case.">
          <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {TYPE.map((t) => (
              <div key={t.token} className="flex flex-col gap-1 px-5 py-4 md:flex-row md:items-baseline md:gap-8">
                <span className="w-56 shrink-0 text-caption text-fg-tertiary">{t.token}</span>
                <span className={`text-fg ${t.cls}`}>{t.sample}</span>
              </div>
            ))}
          </div>
          <Card className="mt-4 border-ink-800 bg-ink-950 p-6">
            <p className="mb-3 text-caption text-ink-400">Focus surface · prompter 20/32</p>
            <p className="text-prompter text-ink-400">Totally fair. Most ops leaders we talk to say the same thing at first.</p>
            <p className="text-prompter text-ink-50">
              <span className="underline decoration-ai decoration-2 underline-offset-[6px]">
                What would it mean for your floor if every seat booked 35 meetings a month?
              </span>
            </p>
          </Card>
        </Section>

        <Section id="buttons" title="Buttons" description="One brand action per screen. Everything else is primary (ink), secondary, ghost or danger outline.">
          <Row label="Variants">
            <Button variant="brand" icon={<Phone />}>Call Adam</Button>
            <Button variant="primary">Save changes</Button>
            <Button variant="secondary">Preview</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger" icon={<Trash2 />} onClick={() => setDialogOpen(true)}>Delete list</Button>
          </Row>
          <Row label="Sizes 32 / 36 / 44">
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary" size="md">Medium</Button>
            <Button variant="primary" size="lg">Large</Button>
          </Row>
          <Row label="States">
            <Button variant="brand" loading>Booking</Button>
            <Button variant="primary" disabled>Disabled</Button>
            <Button variant="secondary" shortcut="1">Booked</Button>
          </Row>
          <Row label="Icon buttons">
            <IconButton label="Previous lead (J)"><ArrowRight className="size-4 rotate-180" /></IconButton>
            <IconButton label="Next lead (K)"><ArrowRight className="size-4" /></IconButton>
            <IconButton label="Email" variant="secondary"><Mail className="size-4" /></IconButton>
            <IconButton label="Add" variant="primary"><Plus className="size-4" /></IconButton>
            <Menu
              items={[
                { label: 'Edit stages', onSelect: () => toast({ message: 'Opening Admin › Pipeline stages' }) },
                { label: 'Export', icon: <Download />, onSelect: () => toast({ message: 'Export started' }) },
                'divider',
                { label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => setDialogOpen(true) },
              ]}
            />
          </Row>
        </Section>

        <Section id="inputs" title="Inputs">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="List name" htmlFor="d-name" hint="Reps see this in their queue.">
              <Input id="d-name" placeholder="Ops leaders, Manila" />
            </Field>
            <Field label="Phone" htmlFor="d-phone">
              <Input id="d-phone" mono defaultValue="+1 (415) 555-0132" />
            </Field>
            <Field label="Owner" htmlFor="d-owner">
              <Combobox
                id="d-owner"
                value={owner}
                onChange={setOwner}
                options={[
                  { value: 'maya', label: 'Maya Cruz', description: 'Rep · Pod A' },
                  { value: 'leo', label: 'Leo Tan', description: 'Rep · Pod A' },
                  { value: 'jon', label: 'Jon Park', description: 'Manager' },
                ]}
              />
            </Field>
            <Field label="Call outcome" htmlFor="d-outcome">
              <Select id="d-outcome" defaultValue="booked">
                <option value="booked">Booked</option>
                <option value="callback">Callback</option>
                <option value="voicemail">Voicemail</option>
              </Select>
            </Field>
            <Field label="Domain" htmlFor="d-domain" error="That domain is already connected to another workspace.">
              <Input id="d-domain" aria-invalid defaultValue="app.apexglobal.com" />
            </Field>
            <Field label="Disabled" htmlFor="d-dis">
              <Input id="d-dis" disabled placeholder="Read-only" />
            </Field>
            <Field label="Notes" htmlFor="d-notes" className="md:col-span-2">
              <Textarea id="d-notes" placeholder="Autosaves as you type" />
            </Field>
          </div>
          <Row>
            <Checkbox label="Split evenly across reps" defaultChecked />
            <span className="inline-flex items-center gap-2 text-body">
              <Switch label="Email me when a meeting is booked" checked={notify} onCheckedChange={setNotify} />
              Email me when a meeting is booked
            </span>
            <span className="inline-flex items-center gap-1.5 text-body text-fg-secondary">
              Connect rate
              <Tooltip content="Share of dials where a person picked up">
                <button type="button" className="focus-ring rounded-full border border-line-strong px-1.5 text-caption">?</button>
              </Tooltip>
            </span>
          </Row>
        </Section>

        <Section id="nav" title="Tabs and segmented control">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'all', label: 'All', count: 1284 },
              { value: 'lists', label: 'Lists', count: 12 },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <Row label="Date range">
            <SegmentedControl
              label="Date range"
              value={segment}
              onChange={setSegment}
              items={['Today', 'Week', 'Month', 'Quarter', 'Custom'].map((l) => ({ value: l.toLowerCase(), label: l }))}
            />
          </Row>
        </Section>

        <Section id="status" title="Badges, status and avatars" description="Badges are for status only. Status is always a dot plus a label.">
          <Row label="Badges">
            <Badge>Draft</Badge>
            <Badge tone="success">Verified</Badge>
            <Badge tone="warning">Pending</Badge>
            <Badge tone="danger">Error</Badge>
            <Badge tone="brand">Day 3</Badge>
          </Row>
          <Row label="Status">
            <StatusDot tone="success" label="Booked" />
            <StatusDot tone="warning" label="Callback" />
            <StatusDot tone="danger" label="Hostile" />
            <StatusDot tone="neutral" label="New" />
            <StatusDot tone="success" label="Live" live />
          </Row>
          <Row label="Avatars">
            <Avatar name="Maya Cruz" size="sm" />
            <Avatar name="Leo Tan" />
            <Avatar name="Jon Park" size="lg" />
          </Row>
          <Row label="Keys">
            <Kbd>⌘</Kbd><Kbd>K</Kbd><Kbd>J</Kbd><Kbd>1</Kbd>
          </Row>
        </Section>

        <Section id="cards" title="Cards and stat tiles">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Calls today" value="64" target="120" progress={64 / 120} />
            <StatTile label="Connects" value="18" delta={12} hint="vs yesterday" />
            <StatTile label="Meetings booked" value="7" target="10" progress={0.7} />
            <StatTile label="Practice score" value="82" delta={-3} hint="this week" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader title="Due now" description="Callbacks and replies needing an answer" actions={<Button size="sm" variant="ghost">View all</Button>} />
              <CardBody className="flex flex-col divide-y divide-line py-0">
                {LEADS.slice(0, 3).map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={l.name} size="sm" />
                      <div>
                        <p className="text-body-strong">{l.name}</p>
                        <p className="text-small text-fg-tertiary">{l.company}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" icon={<Phone />}>Call</Button>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Lead credits" description="1,760 of 2,000 this week" />
              <CardBody>
                <Meter value={0.88} label="Lead credits used" />
                <p className="mt-3 text-small text-fg-secondary">Resets Monday. <a href="#" className="focus-ring rounded-sm text-fg underline underline-offset-2">Get more</a></p>
              </CardBody>
            </Card>
          </div>
        </Section>

        <Section id="table" title="Data table, filter bar and drawer" description="Click a row to open the drawer. Select rows to see the bulk action bar.">
          <FilterBar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search contacts"
            filters={
              <>
                <FilterChip label="Status" value="All · 5" />
                <FilterChip label="Owner" value="Anyone" />
              </>
            }
            onMoreFilters={() => toast({ message: 'More filters' })}
            end={
              <SegmentedControl
                label="Row density"
                size="sm"
                value={density}
                onChange={(v) => setDensity(v as 'comfortable' | 'compact')}
                items={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]}
              />
            }
            className="mb-4"
          />
          <DataTable
            label="Contacts"
            columns={columns}
            rows={rows}
            rowKey={(l) => l.id}
            density={density}
            onRowClick={setDrawerLead}
            rowActions={(l) => (
              <>
                <IconButton size="sm" label={`Call ${l.name}`} onClick={() => toast({ message: `Calling ${l.name}` })}><Phone className="size-4" /></IconButton>
                <IconButton size="sm" label={`Email ${l.name}`}><Mail className="size-4" /></IconButton>
                <Menu items={[{ label: 'Add to list', onSelect: () => {} }, { label: 'Reassign', onSelect: () => {} }]} />
              </>
            )}
            bulkActions={(sel, clear) => (
              <>
                <Button size="sm" variant="secondary" icon={<UserPlus />} onClick={() => { toast({ message: `${sel.length} leads assigned`, action: { label: 'Undo', onClick: () => {} } }); clear(); }}>Assign to…</Button>
                <Button size="sm" variant="secondary" icon={<ListPlus />}>Add to list</Button>
                <Button size="sm" variant="ghost" icon={<Download />}>Export</Button>
              </>
            )}
            empty={<EmptyState icon={<Search />} title="No contacts match" description="Try a different name or company." />}
          />
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-2 text-small text-fg-tertiary">Loading</p>
              <DataTable label="Loading example" columns={columns.slice(0, 3)} rows={[]} rowKey={(l) => l.id} loading />
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-small text-fg-tertiary">Empty and error</p>
              <Card>
                <EmptyState icon={<Users />} title="No leads yet. Build your first list" action={<Button variant="primary" icon={<ListPlus />}>Build a list</Button>} className="py-8" />
              </Card>
              <InlineError message="Couldn't send. Gmail disconnected." onRetry={() => toast({ message: 'Reconnecting Gmail' })} />
            </div>
          </div>
        </Section>

        <Section id="overlays" title="Dialog, command palette and toast">
          <Row>
            <Button variant="danger" icon={<Trash2 />} onClick={() => setDialogOpen(true)}>Delete list</Button>
            <Button variant="secondary" icon={<Search />} onClick={openPalette} shortcut="⌘K">Command palette</Button>
            <Button variant="secondary" onClick={() => toast({ message: 'Booked with Adam', action: { label: 'Undo', onClick: () => toast({ message: 'Booking undone' }) } })}>
              Show toast
            </Button>
          </Row>
          <Row label="Skeletons">
            <div className="flex w-full max-w-md flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </Row>
        </Section>

        <Section id="templates" title="Page templates" description="Every screen uses one of these seven layouts.">
          <div className="flex flex-col gap-8">
            <Frame label="List · Contacts, Workflows, Tickets, Members">
              <div className="flex-1 overflow-auto">
                <ListTemplate
                  header={<PageHeader title="Contacts" count={1284} description="Everyone in this workspace." primaryAction={<Button variant="brand" icon={<Plus />}>Add contact</Button>} />}
                  filters={<FilterBar search="" onSearch={() => {}} searchPlaceholder="Search contacts" filters={<FilterChip label="Status" value="All" />} />}
                >
                  <DataTable label="Contacts preview" columns={columns.slice(0, 4)} rows={LEADS.slice(0, 3)} rowKey={(l) => l.id} />
                </ListTemplate>
              </div>
            </Frame>

            <Frame label="Board · Pipeline">
              <BoardTemplate
                header={<PageHeader title="Pipeline" primaryAction={<Button variant="brand" icon={<Plus />}>Add deal</Button>} />}
                summary={
                  <p className="text-body text-fg-secondary">
                    Total pipeline <span className="font-medium tabular-nums text-fg">$177,500</span> · Meetings <span className="font-medium tabular-nums text-fg">7</span> · Weighted <span className="font-medium tabular-nums text-fg">$61,200</span>
                  </p>
                }
              >
                {[
                  { t: 'New', leads: LEADS.slice(2, 4) },
                  { t: 'Contacted', leads: LEADS.slice(4, 5) },
                  { t: 'Booked', leads: LEADS.slice(0, 2) },
                ].map((col) => (
                  <BoardColumn key={col.t} title={col.t} count={col.leads.length} value={money(col.leads.reduce((s, l) => s + l.value, 0))}>
                    {col.leads.map((l) => (
                      <Card key={l.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-body-strong">{l.name}</p>
                            <p className="truncate text-small text-fg-tertiary">{l.title}, {l.company}</p>
                          </div>
                          <Avatar name={l.owner} size="sm" />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-small">
                          <span className="tabular-nums text-fg">{money(l.value)}</span>
                          <Badge>Day 3</Badge>
                        </div>
                      </Card>
                    ))}
                  </BoardColumn>
                ))}
              </BoardTemplate>
            </Frame>

            <Frame label="Workspace (split) · Dialer, Inbox, Outreach editor" height="h-[460px]">
              <SplitTemplate
                header={
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar name="Adam Reyes" />
                      <div>
                        <p className="text-body-strong">Adam Reyes</p>
                        <p className="text-small text-fg-tertiary">VP Operations @ Taskus · <time>9:42 AM local</time></p>
                      </div>
                    </div>
                    <Button variant="brand" icon={<Phone />}>Call</Button>
                  </div>
                }
                main={
                  <div className="rounded-lg bg-ink-950 p-6">
                    <p className="text-prompter text-ink-50">Hi Adam, it’s Maya from Appointmentlyy. Did I catch you at a bad time?</p>
                  </div>
                }
                rail={
                  <div className="p-4">
                    <Tabs value="notes" onChange={() => {}} items={[{ value: 'notes', label: 'Notes' }, { value: 'activity', label: 'Activity' }, { value: 'crm', label: 'CRM summary' }]} />
                    <Textarea className="mt-4" placeholder="Notes autosave" />
                  </div>
                }
                footer={
                  <div className="flex flex-wrap gap-2">
                    {['Booked', 'Callback', 'Voicemail', 'No answer', 'Referral', 'Not interested'].map((o, i) => (
                      <Button key={o} size="sm" variant="secondary" shortcut={String(i + 1)}>{o}</Button>
                    ))}
                  </div>
                }
              />
            </Frame>

            <Frame label="Dashboard · Home, Reports, Live floor" height="h-[440px]">
              <div className="flex-1 overflow-auto">
                <DashboardTemplate
                  header={
                    <PageHeader
                      title="Reports"
                      meta={<SegmentedControl label="Date range" size="sm" value="week" onChange={() => {}} items={['Today', 'Week', 'Month'].map((l) => ({ value: l.toLowerCase(), label: l }))} />}
                      secondaryActions={<Menu items={[{ label: 'Export', icon: <Download />, onSelect: () => {} }]} />}
                    />
                  }
                  kpis={
                    <>
                      <StatTile label="Meetings booked" value="31" target="35" />
                      <StatTile label="Outreach" value="1,204" />
                      <StatTile label="Connect rate" value="14%" delta={2} />
                      <StatTile label="Not interested" value="88" />
                      <StatTile label="Follow-ups due" value="23" />
                    </>
                  }
                  charts={
                    <>
                      <Card className="h-40 p-4"><p className="text-h3">Meetings over time</p><div className="mt-4 flex h-20 items-end gap-2">{[40, 65, 50, 80, 70, 90, 60].map((h, i) => <div key={i} className="flex-1 rounded-t-sm bg-chart-1" style={{ height: `${h}%` }} />)}</div></Card>
                      <Card className="h-40 p-4"><p className="text-h3">By outcome</p><div className="mt-4 flex h-3 overflow-hidden rounded-full"><div className="w-[40%] bg-chart-1" /><div className="w-[25%] bg-chart-2" /><div className="w-[20%] bg-chart-3" /><div className="w-[15%] bg-chart-4" /></div></Card>
                    </>
                  }
                />
              </div>
            </Frame>

            <Frame label="Settings · All Admin" height="h-[460px]">
              <SettingsTemplate
                nav={
                  <SettingsNav
                    active={settingsTab}
                    onSelect={setSettingsTab}
                    groups={[
                      { label: 'Workspace', items: [{ id: 'general', label: 'General' }, { id: 'members', label: 'Members & seats' }, { id: 'teams', label: 'Teams' }] },
                      { label: 'Sales setup', items: [{ id: 'playbooks', label: 'Playbooks' }, { id: 'outcomes', label: 'Call outcomes' }] },
                      { label: 'Billing', items: [{ id: 'plan', label: 'Plan' }, { id: 'usage', label: 'Usage' }] },
                    ]}
                  />
                }
                header={<PageHeader title="General" description="Name and defaults for this workspace." />}
                saveBar={
                  <StickySaveBar dirty={dirty}>
                    <Button variant="ghost" onClick={() => setDirty(false)}>Discard</Button>
                    <Button variant="brand" onClick={() => { setDirty(false); toast({ message: 'Settings saved' }); }}>Save</Button>
                  </StickySaveBar>
                }
              >
                <SettingsSection title="Workspace name" description="Shown in the switcher and on invites.">
                  <Input defaultValue="Taskus floor" onChange={() => setDirty(true)} aria-label="Workspace name" />
                </SettingsSection>
                <SettingsSection title="Time zone" description="Used for call windows and reports.">
                  <Select defaultValue="manila" onChange={() => setDirty(true)} aria-label="Time zone">
                    <option value="manila">Asia/Manila</option>
                    <option value="ny">America/New_York</option>
                  </Select>
                </SettingsSection>
              </SettingsTemplate>
            </Frame>

            <Frame label="Wizard · Lead Finder, onboarding, domain setup" height="h-[460px]">
              <div className="flex-1 overflow-auto">
                <WizardTemplate
                  header={<PageHeader title="Lead Finder" meta={<span className="text-small tabular-nums text-fg-secondary">1,760 of 2,000 this week</span>} />}
                  stepper={<Stepper steps={['Describe', 'Preview', 'Save & assign']} current={step} />}
                  footer={
                    <>
                      <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</Button>
                      <Button variant="brand" onClick={() => setStep((s) => Math.min(2, s + 1))}>{step === 2 ? 'Save list' : 'Continue'}</Button>
                    </>
                  }
                >
                  <p className="text-h3">{['Describe your ideal buyer', 'Preview matches', 'Name and assign'][step]}</p>
                  <p className="mt-1 text-body text-fg-secondary">
                    {['Ops leaders at BPOs with 500+ seats in the Philippines.', '412 matches. Previews are free.', 'Split evenly across 4 reps.'][step]}
                  </p>
                </WizardTemplate>
              </div>
            </Frame>

            <Frame label="Canvas · Workflow editor" height="h-[320px]">
              <CanvasTemplate
                toolbar={
                  <>
                    <Button size="sm" variant="ghost">Fit</Button>
                    <Button size="sm" variant="ghost">Test run</Button>
                    <Button size="sm" variant="primary">Publish</Button>
                  </>
                }
              >
                <div className="absolute inset-0 bg-[radial-gradient(var(--border-strong)_1px,transparent_1px)] [background-size:16px_16px]" aria-hidden />
                <div className="relative flex h-full items-center justify-center gap-10">
                  {['New lead added', 'Enrich with AI', 'Send first email'].map((n, i) => (
                    <Card key={n} className={`w-60 p-3 ${i === 1 ? 'border-brand-600' : ''}`}>
                      <p className="text-body-strong">{n}</p>
                      <p className="text-small text-fg-tertiary">Step {i + 1}</p>
                    </Card>
                  ))}
                </div>
              </CanvasTemplate>
            </Frame>
          </div>
        </Section>
      </main>

      <Drawer
        open={!!drawerLead}
        onClose={() => setDrawerLead(null)}
        title={drawerLead?.name}
        subtitle={drawerLead ? `${drawerLead.title}, ${drawerLead.company}` : undefined}
        actions={<Menu items={[{ label: 'Reassign', onSelect: () => {} }, { label: 'Add to list', onSelect: () => {} }]} />}
        footer={
          <>
            <Button variant="secondary" icon={<Mail />}>Email</Button>
            <Button variant="brand" icon={<Phone />}>Call</Button>
          </>
        }
      >
        {drawerLead && (
          <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-body">
            <dt className="text-fg-tertiary">Status</dt>
            <dd><StatusDot tone={drawerLead.status.tone} label={drawerLead.status.label} /></dd>
            <dt className="text-fg-tertiary">Owner</dt>
            <dd>{drawerLead.owner}</dd>
            <dt className="text-fg-tertiary">Phone</dt>
            <dd className="font-mono text-small">+1 (415) 555-01{drawerLead.id}2</dd>
            <dt className="text-fg-tertiary">Value</dt>
            <dd className="tabular-nums">{money(drawerLead.value)}</dd>
            <dt className="text-fg-tertiary">Last touch</dt>
            <dd>{drawerLead.lastTouch}</dd>
          </dl>
        )}
      </Drawer>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Delete “Ops leaders, Manila”?"
        description="412 contacts stay in Contacts. Only the list is removed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="danger" icon={<Trash2 />} onClick={() => { setDialogOpen(false); toast({ message: 'List deleted', action: { label: 'Undo', onClick: () => {} } }); }}>
              Delete list
            </Button>
          </>
        }
      />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commands} />
    </div>
  );
}
