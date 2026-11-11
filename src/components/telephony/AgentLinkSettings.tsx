'use client';

import * as React from 'react';

/**
 * Settings › Phone system: shows which VICIdial agent this person dials as. Admins link people to
 * agents in Admin › Phone system; the server enforces the link on every call.
 */
export function AgentLinkSettings() {
  const [state, setState] = React.useState<{ configured: boolean; agentUser: string } | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/telephony/vicidial/config', { method: 'POST' })
      .then((r) => r.json())
      .then((r) => alive && setState({ configured: Boolean(r.configured), agentUser: typeof r.agentUser === 'string' ? r.agentUser : '' }))
      .catch(() => alive && setState({ configured: false, agentUser: '' }));
    return () => {
      alive = false;
    };
  }, []);

  if (state === null) return <p className="text-small text-fg-tertiary">Checking…</p>;

  if (!state.configured) {
    return (
      <p className="text-small text-fg-secondary">
        Your workspace hasn&apos;t connected a VICIdial server yet. The Dialer keeps using your computer&apos;s phone app
        until an admin sets it up in Admin › Phone system.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-small font-medium text-fg">VICIdial agent username</p>
      {state.agentUser ? (
        <p className="font-mono text-body text-fg">{state.agentUser}</p>
      ) : (
        <p className="text-body text-fg-secondary">Not linked yet</p>
      )}
      <p className="text-small text-fg-secondary">
        {state.agentUser
          ? 'Keep your VICIdial agent screen logged in (paused) while you dial from Appointmentlyy.'
          : 'Ask an admin to link your VICIdial agent in Admin › Phone system. Until then the Dialer uses your computer’s phone app.'}{' '}
        Only an admin can change this.
      </p>
    </div>
  );
}
