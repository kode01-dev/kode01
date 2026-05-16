/* eslint-disable @next/next/no-img-element */
'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { ActiveCampaignDisplay, MarketingTemplate } from '../types';

interface CampaignPreviewProps {
  template?: MarketingTemplate;
  data: Partial<ActiveCampaignDisplay>;
}

export function CampaignPreview({ template, data }: CampaignPreviewProps) {
  const templateType = template?.template_type || data.template_type || 'popup_center';

  // Top Banner Preview
  if (templateType === 'banner_top') {
    return (
      <div className="bg-white rounded-[24px] border border-black/5 overflow-hidden shadow-sm p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-black/60 mb-4">Preview: Top Banner</p>

        <div className="bg-black text-white rounded-lg overflow-hidden">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm font-bold flex-1 truncate">{data.title || 'Banner title'}</p>
            {data.cta_text && (
              <button className="px-4 py-1.5 bg-white text-black rounded-full text-xs font-bold hover:opacity-90">
                {data.cta_text}
              </button>
            )}
            <X size={16} className="text-white/60" />
          </div>
        </div>
      </div>
    );
  }

  // Floating Banner Preview
  if (templateType === 'banner_floating') {
    return (
      <div className="bg-white rounded-[24px] border border-black/5 overflow-hidden shadow-sm p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-black/60 mb-4">Preview: Floating Banner</p>

        <div className="max-w-xs mx-auto">
          <div className="relative bg-white rounded-[24px] shadow-2xl overflow-hidden border border-black/10">
            <div className="px-6 py-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-kode01-pink/10 flex items-center justify-center flex-shrink-0">
                <div className="w-6 h-6 rounded-full bg-kode01-pink animate-pulse" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-black text-base leading-tight">{data.title || 'Banner title'}</p>
                {data.body && (
                  <p className="text-black/60 text-sm font-medium mt-1">{data.body}</p>
                )}
              </div>

              <X size={16} className="text-black/40 flex-shrink-0" />
            </div>

            {data.cta_text && (
              <div className="px-6 pb-4">
                <button className="w-full py-2.5 bg-kode01-pink text-white rounded-full font-bold text-sm hover:opacity-90">
                  {data.cta_text}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Inline Banner Preview
  if (templateType === 'banner_inline') {
    return (
      <div className="bg-white rounded-[24px] border border-black/5 overflow-hidden shadow-sm p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-black/60 mb-4">Preview: Inline Banner</p>

        <div className="w-full bg-white rounded-[24px] border-2 border-black/10 p-6">
          <div className="grid grid-cols-1 md:grid-cols-[40%_60%] gap-6 items-center">
            {data.image_url && (
              <img
                src={data.image_url}
                alt="Campaign"
                className="w-full h-32 object-cover rounded-lg"
              />
            )}

            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-black/50 mb-2">Featured</p>
              <h3 className="font-serif text-lg font-black text-black mb-2 leading-tight">
                {data.title || 'Campaign title'}
              </h3>
              {data.body && (
                <p className="text-black/70 text-xs leading-relaxed mb-4">
                  {data.body}
                </p>
              )}

              {data.cta_text && (
                <button className="px-4 py-2 bg-kode01-pink text-white rounded-full font-bold text-xs hover:opacity-90">
                  {data.cta_text}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Center Modal / Corner Popup (default)
  const isCorner = templateType?.startsWith('popup_corner');

  return (
    <div className="bg-white rounded-[24px] border border-black/5 overflow-hidden shadow-sm p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-black/60 mb-4">
        Preview: {isCorner ? 'Corner Popup' : 'Center Modal'}
      </p>

      <div className={`relative ${isCorner ? 'h-64' : 'h-80'} bg-black/5 rounded-[16px] border border-black/10 flex items-center justify-center`}>
        {/* Overlay (only for center modals) */}
        {!isCorner && (
          <div className="absolute inset-0 bg-black/20 rounded-[16px]" />
        )}

        {/* Popup Card */}
        <div className={`relative bg-white rounded-[24px] shadow-2xl w-full max-w-xs ${isCorner ? '' : 'max-h-96'} overflow-hidden`}>
          {/* Close button */}
          <button className="absolute top-5 right-5 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10">
            <X size={16} className="text-black/60" />
          </button>

          {/* Image (optional) */}
          {data.image_url && (
            <img
              src={data.image_url}
              alt="Campaign"
              className="w-full h-32 object-cover"
            />
          )}

          {/* Content */}
          <div className="px-6 py-5">
            {/* Title */}
            <h2 className="font-serif text-lg font-bold text-black leading-tight">
              {data.title || 'Campaign title'}
            </h2>

            {/* Body */}
            {data.body && (
              <p className="text-black/70 text-xs font-sans leading-relaxed mt-2">
                {data.body}
              </p>
            )}

            {/* CTA Button */}
            {data.cta_text && (
              <button className="mt-4 w-full py-2.5 bg-kode01-pink text-white rounded-full font-bold text-xs hover:opacity-90">
                {data.cta_text}
              </button>
            )}

            {/* Dismiss link (for corner popups) */}
            {isCorner && (
              <button className="mt-2 w-full text-center text-black/50 text-xs hover:text-black/70">
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Info text */}
      <div className="mt-4 p-3 bg-black/5 rounded-[12px]">
        <p className="text-xs text-black/60">
          <strong>Trigger:</strong> {data.trigger_type || 'page_load'} {data.trigger_config?.delay ? `(${data.trigger_config.delay}ms)` : ''}
        </p>
      </div>
    </div>
  );
}
