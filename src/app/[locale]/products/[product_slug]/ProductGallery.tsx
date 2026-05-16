'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Play } from 'lucide-react';
import { parseVideoUrl } from '@/features/market/lib/video-embed';

type GalleryItem =
  | { type: 'image'; src: string }
  | { type: 'video'; src: string; embedUrl: string; thumbnailUrl: string; provider: string };

interface ProductGalleryProps {
  coverImage: string;
  videoUrl: string | null;
  galleryUrls: string[];
  title: string;
  categoryBadge: React.ReactNode;
  priceBadge?: React.ReactNode;
}

export function ProductGallery({
  coverImage,
  videoUrl,
  galleryUrls,
  title,
  categoryBadge,
  priceBadge,
}: ProductGalleryProps) {
  const items = useMemo<GalleryItem[]>(() => {
    const result: GalleryItem[] = [];

    if (videoUrl) {
      const parsed = parseVideoUrl(videoUrl);
      if (parsed) {
        result.push({
          type: 'video',
          src: videoUrl,
          embedUrl: parsed.embedUrl,
          thumbnailUrl: parsed.thumbnailUrl,
          provider: parsed.provider,
        });
      }
    }

    result.push({ type: 'image', src: coverImage });

    for (const url of galleryUrls) {
      if (url && url !== coverImage) {
        result.push({ type: 'image', src: url });
      }
    }

    return result;
  }, [videoUrl, coverImage, galleryUrls]);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeItem = items[activeIndex] ?? items[0];
  const hasMultiple = items.length > 1;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!hasMultiple) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
      }
    },
    [hasMultiple, items.length],
  );

  // Touch swipe for mobile gallery navigation
  const touchStartX = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!hasMultiple) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(deltaX) > 50) {
        if (deltaX < 0) {
          setActiveIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
        } else {
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
        }
      }
    },
    [hasMultiple, items.length],
  );

  return (
    <div>
      {/* Main Display */}
      <div
        className="rounded-[20px] md:rounded-[40px] overflow-hidden border border-black/5 aspect-[16/10] sm:aspect-[4/3] lg:aspect-auto lg:h-[540px] xl:h-[620px] relative bg-white group shadow-2xl lg:sticky lg:top-32 focus:outline-none focus:ring-2 focus:ring-kode01-pink/40"
        tabIndex={hasMultiple ? 0 : undefined}
        onKeyDown={hasMultiple ? handleKeyDown : undefined}
        onTouchStart={hasMultiple ? handleTouchStart : undefined}
        onTouchEnd={hasMultiple ? handleTouchEnd : undefined}
      >
        {activeItem.type === 'image' ? (
          <>
            <Image
              src={activeItem.src}
              alt={title}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-80" />
          </>
        ) : (
          <iframe
            src={activeItem.embedUrl}
            title={`${title} – video demo`}
            className="absolute inset-0 w-full h-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}
        {categoryBadge}
        {priceBadge}
      </div>

      {/* Gallery Navigation */}
      {hasMultiple && (
        <>
          {/* Dot indicators: mobile only */}
          <div className="flex justify-center gap-2 mt-3 sm:hidden" role="tablist">
            {items.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={`Slide ${i + 1}`}
                onClick={() => setActiveIndex(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === activeIndex
                    ? 'w-6 bg-kode01-pink'
                    : 'w-2 bg-kode01-noir/20'
                }`}
              />
            ))}
          </div>

          {/* Thumbnail strip: sm+ only */}
          <div className="hidden sm:flex gap-3 mt-4 overflow-x-auto pb-2" role="tablist">
            {items.map((item, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === activeIndex}
                onClick={() => setActiveIndex(i)}
                className={`relative flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden transition-all ${
                  i === activeIndex
                    ? 'border-2 border-kode01-pink scale-105 opacity-100'
                    : 'border-2 border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                {item.type === 'image' ? (
                  <Image
                    src={item.src}
                    alt={`${title} – ${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                ) : (
                  <>
                    <Image
                      src={item.thumbnailUrl}
                      alt={`${title} – video`}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play size={20} className="text-white fill-white drop-shadow-lg" />
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
