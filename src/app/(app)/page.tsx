import { redirect } from 'next/navigation';

/** There is no Home page: the app opens on the Dialer. */
export default function RootPage() {
  redirect('/dialer');
}
