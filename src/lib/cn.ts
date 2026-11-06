import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge has to know our custom type-scale tokens. Otherwise it reads `text-h1`
 * as a color and drops it when a `text-fg` class is also present.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display', 'h1', 'h2', 'h3', 'body', 'body-strong',
        'small', 'caption', 'group', 'kpi', 'prompter',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
