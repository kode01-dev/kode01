import { DEFAULT_HOMEPAGE_SECTIONS } from './catalog';
import { HomepageSectionConfig } from './types';

export function getDefaultSections(): HomepageSectionConfig[] {
  return DEFAULT_HOMEPAGE_SECTIONS.map((section) => ({
    ...section,
    content: { ...section.content },
    settings: { ...section.settings },
  }));
}
