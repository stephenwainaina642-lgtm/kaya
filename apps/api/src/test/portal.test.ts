import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant } from './helpers';

const app = createApp();

async function createOwner(authHeader: Record<string, string>) {
  const res = await request(app).post('/api/owners').set(authHeader).send({ fullName: 'James Mwangi', phone: '+254722000001' });
  return res.body;
}

async function createProperty(authHeader: Record<string, string>, ownerId: string) {
  const res = await request(app)
    .post('/api/properties')
    .set(authHeader)
    .send({
      reference: `PRP-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Riverside 3BR Apartment',
      listingType: 'SALE',
      propertyType: 'APARTMENT',
      price: 12000000,
      location: 'Kilimani',
      bedrooms: 3,
      bathrooms: 2,
      ownerId,
    });
  return res.body;
}

async function createClient(authHeader: Record<string, string>) {
  const res = await request(app).post('/api/clients').send({ fullName: 'Amina Hassan', phone: '+254733000002' }).set(authHeader);
  return res.body;
}

async function createShortlist(authHeader: Record<string, string>, clientId: string, propertyId: string) {
  const createRes = await request(app).post('/api/shortlists').set(authHeader).send({ clientId, title: 'Hand-picked for you' });
  const shortlist = createRes.body;
  await request(app).post(`/api/shortlists/${shortlist.id}/items`).set(authHeader).send({ propertyId });
  return shortlist as { id: string; shareToken: string };
}

describe('client self-service portal', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('exposes property ids and an empty documents list on the public shortlist', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const owner = await createOwner(authHeader);
    const property = await createProperty(authHeader, owner.id);
    const client = await createClient(authHeader);
    const shortlist = await createShortlist(authHeader, client.id, property.id);

    const res = await request(app).get(`/api/public/shortlists/${shortlist.shareToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items[0].property.id).toBe(property.id);
    expect(res.body.documents).toEqual([]);
  });

  it('lets a client request a viewing, and staff can confirm it into a real scheduled viewing', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const owner = await createOwner(authHeader);
    const property = await createProperty(authHeader, owner.id);
    const client = await createClient(authHeader);
    const shortlist = await createShortlist(authHeader, client.id, property.id);

    const preferredAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const reqRes = await request(app)
      .post(`/api/public/shortlists/${shortlist.shareToken}/viewing-requests`)
      .send({ propertyId: property.id, preferredAt, notes: 'Weekday evenings work best' });
    expect(reqRes.status).toBe(201);

    const listRes = await request(app).get('/api/viewing-requests').set(authHeader);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].status).toBe('PENDING');
    expect(listRes.body.items[0].clientName).toBe('Amina Hassan');
    const viewingRequestId = listRes.body.items[0].id;

    const confirmRes = await request(app).post(`/api/viewing-requests/${viewingRequestId}/confirm`).set(authHeader).send({});
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('CONFIRMED');
    expect(confirmRes.body.viewingId).toBeTruthy();

    const viewingsRes = await request(app).get('/api/viewings').set(authHeader);
    expect(viewingsRes.body.items.some((v: { id: string }) => v.id === confirmRes.body.viewingId)).toBe(true);

    // Already responded to — confirming again is rejected.
    const reconfirm = await request(app).post(`/api/viewing-requests/${viewingRequestId}/confirm`).set(authHeader).send({});
    expect(reconfirm.status).toBe(422);
  });

  it('lets staff decline a viewing request with a note', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const owner = await createOwner(authHeader);
    const property = await createProperty(authHeader, owner.id);
    const client = await createClient(authHeader);
    const shortlist = await createShortlist(authHeader, client.id, property.id);

    await request(app)
      .post(`/api/public/shortlists/${shortlist.shareToken}/viewing-requests`)
      .send({ propertyId: property.id, preferredAt: new Date(Date.now() + 86_400_000).toISOString() });

    const { id } = (await request(app).get('/api/viewing-requests').set(authHeader)).body.items[0];
    const declineRes = await request(app).post(`/api/viewing-requests/${id}/decline`).set(authHeader).send({ responseNote: 'Fully booked that day' });
    expect(declineRes.status).toBe(204);

    const after = await request(app).get('/api/viewing-requests').set(authHeader);
    expect(after.body.items[0].status).toBe('DECLINED');
    expect(after.body.items[0].responseNote).toBe('Fully booked that day');
  });

  it('rejects a viewing request for a time in the past', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const owner = await createOwner(authHeader);
    const property = await createProperty(authHeader, owner.id);
    const client = await createClient(authHeader);
    const shortlist = await createShortlist(authHeader, client.id, property.id);

    const res = await request(app)
      .post(`/api/public/shortlists/${shortlist.shareToken}/viewing-requests`)
      .send({ propertyId: property.id, preferredAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect(res.status).toBe(422);
  });

  it('lets a client sign a document that requires a signature, exactly once', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const owner = await createOwner(authHeader);
    const property = await createProperty(authHeader, owner.id);
    const client = await createClient(authHeader);
    const shortlist = await createShortlist(authHeader, client.id, property.id);

    const uploadRes = await request(app)
      .post('/api/documents')
      .set(authHeader)
      .field('type', 'AGREEMENT')
      .field('clientId', client.id)
      .field('requiresSignature', 'true')
      .attach('file', Buffer.from('%PDF-1.4 fake tenancy agreement'), 'agreement.pdf');
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.requiresSignature).toBe(true);
    expect(uploadRes.body.signed).toBe(false);

    const portalBefore = await request(app).get(`/api/public/shortlists/${shortlist.shareToken}`);
    expect(portalBefore.body.documents).toHaveLength(1);
    expect(portalBefore.body.documents[0].signed).toBe(false);

    const signatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const signRes = await request(app)
      .post(`/api/public/shortlists/${shortlist.shareToken}/documents/${uploadRes.body.id}/sign`)
      .send({ signerName: 'Amina Hassan', signatureDataUrl });
    expect(signRes.status).toBe(201);

    const portalAfter = await request(app).get(`/api/public/shortlists/${shortlist.shareToken}`);
    expect(portalAfter.body.documents[0].signed).toBe(true);
    expect(portalAfter.body.documents[0].signedAt).toBeTruthy();

    // Staff side reflects the signature too.
    const staffDoc = await request(app).get(`/api/documents/${uploadRes.body.id}`).set(authHeader);
    expect(staffDoc.body.signed).toBe(true);

    // Signing again is rejected — one signature per document.
    const resignRes = await request(app)
      .post(`/api/public/shortlists/${shortlist.shareToken}/documents/${uploadRes.body.id}/sign`)
      .send({ signerName: 'Amina Hassan', signatureDataUrl });
    expect(resignRes.status).toBe(422);
  });

  it('handles two concurrent sign attempts on the same document cleanly — exactly one succeeds, neither 500s', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const owner = await createOwner(authHeader);
    const property = await createProperty(authHeader, owner.id);
    const client = await createClient(authHeader);
    const shortlist = await createShortlist(authHeader, client.id, property.id);

    const uploadRes = await request(app)
      .post('/api/documents')
      .set(authHeader)
      .field('type', 'AGREEMENT')
      .field('clientId', client.id)
      .field('requiresSignature', 'true')
      .attach('file', Buffer.from('%PDF-1.4 fake tenancy agreement'), 'agreement.pdf');
    expect(uploadRes.status).toBe(201);

    const signatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    // Two tabs open to the same portal link both submitting at once — the
    // app-level "already signed?" check can't see the other request's
    // in-flight insert, so the DB's unique constraint on documentId is the
    // real guard. It must come back as a clean 422, not an unhandled 500.
    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/public/shortlists/${shortlist.shareToken}/documents/${uploadRes.body.id}/sign`)
        .send({ signerName: 'Amina Hassan', signatureDataUrl }),
      request(app)
        .post(`/api/public/shortlists/${shortlist.shareToken}/documents/${uploadRes.body.id}/sign`)
        .send({ signerName: 'Amina Hassan', signatureDataUrl }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 422]);

    const portalAfter = await request(app).get(`/api/public/shortlists/${shortlist.shareToken}`);
    expect(portalAfter.body.documents[0].signed).toBe(true);
  });

  it('refuses to sign a document that does not require a signature', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const owner = await createOwner(authHeader);
    const property = await createProperty(authHeader, owner.id);
    const client = await createClient(authHeader);
    const shortlist = await createShortlist(authHeader, client.id, property.id);

    const uploadRes = await request(app)
      .post('/api/documents')
      .set(authHeader)
      .field('type', 'OTHER')
      .field('clientId', client.id)
      .attach('file', Buffer.from('just an fyi, no signature needed'), 'note.pdf');
    expect(uploadRes.body.requiresSignature).toBe(false);

    const signRes = await request(app)
      .post(`/api/public/shortlists/${shortlist.shareToken}/documents/${uploadRes.body.id}/sign`)
      .send({ signerName: 'Amina Hassan', signatureDataUrl: 'data:image/png;base64,abc=' });
    expect(signRes.status).toBe(422);
  });

  it('never exposes a document belonging to a different client through the portal', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const owner = await createOwner(authHeader);
    const property = await createProperty(authHeader, owner.id);
    const client = await createClient(authHeader);
    const shortlist = await createShortlist(authHeader, client.id, property.id);

    // A second client's document — not linked to the shortlist's client.
    const otherClientRes = await request(app).post('/api/clients').set(authHeader).send({ fullName: 'Other Client', phone: '+254733999999' });
    const uploadRes = await request(app)
      .post('/api/documents')
      .set(authHeader)
      .field('type', 'OTHER')
      .field('clientId', otherClientRes.body.id)
      .field('requiresSignature', 'true')
      .attach('file', Buffer.from('private'), 'private.pdf');

    const fileRes = await request(app).get(`/api/public/shortlists/${shortlist.shareToken}/documents/${uploadRes.body.id}/file`);
    expect(fileRes.status).toBe(404);

    const signRes = await request(app)
      .post(`/api/public/shortlists/${shortlist.shareToken}/documents/${uploadRes.body.id}/sign`)
      .send({ signerName: 'Amina Hassan', signatureDataUrl: 'data:image/png;base64,abc=' });
    expect(signRes.status).toBe(404);
  });
});
