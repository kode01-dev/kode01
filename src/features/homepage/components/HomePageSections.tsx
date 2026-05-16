'use client';

export { LazyMountSection } from './homepage-sections/LazyMountSection';
export {
    HOMEPAGE_INLINE_STYLES,
    HOMEPAGE_LAZY_SECTION_TYPES,
} from './homepage-sections/constants';
export {
    renderHomepageLazySectionFallback,
    renderHomepageSection,
} from './homepage-sections/renderers';
export type { Product } from './homepage-sections/sections/ProductsSection';