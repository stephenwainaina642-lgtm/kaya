import type { Permission } from './permissions';
import type { PlanModule } from './plans';
import { can } from './permissions';
import { planHasModule } from './plans';
import { effectivePlan } from './billing';
import type { Plan, Role } from './enums';

/** Every area of Kaya, in the order a newcomer should meet them. Drives the guided tour and the "ask the guide" answers. */
export interface GuideArea {
  to: string;
  title: string;
  /** What this area is for, in one or two plain sentences. */
  summary: string;
  /** A concrete first thing to try there. */
  tryThis: string;
  keywords: string[];
  permission?: Permission;
  module?: PlanModule;
}

export const GUIDE_AREAS: GuideArea[] = [
  { to: '/', title: 'Dashboard', summary: 'Your day at a glance: what needs attention, deals in progress, rent collected and your portfolio health score.', tryThis: 'Look at "Biggest ways to improve" under the health score.', keywords: ['home', 'overview', 'summary', 'health', 'score', 'today', 'attention'], permission: 'dashboard:view' },
  { to: '/leads', title: 'Leads', summary: 'Everyone who has shown interest and not yet become a client. Enquiries from your public page land here automatically.', tryThis: 'Add a lead, then open it to log a call or schedule a viewing.', keywords: ['lead', 'enquiry', 'inquiry', 'prospect', 'interested', 'new customer', 'follow up'] },
  { to: '/clients', title: 'Clients', summary: 'Your buyers, tenants and sellers, with their requirements, history and everything you have said to them.', tryThis: 'Open a client and add what they are looking for so Kaya can match properties.', keywords: ['client', 'buyer', 'tenant', 'customer', 'contact', 'requirement', 'match'] },
  { to: '/viewings', title: 'Viewings', summary: 'Book and track property viewings and record how the client felt afterwards.', tryThis: 'Book a viewing and add feedback after it happens.', keywords: ['viewing', 'visit', 'tour', 'show', 'appointment', 'feedback'] },
  { to: '/follow-ups', title: 'Follow-ups', summary: 'Reminders to get back to people at the right time so nobody goes cold.', tryThis: 'Add a follow-up from a lead or client and tick it off when done.', keywords: ['follow', 'reminder', 'callback', 'call back', 'remind'] },
  { to: '/tasks', title: 'Tasks', summary: 'Your to-do list, separate from follow-ups, for anything that needs doing.', tryThis: 'Create a task and give it a due date.', keywords: ['task', 'todo', 'to-do', 'checklist'] },
  { to: '/deals', title: 'Deals', summary: 'A board showing each sale or letting from first offer to completion, with its value.', tryThis: 'Drag a deal to the next stage as it progresses.', keywords: ['deal', 'pipeline', 'sale', 'offer', 'stage', 'board', 'negotiation'], module: 'dealsPipeline' },
  { to: '/commissions', title: 'Commissions', summary: 'What you and your agents have earned on closed deals and what is still to be paid out.', tryThis: 'Open a closed deal\'s commission and mark it paid.', keywords: ['commission', 'earn', 'payout', 'agent pay', 'fee'], module: 'dealsPipeline' },
  { to: '/properties', title: 'Properties', summary: 'Every listing you manage with photos, price, owner, assigned agent, the people interested and an Advertise switch for your public page.', tryThis: 'Open a property, add photos and switch on Advertise to get a shareable link and a printable flyer.', keywords: ['property', 'listing', 'house', 'flat', 'apartment', 'advertise', 'photo', 'flyer', 'publish', 'list', 'sell'] },
  { to: '/buildings', title: 'Buildings', summary: 'For blocks and estates: create every unit at once, see occupancy as a floor-by-floor map, and add photos to all units together.', tryThis: 'Create a building, e.g. 5 floors of 6 units, and watch all 30 units appear.', keywords: ['building', 'estate', 'block', 'units', 'floors', 'occupancy', 'bulk', 'many units', 'large', 'apartment block'] },
  { to: '/owners', title: 'Owners', summary: 'The landlords and property owners you act for, with their agreements and a private portal link to see their rent and units.', tryThis: 'Open an owner and send them their portal link.', keywords: ['owner', 'landlord', 'portal', 'statement', 'agreement'] },
  { to: '/rent', title: 'Rent', summary: 'Leases, monthly rent charges, payments, arrears, reminders and owner statements. Tenants can pay from their own link by M-Pesa.', tryThis: 'Generate this month\'s rent, then send a tenant their payment link.', keywords: ['rent', 'lease', 'arrears', 'overdue', 'payment', 'mpesa', 'm-pesa', 'tenant link', 'receipt', 'statement', 'collect', 'reminder', 'sms', 'deposit'], module: 'rentManagement', permission: 'rent:view' },
  { to: '/maintenance', title: 'Maintenance', summary: 'Repair requests from tenants and caretakers, with priority, cost and status. Tenants can report problems without logging in.', tryThis: 'Log a repair and set its priority.', keywords: ['maintenance', 'repair', 'fix', 'plumber', 'broken', 'leak', 'caretaker', 'problem'], module: 'rentManagement', permission: 'maintenance:view' },
  { to: '/calendar', title: 'Calendar', summary: 'Viewings, follow-ups and lease dates together on one calendar.', tryThis: 'Check the week ahead.', keywords: ['calendar', 'schedule', 'week', 'agenda'] },
  { to: '/communications', title: 'Communications', summary: 'A record of calls, WhatsApp messages and emails with each contact, plus message templates.', tryThis: 'Log a call or open a WhatsApp chat from a contact.', keywords: ['message', 'whatsapp', 'email', 'call', 'template', 'communication', 'sms'] },
  { to: '/documents', title: 'Documents', summary: 'Contracts, IDs and agreements stored against the right person or property, with e-signature requests.', tryThis: 'Upload a document and request a signature.', keywords: ['document', 'contract', 'agreement', 'sign', 'signature', 'upload', 'file', 'id'] },
  { to: '/reports', title: 'Reports', summary: 'Sales, pipeline, agent performance and rent reports you can export.', tryThis: 'Pick a period and export a report to share with an owner.', keywords: ['report', 'export', 'csv', 'performance', 'statistics', 'numbers'] },
  { to: '/analytics', title: 'Analytics', summary: 'Trends over time: where leads come from, how fast deals close and how agents compare.', tryThis: 'See which lead source brings the most closed deals.', keywords: ['analytics', 'trend', 'source', 'conversion', 'funnel', 'insight'], module: 'analytics' },
  { to: '/automation', title: 'Automation', summary: 'Rules and email drips that do the repetitive work: assigning new leads, nudging stalled deals, follow-up sequences.', tryThis: 'Turn on a rule that assigns new leads to your agents in turn.', keywords: ['automation', 'automatic', 'rule', 'drip', 'sequence', 'assign', 'workflow'], module: 'automation' },
  { to: '/audit-log', title: 'Audit log', summary: 'A trail of who changed what and when, for accountability.', tryThis: 'Filter by a person to see what they did today.', keywords: ['audit', 'log', 'history', 'who changed', 'trail', 'security'], module: 'auditLog' },
  { to: '/team', title: 'Team', summary: 'Invite agents, managers, viewers and on-site caretakers, and control what each can see.', tryThis: 'Invite a caretaker so they can log repairs without seeing money.', keywords: ['team', 'invite', 'agent', 'user', 'role', 'permission', 'caretaker', 'staff', 'manager'] },
  { to: '/settings', title: 'Settings', summary: 'Your logo and colours, public inquiry and listings links, how tenants pay you, M-Pesa collection, billing and data export.', tryThis: 'Set how tenants pay you, or switch on M-Pesa collection.', keywords: ['settings', 'brand', 'logo', 'colour', 'color', 'billing', 'plan', 'upgrade', 'subscription', 'mpesa setup', 'password', 'export data'] },
];

/** The areas this person can actually open: right role, and a plan that includes the module. */
export function guideAreasFor(role: Role, plan: Plan, planExpiresAt: string | null): GuideArea[] {
  const effective = effectivePlan(plan, planExpiresAt);
  return GUIDE_AREAS.filter((a) => {
    if (role === 'CARETAKER') return !!a.permission && can(role, a.permission);
    if (a.permission && !can(role, a.permission)) return false;
    return !a.module || planHasModule(effective, a.module);
  });
}

export interface GuideAnswer {
  answer: string;
  links: { to: string; title: string }[];
  /** True when the AI wrote the answer; false for the built-in keyword guide. */
  ai: boolean;
}

/** Offline guide: ranks areas by how many of their keywords appear in the question. */
export function keywordGuide(question: string, areas: GuideArea[]): GuideAnswer {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')} `;
  const scored = areas
    .map((a) => ({ a, n: a.keywords.reduce((s, k) => s + (q.includes(` ${k} `) || q.includes(` ${k}s `) || q.includes(` ${k}`) ? (k.length > 3 ? 2 : 1) : 0), 0) + (q.includes(a.title.toLowerCase()) ? 3 : 0) }))
    .filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n)
    .slice(0, 3);
  if (scored.length === 0) {
    return {
      answer: 'I am not sure which part of Kaya that is about. Try the tour to see every area, or ask using words like "rent", "advertise a property", "add an agent" or "reports".',
      links: [], ai: false,
    };
  }
  const best = scored[0]!.a;
  return {
    answer: `${best.title}: ${best.summary} ${best.tryThis}`,
    links: scored.map((x) => ({ to: x.a.to, title: x.a.title })), ai: false,
  };
}
