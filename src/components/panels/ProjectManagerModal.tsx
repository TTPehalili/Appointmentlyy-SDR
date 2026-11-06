'use client';

import React, { useState } from 'react';
import { Folder, FolderPlus, X, Palette, Trash2, Edit3, ArrowRight } from 'lucide-react';
import { ProjectFolderRecord } from '@/lib/db';
import { Button, Dialog, IconButton } from '@/components/ui';

const PRESET_COLORS = [
  '#ED1C24', // Crimson
  '#2563EB', // Blue
  '#059669', // Emerald
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#0891B2', // Cyan
  '#4B5563'  // Slate
];

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProject?: ProjectFolderRecord | null;
  onSave: (projectData: { id?: string; name: string; description?: string; color: string }) => Promise<void>;
}

export default function ProjectModal({ isOpen, onClose, initialProject, onSave }: ProjectModalProps) {
  const [name, setName] = useState(initialProject?.name || '');
  const [description, setDescription] = useState(initialProject?.description || '');
  const [color, setColor] = useState(initialProject?.color || '#ED1C24');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);

  // Focus the name field once the dialog is shown (runs after Dialog's showModal effect)
  React.useEffect(() => {
    if (isOpen) nameRef.current?.focus();
  }, [isOpen]);

  // Sync state when initialProject changes
  React.useEffect(() => {
    if (initialProject) {
      setName(initialProject.name);
      setDescription(initialProject.description || '');
      setColor(initialProject.color || '#ED1C24');
    } else {
      setName('');
      setDescription('');
      setColor('#ED1C24');
    }
  }, [initialProject, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSave({
        id: initialProject?.id,
        name: name.trim(),
        description: description.trim(),
        color
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={initialProject ? 'Edit folder' : 'New folder'}
      size="md"
      bare
      dismissible={!isSubmitting}
      className="max-w-md overflow-hidden"
    >
      <div className="flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Folder className="mt-1 h-5 w-5 shrink-0 text-fg-secondary" />
            <div>
              <h2 className="text-h2 text-fg">
                {initialProject ? 'Edit folder' : 'New folder'}
              </h2>
              <p className="mt-1 text-body text-fg-secondary">Group related workflows together.</p>
            </div>
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-1">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-small font-medium text-fg">Folder name</label>
            <input
              ref={nameRef}
              type="text"
              required
              placeholder="e.g. Sales dialers, QA rubrics, Stripe billing"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="focus-ring w-full h-9 px-3 rounded-sm bg-surface border border-line-strong text-body text-fg placeholder:text-fg-disabled"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-small font-medium text-fg">
              Description <span className="font-normal text-fg-tertiary">(optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="What is this folder for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="focus-ring w-full px-3 py-2 rounded-sm bg-surface border border-line-strong text-body text-fg placeholder:text-fg-disabled"
            />
          </div>

          {/* Color tag picker */}
          <div className="space-y-1.5">
            <label className="text-small font-medium text-fg flex items-center gap-1.5">
              <Palette className="h-4 w-4 text-fg-secondary" />
              <span>Folder colour tag</span>
            </label>
            <div className="flex items-center gap-2 pt-1">
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  className={`focus-ring h-6 w-6 rounded-full border border-line transition-shadow cursor-pointer ${
                    color === c ? 'ring-2 ring-offset-2 ring-ink-900' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="-mx-6 px-6 py-4 border-t border-line flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? 'Saving...' : initialProject ? 'Save changes' : 'Create folder'}
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
