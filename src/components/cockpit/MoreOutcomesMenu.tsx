'use client';

import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Menu, type MenuItem } from '@/components/ui';
import type { CallDisposition } from '@/lib/dispositionStore';
import type { PipelineStageConfig } from '@/lib/leadStore';
import { findStageByRole, resolveOutcomeStage } from '@/lib/dispositionPipeline';

/**
 * "More outcomes" in the Dialer's outcome bar: every active outcome from Admin › Call outcomes,
 * each with the Pipeline stage it moves the lead to.
 */
export default function MoreOutcomesMenu({
  outcomes,
  stages,
  selected,
  quickValues,
  onPick,
}: {
  outcomes: CallDisposition[];
  stages: PipelineStageConfig[];
  /** The outcome currently logged for this lead (highlights the trigger when it's one of these). */
  selected: string | null;
  /** Values of the quick buttons, which are never shown as selected here. */
  quickValues: string[];
  /** `schedulesCallback`: the outcome is a callback (automation or stage), so the scheduler should open. */
  onPick: (outcome: CallDisposition, schedulesCallback: boolean) => void;
}) {
  if (outcomes.length === 0) return null;
  const callbackStage = findStageByRole('callback', stages);
  const isSelected =
    !!selected && !quickValues.includes(selected) && outcomes.some((d) => d.name === selected);

  const items: MenuItem[] = outcomes.map((d) => {
    const stage = resolveOutcomeStage(d, stages);
    const schedulesCallback =
      d.actionTrigger === 'schedule_callback' || (!!stage && !!callbackStage && stage.id === callbackStage.id);
    return {
      label: d.name,
      icon: (
        <span className="flex size-4 items-center justify-center">
          <span className="size-2 rounded-full bg-fg-tertiary" style={d.color ? { backgroundColor: d.color } : undefined} />
        </span>
      ),
      shortcut: stage ? `→ ${stage.label}` : 'Keeps stage',
      onSelect: () => onPick(d, schedulesCallback),
    };
  });

  return (
    <Menu
      label="More outcomes"
      align="start"
      items={items}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={`focus-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-small font-medium transition-colors duration-150 ${
            isSelected ? 'bg-subtle text-fg border-fg' : 'bg-surface text-fg border-line-strong hover:bg-subtle'
          }`}
        >
          {isSelected && <Check className="size-3.5" />}
          <span>More outcomes</span>
          <ChevronDown className="size-3.5 text-fg-tertiary" aria-hidden />
        </button>
      )}
    />
  );
}
