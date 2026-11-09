import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input } from './Input';

/** Keep digits only; a single leading "+" is allowed for international numbers. */
export function sanitizePhone(raw: string): string {
  const trimmed = raw.trimStart();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/\D/g, '').slice(0, 15);
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
};

export const PhoneInput = forwardRef<HTMLInputElement, Props>(({ value, onChange, ...props }, ref) => (
  <Input
    ref={ref}
    type="tel"
    inputMode="tel"
    autoComplete="tel"
    maxLength={16}
    pattern="\+?[0-9]{7,15}"
    title="Digits only, 7 to 15 numbers. Start with + for an international number."
    value={value}
    onChange={(e) => onChange(sanitizePhone(e.target.value))}
    onKeyDown={(e) => {
      if (e.ctrlKey || e.metaKey || e.key.length > 1) return;
      if (!/[0-9]/.test(e.key) && !(e.key === '+' && value === '')) e.preventDefault();
    }}
    {...props}
  />
));
PhoneInput.displayName = 'PhoneInput';
