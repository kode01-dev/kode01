/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useMarketingStore } from '../store/useMarketingStore';
import type { ActiveCampaignDisplay } from '../types';
import { resolveSafeCtaTarget } from '@/lib/security/safe-cta-navigation';

interface MarketingBannerProps {
  campaign: ActiveCampaignDisplay;
}

/**
 * Marketing banner component
 * Handles top banners, floating banners, and inline banners
 * No trigger logic - shown immediately
 */
export function MarketingBanner({ campaign }: MarketingBannerProps) {
  const [visible, setVisible] = useState(true);
  const [closing, setClosing] = useState(false);
  const { isDismissed, dismissCampaign, trackEvent } = useMarketingStore();

  // Check if campaign is dismissed
  const isAlreadyDismissed = isDismissed(campaign.campaign_id);

  // Only track view once
  React.useEffect(() => {
    if (visible && !isAlreadyDismissed) {
      trackEvent(campaign.campaign_id, 'view');
    }
  }, [campaign.campaign_id, trackEvent, visible, isAlreadyDismissed]);

  /**
   * Handle dismiss
   */
  const handleDismiss = () => {
    setClosing(true);
    trackEvent(campaign.campaign_id, 'close');

    setTimeout(() => {
      dismissCampaign(
        campaign.campaign_id,
        campaign.trigger_config.cooldownHours || 24
      );
      setVisible(false);
      setClosing(false);
    }, 300);
  };

  /**
   * Handle CTA click
   */
  const handleCTAClick = () => {
    trackEvent(campaign.campaign_id, 'click');

    const target = resolveSafeCtaTarget(campaign.cta_url);
    if (!target) return;

    if (target.kind === 'external') {
      window.open(target.href, '_blank', 'noopener,noreferrer');
      return;
    }

    window.location.assign(target.href);
  };

  if (!visible || isAlreadyDismissed) return null;

  // Top banner
  if (campaign.template_type === 'banner_top') {
    return (
      <div
        className={`
          fixed top-0 left-0 right-0 z-[99] bg-black text-white
          transition-all duration-300
          ${closing ? 'opacity-0 -translate-y-full' : 'opacity-100 translate-y-0'}
        `}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Message */}
          <p className="text-sm font-bold flex-1">{campaign.title}</p>

          {/* CTA Button */}
          {campaign.cta_text && (
            <button
              onClick={handleCTAClick}
              className="px-4 py-1.5 bg-white text-black rounded-full text-xs font-bold hover:opacity-90 transition-opacity flex-shrink-0"
            >
              {campaign.cta_text}
            </button>
          )}

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="w-6 h-6 flex items-center justify-center text-white/60 hover:text-white transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Floating banner (bottom center)
  if (campaign.template_type === 'banner_floating') {
    return (
      <div
        className={`
          fixed bottom-6 left-1/2 -translate-x-1/2 z-[99] w-[calc(100%-2rem)] max-w-[480px]
          transition-all duration-300
          ${closing ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0 animate-in fade-in slide-in-from-bottom-6'}
        `}
      >
        <div className="relative bg-white rounded-[24px] shadow-2xl overflow-hidden border border-black/10">
          {/* Content */}
          <div className="px-6 py-5 flex items-start gap-4">
            {/* Icon or visual */}
            <div className="w-12 h-12 rounded-full bg-kode01-pink/10 flex items-center justify-center flex-shrink-0">
              <div className="w-6 h-6 rounded-full bg-kode01-pink animate-pulse" />
            </div>

            {/* Text content */}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-black text-base leading-tight">
                {campaign.title}
              </p>
              {campaign.body && (
                <p className="text-black/60 text-sm font-medium mt-1">
                  {campaign.body}
                </p>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="w-6 h-6 flex items-center justify-center text-black/40 hover:text-black/60 transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* CTA Button */}
          {campaign.cta_text && (
            <div className="px-6 pb-4">
              <button
                onClick={handleCTAClick}
                className="w-full py-2.5 bg-kode01-pink text-white rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
              >
                {campaign.cta_text}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Inline banner (for page content integration)
  if (campaign.template_type === 'banner_inline') {
    return (
      <div
        className={`
          w-full bg-white rounded-[24px] border-2 border-black/10 p-8
          transition-all duration-300
          ${closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
        `}
      >
        <div className="grid grid-cols-1 md:grid-cols-[40%_60%] gap-8 items-center">
          {/* Image */}
          {campaign.image_url && (
            <img
              src={campaign.image_url}
              alt="Campaign"
              className="w-full h-48 object-cover rounded-lg"
            />
          )}

          {/* Content */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold text-black/50 mb-2">
              Featured
            </p>
            <h3 className="font-serif text-2xl font-black text-black mb-3 leading-tight">
              {campaign.title}
            </h3>
            {campaign.body && (
              <p className="text-black/70 text-sm leading-relaxed mb-6">
                {campaign.body}
              </p>
            )}

            {/* CTA Button */}
            {campaign.cta_text && (
              <button
                onClick={handleCTAClick}
                className="px-6 py-3 bg-kode01-pink text-white rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
              >
                {campaign.cta_text}
              </button>
            )}
          </div>
        </div>

        {/* Close button (top right) */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition-colors"
          aria-label="Close"
        >
          <X size={14} className="text-black/60" />
        </button>
      </div>
    );
  }

  return null;
}
