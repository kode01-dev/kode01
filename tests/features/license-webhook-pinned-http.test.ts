import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {
  choosePinnedWebhookAddress,
  postWebhookWithPinnedDns,
} from '@/features/licenses/server/pinned-webhook-http';

test('choosePinnedWebhookAddress chooses an IP address from validated DNS results', () => {
  assert.equal(choosePinnedWebhookAddress(['not-an-ip', '93.184.216.34']), '93.184.216.34');
  assert.throws(
    () => choosePinnedWebhookAddress(['not-an-ip']),
    /No resolved IP address available/,
  );
});

test('postWebhookWithPinnedDns connects to the pinned IP and preserves the original Host header', async () => {
  const server = http.createServer();

  const observedRequest = new Promise<{
    body: string;
    host: string | undefined;
    method: string | undefined;
    path: string | undefined;
    signature: string | string[] | undefined;
  }>((resolve, reject) => {
    server.once('request', (req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('error', reject);
      req.on('end', () => {
        res.statusCode = 202;
        res.end('accepted');
        resolve({
          body,
          host: req.headers.host,
          method: req.method,
          path: req.url,
          signature: req.headers['x-kode01-signature'],
        });
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    const response = await postWebhookWithPinnedDns({
      url: `http://public.example:${address.port}/license?delivery=1`,
      resolvedAddresses: ['127.0.0.1'],
      headers: {
        'Content-Type': 'application/json',
        'x-kode01-signature': 'sha256=test-signature',
      },
      body: '{"eventId":"evt_123"}',
      timeoutMs: 1_000,
    });

    const request = await observedRequest;
    assert.equal(response.ok, true);
    assert.equal(response.status, 202);
    assert.equal(response.text, 'accepted');
    assert.equal(request.method, 'POST');
    assert.equal(request.path, '/license?delivery=1');
    assert.equal(request.host, `public.example:${address.port}`);
    assert.equal(request.signature, 'sha256=test-signature');
    assert.equal(request.body, '{"eventId":"evt_123"}');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
