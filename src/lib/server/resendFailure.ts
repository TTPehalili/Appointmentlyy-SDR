/**
 * A failed Resend call, reduced to what is safe to log and show: the HTTP status and Resend's error name
 * (e.g. "validation_error"). Never the provider's message text, which can quote the recipient address.
 */
export interface ResendFailure {
  status: number;
  name: string;
}

export async function readResendFailure(res: Response): Promise<ResendFailure> {
  const name = await res
    .json()
    .then((j: { name?: unknown }) => String(j?.name || '').replace(/[^\w.-]/g, '').slice(0, 60), () => '');
  return { status: res.status, name };
}

export const describeResendFailure = (f: ResendFailure) => `${f.status}${f.name ? ` ${f.name}` : ''}`;

export const resendRefusedMessage = (f: ResendFailure) =>
  `The email provider refused the message (${describeResendFailure(f)}). Nothing was sent.`;

export const RESEND_UNREACHABLE_MESSAGE = 'Could not reach the email provider. Nothing was sent. Please try again.';
