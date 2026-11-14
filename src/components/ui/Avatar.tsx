'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { avatarImageSrc } from '@/lib/avatar';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Fixed box per size, so nothing moves when a photo loads. */
const SIZES: Record<AvatarSize, { box: string; px: number }> = {
  sm: { box: 'size-6 text-[10px]', px: 24 },
  md: { box: 'size-8 text-caption', px: 32 },
  lg: { box: 'size-10 text-body-strong', px: 40 },
  xl: { box: 'size-16 text-h2', px: 64 },
  '2xl': { box: 'size-28 text-h1', px: 112 },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/**
 * A person's photo in a circle, or their initials. `src` may be a URL, a preset id
 * (`preset:avatar-01`) or a data URL. A photo that fails to load falls back to initials.
 * `decorative`: the name is already shown next to it, so screen readers skip the avatar.
 */
export function Avatar({
  name,
  src,
  size = 'md',
  className,
  decorative = false,
}: {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  decorative?: boolean;
}) {
  const url = avatarImageSrc(src);
  const [failed, setFailed] = React.useState<string | null>(null);
  const showImage = Boolean(url) && failed !== url;
  const { box, px } = SIZES[size];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-subtle font-medium text-fg-secondary',
        box,
        className,
      )}
      title={decorative ? undefined : name}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(url!)}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
