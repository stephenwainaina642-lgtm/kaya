import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../i18n/config';

/** A plain, undecorated <select> rather than a custom dropdown — this
 * shows up on public pages (marketing, login, signup) before a visitor
 * has any reason to trust custom JS widgets, so native select behavior
 * (keyboard, screen reader, mobile) matters more than visual polish. */
export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { i18n } = useTranslation();
  return (
    <label className={`inline-flex items-center gap-1.5 text-sm ${dark ? 'text-white/70' : 'text-muted'}`}>
      <Globe size={15} />
      <select
        value={i18n.resolvedLanguage}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className={`cursor-pointer appearance-none rounded-control border-0 bg-transparent py-1 pr-1 text-sm font-medium focus:outline-none ${
          dark ? 'text-white' : 'text-ink'
        }`}
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="text-ink">
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
