import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWebhookEndpointUrl } from '@/features/licenses/server/webhook-url-safety';

test('validateWebhookEndpointUrl accepts public HTTPS hosts', async () => {
  const result = await validateWebhookEndpointUrl('https://example.com/webhooks/license', {
    resolveHostname: async (hostname) => {
      assert.equal(hostname, 'example.com');
      return ['93.184.216.34'];
    },
  });
  assert.equal(result.ok, true);
});

test('validateWebhookEndpointUrl blocks local hostnames and private IP literals', async () => {
  const localhostResult = await validateWebhookEndpointUrl('https://localhost/webhooks/license');
  assert.equal(localhostResult.ok, false);
  if (!localhostResult.ok) {
    assert.equal(localhostResult.reason, 'blocked_hostname');
  }

  const privateIpResult = await validateWebhookEndpointUrl('http://127.0.0.1:8080/hook');
  assert.equal(privateIpResult.ok, false);
  if (!privateIpResult.ok) {
    assert.equal(privateIpResult.reason, 'blocked_ip_literal');
  }
});

test('validateWebhookEndpointUrl blocks unsupported protocols and credentials in URL', async () => {
  const protocolResult = await validateWebhookEndpointUrl('ftp://example.com/hook');
  assert.equal(protocolResult.ok, false);
  if (!protocolResult.ok) {
    assert.equal(protocolResult.reason, 'invalid_protocol');
  }

  const credentialsResult = await validateWebhookEndpointUrl('https://user:pass@example.com/hook');
  assert.equal(credentialsResult.ok, false);
  if (!credentialsResult.ok) {
    assert.equal(credentialsResult.reason, 'contains_credentials');
  }
});

test('validateWebhookEndpointUrl blocks non-standard ports', async () => {
  const result = await validateWebhookEndpointUrl('https://example.com:8443/hook');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'invalid_port');
  }
});

test('validateWebhookEndpointUrl blocks hostnames that resolve to private ranges', async () => {
  const result = await validateWebhookEndpointUrl('https://safe.example/hook', {
    resolveHostname: async (hostname) => {
      assert.equal(hostname, 'safe.example');
      return ['10.0.0.5'];
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'blocked_resolved_ip');
  }
});

test('validateWebhookEndpointUrl fails closed when hostname resolution fails', async () => {
  const result = await validateWebhookEndpointUrl('https://safe.example/hook', {
    resolveHostname: async () => {
      throw new Error('dns unavailable');
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'hostname_resolution_failed');
  }
});
