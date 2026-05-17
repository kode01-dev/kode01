import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

export type PinnedWebhookHttpResponse = {
  ok: boolean;
  status: number;
  text: string;
};

type PostWebhookWithPinnedDnsInput = {
  url: string;
  resolvedAddresses: string[];
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
};

function resolveDefaultPort(url: URL): number {
  if (url.port) return Number.parseInt(url.port, 10);
  return url.protocol === 'https:' ? 443 : 80;
}

export function choosePinnedWebhookAddress(resolvedAddresses: string[]): string {
  const pinnedAddress = resolvedAddresses.find((address) => isIP(address) !== 0);
  if (!pinnedAddress) {
    throw new Error('No resolved IP address available for pinned webhook delivery');
  }
  return pinnedAddress;
}

export async function postWebhookWithPinnedDns({
  url,
  resolvedAddresses,
  headers,
  body,
  timeoutMs,
}: PostWebhookWithPinnedDnsInput): Promise<PinnedWebhookHttpResponse> {
  const parsedUrl = new URL(url);
  const pinnedAddress = choosePinnedWebhookAddress(resolvedAddresses);
  const pinnedAddressFamily = isIP(pinnedAddress);
  if (pinnedAddressFamily !== 4 && pinnedAddressFamily !== 6) {
    throw new Error('Invalid pinned webhook IP address');
  }

  const bodyBuffer = Buffer.from(body);
  const requestOptions: https.RequestOptions = {
    protocol: parsedUrl.protocol,
    hostname: pinnedAddress,
    port: resolveDefaultPort(parsedUrl),
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    method: 'POST',
    headers: {
      ...headers,
      Host: parsedUrl.host,
      'Content-Length': String(bodyBuffer.byteLength),
    },
    servername: isIP(parsedUrl.hostname) === 0 ? parsedUrl.hostname : undefined,
    lookup: (_hostname, _options, callback) => {
      callback(null, pinnedAddress, pinnedAddressFamily);
    },
  };

  const transport = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(requestOptions, (response) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });

      response.on('end', () => {
        const status = response.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('license_webhook_timeout'));
    });

    request.on('error', reject);
    request.write(bodyBuffer);
    request.end();
  });
}
