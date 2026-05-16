'use client';

import { useTranslations } from 'next-intl';
import React from 'react';
import Image from 'next/image';

/**
 * AI Platforms configuration with EXACT official brand icons from user provided references
 */
const AI_PLATFORMS = [
  {
    name: 'ChatGPT',
    url: (prompt: string) => `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`,
    iconPath: '/images/ai-icons/chatgpt.svg',
    id: 'chatgpt'
  },
  {
    name: 'Claude',
    url: (prompt: string) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
    iconPath: '/images/ai-icons/claude.svg',
    id: 'claude'
  },
  {
    name: 'Mistral',
    url: (prompt: string) => `https://chat.mistral.ai/chat?q=${encodeURIComponent(prompt)}`,
    iconPath: '/images/ai-icons/mistral.svg',
    id: 'mistral'
  },
  {
    name: 'Gemini',
    // Switched to AI Studio because gemini.google.com does not natively support pre-filled prompts via URL parameters
    url: (prompt: string) => `https://aistudio.google.com/app/prompts/new_chat?text=${encodeURIComponent(prompt)}`,
    id: 'gemini',
    iconPath: '/images/ai-icons/Gemini.svg'
  },
  {
    name: 'Perplexity',
    url: (prompt: string) => `https://www.perplexity.ai/?q=${encodeURIComponent(prompt)}`,
    iconPath: '/images/ai-icons/perplexity.svg',
    id: 'perplexity'
  }
];

/**
 * AskAiSection - Using EXACT official brand icons from user references
 */
export function AskAiSection() {
  const t = useTranslations('layout.footer.ask_ai');
  const prompt = t('prompt');

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-white/40 font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs">
        {t('title')}
      </h3>
      <div className="flex flex-wrap gap-2">
        {AI_PLATFORMS.map((platform) => (
          <a
            key={platform.name}
            href={platform.url(prompt)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-10 h-10 bg-white/5 border border-white/10 transition-all duration-300 hover:bg-white/10 hover:border-white/20 active:scale-95 group"
            title={`${platform.name}: ${t('title')}`}
            aria-label={`${platform.name}: ${t('title')}`}
            id={`ask-ai-${platform.id}`}
          >
            <div className="relative w-5 h-5 transition-all duration-300 opacity-40 group-hover:opacity-100 group-hover:scale-110 brightness-0 invert">
              <Image
                src={platform.iconPath}
                alt={platform.name}
                fill
                className="object-contain"
              />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
