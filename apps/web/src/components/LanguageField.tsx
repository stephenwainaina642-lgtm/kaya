import { SUPPORTED_LANGUAGES } from '../i18n/config';
import { Field } from './ui/Field';
import { Select } from './ui/Select';

export type Lang = 'en' | 'sw' | 'fr';

/** Which language texts, emails and portal links to this person are written in. */
export function LanguageField({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <Field label="Language for texts and emails">
      <Select value={value} onChange={(e) => onChange(e.target.value as Lang)}>
        {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </Select>
      <p className="mt-1 text-xs text-muted">Reminders, statements and their private link open in this language.</p>
    </Field>
  );
}
