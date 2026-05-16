'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import type { MarketTranslationFn } from './market-utils';

interface MarketHeroSectionProps {
  t: MarketTranslationFn;
  locale: string;
  loading: boolean;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  totalResults: number;
}

const SEARCH_DEBOUNCE_MS = 300;

export function MarketHeroSection({
  t,
  locale,
  loading,
  searchTerm,
  setSearchTerm,
  totalResults,
}: MarketHeroSectionProps): React.JSX.Element {
  const [inputValue, setInputValue] = useState(searchTerm);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const normalizedInput = useMemo(
    () => inputValue.replace(/\s+/g, ' ').trim(),
    [inputValue],
  );

  useEffect(() => {
    setInputValue(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchTerm(inputValue);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [inputValue, setSearchTerm]);

  useEffect(() => {
    if (!normalizedInput) {
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      const requestId = ++requestIdRef.current;

      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(normalizedInput)}`, {
          method: 'GET',
          signal: controller.signal,
        });

        if (!response.ok) {
          if (requestId === requestIdRef.current) {
            setSuggestions([]);
            setActiveSuggestionIndex(-1);
          }
          return;
        }

        const payload = await response.json() as { suggestions?: unknown };
        if (requestId !== requestIdRef.current) return;

        const nextSuggestions = Array.isArray(payload.suggestions)
          ? payload.suggestions.filter((entry): entry is string => typeof entry === 'string').slice(0, 5)
          : [];

        setSuggestions(nextSuggestions);
        setActiveSuggestionIndex(nextSuggestions.length > 0 ? 0 : -1);
      } catch {
        if (requestId === requestIdRef.current) {
          setSuggestions([]);
          setActiveSuggestionIndex(-1);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [normalizedInput]);

  const applySuggestion = (value: string) => {
    setInputValue(value);
    setSearchTerm(value);
    setSuggestions([]);
    setActiveSuggestionIndex(-1);
    setIsFocused(false);
  };

  const showSuggestions = isFocused && normalizedInput.length > 0 && suggestions.length > 0;

  return (
    <section className="py-10 md:py-14 text-center relative flex flex-col items-center">
      <div className="absolute top-0 left-0 w-32 h-32 bg-kode01-pink rounded-full opacity-20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-48 h-48 bg-kode01-green rounded-full opacity-10 blur-3xl pointer-events-none" />

      <h1 className="text-[clamp(2.7rem,8vw,5rem)] font-serif font-black tracking-tight leading-[0.92] text-kode01-noir mb-4">
        {t('hero.title')}
      </h1>
      <p className="hidden md:block text-lg md:text-xl font-medium text-kode01-noir/60 max-w-[600px] mx-auto leading-relaxed mb-5">
        {t('hero.description')}
      </p>

      <div className="w-full max-w-[600px] relative" ref={containerRef}>
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-kode01-noir/40" size={24} />
        <input
          id="market-filters-search-input"
          type="text"
          placeholder={t('filters.search_placeholder')}
          value={inputValue}
          onFocus={() => setIsFocused(true)}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (!showSuggestions) {
              if (event.key === 'Escape') {
                setIsFocused(false);
              }
              return;
            }

            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveSuggestionIndex((current) => {
                const next = current + 1;
                return next >= suggestions.length ? 0 : next;
              });
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveSuggestionIndex((current) => {
                if (current <= 0) return suggestions.length - 1;
                return current - 1;
              });
            } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
              event.preventDefault();
              const selected = suggestions[activeSuggestionIndex];
              if (selected) applySuggestion(selected);
            } else if (event.key === 'Escape') {
              setIsFocused(false);
            }
          }}
          className="w-full border-2 border-black/10 rounded-full py-4 pl-16 pr-12 text-lg focus:outline-none focus:border-kode01-pink/50 transition-colors bg-white/50 backdrop-blur-sm text-kode01-noir placeholder:text-kode01-noir/40 shadow-sm"
          aria-label={locale === 'fr' ? 'Recherche produits' : 'Product search'}
          autoComplete="off"
          spellCheck={false}
        />
        {inputValue && (
          <button
            type="button"
            onClick={() => {
              setInputValue('');
              setSearchTerm('');
              setSuggestions([]);
              setActiveSuggestionIndex(-1);
            }}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-kode01-noir/40 hover:text-kode01-pink transition-colors cursor-pointer animate-in fade-in duration-150"
            aria-label={locale === 'fr' ? 'Effacer la recherche' : 'Clear search'}
          >
            <X size={20} />
          </button>
        )}

        {showSuggestions && (
          <div className="absolute mt-2 w-full rounded-2xl border border-black/10 bg-white shadow-xl overflow-hidden z-40 text-left">
            <ul>
              {suggestions.map((suggestion, index) => {
                const isActive = index === activeSuggestionIndex;
                return (
                  <li key={`${suggestion}-${index}`}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applySuggestion(suggestion)}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      className={cn(
                        'w-full px-4 py-3 text-sm md:text-base transition-colors cursor-pointer',
                        isActive
                          ? 'bg-kode01-pink/10 text-kode01-noir'
                          : 'bg-white text-kode01-noir/80 hover:bg-kode01-noir/5 hover:text-kode01-noir',
                      )}
                    >
                      {suggestion}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!loading && searchTerm.trim() && (
          <p className="text-xs text-kode01-noir/40 mt-2 text-center animate-in fade-in duration-200">
            {t('filters.found_count', { count: totalResults })}
          </p>
        )}
      </div>
    </section>
  );
}
