import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const send = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send })),
  PutObjectCommand: vi.fn((i) => ({ kind: 'put', ...i })),
  GetObjectCommand: vi.fn((i) => ({ kind: 'get', ...i })),
  DeleteObjectCommand: vi.fn((i) => ({ kind: 'delete', ...i })),
}));

describe('storage', () => {
  beforeEach(() => {
    send.mockReset();
    vi.resetModules();
  });

  it('uses local disk when no bucket is configured, and 404s a missing file', async () => {
    vi.stubEnv('S3_BUCKET', '');
    const storage = await import('../lib/storage');
    expect(storage.storageBackend()).toBe('local');
    const key = await storage.saveFile('org-1', Buffer.from('hello'));
    const chunks: Buffer[] = [];
    for await (const c of await storage.readFile(key)) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    await storage.deleteFile(key);
    await expect(storage.readFile(key)).rejects.toMatchObject({ status: 404 });
  });

  it('talks to the bucket when S3 is configured', async () => {
    vi.stubEnv('S3_BUCKET', 'kaya-files');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'id');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'secret');
    vi.resetModules();
    const storage = await import('../lib/storage');
    expect(storage.storageBackend()).toBe('s3');

    send.mockResolvedValueOnce({});
    const key = await storage.saveFile('org-1', Buffer.from('x'));
    expect(send.mock.calls[0]![0]).toMatchObject({ kind: 'put', Bucket: 'kaya-files', Key: key });

    send.mockResolvedValueOnce({ Body: Readable.from(['data']) });
    await storage.readFile(key);
    expect(send.mock.calls[1]![0]).toMatchObject({ kind: 'get', Key: key });

    send.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NoSuchKey' }));
    await expect(storage.readFile('gone')).rejects.toMatchObject({ status: 404 });

    send.mockResolvedValueOnce({});
    await storage.deleteFile(key);
    expect(send.mock.calls[3]![0]).toMatchObject({ kind: 'delete', Key: key });
  });
});
