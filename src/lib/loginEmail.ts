/**
 * Techy, email-client-safe (table + inline CSS) login / invite email template.
 */
export interface LoginEmailParams {
  kind: 'login' | 'invite' | 'reset';
  recipientName: string;
  workspaceName: string;
  role: string;
  loginUrl: string;
  expiresText: string;
  invitedBy?: string;
  logoUrl: string;
  requestedFrom?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildLoginEmailSubject(p: LoginEmailParams): string {
  if (p.kind === 'reset') return 'Reset your Appointmentlyy SDR password';
  return p.kind === 'invite'
    ? `You're invited to ${p.workspaceName} on Appointmentlyy SDR`
    : 'Your Appointmentlyy SDR login link';
}

export function buildLoginEmailText(p: LoginEmailParams): string {
  const intro =
    p.kind === 'reset'
      ? `Someone asked to reset the password for your Appointmentlyy SDR account. Use the link below to choose a new one.`
      : p.kind === 'invite'
      ? `${p.invitedBy || 'Your admin'} invited you to ${p.workspaceName} on Appointmentlyy SDR as ${p.role}.`
      : `Use the link below to sign in to ${p.workspaceName} on Appointmentlyy SDR.`;
  return `${intro}\n\n${p.kind === 'reset' ? 'Reset password' : 'Sign in'}: ${p.loginUrl}\n\nThis link expires in ${p.expiresText}. If you didn't request it, you can safely ignore this email.\n\nAppointmentlyy SDR`;
}

export function buildLoginEmailHtml(p: LoginEmailParams): string {
  const headline =
    p.kind === 'reset' ? 'Reset your password.' : p.kind === 'invite' ? 'You have been invited.' : 'Your secure login link.';
  const lead =
    p.kind === 'reset'
      ? `Someone asked to reset the password for your Appointmentlyy SDR account. Press the button below to choose a new one. If it wasn't you, ignore this email: your password stays the same.`
      : p.kind === 'invite'
      ? `<strong style="color:#09090b;">${esc(p.invitedBy || 'Your admin')}</strong> invited you to join <strong style="color:#09090b;">${esc(p.workspaceName)}</strong> on Appointmentlyy SDR.`
      : `Press the button below to sign in to <strong style="color:#09090b;">${esc(p.workspaceName)}</strong>. No password needed.`;
  const cta = p.kind === 'reset' ? 'Choose a New Password' : p.kind === 'invite' ? 'Accept Invite &amp; Log In' : 'Log In to Appointmentlyy SDR';
  const mono = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";
  const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(buildLoginEmailSubject(p))}</title>
</head>
<body style="margin:0;padding:0;background:#09090b;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(p.kind === 'reset' ? 'Reset your Appointmentlyy SDR password' : p.kind === 'invite' ? 'Accept your invite and log in to Appointmentlyy SDR' : 'Your secure one-click login link')}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#09090b;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;">
      <tr><td style="padding:0 0 18px 4px;font-family:${mono};font-size:11px;letter-spacing:2px;color:#34d399;">
        &#9679; APPOINTMENTLYY // SECURE ACCESS
      </td></tr>
      <tr><td style="background:#fafafa;border-radius:16px 16px 0 0;padding:28px 36px 20px 36px;border-bottom:1px solid #e4e4e7;">
        <img src="${esc(p.logoUrl)}" alt="Appointmentlyy" width="168" style="display:block;border:0;outline:none;height:auto;width:168px;">
      </td></tr>
      <tr><td style="background:#fafafa;padding:32px 36px 8px 36px;font-family:${sans};">
        <div style="font-family:${mono};font-size:11px;letter-spacing:1.5px;color:#71717a;margin-bottom:10px;">
          ${p.kind === 'reset' ? 'PASSWORD_RESET' : p.kind === 'invite' ? 'NEW_USER_INVITE' : 'LOGIN_REQUEST'}
        </div>
        <h1 style="margin:0 0 12px 0;font-size:26px;line-height:1.2;color:#09090b;letter-spacing:-0.5px;">${headline}</h1>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#3f3f46;">Hi ${esc(p.recipientName)},<br>${lead}</p>
      </td></tr>
      <tr><td style="background:#fafafa;padding:0 36px 8px 36px;">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          <td style="border-radius:10px;background:#09090b;">
            <a href="${esc(p.loginUrl)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${sans};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;border:1px solid #09090b;">
              ${cta} &rarr;
            </a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#fafafa;padding:26px 36px 8px 36px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#09090b;border-radius:10px;">
          <tr><td style="padding:16px 18px;font-family:${mono};font-size:12px;line-height:1.9;color:#a1a1aa;">
            <span style="color:#52525b;">workspace</span> &nbsp;<span style="color:#e4e4e7;">${esc(p.workspaceName)}</span><br>
            <span style="color:#52525b;">role</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#e4e4e7;">${esc(p.role)}</span><br>
            <span style="color:#52525b;">expires</span> &nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#34d399;">${esc(p.expiresText)}</span><br>
            <span style="color:#52525b;">auth</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color:#e4e4e7;">signed secure link</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="background:#fafafa;padding:22px 36px 30px 36px;font-family:${sans};font-size:12px;line-height:1.6;color:#71717a;border-radius:0 0 16px 16px;">
        Button not working? Paste this link into your browser:<br>
        <a href="${esc(p.loginUrl)}" style="color:#52525b;word-break:break-all;">${esc(p.loginUrl)}</a>
        <br><br>
        If you didn&rsquo;t request this email, you can safely ignore it &mdash; nobody can sign in without this link.
      </td></tr>
      <tr><td align="center" style="padding:22px 8px 0 8px;font-family:${mono};font-size:10px;letter-spacing:1px;color:#52525b;">
        &copy; 2026 APPOINTMENTLYY AI &middot; OUTBOUND SYSTEMS
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
