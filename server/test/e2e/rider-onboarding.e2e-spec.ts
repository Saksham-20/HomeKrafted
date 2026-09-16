import sharp from 'sharp';
import { API_PREFIX, Actor, Harness, auth, createActor, createHarness, errorOf, resetDatabase } from './harness';

/**
 * A rider's session, minted by `POST /rider-enrolment` rather than
 * `createActor` (which signs in through `/auth/login` and would need a
 * password this flow never sets). `auth()` only reads `.token`, so the
 * other `Actor` fields are harmless placeholders — nothing here asserts
 * on `userId`/`email` through this shape.
 */
const actorFromToken = (token: string): Actor => ({ userId: '', email: '', token });

/**
 * R1 — the rider onboarding path end to end: a shopper enrols, fills in
 * the form, uploads documents, gets refused an incomplete submit, then
 * completes it and is approved by an admin. Also the boundary cases
 * `docs/RIDER-APP.md`'s R1 brief names: a seller cannot enrol, a rider
 * cannot read another account's KYC file, and an admin missing the
 * `riders` scope is refused.
 *
 * `Prisma` is never mocked here (see `docs/TESTS.md`) — the whole point
 * of `RiderOnboardingService.submit`'s completeness check is that it is
 * enforced by real rows, and a mocked Prisma would test the mock.
 */
describe('rider onboarding (R1)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await resetDatabase(h);
  });

  /** A minimal, real JPEG — small enough to be fast, real enough to pass `sniffImage` and `processImage`. */
  async function tinyJpeg(): Promise<Buffer> {
    return sharp({ create: { width: 20, height: 20, channels: 3, background: '#8a6a16' } })
      .jpeg()
      .toBuffer();
  }

  async function seedZone() {
    return h.prisma.deliveryZone.create({
      data: { name: 'Chandigarh Central', city: 'Chandigarh', centerLat: 30.7418, centerLng: 76.7822, radiusKm: 6 },
    });
  }

  const BASE_DOCS = ['selfie', 'aadhaar_front', 'aadhaar_back', 'pan', 'bank_proof'] as const;

  it('a consumer enrols, fills the form, uploads documents, is refused an incomplete submit, then is approved', async () => {
    const consumer = await createActor(h, 'consumer');
    const zone = await seedZone();

    // --- Enrol: consumer -> rider, a fresh token pair carrying the new role. ---
    const enrolRes = await h
      .api()
      .post(`${API_PREFIX}/rider-enrolment`)
      .set(auth(consumer))
      .send({})
      .expect(200);

    expect(enrolRes.body.user.role).toBe('rider');
    expect(enrolRes.body.accessToken).toBeDefined();
    const rider = actorFromToken(enrolRes.body.accessToken as string);

    const meAfterEnrol = await h.api().get(`${API_PREFIX}/rider/me`).set(auth(rider)).expect(200);
    expect(meAfterEnrol.body.status).toBe('applied');

    // --- Fill the application (a bicycle rider — no DL/RC needed). ---
    const applicationRes = await h
      .api()
      .put(`${API_PREFIX}/rider/me/application`)
      .set(auth(rider))
      .send({
        fullName: 'Test Rider',
        dateOfBirth: '2000-01-01',
        homeLine1: '221B, Sector 34',
        homeCity: 'Chandigarh',
        homePincode: '160034',
        emergencyName: 'Emergency Contact',
        emergencyRelation: 'Sibling',
        emergencyPhone: '9988776655',
        vehicleType: 'bicycle',
        aadhaarLast4: '1234',
        panNumber: 'ABCDE1234F',
        upiId: 'rider@upi',
        tshirtSize: 'M',
        homeZoneId: zone.id,
      })
      .expect(200);
    expect(applicationRes.body.vehicleType).toBe('bicycle');
    expect(applicationRes.body.aadhaarLast4).toBe('1234');

    // --- Upload every required document for a bicycle. ---
    const jpeg = await tinyJpeg();
    for (const kind of BASE_DOCS) {
      const docRes = await h
        .api()
        .post(`${API_PREFIX}/rider/documents/${kind}`)
        .set(auth(rider))
        .attach('file', jpeg, `${kind}.jpg`)
        .expect(201);
      expect(docRes.body).toEqual({ kind, status: 'pending', uploadedAt: expect.any(String) });
      // No response ever carries a filesystem path — see the whole-suite
      // assertion below too, but this is the response that would leak one
      // first if `RiderDocumentsService` ever started echoing `storageKey`.
      expect(JSON.stringify(docRes.body)).not.toMatch(/\.webp|rider-kyc/);
    }

    // --- Submit refused: fields and documents are complete, consents are not. ---
    // `AllExceptionsFilter` collapses every thrown body to `{ error: {
    // code, message } }` (docs/API.md's one envelope) — a structured
    // `missing` array never reaches the client, so the refusal is read
    // off the joined sentence instead (see `describeMissing`'s doc
    // comment).
    const refusedSubmit = await h.api().post(`${API_PREFIX}/rider/me/submit`).set(auth(rider)).expect(400);
    const refusalMessage: string = errorOf(refusedSubmit).message ?? '';
    expect(refusalMessage).toMatch(/consent|Agreement|Privacy/i);
    // Every base document was uploaded above — the refusal is about
    // consents only, never a document kind.
    for (const kind of BASE_DOCS) {
      expect(refusalMessage).not.toContain(kind);
    }

    // --- Give every consent. ---
    await h
      .api()
      .post(`${API_PREFIX}/rider/me/consents`)
      .set(auth(rider))
      .send({ agreementVersion: '1.0', privacyVersion: '1.0', location: true, bgv: true })
      .expect(201);

    // --- Submit succeeds. ---
    const submitRes = await h.api().post(`${API_PREFIX}/rider/me/submit`).set(auth(rider)).expect(200);
    expect(submitRes.body.status).toBe('under_review');
    const riderId: string = submitRes.body.id;

    // --- A second submit while under review is refused, not silently re-accepted. ---
    await h.api().post(`${API_PREFIX}/rider/me/submit`).set(auth(rider)).expect(409);

    // --- Admin approves every document, then the rider. ---
    const admin = await createActor(h, 'admin');
    for (const kind of BASE_DOCS) {
      const reviewRes = await h
        .api()
        .patch(`${API_PREFIX}/admin/riders/${riderId}/documents/${kind}`)
        .set(auth(admin))
        .send({ status: 'approved' })
        .expect(200);
      expect(reviewRes.body.status).toBe('approved');
    }

    // Approving before every document is approved is refused — checked by
    // rejecting one document first, then approving it, so the guard is
    // exercised rather than assumed.
    await h
      .api()
      .patch(`${API_PREFIX}/admin/riders/${riderId}/documents/selfie`)
      .set(auth(admin))
      .send({ status: 'rejected', note: 'Face not clearly visible — retake in good light.' })
      .expect(200);
    const blockedApprove = await h
      .api()
      .post(`${API_PREFIX}/admin/riders/${riderId}/approve`)
      .set(auth(admin))
      .expect(400);
    expect(JSON.stringify(blockedApprove.body)).toContain('selfie');

    await h
      .api()
      .patch(`${API_PREFIX}/admin/riders/${riderId}/documents/selfie`)
      .set(auth(admin))
      .send({ status: 'approved' })
      .expect(200);

    const approveRes = await h.api().post(`${API_PREFIX}/admin/riders/${riderId}/approve`).set(auth(admin)).expect(201);
    expect(approveRes.body.status).toBe('approved');
    expect(approveRes.body.approvedById).toBe(admin.userId);

    const meAfterApproval = await h.api().get(`${API_PREFIX}/rider/me`).set(auth(rider)).expect(200);
    expect(meAfterApproval.body.status).toBe('approved');

    // --- Nowhere in any response above does a KYC file path leak. ---
    const wholeAdminDetail = await h.api().get(`${API_PREFIX}/admin/riders/${riderId}`).set(auth(admin)).expect(200);
    expect(JSON.stringify(wholeAdminDetail.body)).not.toMatch(/\.webp|rider-kyc/);
  });

  it('a seller cannot enrol — 409, not a bare refusal', async () => {
    const seller = await createActor(h, 'seller');
    const res = await h.api().post(`${API_PREFIX}/rider-enrolment`).set(auth(seller)).send({}).expect(409);
    expect(errorOf(res).message).toMatch(/already has a HomeKrafter\/admin account/);
  });

  it('an admin cannot enrol either', async () => {
    const admin = await createActor(h, 'admin');
    await h.api().post(`${API_PREFIX}/rider-enrolment`).set(auth(admin)).send({}).expect(409);
  });

  it('enrolling twice as the same rider is idempotent, not an error', async () => {
    const consumer = await createActor(h, 'consumer');
    const first = await h.api().post(`${API_PREFIX}/rider-enrolment`).set(auth(consumer)).send({}).expect(200);
    const second = await h
      .api()
      .post(`${API_PREFIX}/rider-enrolment`)
      .set(auth(actorFromToken(first.body.accessToken)))
      .send({})
      .expect(200);
    expect(second.body.user.role).toBe('rider');

    const riderRows = await h.prisma.rider.findMany({ where: { userId: consumer.userId } });
    expect(riderRows).toHaveLength(1);
  });

  it('a rider cannot reach the admin document-file route at all', async () => {
    const consumer = await createActor(h, 'consumer');
    const enrolRes = await h.api().post(`${API_PREFIX}/rider-enrolment`).set(auth(consumer)).send({}).expect(200);
    const rider = actorFromToken(enrolRes.body.accessToken as string);

    // No rider row id is even known to the caller — the point is that the
    // admin surface is unreachable by role, before any id is checked.
    await h
      .api()
      .get(`${API_PREFIX}/admin/riders/anything/documents/selfie/file`)
      .set(auth(rider))
      .expect(403);
  });

  it('an admin without the riders scope is refused with a sentence naming the scope', async () => {
    const limited = await createActor(h, 'admin');
    await h.prisma.user.update({ where: { id: limited.userId }, data: { adminScopes: ['catalog'] } });
    // The token still carries the old claim set, but scopes are read live
    // from the database on every request (M47) — no re-login needed for
    // the guard to see the narrowed set.
    const res = await h.api().get(`${API_PREFIX}/admin/riders`).set(auth(limited)).expect(403);
    expect(errorOf(res).message).toMatch(/riders/);
  });
});
