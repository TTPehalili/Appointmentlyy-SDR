'use client';

/**
 * Admin › Appearance: the workspace logo (a platform feature for every client workspace). Admins pick a file, see it,
 * and click Save; Remove asks first. The logo replaces the initials tile in the app shell for everyone here. The server
 * checks the bytes (PNG, JPG, WebP, or SVG which it cleans) and the 512 KB limit. Hidden in the Appointmentlyy workspace.
 */
import * as React from 'react';
import { ImageUp, Lock, Trash2 } from 'lucide-react';
import { Badge, Button, ConfirmDialog, InlineError, useToast } from '@/components/ui';
import { refreshServerIdentity } from '@/lib/authClient';
import { LOGO_ACCEPT, LOGO_MAX_BYTES, fmtLogoSize } from '@/lib/tenantLogo';

interface LogoInfo {
  url: string;
  mime: string;
  size: number;
  updatedAt: string;
}

export function WorkspaceLogoCard() {
  const toast = useToast();
  const [state, setState] = React.useState<{ loaded: boolean; platform: boolean; canEdit: boolean; logo: LogoInfo | null; error: string }>({ loaded: false, platform: false, canEdit: false, logo: null, error: '' });
  const [file, setFile] = React.useState<File | null>(null);
  // A local preview of the picked file, made when it is picked and revoked when replaced or when the card goes away.
  const [preview, setPreviewUrl] = React.useState<string | null>(null);
  const previewRef = React.useRef<string | null>(null);
  const showPreview = (f: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f ? URL.createObjectURL(f) : null;
    setPreviewUrl(previewRef.current);
  };
  React.useEffect(() => () => void (previewRef.current && URL.revokeObjectURL(previewRef.current)), []);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [confirm, setConfirm] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  const fetchLogo = React.useCallback(async () => {
    const res = await fetch('/api/tenant/logo', { cache: 'no-store' });
    const d = await res.json().catch(() => ({}));
    return { loaded: true, platform: Boolean(d.platform), canEdit: Boolean(d.canEdit), logo: (d.logo ?? null) as LogoInfo | null, error: res.ok && d.success ? '' : d.error || 'Could not load the logo.' };
  }, []);
  const load = React.useCallback(async () => setState(await fetchLogo()), [fetchLogo]);
  React.useEffect(() => {
    let live = true;
    void fetchLogo().then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [fetchLogo]);

  if (!state.loaded || state.platform) return null;

  const pick = (f: File | null) => {
    setError('');
    if (f && f.size > LOGO_MAX_BYTES) {
      setFile(null);
      showPreview(null);
      setError(`That file is ${fmtLogoSize(f.size)}. Use a logo under ${LOGO_MAX_BYTES / 1024} KB.`);
      return;
    }
    setFile(f);
    showPreview(f);
  };

  const save = async () => {
    if (!file) return;
    setSaving(true);
    setError('');
    const res = await fetch('/api/tenant/logo', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await file.arrayBuffer() });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !d.success) {
      setError(d.error || 'Could not save the logo.');
      return;
    }
    setFile(null);
    showPreview(null);
    if (input.current) input.current.value = '';
    setState((s) => ({ ...s, logo: d.logo ?? null }));
    void refreshServerIdentity();
    toast({ message: d.changed === false ? 'That logo is already set.' : 'Logo saved. Everyone here sees it next time they open the app.' });
  };

  const remove = async () => {
    setSaving(true);
    setError('');
    const res = await fetch('/api/tenant/logo', { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !d.success) {
      setError(d.error || 'Could not remove the logo.');
      return;
    }
    setState((s) => ({ ...s, logo: null }));
    void refreshServerIdentity();
    toast({ message: 'Logo removed. The initials tile shows again.' });
  };

  const shown = preview ?? state.logo?.url ?? null;
  return (
    <section className="mb-6 flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4 md:p-5" aria-labelledby="ws-logo-title" data-testid="ws-logo-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ws-logo-title" className="text-h3 text-fg">
          Workspace logo
        </h2>
        <Badge tone={state.logo ? 'brand' : 'neutral'}>{state.logo ? 'Custom logo' : 'Initials'}</Badge>
      </div>
      <p className="text-small text-fg-secondary">Shown in the sidebar instead of the initials tile. PNG, JPG, WebP or SVG, up to {LOGO_MAX_BYTES / 1024} KB. A square logo looks best.</p>
      {state.error && <InlineError message={state.error} onRetry={() => void load()} />}
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle" data-testid="ws-logo-preview">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={preview ? 'Selected logo (not saved yet)' : 'Current workspace logo'} className="size-full object-contain" />
          ) : (
            <span className="text-caption text-fg-tertiary">None</span>
          )}
        </span>
        {state.canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept={LOGO_ACCEPT} className="sr-only" id="ws-logo-file" onChange={(e) => pick(e.target.files?.[0] ?? null)} data-testid="ws-logo-file" />
            <Button icon={<ImageUp />} onClick={() => input.current?.click()} disabled={saving}>
              {state.logo ? 'Choose another' : 'Choose a file'}
            </Button>
            <Button variant="primary" loading={saving && !!file} disabled={!file || saving} onClick={() => void save()} data-testid="ws-logo-save">
              Save logo
            </Button>
            {state.logo && !file && (
              <Button variant="ghost" icon={<Trash2 />} disabled={saving} onClick={() => setConfirm(true)} data-testid="ws-logo-remove">
                Remove
              </Button>
            )}
            {file && (
              <span className="text-small text-fg-tertiary">
                {file.name} · {fmtLogoSize(file.size)} · not saved yet
              </span>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-small text-fg-secondary">
            <Lock className="size-3.5" aria-hidden /> View only. Ask an admin to change it.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-small font-medium text-danger-fg" data-testid="ws-logo-error">
          {error}
        </p>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void remove()} title="Remove the workspace logo?" description="The initials tile shows again for everyone in this workspace." confirmLabel="Remove logo" />
    </section>
  );
}
