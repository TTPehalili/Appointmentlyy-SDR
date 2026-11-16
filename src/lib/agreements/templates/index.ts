/**
 * Template registry. Owned by the template layer; the platform only calls listTemplates() / getTemplate().
 * Templates register themselves here as they are built.
 */
import type { AgreementTemplate } from './types';

const registry: AgreementTemplate[] = [];

export function registerTemplate(t: AgreementTemplate): void {
  if (registry.some((x) => x.id === t.id)) return;
  registry.push(t);
}

export function listTemplates(): AgreementTemplate[] {
  return [...registry];
}

export function getTemplate(id: string): AgreementTemplate | undefined {
  return registry.find((t) => t.id === id);
}

export type { AgreementTemplate, TemplateField, SignerFormField, TemplateAction } from './types';
