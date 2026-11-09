'use client';

import * as React from 'react';
import { Button, Field, Input } from '@/components/ui';
import { setAgentUser, useAgentUser } from '@/lib/telephony/settings';

/** Settings › Phone system: links this rep to their VICIdial agent login so the Dialer can place calls. */
export function AgentLinkSettings() {
  const saved = useAgentUser();
  const [savedNote, setSavedNote] = React.useState(false);
  // Re-mount when the stored value arrives (it's read after hydration) so the field shows it.
  return <AgentLinkForm key={saved} saved={saved} savedNote={savedNote} onSaved={() => {
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 2500);
  }} />;
}

function AgentLinkForm({ saved, savedNote, onSaved }: { saved: string; savedNote: boolean; onSaved: () => void }) {
  const [value, setValue] = React.useState(saved);
  const [configured, setConfigured] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    fetch('/api/telephony/vicidial/config', { method: 'POST' })
      .then((r) => r.json())
      .then((r) => setConfigured(Boolean(r.configured)))
      .catch(() => setConfigured(false));
  }, []);

  const valid = value === '' || /^[A-Za-z0-9._-]{1,20}$/.test(value.trim());
  const dirty = value.trim() !== saved;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        setAgentUser(value);
        onSaved();
      }}
    >
      {configured === false && (
        <p className="text-small text-fg-secondary">
          Your workspace hasn&apos;t connected a VICIdial server yet. The Dialer keeps using your computer&apos;s phone app
          until an admin sets it up in Admin › Phone system.
        </p>
      )}
      <Field
        label="VICIdial agent username"
        htmlFor="vicidial-agent"
        hint="The username you log in to the VICIdial agent screen with. Keep that screen logged in (paused) while you dial from Appointmentlyy."
        error={valid ? undefined : 'Use letters, numbers, dots, dashes or underscores (max 20).'}
      >
        <Input
          id="vicidial-agent"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 6001"
          autoComplete="off"
          className="max-w-56 font-mono"
          aria-invalid={!valid || undefined}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={!valid || !dirty}>
          Save
        </Button>
        {savedNote && (
          <span role="status" className="text-small text-success-fg">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
