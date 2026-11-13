import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight, BellRing, Building2, Check, FileText, Handshake, KeyRound, Languages, Lock, Menu, MessageCircle,
  Minus, Mic, Plus, Search, ShieldCheck, Smartphone, Users, Wrench, X, type LucideIcon,
} from 'lucide-react';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

const NAV_LINKS = [
  { href: '#features', labelKey: 'landing.nav.features' },
  { href: '#portals', label: 'Portals' },
  { href: '#security', label: 'Security' },
  { href: '#pricing', labelKey: 'landing.nav.pricing' },
  { href: '#faq', labelKey: 'landing.nav.faq' },
];

const CAPABILITIES = ['isolation', 'currency', 'whatsapp', 'roles'] as const;

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: KeyRound, title: 'Rent roll that collects itself', body: 'Rent is raised every month for every active lease. Record M-Pesa, bank or cash, match a pasted M-Pesa statement in one go, and see who is late at a glance.' },
  { icon: BellRing, title: 'Automatic rent reminders', body: 'Late tenants get a polite SMS every morning in their own language. You switch it on once and see exactly who was texted.' },
  { icon: FileText, title: 'Landlord statements and payouts', body: 'Collected rent, less your fee and any tax withheld, as a PDF statement. Email it, text the payout, or let Kaya send every landlord theirs on the day you choose.' },
  { icon: Handshake, title: 'Deals and commissions', body: 'A pipeline for every sale or letting, with offers, counter-offers and the commission split per agent.' },
  { icon: Building2, title: 'Matching, with the reasons', body: 'Active listings are ranked against what a lead asked for, with a visible score and the reasons behind it.' },
  { icon: MessageCircle, title: 'WhatsApp in one tap', body: 'Message or call a lead, client, tenant or landlord straight from the list. Kaya drafts the words; you press send.' },
  { icon: Wrench, title: 'Repairs, reported by voice', body: 'Tenants report a fault from a link, by typing or speaking. The caretaker sees it, updates it, and the tenant sees the progress.' },
  { icon: KeyRound, title: 'Move-in and move-out checklists', body: 'Keys, meter readings, condition photos, inspection and deposit. Tick them off per lease and keep a dated record.' },
  { icon: Users, title: 'Your whole team, with the right access', body: 'Admins, managers, agents, viewers and on-site caretakers each see only what their job needs.' },
];

const PLANS = [
  {
    name: 'Starter', price: 'KES 4,900', unit: '/ agent / month', body: 'For a solo agent or a small team getting organised.',
    features: ['Up to 3 users', 'Leads, clients and properties', 'Viewings, follow-ups and tasks', 'WhatsApp-ready messaging', 'Basic reports'], highlight: false,
  },
  {
    name: 'Growth', price: 'KES 9,900', unit: '/ agent / month', body: 'For an agency that wants sales and rent in one place.',
    features: [
      'Everything in Starter', 'Deal pipeline and commissions', 'Property matching', 'Client shortlists with viewing requests and e-signing',
      'Rent management, arrears and landlord statements', 'Tenant and landlord portals', 'Automatic SMS rent reminders', 'AI lead scoring and drafted messages', 'Automation rules and follow-up sequences', 'Priority support',
    ], highlight: true,
  },
  {
    name: 'Pro', price: 'KES 16,900', unit: '/ agent / month', body: 'For larger agencies and developers running several branches.',
    features: ['Everything in Growth', 'Multiple branches under one account', 'Full audit log', 'Advanced analytics and agent leaderboards', 'Custom reporting', 'Dedicated onboarding'], highlight: false,
  },
];

const FAQS = [
  { q: 'Is my agency’s data kept separate from other agencies?', a: 'Yes. Separation is enforced inside the database, not only in the app, so one agency can never read another’s listings, clients, tenants or money.' },
  { q: 'Does Kaya collect rent through M-Pesa?', a: 'You can record M-Pesa payments by hand, paste in an M-Pesa statement and let Kaya match it to tenants, and let tenants pay by M-Pesa prompt once you connect your own Daraja account in settings. Your agency’s keys are stored encrypted.' },
  { q: 'Does Kaya send messages without me?', a: 'Only the ones you switch on. Rent reminders and landlord payout texts go out automatically once you enable them, and each one is logged. Everything else is drafted for you to review and send yourself.' },
  { q: 'Which languages does it speak?', a: 'Tenant, landlord and public listing pages, and the SMS and emails they receive, work in English, Kiswahili and Français, set per person. The staff app is in English for now.' },
  { q: 'Can I bring my existing listings, leases and contacts?', a: 'Yes. Import them from a spreadsheet (CSV), and export your rent roll and leases back out whenever you like. Your data stays yours.' },
  { q: 'Does it work on a phone?', a: 'Yes. Agents work from viewings, not desks, so every screen is built to work on a phone as well as a laptop.' },
  { q: 'Can I change plans or cancel later?', a: 'Yes, at any time.' },
];

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Kaya home">
      <span className="flex h-8 w-8 items-center justify-center rounded-control bg-accent text-sm font-semibold text-white">K</span>
      <span className={`text-lg font-semibold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>Kaya</span>
    </Link>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-accent">{children}</p>;
}

/** A product picture built from real layout, so it stays sharp on every screen. Figures are sample data. */
function HeroPicture() {
  const bars = [38, 52, 47, 63, 58, 74, 69, 86];
  return (
    <div className="relative mx-auto w-full max-w-[34rem]" aria-hidden>
      <div className="overflow-hidden rounded-panel border border-line bg-white shadow-lift sm:w-[78%]">
        <div className="flex items-center gap-1.5 border-b border-line bg-sunk px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line" /><span className="h-2.5 w-2.5 rounded-full bg-line" /><span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="ml-3 text-[0.7rem] text-faint">Dashboard · Savanna Ridge Realty</span>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-3 gap-3">
            {[['Collected', 'KES 1.84M', 'of 2.10M'], ['Active leads', '24', '6 to chase'], ['Open deals', '9', 'KES 142M']].map(([l, v, s]) => (
              <div key={l} className="rounded-control border border-line p-3">
                <p className="text-[0.65rem] uppercase tracking-wide text-faint">{l}</p>
                <p className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-ink">{v}</p>
                <p className="text-[0.68rem] text-muted">{s}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-control border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="font-medium text-ink">Rent, last 8 months</span><span className="text-accent-deep">88% this month</span></div>
            <div className="flex h-24 items-end gap-2">
              {bars.map((h, i) => <div key={i} className={`flex-1 rounded-t ${i === bars.length - 1 ? 'bg-accent' : 'bg-accent-soft'}`} style={{ height: `${h}%` }} />)}
            </div>
          </div>
          <ul className="mt-4 divide-y divide-line text-xs">
            {[['Unit 4B', 'rent 6 days late', 'Late', 'bg-danger'], ['Unit 2A', 'lease ends in 21 days', 'Renew', 'bg-warn']].map(([a, b, , tone]) => (
              <li key={a} className="flex items-center gap-2 py-2.5"><span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} /><span className="truncate"><span className="font-medium text-ink">{a}</span> <span className="text-muted">· {b}</span></span></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="absolute -bottom-6 right-0 hidden w-40 overflow-hidden rounded-[1.4rem] border-[5px] border-ink bg-white shadow-lift sm:block">
        <div className="bg-accent px-3 pb-3 pt-4 text-white"><p className="text-[0.6rem] opacity-80">Your rent</p><p className="text-sm font-semibold">Unit 4B · Kilimani</p></div>
        <div className="space-y-2 p-3 text-[0.65rem]">
          <div className="rounded-control bg-[#fbefed] p-2"><p className="text-muted">Balance due</p><p className="text-sm font-semibold text-danger">KES 45,000</p></div>
          <div className="flex items-center justify-between"><span className="text-muted">Oct 2026</span><span className="font-medium text-ok">Paid</span></div>
          <div className="flex items-center justify-between"><span className="text-muted">Sep 2026</span><span className="font-medium text-ok">Paid</span></div>
          <div className="rounded-control bg-ink py-1.5 text-center font-medium text-white">Pay by M-Pesa</div>
        </div>
      </div>
      <p className="mt-4 text-center text-[0.65rem] text-faint sm:mt-8 sm:w-[76%]">Sample data</p>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 py-5 text-left">
        <span className="text-base font-medium text-ink">{q}</span>
        <span className="shrink-0 text-faint">{open ? <Minus size={18} /> : <Plus size={18} />}</span>
      </button>
      {open && <p className="-mt-1 mb-5 max-w-2xl text-sm leading-relaxed text-muted">{a}</p>}
    </div>
  );
}

export function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useTranslation();
  const label = (l: (typeof NAV_LINKS)[number]) => ('labelKey' in l && l.labelKey ? t(l.labelKey) : (l as { label: string }).label);

  return (
    <div className="bg-white text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Logo />
          <nav className="hidden items-center gap-8 lg:flex">
            {NAV_LINKS.map((l) => <a key={l.href} href={l.href} className="text-sm font-medium text-muted transition hover:text-ink">{label(l)}</a>)}
          </nav>
          <div className="hidden items-center gap-4 lg:flex">
            <LanguageSwitcher />
            <Link to="/login" className="text-sm font-medium text-muted hover:text-ink">{t('landing.nav.signIn')}</Link>
            <Link to="/signup" className="rounded-control bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink/90">{t('landing.nav.startFree')}</Link>
          </div>
          <button onClick={() => setMenuOpen((v) => !v)} className="p-1.5 text-ink lg:hidden" aria-label="Menu" aria-expanded={menuOpen}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
        {menuOpen && (
          <div className="border-t border-line px-5 pb-5 lg:hidden">
            <nav className="flex flex-col gap-4 pt-4">
              {NAV_LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="text-sm font-medium text-ink">{label(l)}</a>)}
              <Link to="/login" className="text-sm font-medium text-ink">{t('landing.nav.signIn')}</Link>
              <Link to="/signup" className="rounded-control bg-ink px-4 py-2.5 text-center text-sm font-medium text-white">{t('landing.nav.startFree')}</Link>
              <LanguageSwitcher />
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-24 pt-14 md:pb-32 md:pt-24">
        <div className="grid items-center gap-16 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-sunk px-3 py-1 text-xs font-medium text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Built for Kenyan agents and landlords
            </span>
            <h1 className="mt-6 max-w-xl text-[2.35rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.1rem]">{t('landing.hero.headline')}</h1>
            <p className="mt-6 max-w-lg text-[1.05rem] leading-relaxed text-muted">{t('landing.hero.subhead')}</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/signup" className="group inline-flex items-center gap-2 rounded-control bg-accent px-6 py-3.5 text-sm font-medium text-white transition hover:bg-accent-deep">
                {t('landing.hero.startFree')} <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
              </Link>
              <a href="#contact" className="rounded-control border border-line px-6 py-3.5 text-sm font-medium text-ink transition hover:bg-sunk">{t('landing.hero.bookDemo')}</a>
            </div>
            <p className="mt-4 text-xs text-faint">{t('landing.hero.noCard')}</p>
          </div>
          <HeroPicture />
        </div>
      </section>

      <section className="border-y border-line bg-sunk">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-4 px-5 py-6 text-sm text-muted md:grid-cols-4">
          {CAPABILITIES.map((c) => <div key={c} className="flex items-center gap-2"><Check size={15} className="shrink-0 text-accent" /><span>{t(`landing.capabilities.${c}`)}</span></div>)}
        </div>
      </section>

      {/* Two businesses */}
      <section className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="max-w-2xl"><Eyebrow>One system</Eyebrow><h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Selling and renting, without two sets of spreadsheets</h2>
          <p className="mt-4 leading-relaxed text-muted">Most agencies chase buyers in one tool and tenants in another. Kaya keeps both, with the same contacts, properties and team.</p></div>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {[
            { tag: 'Sales', title: 'From first enquiry to a closed deal', points: ['Every enquiry lands with its source and budget', 'Listings ranked against what the client asked for', 'Viewings, offers and counter-offers in one pipeline', 'Commission split per agent, marked paid'] },
            { tag: 'Rent', title: 'From lease to landlord payout', points: ['Rent raised every month for every active lease', 'M-Pesa, bank and cash recorded against the right month', 'Arrears chased by SMS, in the tenant’s language', 'Landlord statement and payout, sent on your schedule'] },
          ].map((c) => (
            <div key={c.tag} className="rounded-panel border border-line p-8 transition hover:shadow-card">
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-deep">{c.tag}</span>
              <h3 className="mt-5 text-xl font-semibold">{c.title}</h3>
              <ul className="mt-5 space-y-3">{c.points.map((p) => <li key={p} className="flex items-start gap-2.5 text-sm text-muted"><Check size={16} className="mt-0.5 shrink-0 text-accent" />{p}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-y border-line bg-sunk">
        <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
          <div className="max-w-2xl"><Eyebrow>Features</Eyebrow><h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Everything an agency runs on, nothing it doesn’t</h2></div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-panel border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-card">
                <span className="flex h-10 w-10 items-center justify-center rounded-control bg-accent-soft text-accent"><Icon size={19} /></span>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portals */}
      <section id="portals" className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <Eyebrow>Portals</Eyebrow>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Tenants and landlords see their own side, on their phone</h2>
            <p className="mt-4 leading-relaxed text-muted">No logins to forget. You share a private link, and they see what matters to them.</p>
            <dl className="mt-8 space-y-6">
              {[
                [Smartphone, 'For tenants', 'Rent history, what is pending, receipts, and a place to report a repair by typing or speaking.'],
                [Building2, 'For landlords', 'Occupancy, rent collected against rent expected, who owes what, and every monthly statement as a PDF.'],
                [Languages, 'In their language', 'English, Kiswahili or Français, set per person, including the SMS and emails they get.'],
              ].map(([Icon, title, body]) => {
                const I = Icon as LucideIcon;
                return (
                  <div key={title as string} className="flex gap-4">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent"><I size={17} /></span>
                    <div><dt className="font-medium">{title as string}</dt><dd className="mt-1 text-sm leading-relaxed text-muted">{body as string}</dd></div>
                  </div>
                );
              })}
            </dl>
          </div>
          <div className="relative rounded-panel border border-line bg-sunk p-6 sm:p-8" aria-hidden>
            <div className="rounded-panel border border-line bg-white p-5 shadow-card">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold">Landlord summary · October</p><span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent-deep">Kiswahili · Français · English</span></div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                {[['Occupancy', '92%'], ['Collected', 'KES 612k'], ['Your payout', 'KES 551k']].map(([l, v]) => <div key={l} className="rounded-control border border-line p-3"><p className="text-faint">{l}</p><p className="mt-1 text-base font-semibold tabular-nums">{v}</p></div>)}
              </div>
              <div className="mt-4 flex h-20 items-end gap-1.5">{[40, 55, 50, 68, 62, 80, 88].map((h, i) => <div key={i} className={`flex-1 rounded-t ${i === 6 ? 'bg-accent' : 'bg-accent-soft'}`} style={{ height: `${h}%` }} />)}</div>
              <div className="mt-4 flex items-center justify-between rounded-control border border-line px-3 py-2 text-xs"><span className="flex items-center gap-2 text-muted"><FileText size={14} /> Statement, October 2026</span><span className="font-medium text-accent">Download PDF</span></div>
            </div>
            <p className="mt-3 text-center text-[0.65rem] text-faint">Sample data</p>
          </div>
        </div>
      </section>

      {/* Quick tools */}
      <section className="border-y border-line bg-sunk">
        <div className="mx-auto grid max-w-6xl gap-px px-5 py-16 sm:grid-cols-3">
          {[
            [Search, 'Find anything in a keystroke', 'Press Ctrl K to jump to any screen or find a person or property by name or phone.'],
            [Mic, 'Speak instead of type', 'Report repairs and fill in notes by voice, in English, Kiswahili or Français, on browsers that support it.'],
            [MessageCircle, 'Reach people in one tap', 'WhatsApp and call buttons sit next to every phone number in your lists.'],
          ].map(([Icon, title, body]) => { const I = Icon as LucideIcon; return (
            <div key={title as string} className="px-2 py-4 sm:px-6"><I size={20} className="text-accent" /><h3 className="mt-4 font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{body as string}</p></div>
          ); })}
        </div>
      </section>

      {/* Security */}
      <section id="security" className="mx-auto max-w-6xl px-5 py-24 md:py-32">
        <div className="max-w-2xl"><Eyebrow>Security</Eyebrow><h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Tenants’ money and details deserve real protection</h2></div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            [ShieldCheck, 'Isolated by the database', 'Each agency’s data is separated at the database level, so a mistake in one screen cannot expose another agency’s records.'],
            [Lock, 'Strong sign-in', 'Passwords are stored with argon2id, accounts lock after repeated failed attempts, and password resets use single-use expiring links.'],
            [Users, 'The right access for each role', 'Rent and money screens are for managers and admins. Caretakers only see repairs. Money changes are written to an audit trail.'],
          ].map(([Icon, title, body]) => { const I = Icon as LucideIcon; return (
            <div key={title as string} className="rounded-panel border border-line p-6"><I size={20} className="text-accent" /><h3 className="mt-4 font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{body as string}</p></div>
          ); })}
        </div>
        <p className="mt-6 text-sm text-muted">Your agency’s M-Pesa keys are encrypted at rest, and tenant and landlord links can be revoked at any time.</p>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-line bg-sunk">
        <div className="mx-auto max-w-6xl px-5 py-24 md:py-32">
          <div className="max-w-2xl"><Eyebrow>Pricing</Eyebrow><h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Priced per agent, in your currency</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">Start on Starter and move up as your team grows. No setup fees. Shown in KES; pick your own currency when you sign up.</p></div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.name} className={`relative flex flex-col rounded-panel border bg-white p-7 ${p.highlight ? 'border-accent shadow-lift md:-translate-y-2' : 'border-line'}`}>
                {p.highlight && <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white">Most popular</span>}
                <h3 className="text-xl font-semibold">{p.name}</h3>
                <p className="mt-2 text-sm text-muted">{p.body}</p>
                <p className="mt-5"><span className="text-3xl font-semibold tracking-tight tabular-nums">{p.price}</span><span className="text-sm text-muted"> {p.unit}</span></p>
                <ul className="mt-6 flex-1 space-y-3">{p.features.map((f) => <li key={f} className="flex items-start gap-2 text-sm text-muted"><Check size={15} className="mt-0.5 shrink-0 text-accent" /><span>{f}</span></li>)}</ul>
                <Link to="/signup" className={`mt-7 rounded-control px-4 py-3 text-center text-sm font-medium transition ${p.highlight ? 'bg-accent text-white hover:bg-accent-deep' : 'border border-line text-ink hover:bg-sunk'}`}>Start free</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-5 py-24 md:py-32">
        <Eyebrow>FAQ</Eyebrow><h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Questions agencies actually ask</h2>
        <div className="mt-8 border-t border-line">{FAQS.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}</div>
      </section>

      {/* Closing */}
      <section id="contact" className="bg-ink">
        <div className="mx-auto max-w-3xl px-5 py-24 text-center md:py-28">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{t('landing.closingCta.headline')}</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/70">{t('landing.closingCta.subhead')}</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup" className="rounded-control bg-white px-6 py-3.5 text-sm font-medium text-ink transition hover:bg-sunk">{t('landing.closingCta.startFree')}</Link>
            <a href="mailto:hello@kaya.co.ke?subject=Book%20a%20Kaya%20demo" className="rounded-control border border-white/30 px-6 py-3.5 text-sm font-medium text-white transition hover:bg-white/10">{t('landing.closingCta.bookDemo')}</a>
          </div>
        </div>
      </section>

      <footer className="bg-ink">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 border-t border-white/10 px-5 py-10 text-sm text-white/60 md:flex-row md:justify-between">
          <Logo dark />
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {NAV_LINKS.map((l) => <a key={l.href} href={l.href} className="hover:text-white">{label(l)}</a>)}
            <a href="mailto:hello@kaya.co.ke" className="hover:text-white">hello@kaya.co.ke</a>
          </nav>
          <p>&copy; {new Date().getFullYear()} Kaya. Built for Kenya.</p>
        </div>
      </footer>
    </div>
  );
}
