export function normalizeKenyanPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+254')) return digits.slice(1);
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') || digits.startsWith('1')) return `254${digits}`;
  return digits;
}

export function whatsappLink(phone: string, message?: string): string {
  const normalized = normalizeKenyanPhone(phone);
  const base = `https://wa.me/${normalized}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export type WhatsAppMessageContext =
  | { kind: 'PROPERTY_SUGGESTION'; contactName: string; propertyTitle: string; location: string; price: string; agentName: string }
  | { kind: 'SHORTLIST_LINK'; contactName: string; url: string; agentName: string }
  | { kind: 'VIEWING_REMINDER'; contactName: string; propertyTitle: string; whenText: string; agentName: string }
  | { kind: 'GENERIC'; contactName: string; body: string };

export function buildWhatsAppMessage(ctx: WhatsAppMessageContext): string {
  switch (ctx.kind) {
    case 'PROPERTY_SUGGESTION':
      return `Hi ${ctx.contactName}, I found a property that might interest you: ${ctx.propertyTitle} in ${ctx.location}, listed at ${ctx.price}. Let me know if you'd like to view it.\n\n${ctx.agentName}`;
    case 'SHORTLIST_LINK':
      return `Hi ${ctx.contactName}, here is a shortlist of properties curated for you: ${ctx.url}\n\n${ctx.agentName}`;
    case 'VIEWING_REMINDER':
      return `Hi ${ctx.contactName}, this is a reminder of your viewing for ${ctx.propertyTitle} ${ctx.whenText}. Looking forward to seeing you.\n\n${ctx.agentName}`;
    case 'GENERIC':
      return `Hi ${ctx.contactName}, ${ctx.body}`;
  }
}
