const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

export function isSellerVaultPath(path: string, sellerUserId: string): boolean {
  const prefix = `digital_file/${sellerUserId}/`;

  return (
    path.startsWith(prefix) &&
    path.length > prefix.length &&
    !path.includes('..') &&
    !path.includes('\\') &&
    !path.includes('//') &&
    !CONTROL_CHAR_PATTERN.test(path)
  );
}

export function isOptionalSellerVaultPath(path: string | null | undefined, sellerUserId: string): boolean {
  return path == null || isSellerVaultPath(path, sellerUserId);
}
