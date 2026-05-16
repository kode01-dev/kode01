export async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function normalizeEditionKey(value: string) {
  return value.trim().toUpperCase();
}

export function isValidEditionKey(value: string) {
  return /^[A-Z0-9][A-Z0-9_-]*$/.test(value) && value.length >= 3 && value.length <= 64;
}
