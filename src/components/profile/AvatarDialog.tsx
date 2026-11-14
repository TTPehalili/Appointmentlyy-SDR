'use client';

import * as React from 'react';
import { Check, ImageUp, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar, Button, Dialog } from '@/components/ui';
import { AVATAR_PRESETS } from '@/lib/avatarPresets';
import { presetValue } from '@/lib/avatar';
import { removeAvatar, saveAvatar } from '@/lib/avatarClient';
import { resizeAvatar } from '@/lib/avatarResize';

type Pending = { value: string; kind: 'upload' | 'preset'; presetId?: string; bytes?: number } | null;

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * Change a profile photo: upload (drag and drop or choose a file; resized to 256 px in the
 * browser), pick one of the illustrated avatars, or remove it. Without `email` it is your own;
 * admins pass a member's email.
 */
export function AvatarDialog({
  open,
  onClose,
  name,
  email,
  currentSrc,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  /** Someone else's photo (Admin+). Omit for your own. */
  email?: string;
  currentSrc: string | null | undefined;
  onSaved?: (avatar: string | null) => void;
}) {
  const [pending, setPending] = React.useState<Pending>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<'save' | 'remove' | 'read' | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();

  const reset = () => {
    setPending(null);
    setError(null);
    setBusy(null);
    setDragging(false);
    if (fileRef.current) fileRef.current.value = '';
  };
  const close = () => {
    if (busy === 'save' || busy === 'remove') return;
    reset();
    onClose();
  };

  const takeFile = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    setBusy('read');
    const r = await resizeAvatar(file);
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
    if (!r.ok) return setError(r.error);
    setPending({ value: r.dataUrl, kind: 'upload', bytes: r.bytes });
  };

  const save = async () => {
    if (!pending) return;
    setBusy('save');
    setError(null);
    const r = await saveAvatar(pending.value, email);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    onSaved?.(r.avatar);
    reset();
    onClose();
  };

  const remove = async () => {
    setBusy('remove');
    setError(null);
    const r = await removeAvatar(email);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    onSaved?.(null);
    reset();
    onClose();
  };

  const previewSrc = pending ? pending.value : currentSrc;
  const own = !email;
  const working = busy === 'save' || busy === 'remove';

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!working}
      title={own ? 'Profile photo' : `Photo for ${name}`}
      description={own ? 'Shown to your team in chat, the member list and across the app.' : 'Shown to everyone in this workspace.'}
      size="md"
      footer={
        <>
          {currentSrc && (
            <Button variant="danger" icon={<Trash2 />} onClick={remove} loading={busy === 'remove'} disabled={!!busy} className="mr-auto" data-avatar-remove>
              Remove<span className="hidden sm:inline">&nbsp;photo</span>
            </Button>
          )}
          <Button variant="ghost" onClick={close} disabled={working}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy === 'save'} disabled={!pending || !!busy}>
            Save photo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-stretch">
          {/* Live preview, the same circle crop everyone will see. */}
          <div className="flex shrink-0 flex-col items-center gap-1.5" aria-live="polite">
            <Avatar name={name} src={previewSrc} size="2xl" className="ring-1 ring-line" />
            <span className="text-caption text-fg-tertiary">{pending?.kind === 'upload' && pending.bytes ? `256 × 256 · ${kb(pending.bytes)}` : 'Preview'}</span>
          </div>

          <label
            htmlFor={inputId}
            data-avatar-dropzone
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void takeFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              'focus-within:ring-2 focus-within:ring-selected flex min-h-28 w-full flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center transition-colors duration-150',
              dragging ? 'border-selected bg-selected-soft text-selected-soft-fg' : 'border-line-strong bg-subtle/50 text-fg-secondary hover:bg-subtle',
            )}
          >
            <ImageUp className="size-5" aria-hidden />
            <span className="text-body text-fg">
              {busy === 'read' ? 'Preparing photo…' : (
                <>
                  <span className="font-medium underline underline-offset-2">Choose a photo</span>
                  <span className="hidden sm:inline"> or drag one here</span>
                </>
              )}
            </span>
            <span className="text-caption text-fg-tertiary">JPG, PNG or WebP. We crop it to a circle.</span>
            <input
              ref={fileRef}
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/*"
              className="sr-only"
              onChange={(e) => void takeFile(e.target.files?.[0])}
              disabled={!!busy}
            />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-small font-medium text-fg-secondary">Or pick an avatar</legend>
          <div className="grid grid-cols-6 gap-2">
            {AVATAR_PRESETS.map((p) => {
              const selected = pending?.kind === 'preset' && pending.presetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-avatar-preset={p.id}
                  aria-pressed={selected}
                  aria-label={p.label}
                  title={p.label}
                  disabled={!!busy}
                  onClick={() => {
                    setError(null);
                    setPending({ value: presetValue(p.id), kind: 'preset', presetId: p.id });
                  }}
                  className={cn(
                    'focus-ring relative aspect-square w-full overflow-hidden rounded-full border-2 transition-colors duration-150 disabled:opacity-60',
                    selected ? 'border-selected' : 'border-transparent hover:border-line-strong',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" width={56} height={56} loading="lazy" className="size-full object-cover" draggable={false} />
                  {selected && (
                    <span className="absolute bottom-0 right-0 inline-flex size-4 items-center justify-center rounded-full bg-selected text-selected-fg" aria-hidden>
                      <Check className="size-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-md border border-danger-fg/30 bg-danger-bg px-3 py-2 text-small text-danger-fg">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
