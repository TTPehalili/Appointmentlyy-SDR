'use client';

/**
 * The client's full-height panel for one item on the shared board (direct access from a card): the item's body from
 * IntakeStep (shared with the guided onboarding page) in a drawer, with section pills, explicit Save draft, an
 * "unsaved changes" guard and a summary before Submit.
 */
import * as React from 'react';
import { Button, Drawer } from '@/components/ui';
import type { PublicProject, PublicTask } from '@/lib/clientProjects/types';
import type { PublicIntake } from '@/lib/clientProjects/intake';
import { IntakeStepContent, IntakeSummaryDialog, formLocked, useIntakeStep } from '@/components/clientProjects/intake/IntakeStep';

export function ClientIntakePanel({
  token,
  task,
  intake,
  readOnly,
  who,
  withName,
  onBoard,
  onClose,
}: {
  token: string;
  task: PublicTask;
  intake: PublicIntake;
  readOnly: boolean;
  /** The visitor's name and picked person (for the upload headers). */
  who: { name: string; personId: string };
  /** Runs `fn` once the visitor has said who they are. */
  withName: (fn: (name: string) => void) => void;
  onBoard: (b: PublicProject) => void;
  onClose: () => void;
}) {
  const s = useIntakeStep({ token, intake, who, withName, onBoard });
  const locked = formLocked(s, readOnly);
  const close = () => {
    if (s.dirty && !window.confirm('You have unsaved changes. Close without saving them?')) return;
    onClose();
  };
  const footer =
    s.form && !locked ? (
      <>
        {s.dirty && (
          <span className="mr-auto text-caption text-fg-tertiary" data-testid="cpi-unsaved">
            Unsaved changes
          </span>
        )}
        {s.part > 0 && (
          <Button variant="ghost" onClick={() => s.setPart(s.part - 1)}>
            Back
          </Button>
        )}
        <Button variant="secondary" onClick={() => void s.save()} loading={s.busy === 'save'} data-testid="cpi-save">
          Save draft
        </Button>
        {s.part < s.parts.length - 1 ? (
          <Button variant="primary" onClick={() => s.setPart(s.part + 1)} data-testid="cpi-next">
            Next
          </Button>
        ) : (
          <Button variant="primary" onClick={() => s.review()} data-testid="cpi-review">
            Review and submit
          </Button>
        )}
      </>
    ) : (
      <Button variant="ghost" onClick={close}>
        Close
      </Button>
    );

  return (
    <Drawer open onClose={close} width={640} title={task.title} subtitle={<span data-testid="cpi-status">{intake.label}</span>} footer={footer}>
      <IntakeStepContent s={s} token={token} task={task} intake={intake} readOnly={readOnly} />
      <IntakeSummaryDialog s={s} onSubmit={() => void s.submit()} />
    </Drawer>
  );
}
