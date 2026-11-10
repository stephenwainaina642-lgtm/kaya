import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Phone, MessageCircle, Megaphone, Copy, Check, ExternalLink, Share2 } from 'lucide-react';
import type { PropertyDetail, PropertyNetwork as Net, InquiryLink } from '@kaya/shared';
import { formatMoney, whatsappLink } from '@kaya/shared';
import { api } from '../lib/api';
import { printListingFlyer } from '../lib/listingFlyer';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

function Contact({ phone }: { phone: string }) {
  if (!phone) return null;
  return (
    <span className="flex items-center gap-1">
      <a href={`tel:${phone}`} aria-label={`Call ${phone}`} className="rounded-control p-1.5 text-muted hover:bg-sunk hover:text-ink"><Phone size={14} /></a>
      <a href={whatsappLink(phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="rounded-control p-1.5 text-muted hover:bg-sunk hover:text-ink"><MessageCircle size={14} /></a>
    </span>
  );
}

function Row({ role, name, sub, to, phone }: { role: string; name: string; sub?: string; to?: string; phone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-xs text-faint">{role}</p>
        {to ? <Link to={to} className="block truncate text-sm font-medium text-ink hover:underline">{name}</Link> : <p className="truncate text-sm font-medium text-ink">{name}</p>}
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
      {phone && <Contact phone={phone} />}
    </div>
  );
}

/** Owner, agent, tenant and every interested buyer on one property: the whole deal room. */
export function PropertyPeople({ propertyId }: { propertyId: string }) {
  const { data } = useQuery({ queryKey: ['property-network', propertyId], queryFn: () => api.get<Net>(`/properties/${propertyId}/network`) });
  if (!data) return null;
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold text-ink">People on this property</h2>
      <div className="mt-2 divide-y divide-line">
        {data.owner && <Row role="Owner" name={data.owner.name} sub={data.owner.email ?? undefined} to={`/owners/${data.owner.id}`} phone={data.owner.whatsapp ?? data.owner.phone} />}
        {data.agent && <Row role="Listing agent" name={data.agent.name} sub={data.agent.email ?? undefined} />}
        {data.tenant && <Row role="Current tenant" name={data.tenant.name} sub={`Since ${data.tenant.since}`} to={`/clients/${data.tenant.id}`} phone={data.tenant.phone} />}
      </div>
      <div className="mt-3 border-t border-line pt-4">
        <p className="mb-1 text-sm font-medium text-ink">Interested buyers and tenants <span className="font-normal text-muted">({data.interested.length})</span></p>
        {data.interested.length === 0 ? (
          <p className="text-sm text-muted">Nobody yet. Book a viewing or open a deal on this property and they appear here.</p>
        ) : (
          <div className="divide-y divide-line">
            {data.interested.map((c) => (
              <div key={`${c.kind}${c.id}`} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link to={`/${c.kind === 'CLIENT' ? 'clients' : 'leads'}/${c.id}`} className="block truncate text-sm font-medium text-ink hover:underline">{c.name}</Link>
                  <p className="truncate text-xs text-muted">{c.detail}{c.agentName ? ` · ${c.agentName}` : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={c.stage === 'DEAL' ? 'accent' : 'neutral'}>{c.stage === 'DEAL' ? 'Deal' : 'Viewing'}</Badge>
                  <Contact phone={c.phone} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Turn a listing on for the agency's public page, copy the link, or push it to WhatsApp. */
export function AdvertiseCard({ property }: { property: PropertyDetail }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const { data: link } = useQuery({ queryKey: ['inquiry-link'], queryFn: () => api.get<InquiryLink>('/leads/inquiry-link') });
  const toggle = useMutation({
    mutationFn: (advertised: boolean) => api.post(`/properties/${property.id}/advertise`, { advertised }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['property', property.id] }); qc.invalidateQueries({ queryKey: ['properties'] }); },
  });
  const on = !!property.advertised;
  const available = property.status === 'AVAILABLE';
  const url = link ? `${window.location.origin}/listings/${link.slug}/${property.id}` : '';
  const catalogue = link ? `${window.location.origin}/listings/${link.slug}` : '';
  const message = `${property.title}, ${property.location}. ${formatMoney(property.price, property.currency)}${property.listingType === 'RENT' ? ' per month' : ''}. ${url}`;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink"><Megaphone size={16} /> Advertise</h2>
          <p className="mt-1 text-sm text-muted">
            {on ? (available ? 'Live on your public listings page.' : 'Switched on, but hidden until the property is available again.') : 'Publish to your public listings page.'}
          </p>
        </div>
        <button
          type="button" role="switch" aria-checked={on} aria-label="Advertise this property"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(!on)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-ink' : 'bg-[#cfd5dd]'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      {on && url && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <input readOnly value={url} onFocus={(e) => e.target.select()} className="w-full rounded-control border border-line bg-sunk px-3 py-2 text-sm text-muted" aria-label="Public link" />
            <Button type="button" variant="secondary" aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><Button type="button" variant="secondary"><Share2 size={14} /> Share on WhatsApp</Button></a>
            <a href={url} target="_blank" rel="noreferrer"><Button type="button" variant="secondary"><ExternalLink size={14} /> Preview</Button></a>
            {available && link && (
              <Button type="button" variant="secondary" onClick={() => printListingFlyer(link.slug, property.id).catch((e) => alert(e.message))}>
                <Printer size={14} /> Print flyer
              </Button>
            )}
          </div>
          <a href={catalogue} target="_blank" rel="noreferrer" className="inline-block pt-1 text-sm text-accent hover:underline">Your full listings page</a>
        </div>
      )}
    </Card>
  );
}
