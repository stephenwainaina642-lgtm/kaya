import { LANGUAGES, type Language } from '@kaya/shared';

/** Anything unknown (old rows, hand-edited data) falls back to English rather than failing a send. */
export const langOf = (v: string | null | undefined): Language => ((LANGUAGES as readonly string[]).includes(v ?? '') ? (v as Language) : 'en');

const LOCALE: Record<Language, string> = { en: 'en-GB', sw: 'sw', fr: 'fr' };

/** "2026-03" as month and year in the reader's language. */
export function monthName(period: string, lang: Language): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  try { return new Intl.DateTimeFormat(LOCALE[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))); } catch { return period; }
}

/** Opens a portal link in the person's language. English links stay clean. */
export const linkIn = (url: string, lang: Language) => (lang === 'en' ? url : `${url}?lng=${lang}`);

export const money = (n: number, currency: string | null | undefined, lang: Language) => `${currency ?? 'KES'} ${n.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US')}`;

export function reminderSms(lang: Language, d: { name: string; property: string; owed: string; months: number; monthLabel: string; url: string; agency: string }): string {
  const when = d.months === 1 ? d.monthLabel : null;
  switch (lang) {
    case 'sw': return `Habari ${d.name}, kodi yako ya ${d.property} imechelewa: ${d.owed} (${when ?? `miezi ${d.months}`}). Angalia salio lako: ${d.url} - ${d.agency}`;
    case 'fr': return `Bonjour ${d.name}, votre loyer pour ${d.property} est en retard : ${d.owed} (${when ?? `${d.months} mois`}). Consultez votre solde : ${d.url} - ${d.agency}`;
    default: return `Hello ${d.name}, your rent for ${d.property} is overdue: ${d.owed} (${when ?? `${d.months} months`}). See your balance: ${d.url} - ${d.agency}`;
  }
}

export function payoutSms(lang: Language, d: { agency: string; month: string; net: string; url: string }): string {
  switch (lang) {
    case 'sw': return `${d.agency}: taarifa yako ya ${d.month} iko tayari. Uliyolipwa: ${d.net}. Tazama: ${d.url}`;
    case 'fr': return `${d.agency} : votre relevé de ${d.month} est prêt. Versé à vous : ${d.net}. Consultez-le : ${d.url}`;
    default: return `${d.agency}: your ${d.month} statement is ready. Paid to you: ${d.net}. View it: ${d.url}`;
  }
}

export interface StatementWords {
  subject: (agency: string, month: string) => string;
  collected: string; fee: string; repairs: string; paid: string; byProperty: string;
  hi: (name: string) => string; intro: (month: string) => string; due: string; of: string;
  see: string; seeAll: string; private: string; label: string;
}

export const STATEMENT_WORDS: Record<Language, StatementWords> = {
  en: {
    subject: (a, m) => `Your rent statement for ${m}: ${a}`, collected: 'Rent collected', fee: 'Management fee and tax', repairs: 'Repairs', paid: 'Paid to you', byProperty: 'By property',
    hi: (n) => `Hi ${n}`, intro: (m) => `here is how ${m} went.`, due: 'due', of: 'of', see: 'See everything, including past months and repairs, here:', seeAll: 'See all your statements',
    private: 'This link is private to you. Please do not share it.', label: 'Rent statement',
  },
  sw: {
    subject: (a, m) => `Taarifa yako ya kodi ya ${m}: ${a}`, collected: 'Kodi iliyokusanywa', fee: 'Ada ya usimamizi na kodi', repairs: 'Ukarabati', paid: 'Uliyolipwa', byProperty: 'Kwa kila mali',
    hi: (n) => `Habari ${n}`, intro: (m) => `hivi ndivyo ${m} ulivyokwenda.`, due: 'inayodaiwa', of: 'kati ya', see: 'Tazama kila kitu, pamoja na miezi iliyopita na ukarabati, hapa:', seeAll: 'Tazama taarifa zako zote',
    private: 'Kiungo hiki ni chako peke yako. Tafadhali usikishiriki.', label: 'Taarifa ya kodi',
  },
  fr: {
    subject: (a, m) => `Votre relevé de loyers de ${m} : ${a}`, collected: 'Loyers encaissés', fee: 'Frais de gestion et taxes', repairs: 'Réparations', paid: 'Versé à vous', byProperty: 'Par bien',
    hi: (n) => `Bonjour ${n}`, intro: (m) => `voici comment s'est passé ${m}.`, due: 'dû', of: 'sur', see: 'Retrouvez tout, y compris les mois passés et les réparations, ici :', seeAll: 'Voir tous vos relevés',
    private: "Ce lien est privé. Merci de ne pas le partager.", label: 'Relevé de loyers',
  },
};
