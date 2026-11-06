import RepPerformanceDashboard from '@/components/RepPerformanceDashboard';

export const metadata = {
  title: 'Reports | Appointmentlyy SDR',
  description: 'Track daily, weekly, monthly, quarterly, and yearly SDR performance, appointments booked, DNC compliance, and carry-over outreach.'
};

export default function AnalyticsPage() {
  return <RepPerformanceDashboard />;
}
