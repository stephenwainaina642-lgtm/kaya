import { MessageCircle, Phone } from 'lucide-react';
import { whatsappLink } from '@kaya/shared';

/**
 * One-tap WhatsApp and call buttons that sit beside a phone number, so an agent can reach
 * someone straight from a list without opening their record first.
 */
export function ContactActions({ phone, whatsapp, name, size = 32 }: { phone: string; whatsapp?: string | null; name?: string; size?: number }) {
  const first = name?.split(' ')[0];
  const box = { width: size, height: size };
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <a href={whatsappLink(whatsapp ?? phone, first ? `Hi ${first}, ` : undefined)} target="_blank" rel="noreferrer" style={box}
        aria-label={`WhatsApp ${name ?? phone}`} title="WhatsApp"
        className="flex items-center justify-center rounded-full bg-sunk text-ink ring-1 ring-inset ring-line transition hover:bg-accent-soft hover:text-accent-deep hover:ring-[#d3defa]">
        <MessageCircle size={size * 0.5} />
      </a>
      <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} style={box} aria-label={`Call ${name ?? phone}`} title="Call"
        className="flex items-center justify-center rounded-full bg-sunk text-ink ring-1 ring-inset ring-line transition hover:bg-line/60">
        <Phone size={size * 0.46} />
      </a>
    </span>
  );
}
