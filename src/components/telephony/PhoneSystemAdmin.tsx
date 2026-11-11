'use client';

import * as React from 'react';
import { Button, Field, Input, SettingsSection } from '@/components/ui';
import {
  DEFAULT_OUTCOME_CODES,
  DIALER_OUTCOMES,
  setOutcomeCodes,
  useOutcomeCodes,
} from '@/lib/telephony/settings';

interface ConfigReply {
  configured: boolean;
  host: string | null;
}
interface TestReply {
  ok: boolean;
  message?: string;
  unreachable?: boolean;
  agent?: { state: string; detail: string } | null;
}

const STATE_TEXT: Record<string, string> = {
  ready: 'logged in and ready',
  paused: 'logged in (paused)',
  in_call: 'on a call',
  wrap_up: 'finishing a call',
  logged_out: 'not logged in to the agent screen',
  unknown: 'status unknown',
};

/** Admin › Integrations › Phone system: VICIdial connection status, connection test, agent links and outcome codes. */
export function PhoneSystemAdmin() {
  const [config, setConfig] = React.useState<ConfigReply | null>(null);
  const [agent, setAgent] = React.useState('');
  const [testing, setTesting] = React.useState(false);
  const [test, setTest] = React.useState<TestReply | null>(null);

  React.useEffect(() => {
    fetch('/api/telephony/vicidial/config', { method: 'POST' })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ configured: false, host: null }));
  }, []);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const r = await fetch('/api/telephony/vicidial/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentUser: agent.trim() || undefined }),
      });
      setTest(await r.json());
    } catch {
      setTest({ ok: false, message: 'Could not reach the Appointmentlyy server.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col divide-y divide-line border-t border-line">
      <SettingsSection
        title="Connection"
        description="Reps dial from the Dialer through their logged-in VICIdial agent session. Server credentials are set by IT on the server, never in the browser."
      >
        {config === null ? (
          <p className="text-small text-fg-tertiary">Checking…</p>
        ) : config.configured ? (
          <p className="text-body text-fg">
            Connected to <span className="font-mono">{config.host}</span>
          </p>
        ) : (
          <div className="flex flex-col gap-2 text-small text-fg-secondary">
            <p className="text-body text-fg">Not connected</p>
            <p>Ask IT to add these to the server&apos;s environment (for example <span className="font-mono">.env.local</span>) and restart the app:</p>
            <pre className="overflow-x-auto rounded-md border border-line bg-subtle p-3 font-mono text-small text-fg">
{`VICIDIAL_URL=https://your-vicidial-server
VICIDIAL_API_USER=api-user
VICIDIAL_API_PASS=********
VICIDIAL_TIMEZONE=America/New_York
VICIDIAL_TENANTS=YOUR-WORKSPACE-CODE`}
            </pre>
            <p>Until then the Dialer keeps using each rep&apos;s computer phone app.</p>
          </div>
        )}

        {config?.configured && (
          <div className="flex flex-col gap-3">
            <Field
              label="Agent to check (optional)"
              htmlFor="test-agent"
              hint="A VICIdial agent username, to confirm that agent is logged in."
            >
              <Input
                id="test-agent"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="e.g. 6001"
                className="max-w-56 font-mono"
                autoComplete="off"
              />
            </Field>
            <div>
              <Button variant="secondary" onClick={runTest} loading={testing}>
                Test connection
              </Button>
            </div>
            {test && (
              <div
                role="status"
                className={`rounded-md border p-3 text-small ${
                  test.ok ? 'border-success-500/40 bg-success-bg text-success-fg' : 'border-danger-700/30 bg-danger-bg text-danger-fg'
                }`}
              >
                {test.ok ? (
                  <>
                    <p className="font-medium">API login works. {test.message}</p>
                    {test.agent && (
                      <p className="mt-1">
                        Agent <span className="font-mono">{agent.trim()}</span> is {STATE_TEXT[test.agent.state] ?? test.agent.detail}.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="font-medium">{test.message || 'Test failed.'}</p>
                )}
              </div>
            )}
          </div>
        )}
      </SettingsSection>

      {config?.configured && (
        <SettingsSection
          title="Agent links"
          description="Which VICIdial agent each person dials as. People can only drive the agent linked to them here; supervisors and above can also use any agent linked in this workspace."
        >
          <AgentLinks />
        </SettingsSection>
      )}

      <SettingsSection
        title="Call outcomes → VICIdial status"
        description="When a rep picks an outcome in the Dialer, this status code is set on the call in VICIdial. Each code must exist in the campaign."
      >
        <OutcomeCodes />
      </SettingsSection>

      <SettingsSection title="Setup checklist" description="What IT needs to provide before reps can dial.">
        <ol className="list-decimal space-y-1.5 pl-5 text-small text-fg-secondary">
          <li>VICIdial web address (the main HTTPS site, not the :446 access portal).</li>
          <li>This app server&apos;s public IP permanently allow-listed in the VICIdial firewall.</li>
          <li>An API user (level 8+, API access on) allowed: external_dial, external_hangup, external_status, agent_status, version.</li>
          <li>Each rep&apos;s VICIdial agent username, linked to them by an admin under Agent links above.</li>
          <li>Campaigns allow manual dialing, and the status codes above exist in them.</li>
        </ol>
      </SettingsSection>
    </div>
  );
}

interface AgentRow {
  email: string;
  name: string;
  role: string;
  status: string;
  agentUser: string;
}

/** Admin+: link each member to their VICIdial agent username (stored on the server). */
function AgentLinks() {
  const [rows, setRows] = React.useState<AgentRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/telephony/agents')
      .then(async (r) => {
        const data = await r.json();
        if (!alive) return;
        if (r.ok && data.success) setRows(data.members as AgentRow[]);
        else setError(data.error || 'Could not load agent links.');
      })
      .catch(() => alive && setError('Could not reach the Appointmentlyy server.'));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="text-small text-danger-fg">{error}</p>;
  if (rows === null) return <p className="text-small text-fg-tertiary">Loading…</p>;
  if (rows.length === 0) return <p className="text-small text-fg-secondary">No members yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <AgentLinkRow key={r.email} row={r} />
      ))}
    </div>
  );
}

function AgentLinkRow({ row }: { row: AgentRow }) {
  const [saved, setSaved] = React.useState(row.agentUser);
  const [value, setValue] = React.useState(row.agentUser);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null);
  const valid = value === '' || /^[A-Za-z0-9._-]{1,20}$/.test(value.trim());
  const dirty = value.trim() !== saved;
  const id = `agent-${row.email}`;

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch('/api/telephony/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: row.email, agentUser: value.trim() }),
      });
      const data = await r.json();
      if (r.ok && data.success) {
        setSaved(data.agentUser || '');
        setValue(data.agentUser || '');
        setNote({ ok: true, text: 'Saved' });
      } else {
        setNote({ ok: false, text: data.error || 'Could not save.' });
      }
    } catch {
      setNote({ ok: false, text: 'Could not reach the Appointmentlyy server.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid grid-cols-[minmax(0,1fr)_9rem_auto] items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && dirty) save();
      }}
    >
      <label htmlFor={id} className="min-w-0">
        <span className="block truncate text-body text-fg">{row.name || row.email}</span>
        <span className="block truncate text-small text-fg-tertiary">
          {row.email} · {row.role}
          {row.status !== 'active' ? ` · ${row.status}` : ''}
        </span>
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          setNote(null);
          setValue(e.target.value);
        }}
        placeholder="e.g. 6001"
        autoComplete="off"
        className="font-mono"
        aria-invalid={!valid || undefined}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="secondary" size="sm" disabled={!valid || !dirty} loading={busy}>
          Save
        </Button>
        {note && (
          <span role="status" className={`text-small ${note.ok ? 'text-success-fg' : 'text-danger-fg'}`}>
            {note.text}
          </span>
        )}
        {!valid && <span className="text-small text-danger-fg">Letters, numbers, . _ - (max 20)</span>}
      </div>
    </form>
  );
}

function OutcomeCodes() {
  const codes = useOutcomeCodes();
  // Re-mount when stored codes change so the inputs reflect them.
  return <OutcomeCodesForm key={JSON.stringify(codes)} codes={codes} />;
}

function OutcomeCodesForm({ codes }: { codes: Record<string, string> }) {
  const [draft, setDraft] = React.useState(codes);
  const [saved, setSaved] = React.useState(false);
  const invalid = DIALER_OUTCOMES.filter((o) => !/^[A-Za-z0-9]{1,6}$/.test(draft[o.name] || ''));
  const dirty = DIALER_OUTCOMES.some((o) => (draft[o.name] || '') !== (codes[o.name] || ''));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid.length) return;
        setOutcomeCodes(Object.fromEntries(DIALER_OUTCOMES.map((o) => [o.name, draft[o.name].toUpperCase()])));
        setSaved(true);
      }}
    >
      <div className="grid max-w-md grid-cols-[1fr_8rem] items-center gap-x-4 gap-y-2">
        {DIALER_OUTCOMES.map((o) => (
          <React.Fragment key={o.name}>
            <label htmlFor={`code-${o.label}`} className="text-body text-fg">
              {o.label}
            </label>
            <Input
              id={`code-${o.label}`}
              value={draft[o.name] || ''}
              onChange={(e) => {
                setSaved(false);
                setDraft({ ...draft, [o.name]: e.target.value.trim().toUpperCase() });
              }}
              className="font-mono"
              maxLength={6}
              aria-invalid={invalid.includes(o) || undefined}
            />
          </React.Fragment>
        ))}
      </div>
      {invalid.length > 0 && (
        <p className="text-small text-danger-fg">Codes are 1–6 letters or numbers ({invalid.map((o) => o.label).join(', ')}).</p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={!dirty || invalid.length > 0}>
          Save codes
        </Button>
        <Button variant="ghost" onClick={() => setDraft(DEFAULT_OUTCOME_CODES)}>
          Use VICIdial defaults
        </Button>
        {saved && !dirty && (
          <span role="status" className="text-small text-success-fg">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
