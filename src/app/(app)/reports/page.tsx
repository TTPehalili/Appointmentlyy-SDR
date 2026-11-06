import RepPerformanceDashboard from '@/components/RepPerformanceDashboard';

export const metadata = {
  title: 'Executive & Rep Performance Dashboard | Appointmently SDR',
  description: 'Track daily, weekly, monthly, quarterly, and yearly SDR performance, appointments booked, DNC compliance, and carry-over outreach.'
};

export default function AnalyticsPage() {
  return <RepPerformanceDashboard />;
}
