import { BadGatewayException } from '@nestjs/common';
import type { Storage } from '@google-cloud/storage';
import { GcsDriver } from '../../src/uploads/storage/gcs.driver';
import { PurposeRoutingDriver } from '../../src/uploads/storage/purpose-routing.driver';
import type { StorageDriver } from '../../src/uploads/storage/storage-driver.interface';

/**
 * The cloud storage driver, against a stubbed client.
 *
 * No network: what is worth testing here is the contract the seam
 * promises — key shape, URL construction, and the two failure behaviours
 * the interface specifies (a missing object resolves; an upstream refusal
 * surfaces as 502 rather than a bare 500).
 */
function stubStorage() {
  const save = jest.fn().mockResolvedValue(undefined);
  const del = jest.fn().mockResolvedValue(undefined);
  const file = jest.fn(() => ({ save, delete: del }));
  const storage = { bucket: jest.fn(() => ({ name: 'test-bucket', file })) } as unknown as Storage;
  return { storage, save, del, file };
}

const input = {
  body: Buffer.from('fake-webp-bytes'),
  mime: 'image/webp',
  ext: 'webp',
  scope: 'listing/seller-1',
};

describe('GcsDriver', () => {
  it('mints the same key shape as the local driver and returns an absolute URL', async () => {
    const { storage, file } = stubStorage();
    const driver = new GcsDriver(
      { bucket: 'test-bucket', publicBaseUrl: 'https://cdn.example.test' },
      storage,
    );

    const stored = await driver.put(input);

    // `scope/uuid.ext` — the same layout local disk writes, which is what
    // lets a synced bucket line up object-for-object with the box.
    expect(stored.key).toMatch(/^listing\/seller-1\/[0-9a-f-]{36}\.webp$/);
    expect(stored.url).toBe(`https://cdn.example.test/${stored.key}`);
    expect(stored.bytes).toBe(input.body.byteLength);
    expect(stored.mime).toBe('image/webp');
    expect(file).toHaveBeenCalledWith(stored.key);
  });

  it('stores with an immutable cache header', async () => {
    const { storage, save } = stubStorage();
    const driver = new GcsDriver(
      { bucket: 'test-bucket', publicBaseUrl: 'https://cdn.example.test' },
      storage,
    );

    await driver.put(input);

    // Safe only because keys are UUIDs — an edited photo is a new key, so
    // no addressable object ever changes bytes.
    expect(save).toHaveBeenCalledWith(
      input.body,
      expect.objectContaining({
        contentType: 'image/webp',
        metadata: expect.objectContaining({ cacheControl: expect.stringContaining('immutable') }),
      }),
    );
  });

  it('strips a trailing slash from the public base URL', async () => {
    const { storage } = stubStorage();
    const driver = new GcsDriver(
      { bucket: 'test-bucket', publicBaseUrl: 'https://cdn.example.test/' },
      storage,
    );
    const stored = await driver.put(input);
    expect(stored.url).not.toContain('//listing');
  });

  it('turns an upstream refusal into a 502, not a 500', async () => {
    const { storage, save } = stubStorage();
    save.mockRejectedValue(new Error('403 does not have storage.objects.create access'));
    const driver = new GcsDriver(
      { bucket: 'test-bucket', publicBaseUrl: 'https://cdn.example.test' },
      storage,
    );

    await expect(driver.put(input)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('never puts the upstream message in the client response', async () => {
    const { storage, save } = stubStorage();
    // A real GCS permission error names the service account and bucket.
    save.mockRejectedValue(new Error('service-account@project.iam.gserviceaccount.com denied'));
    const driver = new GcsDriver(
      { bucket: 'test-bucket', publicBaseUrl: 'https://cdn.example.test' },
      storage,
    );

    await expect(driver.put(input)).rejects.toThrow(/not accepting uploads/i);
    await expect(driver.put(input)).rejects.not.toThrow(/gserviceaccount/);
  });

  it('resolves rather than throwing when the object is already gone', async () => {
    const { storage, del } = stubStorage();
    del.mockRejectedValue(new Error('404 Not Found'));
    const driver = new GcsDriver(
      { bucket: 'test-bucket', publicBaseUrl: 'https://cdn.example.test' },
      storage,
    );

    // The interface says removal is best-effort: a failed cleanup must
    // never fail the request that triggered it.
    await expect(driver.remove('listing/seller-1/abc.webp')).resolves.toBeUndefined();
  });
});

describe('PurposeRoutingDriver', () => {
  function spyDriver(name: string): StorageDriver & { put: jest.Mock; remove: jest.Mock } {
    return {
      name,
      put: jest.fn().mockResolvedValue({ key: 'k', url: `${name}://k`, bytes: 1, mime: 'image/webp' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('keeps application documents off the public backend', async () => {
    // FSSAI licences and identity photos. A public bucket with a
    // year-long immutable cache is not where those belong.
    const general = spyDriver('gcs');
    const sensitive = spyDriver('local');
    const driver = new PurposeRoutingDriver(general, sensitive);

    await driver.put({ ...input, scope: 'application/user-9' });

    expect(sensitive.put).toHaveBeenCalled();
    expect(general.put).not.toHaveBeenCalled();
  });

  it('sends catalogue imagery to the public backend', async () => {
    const general = spyDriver('gcs');
    const sensitive = spyDriver('local');
    const driver = new PurposeRoutingDriver(general, sensitive);

    for (const scope of ['listing/seller-1', 'menu/seller-1', 'storefront/seller-1']) {
      await driver.put({ ...input, scope });
    }

    expect(general.put).toHaveBeenCalledTimes(3);
    expect(sensitive.put).not.toHaveBeenCalled();
  });

  it('removes from whichever backend holds the key', async () => {
    const general = spyDriver('gcs');
    const sensitive = spyDriver('local');
    const driver = new PurposeRoutingDriver(general, sensitive);

    await driver.remove('application/user-9/abc.webp');
    await driver.remove('listing/seller-1/abc.webp');

    expect(sensitive.remove).toHaveBeenCalledWith('application/user-9/abc.webp');
    expect(general.remove).toHaveBeenCalledWith('listing/seller-1/abc.webp');
  });
});
