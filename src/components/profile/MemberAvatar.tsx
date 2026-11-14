'use client';

import { Avatar, type AvatarSize } from '@/components/ui';
import { useAvatarSrc } from '@/lib/avatarClient';

/**
 * Someone's profile photo in the current workspace (initials until it is known or if they have
 * none). `src` is a hint from the payload that listed them; the shared cache wins once loaded,
 * so a live change shows everywhere at once.
 */
export function MemberAvatar({
  email,
  name,
  src,
  size = 'md',
  className,
  decorative,
}: {
  email: string | null | undefined;
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  decorative?: boolean;
}) {
  const cached = useAvatarSrc(email);
  return <Avatar name={name} src={cached !== undefined ? cached : src} size={size} className={className} decorative={decorative} />;
}
