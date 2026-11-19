/** Server only. The shared client board's payload: everything goes through toPublicProject() (the one projection). */
import { getClientProjectStore } from '@/lib/server/clientProjectStore';
import { toPublicProject } from '@/lib/server/clientProjects/core';
import { boardIntake } from '@/lib/server/clientProjects/intake';
import type { Project, PublicProject } from '@/lib/clientProjects/types';

/** The current board for a project (re-read, so a reply after an action shows its effect). */
export async function boardPayload(project: Project): Promise<PublicProject> {
  const store = getClientProjectStore();
  const [fresh, tasks, comments, attachments] = await Promise.all([store.getProject(project.id), store.listTasks(project.id), store.listComments(project.id), store.listFiles(project.id, 'attachment')]);
  const p = fresh ?? project;
  // Intake may move cards (sync with Agreements, key checks): read the cards again only when it did something.
  const intake = await boardIntake(p, tasks);
  const after = intake ? await store.listTasks(project.id) : tasks;
  return toPublicProject(p, after, comments, undefined, attachments, intake);
}
