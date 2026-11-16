/**
 * Agreement templates: the shared contract between the template layer (src/lib/agreements/templates/**)
 * and the e-signature platform (envelopes, signing, tracking, execution page, certificate).
 *
 * A template renders a client-ready PDF from owner-entered field values. It never draws signatures:
 * the platform appends an "Execution page" (signer choices + signatures) and a
 * "Certificate of Completion" (audit trail + SHA-256 hashes) to the template PDF after signing.
 */

export type TemplateFieldType = 'text' | 'textarea' | 'date' | 'money' | 'number' | 'select' | 'email';

/** A value the OWNER fills in when preparing a document (client name, prices, dates...). */
export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
  required?: boolean;
  /** Pre-filled value; for STACKph-derived templates, the STACKph v2 value. */
  default?: string;
  options?: string[];
  help?: string;
  /** UI grouping in the owner's "Prepare" form, e.g. 'Client', 'Pricing', 'Dates', 'Legal'. */
  group?: string;
}

/** Something the SIGNER chooses or confirms in the signing panel (package, plan, start date, UAT ticks...). */
export interface SignerFormField {
  key: string;
  label: string;
  kind: 'choice' | 'multi-check' | 'text' | 'date' | 'confirm' | 'rows';
  required?: boolean;
  options?: string[];
  /** kind 'rows': column labels for a small table the signer fills (e.g. outstanding minor items). */
  columns?: string[];
  maxRows?: number;
  help?: string;
}

/**
 * What the document asks of the recipient.
 * 'view' = no signature: tracked viewing only (billing statements), with an owner-managed payment status.
 */
export type TemplateAction = 'sign' | 'acknowledge' | 'view';

export interface AgreementTemplate {
  id: string;                 // stable slug, e.g. 'proposal-growth-v1'
  name: string;               // shown to the owner
  description: string;
  action: TemplateAction;     // 'sign' (proposal, UAT certificate) or 'acknowledge' (weekly delivery report)
  countersign: boolean;       // owner signs after the client (true for proposal + UAT certificate)
  fields: TemplateField[];
  signerForm: SignerFormField[];
  /** Title used for the envelope and emails, from the field values. */
  title(values: Record<string, string>): string;
  /** Render the client-facing PDF (no signatures). Must be deterministic for the same values. */
  render(values: Record<string, string>): Promise<Uint8Array>;
}
