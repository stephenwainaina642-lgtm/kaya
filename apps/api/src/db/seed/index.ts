/* eslint-disable no-console */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { systemDb, closeSystemPool } from '../system';
import {
  organizations, users, owners, properties, propertyImages, propertyFeatures,
  leads, clients, requirements, dealStages, deals, offers, commissions,
  viewings, viewingFeedback, followUps, tasks, communications, activities,
  clientShortlists, shortlistItems, platformAdmins,
} from '../schema';
import { hashPassword } from '../../lib/password';
import { inOrder } from '../../lib/in-order';
import { calculateCommission } from '@kaya/shared';

const DEMO_PASSWORD = 'Kaya!Demo2026';

const TENANT_TABLES = [
  'commissions', 'offers', 'viewing_feedback', 'viewings', 'deals', 'deal_stages',
  'shortlist_items', 'client_shortlists', 'client_property_matches', 'property_features',
  'property_images', 'properties', 'owners', 'documents', 'communications', 'activities',
  'follow_ups', 'tasks', 'requirements', 'audit_logs', 'refresh_tokens', 'clients', 'leads',
  'users', 'organizations', 'platform_admins',
];

async function resetDb() {
  await systemDb.execute(sql.raw(`TRUNCATE TABLE ${TENANT_TABLES.join(', ')} RESTART IDENTITY CASCADE`));
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}

async function seedSavannaRidge() {
  const [org] = await systemDb
    .insert(organizations)
    .values({
      name: 'Savanna Ridge Realty',
      slug: 'savanna-ridge-realty',
      plan: 'GROWTH',
      timezone: 'Africa/Nairobi',
      currency: 'KES',
      phone: '+254700112233',
    })
    .returning();
  if (!org) throw new Error('failed to create Savanna Ridge org');

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const userSeed = [
    { name: 'Wanjiru Kamau', email: 'wanjiru@savannaridge.co.ke', role: 'ORG_ADMIN' as const, jobTitle: 'Managing Director' },
    { name: 'Brian Otieno', email: 'brian@savannaridge.co.ke', role: 'MANAGER' as const, jobTitle: 'Sales Manager' },
    { name: 'Amina Hassan', email: 'amina@savannaridge.co.ke', role: 'AGENT' as const, jobTitle: 'Senior Agent' },
    { name: 'Faith Njeri', email: 'faith@savannaridge.co.ke', role: 'AGENT' as const, jobTitle: 'Agent' },
    { name: 'Kevin Mutua', email: 'kevin@savannaridge.co.ke', role: 'AGENT' as const, jobTitle: 'Agent' },
    { name: 'Dennis Kiplagat', email: 'dennis@savannaridge.co.ke', role: 'AGENT' as const, jobTitle: 'Agent' },
    { name: 'Grace Wambui', email: 'grace@savannaridge.co.ke', role: 'VIEWER' as const, jobTitle: 'Accounts & Compliance' },
  ];

  const insertedUsers = await systemDb
    .insert(users)
    .values(userSeed.map((u) => ({ organizationId: org.id, name: u.name, email: u.email, passwordHash, role: u.role, jobTitle: u.jobTitle, phone: '+2547' + Math.floor(10000000 + Math.random() * 89999999) })))
    .returning();

  const byEmail = Object.fromEntries(insertedUsers.map((u) => [u.email, u]));
  const admin = byEmail['wanjiru@savannaridge.co.ke']!;
  const manager = byEmail['brian@savannaridge.co.ke']!;
  const amina = byEmail['amina@savannaridge.co.ke']!;
  const faith = byEmail['faith@savannaridge.co.ke']!;
  const kevin = byEmail['kevin@savannaridge.co.ke']!;
  const dennis = byEmail['dennis@savannaridge.co.ke']!;

  // Deal stages
  const DEFAULT_STAGES = [
    { key: 'NEW', name: 'New', position: 0, probability: 10, isWon: false, isLost: false },
    { key: 'QUALIFYING', name: 'Qualifying', position: 1, probability: 25, isWon: false, isLost: false },
    { key: 'NEGOTIATION', name: 'Negotiation', position: 2, probability: 50, isWon: false, isLost: false },
    { key: 'OFFER', name: 'Offer Made', position: 3, probability: 70, isWon: false, isLost: false },
    { key: 'CLOSING', name: 'Closing', position: 4, probability: 90, isWon: false, isLost: false },
    { key: 'WON', name: 'Won', position: 5, probability: 100, isWon: true, isLost: false },
    { key: 'LOST', name: 'Lost', position: 6, probability: 0, isWon: false, isLost: true },
  ];
  const stages = await systemDb.insert(dealStages).values(DEFAULT_STAGES.map((s) => ({ organizationId: org.id, ...s }))).returning();
  const stageByKey = Object.fromEntries(stages.map((s) => [s.key, s]));

  // Owners
  const ownerSeed = [
    { fullName: 'Peter Macharia', phone: '+254722334455', email: 'peter.macharia@example.com', commissionArrangement: 'PERCENTAGE' as const, commissionRate: 5 },
    { fullName: 'Susan Chebet', phone: '+254733445566', email: 'susan.chebet@example.com', commissionArrangement: 'PERCENTAGE' as const, commissionRate: 6 },
    { companyName: 'Riverview Properties Ltd', fullName: null, phone: '+254744556677', email: 'info@riverviewproperties.co.ke', commissionArrangement: 'PERCENTAGE' as const, commissionRate: 5 },
    { fullName: 'David Omondi', phone: '+254755667788', email: 'david.omondi@example.com', commissionArrangement: 'FIXED' as const, commissionFixedAmount: 50000 },
    { fullName: 'Mary Wairimu', phone: '+254766778899', email: 'mary.wairimu@example.com', commissionArrangement: 'PERCENTAGE' as const, commissionRate: 5 },
    { fullName: 'Joseph Kariuki', phone: '+254777889900', email: 'joseph.kariuki@example.com', commissionArrangement: 'PERCENTAGE' as const, commissionRate: 6 },
  ];
  const insertedOwners = await systemDb
    .insert(owners)
    .values(ownerSeed.map((o) => ({ organizationId: org.id, createdById: admin.id, updatedById: admin.id, ...o })))
    .returning();

  // Properties
  const propertySeed = [
    { reference: 'SR-1001', title: 'Modern 3BR Apartment, Kilimani', listingType: 'SALE' as const, propertyType: 'APARTMENT' as const, segment: 'RESIDENTIAL' as const, price: 18500000, location: 'Kilimani', neighborhood: 'Kilimani', city: 'Nairobi', bedrooms: 3, bathrooms: 3, sizeSqm: 165, parkingSpaces: 2, furnishing: 'UNFURNISHED' as const, ownerIdx: 0, agentId: amina.id, status: 'AVAILABLE' as const },
    { reference: 'SR-1002', title: '4BR Townhouse, Lavington', listingType: 'SALE' as const, propertyType: 'TOWNHOUSE' as const, segment: 'RESIDENTIAL' as const, price: 32000000, location: 'Lavington', neighborhood: 'Lavington', city: 'Nairobi', bedrooms: 4, bathrooms: 4, sizeSqm: 280, parkingSpaces: 3, furnishing: 'UNFURNISHED' as const, ownerIdx: 1, agentId: amina.id, status: 'AVAILABLE' as const },
    { reference: 'SR-1003', title: 'Cozy 2BR Apartment, Westlands', listingType: 'RENT' as const, propertyType: 'APARTMENT' as const, segment: 'RESIDENTIAL' as const, price: 95000, location: 'Westlands', neighborhood: 'Westlands', city: 'Nairobi', bedrooms: 2, bathrooms: 2, sizeSqm: 110, parkingSpaces: 1, furnishing: 'FURNISHED' as const, ownerIdx: 2, agentId: faith.id, status: 'AVAILABLE' as const },
    { reference: 'SR-1004', title: 'Spacious 5BR Villa, Karen', listingType: 'SALE' as const, propertyType: 'VILLA' as const, segment: 'RESIDENTIAL' as const, price: 85000000, location: 'Karen', neighborhood: 'Karen', city: 'Nairobi', bedrooms: 5, bathrooms: 5, sizeSqm: 450, parkingSpaces: 4, furnishing: 'UNFURNISHED' as const, ownerIdx: 3, agentId: kevin.id, status: 'UNDER_OFFER' as const },
    { reference: 'SR-1005', title: 'Studio Apartment, Kileleshwa', listingType: 'RENT' as const, propertyType: 'APARTMENT' as const, segment: 'RESIDENTIAL' as const, price: 55000, location: 'Kileleshwa', neighborhood: 'Kileleshwa', city: 'Nairobi', bedrooms: 1, bathrooms: 1, sizeSqm: 55, parkingSpaces: 1, furnishing: 'FURNISHED' as const, ownerIdx: 4, agentId: dennis.id, status: 'AVAILABLE' as const },
    { reference: 'SR-1006', title: 'Open-Plan Office Suite, Upper Hill', listingType: 'RENT' as const, propertyType: 'OFFICE' as const, segment: 'COMMERCIAL' as const, price: 350000, location: 'Upper Hill', neighborhood: 'Upper Hill', city: 'Nairobi', bedrooms: null, bathrooms: 2, sizeSqm: 320, parkingSpaces: 6, furnishing: 'UNFURNISHED' as const, ownerIdx: 2, agentId: amina.id, status: 'AVAILABLE' as const },
    { reference: 'SR-1007', title: 'Retail Shopfront, CBD', listingType: 'RENT' as const, propertyType: 'RETAIL' as const, segment: 'COMMERCIAL' as const, price: 180000, location: 'CBD', neighborhood: 'Nairobi CBD', city: 'Nairobi', bedrooms: null, bathrooms: 1, sizeSqm: 90, parkingSpaces: 0, furnishing: 'UNFURNISHED' as const, ownerIdx: 5, agentId: faith.id, status: 'AVAILABLE' as const },
    { reference: 'SR-1008', title: '3BR Maisonette, Runda', listingType: 'SALE' as const, propertyType: 'MAISONETTE' as const, segment: 'RESIDENTIAL' as const, price: 45000000, location: 'Runda', neighborhood: 'Runda', city: 'Nairobi', bedrooms: 3, bathrooms: 4, sizeSqm: 310, parkingSpaces: 3, furnishing: 'UNFURNISHED' as const, ownerIdx: 1, agentId: kevin.id, status: 'AVAILABLE' as const },
    { reference: 'SR-1009', title: 'Half-Acre Plot, Kitengela', listingType: 'SALE' as const, propertyType: 'LAND' as const, segment: 'LAND' as const, price: 6500000, location: 'Kitengela', neighborhood: 'Kitengela', city: 'Kajiado', bedrooms: null, bathrooms: null, sizeSqm: 2023, parkingSpaces: null, furnishing: null, ownerIdx: 0, agentId: dennis.id, status: 'AVAILABLE' as const },
    { reference: 'SR-1010', title: '2BR Apartment, Kileleshwa', listingType: 'SALE' as const, propertyType: 'APARTMENT' as const, segment: 'RESIDENTIAL' as const, price: 13500000, location: 'Kileleshwa', neighborhood: 'Kileleshwa', city: 'Nairobi', bedrooms: 2, bathrooms: 2, sizeSqm: 120, parkingSpaces: 1, furnishing: 'SEMI_FURNISHED' as const, ownerIdx: 4, agentId: amina.id, status: 'SOLD' as const },
  ];

  const insertedProperties = await inOrder(propertySeed, async (p) => {
    const owner = insertedOwners[p.ownerIdx]!;
    const [row] = await systemDb
      .insert(properties)
      .values({
        organizationId: org.id,
        reference: p.reference,
        title: p.title,
        listingType: p.listingType,
        propertyType: p.propertyType,
        segment: p.segment,
        price: p.price,
        location: p.location,
        neighborhood: p.neighborhood,
        city: p.city,
        bedrooms: p.bedrooms,
        bathrooms: p.bathrooms,
        sizeSqm: p.sizeSqm,
        parkingSpaces: p.parkingSpaces,
        furnishing: p.furnishing,
        status: p.status,
        ownerId: owner.id,
        assignedAgentId: p.agentId,
        description: `${p.title} located in ${p.neighborhood ?? p.location}, ${p.city}. A well-maintained ${p.propertyType.toLowerCase()} managed by Savanna Ridge Realty.`,
        listedAt: daysAgo(Math.floor(Math.random() * 60) + 5),
        createdById: p.agentId,
        updatedById: p.agentId,
      })
      .returning();
    return row!;
  });

  await inOrder(insertedProperties, async (p, i) => {
    await systemDb.insert(propertyImages).values([
      { propertyId: p.id, url: `https://picsum.photos/seed/kaya-${i}-1/1200/800`, isCover: true, position: 0 },
      { propertyId: p.id, url: `https://picsum.photos/seed/kaya-${i}-2/1200/800`, isCover: false, position: 1 },
      { propertyId: p.id, url: `https://picsum.photos/seed/kaya-${i}-3/1200/800`, isCover: false, position: 2 },
    ]);
    await systemDb.insert(propertyFeatures).values([
      { propertyId: p.id, key: 'borehole', label: 'Borehole Water', kind: 'UTILITY' },
      { propertyId: p.id, key: 'cctv', label: '24/7 CCTV Security', kind: 'SECURITY' },
      { propertyId: p.id, key: 'backup_generator', label: 'Backup Generator', kind: 'UTILITY' },
    ]);
  });

  // Leads
  const leadSeed = [
    { fullName: 'James Mwangi', phone: '0711223344', email: 'james.mwangi@example.com', source: 'WEBSITE' as const, status: 'NEW' as const, temperature: 'HOT' as const, leadType: 'BUYER' as const, agentId: amina.id },
    { fullName: 'Lucy Atieno', phone: '0722334455', email: 'lucy.atieno@example.com', source: 'REFERRAL' as const, status: 'CONTACTED' as const, temperature: 'WARM' as const, leadType: 'TENANT' as const, agentId: faith.id },
    { fullName: 'Samuel Kiptoo', phone: '0733445566', email: 'samuel.kiptoo@example.com', source: 'PROPERTY_PORTAL' as const, status: 'NEW' as const, temperature: 'WARM' as const, leadType: 'BUYER' as const, agentId: kevin.id },
    { fullName: 'Esther Nyambura', phone: '0744556677', email: 'esther.nyambura@example.com', source: 'WHATSAPP' as const, status: 'CONTACTED' as const, temperature: 'HOT' as const, leadType: 'TENANT' as const, agentId: dennis.id },
    { fullName: 'Michael Owuor', phone: '0755667788', email: 'michael.owuor@example.com', source: 'WALK_IN' as const, status: 'QUALIFIED' as const, temperature: 'HOT' as const, leadType: 'BUYER' as const, agentId: amina.id },
    { fullName: 'Catherine Wanjiku', phone: '0766778899', email: 'catherine.wanjiku@example.com', source: 'SOCIAL_MEDIA' as const, status: 'NEW' as const, temperature: 'COLD' as const, leadType: 'LANDLORD' as const, agentId: faith.id },
    { fullName: 'Robert Kamau', phone: '0777889900', email: 'robert.kamau@example.com', source: 'OTHER' as const, status: 'LOST' as const, temperature: 'COLD' as const, leadType: 'BUYER' as const, agentId: kevin.id, lostReason: 'Budget mismatch' },
    { fullName: 'Agnes Wambui', phone: '0788990011', email: 'agnes.wambui@example.com', source: 'WEBSITE' as const, status: 'CONTACTED' as const, temperature: 'WARM' as const, leadType: 'SELLER' as const, agentId: dennis.id },
    { fullName: 'Paul Njoroge', phone: '0799001122', email: 'paul.njoroge@example.com', source: 'REFERRAL' as const, status: 'NEW' as const, temperature: 'HOT' as const, leadType: 'TENANT' as const, agentId: amina.id },
    { fullName: 'Diana Akinyi', phone: '0700112233', email: 'diana.akinyi@example.com', source: 'PROPERTY_PORTAL' as const, status: 'QUALIFIED' as const, temperature: 'WARM' as const, leadType: 'BUYER' as const, agentId: faith.id },
  ];
  const insertedLeads = await systemDb
    .insert(leads)
    .values(leadSeed.map((l) => ({
      organizationId: org.id,
      fullName: l.fullName,
      phone: l.phone,
      whatsapp: l.phone,
      email: l.email,
      source: l.source,
      status: l.status,
      temperature: l.temperature,
      leadType: l.leadType,
      assignedAgentId: l.agentId,
      lostReason: l.lostReason ?? null,
      lastContactedAt: l.status !== 'NEW' ? daysAgo(Math.floor(Math.random() * 10) + 1) : null,
      nextFollowUpAt: l.status !== 'LOST' ? daysFromNow(Math.floor(Math.random() * 5) + 1) : null,
      createdById: l.agentId,
      updatedById: l.agentId,
    })))
    .returning();

  await inOrder(insertedLeads, async (l) => {
    await systemDb.insert(requirements).values({
      organizationId: org.id,
      leadId: l.id,
      intent: l.leadType === 'TENANT' || l.leadType === 'LANDLORD' ? 'RENT' : 'BUY',
      segment: 'RESIDENTIAL',
      budgetMin: 1000000 + Math.floor(Math.random() * 5) * 2000000,
      budgetMax: 8000000 + Math.floor(Math.random() * 10) * 3000000,
      locations: ['Kilimani', 'Westlands', 'Lavington'].slice(0, 1 + Math.floor(Math.random() * 3)),
      propertyTypes: ['APARTMENT'],
      bedroomsMin: 2 + Math.floor(Math.random() * 3),
    });
  });

  // Clients (some converted from leads, some standalone)
  const qualifiedLeads = insertedLeads.filter((l) => l.status === 'QUALIFIED');
  const clientSeed = [
    { fullName: 'Nancy Chepkoech', phone: '0711998877', email: 'nancy.chepkoech@example.com', leadType: 'BUYER' as const, agentId: amina.id, status: 'ACTIVE' as const },
    { fullName: 'George Mbugua', phone: '0722887766', email: 'george.mbugua@example.com', leadType: 'TENANT' as const, agentId: faith.id, status: 'ACTIVE' as const },
    { fullName: 'Irene Jepkemoi', phone: '0733776655', email: 'irene.jepkemoi@example.com', leadType: 'BUYER' as const, agentId: kevin.id, status: 'ACTIVE' as const },
    { fullName: 'Victor Odhiambo', phone: '0744665544', email: 'victor.odhiambo@example.com', leadType: 'LANDLORD' as const, agentId: dennis.id, status: 'INACTIVE' as const },
  ];
  const insertedClientsStandalone = await systemDb
    .insert(clients)
    .values(clientSeed.map((c) => ({
      organizationId: org.id, fullName: c.fullName, phone: c.phone, whatsapp: c.phone, email: c.email,
      leadType: c.leadType, status: c.status, assignedAgentId: c.agentId,
      lastContactedAt: daysAgo(Math.floor(Math.random() * 14) + 1),
      createdById: c.agentId, updatedById: c.agentId,
    })))
    .returning();

  const insertedClientsFromLeads = await inOrder(qualifiedLeads, async (l) => {
    const [c] = await systemDb
      .insert(clients)
      .values({
        organizationId: org.id, fullName: l.fullName, phone: l.phone, whatsapp: l.whatsapp, email: l.email,
        leadType: l.leadType, status: 'ACTIVE', assignedAgentId: l.assignedAgentId, leadId: l.id,
        lastContactedAt: daysAgo(2), createdById: l.assignedAgentId, updatedById: l.assignedAgentId,
      })
      .returning();
    await systemDb.update(leads).set({ clientId: c!.id, status: 'WON', wonAt: daysAgo(1) }).where(sql`${leads.id} = ${l.id}`);
    return c!;
  });

  const allClients = [...insertedClientsStandalone, ...insertedClientsFromLeads];

  await inOrder(allClients, async (c) => {
    await systemDb.insert(requirements).values({
      organizationId: org.id,
      clientId: c.id,
      intent: c.leadType === 'TENANT' || c.leadType === 'LANDLORD' ? 'RENT' : 'BUY',
      segment: 'RESIDENTIAL',
      budgetMin: 2000000 + Math.floor(Math.random() * 5) * 2000000,
      budgetMax: 10000000 + Math.floor(Math.random() * 10) * 3000000,
      locations: ['Kilimani', 'Lavington', 'Karen', 'Kileleshwa'].slice(0, 1 + Math.floor(Math.random() * 3)),
      propertyTypes: ['APARTMENT', 'MAISONETTE'],
      bedroomsMin: 2 + Math.floor(Math.random() * 3),
    });
  });

  // Deals
  const dealSeed = [
    { name: 'Kamau - 3BR Kilimani Sale', clientIdx: 0, propertyIdx: 0, agentId: amina.id, stageKey: 'NEGOTIATION', dealType: 'SALE' as const, value: 18500000 },
    { name: 'Mbugua - Westlands Rental', clientIdx: 1, propertyIdx: 2, agentId: faith.id, stageKey: 'OFFER', dealType: 'RENT' as const, value: 95000 },
    { name: 'Jepkemoi - Runda Maisonette', clientIdx: 2, propertyIdx: 7, agentId: kevin.id, stageKey: 'CLOSING', dealType: 'SALE' as const, value: 45000000 },
    { name: 'Odhiambo - Office Lease Upper Hill', clientIdx: 3, propertyIdx: 5, agentId: dennis.id, stageKey: 'QUALIFYING', dealType: 'RENT' as const, value: 350000 },
    { name: 'Chepkoech - Karen Villa', clientIdx: 0, propertyIdx: 3, agentId: amina.id, stageKey: 'NEW', dealType: 'SALE' as const, value: 85000000 },
    { name: 'Kileleshwa Apartment - WON', clientIdx: 2, propertyIdx: 9, agentId: amina.id, stageKey: 'WON', dealType: 'SALE' as const, value: 13500000 },
  ];

  const insertedDeals = await inOrder(dealSeed, async (d, i) => {
    const stage = stageByKey[d.stageKey]!;
    const client = allClients[d.clientIdx]!;
    const property = insertedProperties[d.propertyIdx]!;
    const rate = d.dealType === 'SALE' ? 2.5 : 8.33;
    const isWon = d.stageKey === 'WON';
    const commissionAmount = calculateCommission(d.value, rate);
    const [row] = await systemDb
      .insert(deals)
      .values({
        organizationId: org.id,
        dealNumber: `D-${String(i + 1).padStart(4, '0')}`,
        name: d.name,
        dealType: d.dealType,
        status: isWon ? 'WON' : 'OPEN',
        stageId: stage.id,
        clientId: client.id,
        propertyId: property.id,
        agentId: d.agentId,
        dealValue: d.value,
        commissionRate: rate,
        commissionAmount,
        probability: stage.probability,
        finalPrice: isWon ? d.value : null,
        paymentStatus: isWon ? 'PAID' : 'UNPAID',
        stageEnteredAt: daysAgo(Math.floor(Math.random() * 10)),
        lastActivityAt: daysAgo(Math.floor(Math.random() * 3)),
        actualCloseDate: isWon ? daysAgo(1).toISOString().slice(0, 10) : null,
        createdById: d.agentId,
        updatedById: d.agentId,
      })
      .returning();
    if (isWon) {
      await systemDb.insert(commissions).values({
        dealId: row!.id, agentId: d.agentId, sharePercent: 100, amount: commissionAmount, paidAmount: commissionAmount,
        status: 'PAID', earnedAt: daysAgo(1), paidAt: daysAgo(0),
      });
    } else {
      await systemDb.insert(commissions).values({
        dealId: row!.id, agentId: d.agentId, sharePercent: 100, amount: commissionAmount,
        status: 'PENDING', earnedAt: null,
      });
      await systemDb.insert(offers).values({
        dealId: row!.id, amount: Math.round(d.value * 0.95), madeBy: 'BUYER', status: 'PENDING', offeredAt: daysAgo(1),
      });
    }
    return row!;
  });

  // Viewings
  const viewingSeed = [
    { propertyIdx: 0, clientIdx: 0, agentId: amina.id, scheduledAt: daysFromNow(2), status: 'SCHEDULED' as const },
    { propertyIdx: 2, clientIdx: 1, agentId: faith.id, scheduledAt: daysFromNow(1), status: 'SCHEDULED' as const },
    { propertyIdx: 7, clientIdx: 2, agentId: kevin.id, scheduledAt: daysAgo(2), status: 'COMPLETED' as const },
    { propertyIdx: 3, clientIdx: 0, agentId: amina.id, scheduledAt: daysAgo(5), status: 'COMPLETED' as const },
    { propertyIdx: 5, clientIdx: 3, agentId: dennis.id, scheduledAt: daysFromNow(3), status: 'SCHEDULED' as const },
    { propertyIdx: 1, leadIdx: 0, agentId: amina.id, scheduledAt: daysFromNow(4), status: 'SCHEDULED' as const },
  ];
  await inOrder(viewingSeed, async (v: any) => {
    const [row] = await systemDb
      .insert(viewings)
      .values({
        organizationId: org.id,
        propertyId: insertedProperties[v.propertyIdx]!.id,
        clientId: v.clientIdx !== undefined ? allClients[v.clientIdx]!.id : null,
        leadId: v.leadIdx !== undefined ? insertedLeads[v.leadIdx]!.id : null,
        agentId: v.agentId,
        scheduledAt: v.scheduledAt,
        status: v.status,
        completedAt: v.status === 'COMPLETED' ? v.scheduledAt : null,
        createdById: v.agentId,
        updatedById: v.agentId,
      })
      .returning();
    if (v.status === 'COMPLETED') {
      await systemDb.insert(viewingFeedback).values({
        viewingId: row!.id, interestLevel: 'INTERESTED', rating: 4,
        feedback: 'Client liked the space, requested a second viewing with family.',
      });
    }
  });

  // Follow-ups
  const followUpSeed = [
    { title: 'Call James Mwangi about financing options', leadIdx: 0, agentId: amina.id, dueAt: daysFromNow(1), priority: 'HIGH' as const },
    { title: 'Send Lucy Atieno the Westlands lease terms', leadIdx: 1, agentId: faith.id, dueAt: daysAgo(1), priority: 'MEDIUM' as const, status: 'PENDING' as const },
    { title: 'Follow up with Esther on viewing feedback', leadIdx: 3, agentId: dennis.id, dueAt: new Date(), priority: 'HIGH' as const },
    { title: 'Check in with Agnes re: listing her property', leadIdx: 7, agentId: dennis.id, dueAt: daysFromNow(3), priority: 'LOW' as const },
    { title: 'Confirm Nancy Chepkoech viewing time', clientIdx: 0, agentId: amina.id, dueAt: daysFromNow(2), priority: 'MEDIUM' as const },
  ];
  await inOrder(followUpSeed, async (f: any) => {
    await systemDb.insert(followUps).values({
      organizationId: org.id,
      title: f.title,
      dueAt: f.dueAt,
      priority: f.priority,
      status: f.status ?? 'PENDING',
      leadId: f.leadIdx !== undefined ? insertedLeads[f.leadIdx]!.id : null,
      clientId: f.clientIdx !== undefined ? allClients[f.clientIdx]!.id : null,
      assignedToId: f.agentId,
    });
  });

  // Tasks
  const taskSeed = [
    { title: 'Prepare offer letter for Kilimani apartment', agentId: amina.id, dueAt: daysFromNow(1), priority: 'HIGH' as const },
    { title: 'Collect ID copies from Jepkemoi for closing', agentId: kevin.id, dueAt: daysAgo(1), priority: 'HIGH' as const },
    { title: 'Update property listing photos for Runda', agentId: kevin.id, dueAt: daysFromNow(5), priority: 'LOW' as const },
    { title: 'Reconcile commission payouts for the month', agentId: manager.id, dueAt: daysFromNow(2), priority: 'MEDIUM' as const },
  ];
  await inOrder(taskSeed, async (t) => {
    await systemDb.insert(tasks).values({
      organizationId: org.id, title: t.title, dueAt: t.dueAt, priority: t.priority, status: 'OPEN', assignedToId: t.agentId,
    });
  });

  // Communications + activity log
  await inOrder(insertedLeads.slice(0, 5), async (l) => {
    await systemDb.insert(communications).values({
      organizationId: org.id, channel: 'WHATSAPP', direction: 'OUTBOUND',
      body: `Hi ${l.fullName.split(' ')[0]}, thanks for your interest — I'll send over some options shortly.`,
      leadId: l.id, userId: l.assignedAgentId, occurredAt: daysAgo(2),
    });
    await systemDb.insert(activities).values({
      organizationId: org.id, type: 'WHATSAPP', title: 'WhatsApp message sent', leadId: l.id, actorId: l.assignedAgentId, occurredAt: daysAgo(2),
    });
  });

  // A shortlist for one client, with a shareable token
  const shortlistClient = allClients[0]!;
  const [shortlist] = await systemDb
    .insert(clientShortlists)
    .values({ organizationId: org.id, clientId: shortlistClient.id, title: 'Curated for Nancy', shareToken: 'demo-nancy-shortlist-token', createdById: amina.id, updatedById: amina.id })
    .returning();
  await systemDb.insert(shortlistItems).values([
    { shortlistId: shortlist!.id, propertyId: insertedProperties[0]!.id, position: 0, note: 'Great natural light, close to the mall.' },
    { shortlistId: shortlist!.id, propertyId: insertedProperties[1]!.id, position: 1, note: 'Larger option if budget stretches.' },
  ]);

  console.log(`Seeded org "${org.name}" (${org.id})`);
  console.log(`  Demo login: wanjiru@savannaridge.co.ke / ${DEMO_PASSWORD}`);
  return { org, users: insertedUsers };
}

async function seedCoastline() {
  const [org] = await systemDb
    .insert(organizations)
    .values({ name: 'Coastline Properties', slug: 'coastline-properties', plan: 'STARTER', timezone: 'Africa/Nairobi', currency: 'KES', phone: '+254700998877' })
    .returning();
  if (!org) throw new Error('failed to create Coastline org');

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [adminUser] = await systemDb
    .insert(users)
    .values({ organizationId: org.id, name: 'Salim Abdalla', email: 'salim@coastline.example', passwordHash, role: 'ORG_ADMIN', jobTitle: 'Director' })
    .returning();

  const [owner] = await systemDb
    .insert(owners)
    .values({ organizationId: org.id, fullName: 'Fatuma Said', phone: '+254711000111', email: 'fatuma.said@example.com', commissionArrangement: 'PERCENTAGE', commissionRate: 5, createdById: adminUser!.id, updatedById: adminUser!.id })
    .returning();

  const [property] = await systemDb
    .insert(properties)
    .values({
      organizationId: org.id, reference: 'CL-0001', title: 'Beachfront Apartment, Nyali', listingType: 'SALE', propertyType: 'APARTMENT',
      segment: 'RESIDENTIAL', price: 22000000, location: 'Nyali', city: 'Mombasa', bedrooms: 3, bathrooms: 2, sizeSqm: 140,
      ownerId: owner!.id, assignedAgentId: adminUser!.id, description: 'Oceanview apartment in Nyali, Mombasa.',
      listedAt: daysAgo(10), createdById: adminUser!.id, updatedById: adminUser!.id,
    })
    .returning();

  await systemDb.insert(propertyImages).values({ propertyId: property!.id, url: 'https://picsum.photos/seed/kaya-coastline-1/1200/800', isCover: true, position: 0 });

  const [lead] = await systemDb
    .insert(leads)
    .values({ organizationId: org.id, fullName: 'Hassan Ali', phone: '0712000111', email: 'hassan.ali@example.com', source: 'WEBSITE', status: 'NEW', temperature: 'WARM', leadType: 'BUYER', assignedAgentId: adminUser!.id, createdById: adminUser!.id, updatedById: adminUser!.id })
    .returning();

  console.log(`Seeded org "${org.name}" (${org.id}) — second tenant for RLS cross-tenant verification`);
  console.log(`  Demo login: salim@coastline.example / ${DEMO_PASSWORD}`);
  return { org, lead };
}

async function seedPlatformAdmin() {
  await systemDb.insert(platformAdmins).values({
    name: 'Kaya Platform Ops',
    email: 'ops@kaya.co.ke',
    passwordHash: await hashPassword(DEMO_PASSWORD),
  });
  console.log(`Seeded platform admin: ops@kaya.co.ke / ${DEMO_PASSWORD}`);
}

async function main() {
  console.log('Resetting database...');
  await resetDb();
  console.log('Seeding Savanna Ridge Realty...');
  await seedSavannaRidge();
  console.log('Seeding Coastline Properties (second tenant)...');
  await seedCoastline();
  console.log('Seeding platform admin...');
  await seedPlatformAdmin();
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSystemPool();
  });
