// Shared utility for Next.js cache revalidation
import { getEdgeEnv } from "./env.ts";

/**
 * Triggers Next.js cache revalidation for specific tags.
 */
export async function revalidateCache(tags: string[]) {
  const env = getEdgeEnv();
  const siteUrl = env.appBaseUrl;
  const token = env.edgeInternalAuthToken;

  if (!siteUrl || !token) {
    console.warn("Skipping cache revalidation: siteUrl or internalToken missing");
    return;
  }

  try {
    const res = await fetch(`${siteUrl}/api/internal/cache/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-auth": token,
      },
      body: JSON.stringify({ tags }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`Cache revalidation failed: ${res.status} ${error}`);
      return;
    }

    console.log(`Cache revalidation triggered for tags: ${tags.join(", ")}`);
  } catch (error) {
    console.error("Error triggering cache revalidation:", error);
  }
}
