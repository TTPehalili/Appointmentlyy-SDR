import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-app px-6 text-center">
      <p className="text-caption tabular-nums text-fg-tertiary">404</p>
      <h1 className="text-h1 text-fg">We can’t find that page</h1>
      <p className="max-w-sm text-body text-fg-secondary">It may have moved during the redesign. Use search or go back home.</p>
      <Link
        href="/"
        className="focus-ring mt-2 inline-flex h-9 items-center rounded-md bg-action px-3.5 text-body font-medium text-action-fg hover:bg-action-hover"
      >
        Go home
      </Link>
    </main>
  );
}
