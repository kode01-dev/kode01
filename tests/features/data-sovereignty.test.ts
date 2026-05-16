import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertUrlMeetsDataSovereigntyPolicy,
  getChinaSovereigntyBlockReasonForHostname,
} from '@/lib/security/data-sovereignty';

test('getChinaSovereigntyBlockReasonForHostname blocks .cn TLD hosts', () => {
  assert.equal(getChinaSovereigntyBlockReasonForHostname('api.vendor.cn'), 'blocked_country_tld');
  assert.equal(getChinaSovereigntyBlockReasonForHostname('portal.example.com.cn'), 'blocked_country_tld');
});

test('getChinaSovereigntyBlockReasonForHostname blocks known China cloud domains', () => {
  assert.equal(
    getChinaSovereigntyBlockReasonForHostname('service.eu-central-1.aliyuncs.com'),
    'blocked_provider_domain',
  );
  assert.equal(
    getChinaSovereigntyBlockReasonForHostname('runtime.volcengine.com'),
    'blocked_provider_domain',
  );
});

test('assertUrlMeetsDataSovereigntyPolicy allows non-China infrastructure URLs', () => {
  assert.doesNotThrow(() => {
    assertUrlMeetsDataSovereigntyPolicy('https://api.brevo.com/v3/smtp/email', 'NOTIF_PROVIDER_URL');
  });
});

test('assertUrlMeetsDataSovereigntyPolicy throws for blocked China infrastructure URLs', () => {
  assert.throws(
    () => assertUrlMeetsDataSovereigntyPolicy('https://mail.example.cn/api', 'NOTIF_PROVIDER_URL'),
    /no-China data sovereignty policy/i,
  );
});

