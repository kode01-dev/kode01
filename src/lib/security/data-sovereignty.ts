type ChinaSovereigntyBlockReason = 'blocked_country_tld' | 'blocked_provider_domain';

const BLOCKED_COUNTRY_TLD_SUFFIXES = [
  '.cn',
  '.xn--fiqs8s', // .中国
  '.xn--fiqz9s', // .中國
] as const;

const BLOCKED_PROVIDER_DOMAIN_SUFFIXES = [
  '.aliyun.com',
  '.aliyuncs.com',
  '.alibabacloud.com',
  '.alibaba.com.cn',
  '.tencent.com',
  '.tencentcloud.com',
  '.tencentcloudapi.com',
  '.qcloud.com',
  '.myqcloud.com',
  '.baidu.com',
  '.bdstatic.com',
  '.baidubce.com',
  '.huawei.com',
  '.huaweicloud.com',
  '.jdcloud.com',
  '.bytedance.com',
  '.volcengine.com',
  '.volces.com',
  '.chinacloudapi.cn',
  '.amazonaws.com.cn',
] as const;

function normalizeHostname(rawHostname: string): string {
  return rawHostname.trim().toLowerCase().replace(/\.+$/, '');
}

function matchesSuffix(hostname: string, suffix: string): boolean {
  const normalizedSuffix = suffix.startsWith('.') ? suffix.slice(1) : suffix;
  return hostname === normalizedSuffix || hostname.endsWith(`.${normalizedSuffix}`);
}

export function getChinaSovereigntyBlockReasonForHostname(
  rawHostname: string,
): ChinaSovereigntyBlockReason | null {
  const hostname = normalizeHostname(rawHostname);
  if (!hostname) return 'blocked_provider_domain';

  if (BLOCKED_COUNTRY_TLD_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return 'blocked_country_tld';
  }

  if (BLOCKED_PROVIDER_DOMAIN_SUFFIXES.some((suffix) => matchesSuffix(hostname, suffix))) {
    return 'blocked_provider_domain';
  }

  return null;
}

export function assertUrlMeetsDataSovereigntyPolicy(rawUrl: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL for ${label}: ${rawUrl}`);
  }

  const reason = getChinaSovereigntyBlockReasonForHostname(parsed.hostname);
  if (!reason) return;

  throw new Error(
    `Blocked ${label}: hostname "${parsed.hostname}" violates no-China data sovereignty policy (${reason}).`,
  );
}

