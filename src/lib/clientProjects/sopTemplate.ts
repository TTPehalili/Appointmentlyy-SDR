/**
 * The onboarding SOP (v1), built from the delivery playbook's Promise Register. Content only: every
 * new client project starts from these cards, and editing them needs no schema change.
 *
 * `offset` is Business Days from kickoff (0 = kickoff day, negative = before kickoff). `client` is
 * the client-facing wording; `notes` stay internal and are never shown on the shared board.
 */
import type { OwnerSide, Phase } from '@/lib/clientProjects/types';

export interface SopCard {
  key: string;
  phase: Phase;
  title: string;
  client: string;
  notes?: string;
  side: OwnerSide;
  offset: number;
  /** Contract deliverable 01-11, when the card belongs to one. */
  ref?: string;
  gate?: boolean;
  /** Hidden from the client board (internal controls). Default: visible. */
  internal?: boolean;
  /**
   * Milestones only: a purely internal checkpoint that the "Phase finished" rule may mark Done by itself.
   * Never set it on a milestone that stands for an external or legal act (countersign, payments, the
   * Readiness Notice, UAT sign-off, go-live) or an approval: those default to false and stay manual.
   */
  auto?: boolean;
  /**
   * Client-owned cards: an ordinary dependency item the client may tick Done themselves on the shared board.
   * Never set it on a signature, a payment, an acceptance or a report confirmation: for those the client
   * can only say "I've done this" and the owner confirms.
   */
  tick?: boolean;
}

export const SOP_VERSION = 'sop-v1';
/** Go-live is Business Day 15 after kickoff (the proposal's 3 weeks). */
export const SOP_GO_LIVE_OFFSET = 15;
/** UAT opens with the Readiness Notice (Business Day 10). */
export const SOP_UAT_START_OFFSET = 10;

export const SOP_TEMPLATE: SopCard[] = [
  // ------------------------------------------------------------ Before kickoff
  { key: 'countersign', phase: 'before_kickoff', side: 'client', offset: -2, title: 'Sign the agreement and send your company details', client: 'Sign the proposal, and send your registration number, registered address and proof of the signatory’s authority (secretary’s certificate or board resolution).', notes: 'P24 / Annex B 16.2. File the fully signed PDF as evidence.' },
  { key: 'billing-1', phase: 'before_kickoff', side: 'us', offset: -2, title: 'Billing statement #1 sent (first 50%)', client: 'We send the billing statement for the first 50% of the build fee.', notes: 'Send through the Agreements tool. Issue the BIR invoice after the payment lands.' },
  { key: 'first-payment', phase: 'before_kickoff', side: 'client', offset: -1, title: 'Pay the first 50% of the build fee', client: 'Kickoff is scheduled as soon as the first payment is received.', notes: 'Kickoff only after the payment lands. Evidence: payment receipt.' },
  { key: 'kickoff-pack', phase: 'before_kickoff', side: 'us', offset: -1, title: 'Kickoff pack sent', client: 'Agenda, onboarding questionnaire and your list of items to prepare, with due dates.', notes: 'Dependency list: provider keys, DNS access, logo and colours, user list, scripts, UAT lead and testers.' },
  { key: 'gap-audit', phase: 'before_kickoff', side: 'us', offset: 0, gate: true, internal: true, title: 'Gate 1: promise-vs-product gap audit approved', client: '', notes: 'P-register G1. Every deliverable rated ready / partial / missing, with a build plan for each gap. Owner approves the gap list.' },
  { key: 'staging', phase: 'before_kickoff', side: 'us', offset: 0, internal: true, title: 'Staging environment ready', client: '', notes: 'Railway service + Supabase staging project with fake data. Client workspace rehearsed in staging.' },
  { key: 'uat-team', tick: true, phase: 'before_kickoff', side: 'client', offset: 0, title: 'Name your UAT lead and testers', client: 'Tell us who leads acceptance testing and who the testers are, and block their time for the UAT week.', notes: 'Book tester slots at kickoff (risk: testers unavailable).' },

  // ------------------------------------------------------------ Week 1
  { key: 'kickoff-call', phase: 'week_1', side: 'us', offset: 1, ref: '01', title: 'Kickoff call and targeting session', client: 'We agree the plan, the service lines, target markets and buying committees, and book the training days.', notes: 'P1, P2. Book onsite days and post-go-live sessions now; confirm dates by email.' },
  { key: 'dns-access', tick: true, phase: 'week_1', side: 'client', offset: 1, ref: '06', title: 'Give DNS access for your sending domain', client: 'We need to add a few DNS records so your outreach emails send from your own domain. DNS can take time to update, so this starts on day 1.', notes: 'Risk: slow DNS. Fallback: reply-to on a verified subdomain.' },
  { key: 'questionnaire', tick: true, phase: 'week_1', side: 'client', offset: 2, ref: '01', title: 'Complete the onboarding questionnaire', client: 'Your services, ideal customers, markets and current sales process.' },
  { key: 'brand-assets', tick: true, phase: 'week_1', side: 'client', offset: 2, ref: '02', title: 'Send your logo and brand colours', client: 'A logo file (SVG or PNG) and your brand colours for your workspace.' },
  { key: 'discovery', phase: 'week_1', side: 'us', offset: 2, ref: '01', title: 'Discovery complete', client: 'Completed questionnaire and your ideal-customer profile, agreed with you.', notes: 'P2. Evidence: questionnaire, ICP doc.' },
  { key: 'provider-keys', tick: true, phase: 'week_1', side: 'client', offset: 3, ref: '07', title: 'Send your provider keys', client: 'Your own accounts and keys for AI, voice, lead data and email sending. We connect and test them for you.', notes: 'P8. Keys go in the workspace vault, never in email threads.' },
  { key: 'user-list', tick: true, phase: 'week_1', side: 'client', offset: 3, ref: '02', title: 'Send your user list with roles', client: 'Names, emails and roles for every rep, supervisor and manager.' },
  { key: 'scripts', tick: true, phase: 'week_1', side: 'client', offset: 4, ref: '03', title: 'Send your current scripts and service notes', client: 'Any call scripts, email templates and service descriptions you use today. They feed your custom playbook.' },
  { key: 'workspace', phase: 'week_1', side: 'us', offset: 5, ref: '02', title: 'Branded workspace with users and roles', client: 'Your name, logo and colours on every screen, with an account for every user.', notes: 'P3. Staging first, then production. Evidence: screenshots light + dark; user list matched.' },
  { key: 'keys-connected', phase: 'week_1', side: 'us', offset: 5, ref: '07', title: 'Your provider keys connected and tested', client: 'Each provider tested in your workspace.', notes: 'P8. Evidence: test log per provider. Verify BYOK routing per workspace.' },
  { key: 'subprocessors', phase: 'week_1', side: 'us', offset: 5, internal: true, title: 'Sub-processor list ready', client: '', notes: 'P18 (Annex B 10.3d). Railway, Supabase, Resend + the client’s own providers.' },
  { key: 'gate-2', phase: 'week_1', side: 'us', offset: 5, gate: true, auto: true, title: 'Gate 2: workspace configured', client: 'Your workspace is set up and your providers are connected.', notes: 'G2 (Day 5). Any register row still missing at Day 5 is escalated to the owner the same day.' },
  { key: 'report-1', phase: 'week_1', side: 'us', offset: 5, title: 'Delivery Report #1', client: 'Our weekly report: work done, evidence and anything waiting on you.', notes: 'P21 (cl. 10A). Friday, through the Agreements tool (acknowledge flow).' },

  // ------------------------------------------------------------ Week 2
  { key: 'report-1-confirm', phase: 'week_2', side: 'client', offset: 7, title: 'Confirm Delivery Report #1', client: 'Please confirm within 2 business days. After that the report counts as confirmed.' },
  { key: 'playbook', phase: 'week_2', side: 'us', offset: 8, ref: '03', title: 'Custom playbook', client: 'Scripts per service line, qualifying questions and an objection bank with rebuttals.', notes: 'P4. Evidence: playbook loaded in the Dialer; PDF copy.' },
  { key: 'personas', phase: 'week_2', side: 'us', offset: 8, ref: '04', title: 'AI practice prospects and certification path', client: 'Practice prospects modelled on your buyers, plus the path reps follow to get certified.', notes: 'P5. Evidence: personas live; a test call recorded per persona.' },
  { key: 'campaign-kit', phase: 'week_2', side: 'us', offset: 8, ref: '06', title: 'Campaign kit and sending domain', client: 'Cold email templates and sequence, LinkedIn post and message templates, and your verified sending domain.', notes: 'P7. Evidence: templates in the studios; domain verified.' },
  { key: 'floor', phase: 'week_2', side: 'us', offset: 8, ref: '08', title: 'Floor and reporting set up', client: 'Team chat, live floor, reports by rep and outcome, and Copilot team reports.', notes: 'P9.' },
  { key: 'reseller', phase: 'week_2', side: 'us', offset: 8, ref: '10', title: 'Reseller workspaces enabled', client: 'Separate, private workspaces for your own clients, under your brand.', notes: 'P11. Evidence: isolation test passed (tenant A cannot see B).' },
  { key: 'gate-3', phase: 'week_2', side: 'us', offset: 8, gate: true, auto: true, title: 'Gate 3: all features live in your workspace', client: 'Everything in the agreement is switched on in your workspace.', notes: 'G3 (Day 8). Each gap build: build, security review, QA, owner publish.' },
  { key: 'lead-finder', phase: 'week_2', side: 'us', offset: 9, ref: '05', title: 'Lead Finder: saved searches and first target lists', client: 'Built and reviewed together with you.', notes: 'P6. Evidence: saved searches, list export, session notes.' },
  { key: 'cost-estimate', phase: 'week_2', side: 'us', offset: 9, ref: '07', title: 'Usage cost estimate', client: 'What your own provider accounts are likely to cost per month.', notes: 'P8.' },
  { key: 'security', phase: 'week_2', side: 'us', offset: 9, title: 'Security and data-isolation review', client: 'Your data stays yours: workspace isolation and access controls are checked before testing starts.', notes: 'P13-P15, P17. Regression in the client workspace; security wave 1 done.' },
  { key: 'gate-4', phase: 'week_2', side: 'us', offset: 9, gate: true, internal: true, auto: true, title: 'Gate 4: internal UAT rehearsal passed', client: '', notes: 'G4 (Day 9). Run the client’s exact UAT checklist in production. Zero S1 or S2 before the Readiness Notice.' },
  { key: 'readiness', phase: 'week_2', side: 'us', offset: 10, gate: true, title: 'Gate 5: Readiness Notice and test checklist sent', client: 'We confirm the platform is ready for your acceptance testing and send the checklist.', notes: 'P22 (cl. 2A, 3). Internal deadline Day 10; the contract allows 15 Business Days.' },
  { key: 'report-2', phase: 'week_2', side: 'us', offset: 10, title: 'Delivery Report #2', client: 'Our weekly report: work done, evidence and anything waiting on you.', notes: 'P21.' },

  // ------------------------------------------------------------ Week 3
  { key: 'report-2-confirm', phase: 'week_3', side: 'client', offset: 12, title: 'Confirm Delivery Report #2', client: 'Please confirm within 2 business days. After that the report counts as confirmed.' },
  { key: 'training', phase: 'week_3', side: 'us', offset: 12, ref: '09', title: 'Training and rep certification', client: 'Platform training, live outbound coaching and supervisor mentoring, with reps certified.', notes: 'P10, P12. Evidence: attendance sheet, photos, certification results.' },
  { key: 'support-ready', phase: 'week_3', side: 'us', offset: 14, title: 'Support channel and incident process ready', client: 'How to reach support, with response targets, before you go live.', notes: 'P19, P20, P25. Incident runbook with the client contact; export/delete procedure tested on staging.' },
  { key: 'uat-run', phase: 'week_3', side: 'client', offset: 15, title: 'Run acceptance testing (UAT)', client: 'Your testers work through the checklist and report any issues here. Testing runs for 5 business days.', notes: 'cl. 3-8. Deemed acceptance applies if testing is not completed.' },
  { key: 'uat-fixes', phase: 'week_3', side: 'us', offset: 15, title: 'UAT issues triaged and fixed', client: 'Every reported issue is classified the same day and fixed within its target.', notes: 'P23. S1 fix within 2 BD, S2 within 5 BD; up to 3 cycles.' },
  { key: 'uat-signoff', phase: 'week_3', side: 'client', offset: 15, gate: true, title: 'Gate 6: sign the UAT Sign-off Certificate', client: 'Sign the certificate we send you once testing is complete.', notes: 'G6. Sent through the Agreements tool. Track deemed-acceptance dates.' },
  { key: 'go-live', phase: 'week_3', side: 'us', offset: 15, ref: '09', gate: true, title: 'Go-live', client: 'Your team starts working live, with us alongside on the day.', notes: 'P10. Go-live checklist.' },
  { key: 'report-3', phase: 'week_3', side: 'us', offset: 15, title: 'Delivery Report #3', client: 'Our weekly report: work done, evidence and anything waiting on you.', notes: 'P21.' },

  // ------------------------------------------------------------ After go-live
  { key: 'billing-2', phase: 'after_go_live', side: 'us', offset: 16, title: 'Billing statement #2 sent (second 50%)', client: 'We send the billing statement for the second 50% of the build fee.', notes: 'P24. Then the BIR invoice. Monthly billing starts from go-live.' },
  { key: 'second-payment', phase: 'after_go_live', side: 'client', offset: 18, title: 'Pay the second 50% of the build fee', client: 'Payable within 3 business days of go-live.', notes: 'cl. 9.' },
  { key: 'minor-fixes', phase: 'after_go_live', side: 'us', offset: 30, title: 'Remaining minor issues fixed', client: 'Any minor (S3) or cosmetic (S4) issues from testing are fixed within 15 business days of sign-off.', notes: 'P23 (cl. 7).' },
  { key: 'coaching', phase: 'after_go_live', side: 'us', offset: 37, ref: '11', title: 'Four weekly coaching sessions', client: 'Four online coaching sessions in the 30 days after go-live.', notes: 'P12 (cl. 10B). Session log, invites, attendance. No performance claims.' },
];

export const sopCard = (key: string) => SOP_TEMPLATE.find((c) => c.key === key);
