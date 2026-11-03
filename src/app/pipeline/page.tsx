import React from 'react';
import PipelineKanbanHub from '@/components/pipeline/PipelineKanbanHub';

export const metadata = {
  title: 'Pipeline Kanban Board | Appointmentlyy SDR',
  description:
    'Interactive outbound deal stage Kanban board synced with Calling Floor, ICP Folders, and Global Contacts.',
};

export default function PipelinePage() {
  return <PipelineKanbanHub />;
}

