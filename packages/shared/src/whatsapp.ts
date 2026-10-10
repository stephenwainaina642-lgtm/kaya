function normalizeKenyanPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.startsWith('254')) return digits;
  return `254${digits}`;
}

export function whatsappLink(phone: string, message?: string): string {
  const normalized = normalizeKenyanPhone(phone);
  const base = `https://wa.me/${normalized}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

interface PropertySuggestionContext {
  kind: 'PROPERTY_SUGGESTION';
  contactName: string;
  propertyTitle: string;
  propertyPrice: string;
  propertyLocation: string;
  agentName: string;
}

interface ShortlistLinkContext {
  kind: 'SHORTLIST_LINK';
  contactName: string;
  shortlistUrl: string;
  agentName: string;
}

export type WhatsAppMessageContext = PropertySuggestionContext | ShortlistLinkContext;

export function buildWhatsAppMessage(ctx: WhatsAppMessageContext): string {
  switch (ctx.kind) {
    case 'PROPERTY_SUGGESTION':
      return `Hi ${ctx.contactName}, I think you'll like this: ${ctx.propertyTitle} in ${ctx.propertyLocation}, ${ctx.propertyPrice}. Let me know if you'd like to view it!\n\n- ${ctx.agentName}`;
    case 'SHORTLIST_LINK':
      return `Hi ${ctx.contactName}, here's a shortlist of properties I've put together for you: ${ctx.shortlistUrl}\n\n- ${ctx.agentName}`;
  }
}
