import type { HomepageSectionType } from '@/features/homepage-layout/types';
import { PUBLIC_MARKETPLACE_ENABLED } from '@/config/marketplace';

export const HOMEPAGE_INLINE_STYLES = `
body {
  background-color: #F4F1EA !important;
}

.artifacts-page {
  background-color: #F4F1EA;
  font-family: var(--font-dm-sans), sans-serif;
  color: #1A1A1A;
  min-height: 100vh;
  overflow-x: hidden;
}

.marquee-container {
    background: #F291C8;
    border-top: 3px solid #050505;
    border-bottom: 3px solid #050505;
    padding: 1rem 0;
    overflow: hidden;
    transform: rotate(-2deg) scale(1.05);
    margin: 0.5rem 0 4rem 0;
    position: relative;
    z-index: 10;
}

.marquee-content {
    display: flex;
    gap: 3rem;
    white-space: nowrap;
    animation: scroll 20s linear infinite;
}

.marquee-item {
    font-family: var(--font-dm-sans), sans-serif;
    font-size: 1.8rem;
    color: #050505;
    text-transform: uppercase;
    font-weight: 800;
}

@keyframes scroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
}

.marquee-container:hover .marquee-content {
    animation-play-state: paused;
}

@media (max-width: 768px) {
    .marquee-container {
        padding: 0.5rem 0;
        margin: 0.25rem 0 2rem 0;
        border-top-width: 2px;
        border-bottom-width: 2px;
    }
    .marquee-item {
        font-size: 1rem;
    }
    .marquee-content {
        gap: 1.5rem;
    }
}
`;

export const HOMEPAGE_LAZY_SECTION_TYPES = new Set<HomepageSectionType>([
    ...(PUBLIC_MARKETPLACE_ENABLED ? (['products_latest', 'top_deals'] as const) : []),
    'news_latest',
    'stats',
]);
