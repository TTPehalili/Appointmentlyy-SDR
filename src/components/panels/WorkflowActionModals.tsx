'use client';

import React, { useState } from 'react';
import { Copy, FolderInput, X, Settings2, Trash2, Check } from 'lucide-react';
import { ProjectFolderRecord, WorkflowRecord } from '@/lib/db';
import { Button, Dialog, IconButton } from '@/components/ui';

interface MoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflow: WorkflowRecord | null;
  projects: ProjectFolderRecord[];
  onMove: (workflowId: string, targetFolderId?: string) => Promise<void>;
}

export function MoveWorkflowModal({ isOpen, onClose, workflow, projects, onMove }: MoveModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string>(workflow?.folderId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (workflow) {
      setSelectedFolderId(workflow.folderId || '');
    }
  }, [workflow, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workflow) return;
    setIsSubmitting(true);
    try {
      await onMove(workflow.id, selectedFolderId || undefined);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen && Boolean(workflow)}
      onClose={onClose}
      title="Move workflow"
      size="sm"
      bare
      dismissible={!isSubmitting}
      className="overflow-hidden"
    >
      {workflow && (
        <div className="flex flex-col">
          <div className="px-6 pt-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <FolderInput className="h-5 w-5 text-fg-secondary" />
              <h2 className="text-h2 text-fg">Move workflow</h2>
            </div>
            <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pt-4 space-y-4">
            <p className="text-body text-fg-secondary">
              Choose a folder for <strong className="font-medium text-fg">{workflow.name}</strong>.
            </p>

            <div className="space-y-1.5">
              <label className="text-small font-medium text-fg">Folder</label>
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="focus-ring w-full h-9 px-3 rounded-sm bg-surface border border-line-strong text-body text-fg placeholder:text-fg-disabled"
              >
                <option value="">No folder (root)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="-mx-6 px-6 py-4 border-t border-line flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={isSubmitting}>
                {isSubmitting ? 'Moving...' : 'Move'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Dialog>
  );
}

interface DuplicateModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflow: WorkflowRecord | null;
  projects: ProjectFolderRecord[];
  onDuplicate: (workflowId: string, newName: string, folderId?: string) => Promise<void>;
}

export function DuplicateWorkflowModal({ isOpen, onClose, workflow, projects, onDuplicate }: DuplicateModalProps) {
  const [name, setName] = useState(workflow ? `${workflow.name} (Copy)` : '');
  const [folderId, setFolderId] = useState<string>(workflow?.folderId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const isShown = isOpen && Boolean(workflow);

  // Focus the name field once the dialog is shown (runs after Dialog's showModal effect)
  React.useEffect(() => {
    if (isShown) nameRef.current?.focus();
  }, [isShown]);

  React.useEffect(() => {
    if (workflow) {
      setName(`${workflow.name} (Copy)`);
      setFolderId(workflow.folderId || '');
    }
  }, [workflow, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workflow || !name.trim()) return;

    setIsSubmitting(true);
    try {
      await onDuplicate(workflow.id, name.trim(), folderId || undefined);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen && Boolean(workflow)}
      onClose={onClose}
      title="Duplicate workflow"
      size="sm"
      bare
      dismissible={!isSubmitting}
      className="overflow-hidden"
    >
      {workflow && (
        <div className="flex flex-col">
          <div className="px-6 pt-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-fg-secondary" />
              <h2 className="text-h2 text-fg">Duplicate workflow</h2>
            </div>
            <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-small font-medium text-fg">Name of the copy</label>
              <input
                ref={nameRef}
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="focus-ring w-full h-9 px-3 rounded-sm bg-surface border border-line-strong text-body text-fg placeholder:text-fg-disabled"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-small font-medium text-fg">Folder</label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="focus-ring w-full h-9 px-3 rounded-sm bg-surface border border-line-strong text-body text-fg placeholder:text-fg-disabled"
              >
                <option value="">No folder (root)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="-mx-6 px-6 py-4 border-t border-line flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={isSubmitting || !name.trim()}>
                {isSubmitting ? 'Duplicating...' : 'Duplicate'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Dialog>
  );
}

interface WorkflowSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflow: WorkflowRecord | null;
  onSave: (id: string, updates: Partial<WorkflowRecord>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function WorkflowSettingsModal({ isOpen, onClose, workflow, onSave, onDelete }: WorkflowSettingsModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [webhookPath, setWebhookPath] = useState('');
  const [active, setActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (workflow) {
      setName(workflow.name);
      setDescription(workflow.description || '');
      setWebhookPath(workflow.webhookPath || '');
      setActive(workflow.active ?? true);
    }
  }, [workflow, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workflow || !name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave(workflow.id, {
        name: name.trim(),
        description: description.trim(),
        webhookPath: webhookPath.trim() || undefined,
        active
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!workflow) return;
    if (window.confirm(`Are you sure you want to delete workflow "${workflow.name}"? This cannot be undone.`)) {
      await onDelete(workflow.id);
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen && Boolean(workflow)}
      onClose={onClose}
      title="Workflow settings"
      size="md"
      bare
      dismissible={!isSubmitting}
      className="max-w-md overflow-hidden"
    >
      {workflow && (
        <div className="flex flex-col">
          <div className="px-6 pt-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-fg-secondary" />
              <h2 className="text-h2 text-fg">Workflow settings</h2>
            </div>
            <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <form onSubmit={handleSubmit} className="px-6 pt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-small font-medium text-fg">Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="focus-ring w-full h-9 px-3 rounded-sm bg-surface border border-line-strong text-body text-fg placeholder:text-fg-disabled"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-small font-medium text-fg">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="focus-ring w-full px-3 py-2 rounded-sm bg-surface border border-line-strong text-body text-fg placeholder:text-fg-disabled"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-small font-medium text-fg">Webhook path</label>
              <div className="flex items-center">
                <span className="h-9 px-3 flex items-center rounded-l-sm bg-subtle border border-r-0 border-line-strong text-fg-secondary font-mono text-small">
                  /api/webhooks/
                </span>
                <input
                  type="text"
                  placeholder="slug-name"
                  value={webhookPath}
                  onChange={(e) => setWebhookPath(e.target.value)}
                  className="focus-ring w-full h-9 px-3 rounded-r-sm bg-surface border border-line-strong text-small text-fg font-mono placeholder:text-fg-disabled"
                />
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="focus-ring h-4 w-4 rounded-sm accent-ink-900"
                />
                <span className="text-body text-fg">Active (listening for triggers)</span>
              </label>

              <Button size="sm" variant="danger" onClick={handleDelete} icon={<Trash2 className="h-4 w-4" />}>
                Delete
              </Button>
            </div>

            <div className="-mx-6 px-6 py-4 border-t border-line flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={isSubmitting || !name.trim()}>
                {isSubmitting ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Dialog>
  );
}
