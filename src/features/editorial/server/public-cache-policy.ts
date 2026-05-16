export type EditorialPublicStatus = 'draft' | 'published';

export function shouldRevalidateOnEditorialCreate(status: EditorialPublicStatus): boolean {
  return status === 'published';
}

export function shouldRevalidateOnEditorialUpdate(
  previousStatus: EditorialPublicStatus,
  nextStatus: EditorialPublicStatus,
): boolean {
  return previousStatus === 'published' || nextStatus === 'published';
}

export function shouldRevalidateOnEditorialDelete(previousStatus: EditorialPublicStatus): boolean {
  return previousStatus === 'published';
}

