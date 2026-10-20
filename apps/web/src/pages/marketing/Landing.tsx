import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Menu, X, Users, SlidersHorizontal, Handshake, CalendarClock, FileText, BarChart3,
  Check, Plus, Minus,
} from 'lucide-react';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

const WORKFLOW = [
  { title: 'Capture the lead', body: 'A new enquiry lands with its source, budget and requirements already attached — nothing typed twice.' },
  { title: 'Match the right listings', body: 'Kaya ranks your active properties against what the lead actually asked for, and shows its reasoning.' },
  { title: 'Book the viewing', body: 'Schedule it, send the WhatsApp confirmation, and log feedback the moment you’re back in the car.' },
  { title: 'Track the offer', body: 'Move the deal through your pipeline stages, record offers and counter-offers as they come in.' },
  { title: 'Close and get paid', body: 'Split commission across agents, mark it paid, and see it land in your monthly reports.' },
];

const FEATURES = [
  {
    icon: Users,
    title: 'Leads and clients in one pipeline',
    body: 'Every enquiry, call and WhatsApp thread lives against the person it came from — from first contact to signed client, visible to the whole team.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Property matching, explained',
    body: 'Listings are ranked against a lead’s stated requirements with a visible score and reasons — not a black box.',
  },
  {
    icon: Handshake,
    title: 'Deals and commissions',
    body: 'A kanban pipeline for every sale or letting, with offers, counter-offers and commission splits tracked per agent.',
  },
  {
    icon: CalendarClock,
    title: 'Viewings and follow-ups',
    body: 'Every scheduled viewing and promised follow-up shows up on one calendar, so nothing slips between agents.',
  },
  {
    icon: FileText,
    title: 'Documents, properly linked',
    body: 'Agreements, IDs and offer letters attach to the client, property or deal they belong to — not a shared folder.',
  },
  {
    icon: BarChart3,
    title: 'Reports built for owners',
    body: 'Pipeline value, commission by month, and agent performance — the numbers an agency actually runs on.',
  },
];

const CAPABILITIES = [
  'Each agency’s data fully isolated',
  'Priced and shown in KES',
  'WhatsApp-ready messaging',
  'Role-based access for every team member',
];

const PLANS = [
  {
    name: 'Starter',
    price: 'KES 4,900',
    unit: '/ agent / month',
    body: 'For a solo agent or a small team getting organized.',
    features: ['Up to 3 users', 'Leads, clients and properties', 'Viewings and follow-ups', 'WhatsApp-ready messaging', 'Basic reports'],
    highlight: false,
  },
  {
    name: 'Growth',
    price: 'KES 9,900',
    unit: '/ agent / month',
    body: 'For an agency ready to run its full pipeline in one place.',
    features: [
      'Everything in Starter',
      'Deal pipeline and commissions',
      'Property matching engine',
      'Shortlists with a client self-service portal — request viewings, sign documents',
      'Team roles and permissions',
      'AI lead scoring, drafted messages and summaries',
      'Auto-assignment rules and drip follow-up sequences',
      'Priority support',
    ],
    highlight: true,
  },
  {
    name: 'Pro',
    price: 'KES 16,900',
    unit: '/ agent / month',
    body: 'For larger agencies and developers running multiple branches.',
    features: ['Everything in Growth', 'Multiple branches under one account', 'Full audit log', 'Advanced analytics and agent leaderboards', 'Custom reporting', 'Dedicated onboarding'],
    highlight: false,
  },
];

const FAQS = [
  {
    q: 'Is my agency’s data kept separate from other agencies?',
    a: 'Yes. Every agency on Kaya is fully isolated at the database level — your listings, clients and deals are never visible to anyone outside your organization.',
  },
  {
    q: 'Does Kaya send WhatsApp messages on its own?',
    a: 'No, and we’d rather be upfront about that. Kaya drafts a ready-to-send message at each stage of your pipeline — you review it and send it yourself. Nothing goes out in your name without you.',
  },
  {
    q: 'How does the property matching actually work?',
    a: 'It scores your active listings against what a lead or client has stated — budget, location, bedrooms, type — and shows the reasons behind every ranking. No black-box AI claims.',
  },
  {
    q: 'Can I move my existing listings and contacts in?',
    a: 'Our team can help migrate your spreadsheets and listings during onboarding, so your team isn’t starting from zero.',
  },
  {
    q: 'Does it work well on a phone?',
    a: 'Yes — Kaya is built mobile-first, since most agents update a deal from a viewing, not a desk.',
  },
  {
    q: 'Can I change plans or cancel later?',
    a: 'Yes, at any time. Your data stays yours and exports cleanly if you ever need to leave.',
  },
];

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-control bg-cypress-600 font-display text-sm font-semibold text-white">
        K
      </div>
      <span className={`font-display text-lg font-semibold ${dark ? 'text-white' : 'text-ink'}`}>Kaya</span>
    </Link>
  );
}

function PipelineMock() {
  const rows = [
    { name: 'Kilimani · 2BR Apartment', price: 'KES 12.5M', stage: 'Viewing booked', tone: 'bg-cypress-50 text-cypress-700' },
    { name: 'Lavington · Townhouse', price: 'KES 38M', stage: 'Offer received', tone: 'bg-[#fbf3e7] text-brass' },
    { name: 'Karen · 5BR Villa', price: 'KES 85M', stage: 'Negotiating', tone: 'bg-[#fbf3e7] text-brass' },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-4 -z-10 rounded-panel bg-cypress-100/60 [transform:rotate(-2deg)]" />
      <div className="rounded-panel border border-line bg-surface p-5 shadow-card [transform:rotate(1.5deg)]">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-ink">This week’s pipeline</p>
          <span className="text-xs text-faint">Savanna Ridge Realty</span>
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between rounded-control border border-line bg-sunk px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                <p className="text-xs text-muted">{r.price}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${r.tone}`}>{r.stage}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
          <span>Commission this month</span>
          <span className="font-display text-sm font-semibold text-cypress-700">KES 2.1M</span>
        </div>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line py-5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-4 text-left">
        <span className="font-display text-base font-medium text-ink">{q}</span>
        <span className="shrink-0 text-faint">{open ? <Minus size={18} /> : <Plus size={18} />}</span>
      </button>
      {open && <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{a}</p>}
    </div>
  );
}

export function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-surface">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-muted hover:text-ink">{l.label}</a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <Link to="/login" className="text-sm font-medium text-muted hover:text-ink">Sign in</Link>
            <Link to="/login" className="rounded-control bg-cypress-600 px-4 py-2 text-sm font-medium text-white hover:bg-cypress-700">
              Start free
            </Link>
          </div>
          <button onClick={() => setMenuOpen((v) => !v)} className="p-1.5 text-ink md:hidden">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-line px-5 pb-5 md:hidden">
            <nav className="flex flex-col gap-4 pt-4">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="text-sm font-medium text-ink">{l.label}</a>
              ))}
              <Link to="/login" className="text-sm font-medium text-ink">Sign in</Link>
              <Link to="/login" className="rounded-control bg-cypress-600 px-4 py-2 text-center text-sm font-medium text-white">Start free</Link>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 md:pb-28 md:pt-24">
        <div className="grid items-center gap-14 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="max-w-lg font-display text-4xl font-semibold leading-[1.1] text-ink md:text-5xl">
              The CRM built for how Kenyan agencies actually sell property.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted">
              Leads, listings, viewings, deals and commissions in one place — priced in KES, built for WhatsApp follow-ups, and honest about what it automates and what it doesn’t.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/login" className="rounded-control bg-cypress-600 px-5 py-3 text-sm font-medium text-white hover:bg-cypress-700">
                Start free
              </Link>
              <a href="#contact" className="rounded-control border border-line px-5 py-3 text-sm font-medium text-ink hover:bg-sunk">
                Book a demo
              </a>
            </div>
            <p className="mt-4 text-xs text-faint">No credit card required to try it.</p>
          </div>
          <PipelineMock />
        </div>
      </section>

      {/* Capability strip */}
      <section className="border-y border-line bg-sunk">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-4 px-5 py-6 text-sm text-muted md:grid-cols-4">
          {CAPABILITIES.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <Check size={15} className="shrink-0 text-cypress-600" />
              <span>{c}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="max-w-md">
          <h2 className="font-display text-3xl font-semibold text-ink">From first enquiry to a closed deal</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">The same five stages your agents already work through — just with nothing falling through the cracks.</p>
        </div>
        <ol className="mt-12 space-y-0">
          {WORKFLOW.map((step, i) => (
            <li key={step.title} className="flex gap-5 border-t border-line py-6 first:border-t-0 md:gap-8">
              <span className="font-display text-2xl font-semibold text-line md:text-3xl">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-line bg-sunk">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <h2 className="max-w-md font-display text-3xl font-semibold text-ink">Everything an agency runs on, nothing it doesn’t</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-panel border border-line bg-surface p-6">
                <f.icon size={20} className="text-cypress-600" strokeWidth={2} />
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <h2 className="font-display text-3xl font-semibold text-ink">Priced per agent, in KES</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">Start on Starter and move up as your team grows. No setup fees.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`flex flex-col rounded-panel border p-7 ${p.highlight ? 'border-brass bg-surface shadow-card' : 'border-line bg-surface'}`}
            >
              {p.highlight && (
                <span className="mb-3 inline-flex w-fit items-center rounded-full bg-[#fbf3e7] px-2.5 py-1 text-xs font-medium text-brass">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-xl font-semibold text-ink">{p.name}</h3>
              <p className="mt-3 text-sm text-muted">{p.body}</p>
              <p className="mt-5">
                <span className="font-display text-3xl font-semibold text-ink">{p.price}</span>
                <span className="text-sm text-muted">{p.unit}</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted">
                    <Check size={15} className="mt-0.5 shrink-0 text-cypress-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/login"
                className={`mt-7 rounded-control px-4 py-2.5 text-center text-sm font-medium ${
                  p.highlight ? 'bg-cypress-600 text-white hover:bg-cypress-700' : 'border border-line text-ink hover:bg-sunk'
                }`}
              >
                Start free
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-line bg-sunk">
        <div className="mx-auto max-w-3xl px-5 py-20 md:py-28">
          <h2 className="font-display text-3xl font-semibold text-ink">Questions agencies actually ask</h2>
          <div className="mt-8">
            {FAQS.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="contact" className="bg-[#1d2a22]">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center md:py-28">
          <h2 className="font-display text-3xl font-semibold text-white md:text-4xl">Give your team one place to run the pipeline</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-cypress-100">
            Try Kaya free, or talk to us first — we’ll walk your team through it over a call.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/login" className="rounded-control bg-white px-5 py-3 text-sm font-medium text-ink hover:bg-cypress-50">
              Start free
            </Link>
            <a
              href="mailto:hello@kaya.co.ke?subject=Book%20a%20Kaya%20demo"
              className="rounded-control border border-white/30 px-5 py-3 text-sm font-medium text-white hover:bg-white/10"
            >
              Book a demo
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-10 text-sm text-faint md:flex-row md:justify-between">
          <Logo />
          <nav className="flex items-center gap-6">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-muted">{l.label}</a>
            ))}
            <a href="mailto:hello@kaya.co.ke" className="hover:text-muted">hello@kaya.co.ke</a>
          </nav>
          <p>&copy; {new Date().getFullYear()} Kaya. Built for Kenya.</p>
        </div>
      </footer>
    </div>
  );
}
