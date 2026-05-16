/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useMarketingStore } from '../store/useMarketingStore';
import type { ActiveCampaignDisplay } from '../types';
import { resolveSafeCtaTarget } from '@/lib/security/safe-cta-navigation';

interface MarketingPopupProps {
  campaign: ActiveCampaignDisplay;
}

/**
 * Marketing popup component
 * Handles modal and corner popups with trigger logic
 * Supports: page_load, scroll_depth, time_delay, exit_intent
 */
export function MarketingPopup({ campaign }: MarketingPopupProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const { isDismissed, dismissCampaign, trackEvent } = useMarketingStore();

  // Check if campaign is dismissed
  const isAlreadyDismissed = isDismissed(campaign.campaign_id);

  /**
   * Handle popup close with animation
   */
  const handleClose = () => {
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

  /**
   * Setup triggers on mount
   */
  useEffect(() => {
    // Don't show if already dismissed
    if (isAlreadyDismissed) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let scrollListenerId: (() => void) | null = null;
    let mouseLeaveListenerId: ((e: MouseEvent) => void) | null = null;

    const showPopup = () => {
      setVisible(true);
      trackEvent(campaign.campaign_id, 'view');
    };

    // Trigger: page_load
    if (campaign.trigger_type === 'page_load') {
      timeoutId = setTimeout(
        showPopup,
        campaign.trigger_config.delay || 0
      );
    }

    // Trigger: scroll_depth
    if (campaign.trigger_type === 'scroll_depth') {
      scrollListenerId = () => {
        const scrollPercent =
          (window.scrollY /
            (document.documentElement.scrollHeight - window.innerHeight)) *
          100;

        if (scrollPercent >= (campaign.trigger_config.scrollDepth || 50)) {
          showPopup();
          if (scrollListenerId) {
            window.removeEventListener('scroll', scrollListenerId);
          }
        }
      };

      window.addEventListener('scroll', scrollListenerId);
    }

    // Trigger: time_delay (on page)
    if (campaign.trigger_type === 'time_delay') {
      timeoutId = setTimeout(
        showPopup,
        campaign.trigger_config.delay || 2000
      );
    }

    // Trigger: exit_intent
    if (campaign.trigger_type === 'exit_intent') {
      mouseLeaveListenerId = (e: MouseEvent) => {
        // Show when mouse leaves top of page (moving to close/address bar)
        if (e.clientY <= 0) {
          showPopup();
          document.removeEventListener('mouseleave', mouseLeaveListenerId!);
        }
      };
      document.addEventListener('mouseleave', mouseLeaveListenerId);
    }

    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (scrollListenerId) {
        window.removeEventListener('scroll', scrollListenerId);
      }
      if (mouseLeaveListenerId) {
        document.removeEventListener('mouseleave', mouseLeaveListenerId);
      }
    };
  }, [campaign, isAlreadyDismissed, trackEvent, dismissCampaign]);

  if (!visible || isAlreadyDismissed) return null;

  // Determine position classes based on template type
  const positionClass =
    campaign.template_type === 'popup_corner_br'
      ? 'fixed bottom-6 right-6'
      : campaign.template_type === 'popup_corner_bl'
        ? 'fixed bottom-6 left-6'
        : 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';

  return (
    <>
      {/* Overlay (only for center popups) */}
      {campaign.template_type === 'popup_center' && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        />
      )}

      {/* Popup */}
      <div
        className={`
          ${positionClass}
          z-[101] w-full max-w-[440px] bg-white rounded-[24px] shadow-2xl
          transition-all duration-300
          ${
            closing
              ? 'opacity-0 scale-95'
              : 'opacity-100 scale-100 animate-in fade-in zoom-in-95'
          }
        `}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition-colors"
          aria-label="Close"
        >
          <X size={16} className="text-black/60" />
        </button>

        {/* Image (optional) */}
        {campaign.image_url && (
          <img
            src={campaign.image_url}
            alt="Campaign"
            className="w-full h-48 object-cover rounded-t-[24px]"
          />
        )}

        {/* Content */}
        <div className="px-8 py-6">
          {/* Title */}
          <h2 className="font-serif text-[1.75rem] font-bold text-black leading-tight mb-2">
            {campaign.title}
          </h2>

          {/* Body */}
          {campaign.body && (
            <p className="text-black/70 text-sm font-sans leading-relaxed mb-4">
              {campaign.body}
            </p>
          )}

          {/* CTA Button */}
          {campaign.cta_text && campaign.cta_url && (
            <button
              onClick={handleCTAClick}
              className="mt-6 w-full py-3.5 bg-kode01-pink text-black rounded-full font-bold text-sm hover:opacity-90 transition-all active:scale-95"
            >
              {campaign.cta_text}
            </button>
          )}

          {/* Dismiss link (for corner popups) */}
          {campaign.template_type.startsWith('popup_corner') && (
            <button
              onClick={handleClose}
              className="mt-3 w-full text-center text-black/50 text-xs hover:text-black/70 transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </>
  );
}
