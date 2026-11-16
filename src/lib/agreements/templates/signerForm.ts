/**
 * Signer forms whose option labels depend on the owner's field values (e.g. the proposal's
 * "Annual ($1,250/month)"). `AgreementTemplate.signerForm` is static and holds the labels for the
 * DEFAULT values; templates that vary also expose `signerFormFor(values)`.
 *
 * Platform: always call `resolveSignerForm(template, envelope.field_values)` to build the signing
 * panel and to validate/store the signer's answers. It falls back to `signerForm` for templates
 * that do not vary.
 */
import type { AgreementTemplate, SignerFormField } from './types';

export interface DynamicSignerForm {
  signerFormFor?: (values: Record<string, string>) => SignerFormField[];
}

export type AgreementTemplateDef = AgreementTemplate & DynamicSignerForm;

export function resolveSignerForm(t: AgreementTemplate, values: Record<string, string>): SignerFormField[] {
  const fn = (t as AgreementTemplateDef).signerFormFor;
  return typeof fn === 'function' ? fn(values) : t.signerForm;
}
