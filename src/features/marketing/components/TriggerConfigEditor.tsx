'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { TriggerConfig, MarketingTriggerType } from '../types';

interface TriggerConfigEditorProps {
  triggerType: MarketingTriggerType;
  value: TriggerConfig;
  onChange: (config: TriggerConfig) => void;
}

export function TriggerConfigEditor({ triggerType, value, onChange }: TriggerConfigEditorProps) {
  const t = useTranslations('marketing.form');

  const updateConfig = <K extends keyof TriggerConfig>(key: K, val: TriggerConfig[K]) => {
    onChange({
      ...value,
      [key]: val,
    });
  };

  return (
    <div className="space-y-4">
      {/* Delay (for page_load, time_delay) */}
      {(triggerType === 'page_load' || triggerType === 'time_delay') && (
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
            {t('delayMs')}
          </label>
          <input
            type="number"
            value={value.delay || 0}
            onChange={(e) => updateConfig('delay', Number.parseInt(e.target.value, 10) || 0)}
            placeholder="0"
            className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
          />
          <p className="text-xs text-black/50 mt-1">
            {triggerType === 'page_load'
              ? t('delayHelpPageLoad')
              : t('delayHelpTimeDelay')}
          </p>
        </div>
      )}

      {/* Scroll Depth */}
      {triggerType === 'scroll_depth' && (
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
            {t('scrollDepthPercent')}
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={value.scrollDepth || 50}
              onChange={(e) => updateConfig('scrollDepth', Number.parseInt(e.target.value, 10) || 0)}
              className="flex-1"
            />
            <span className="text-sm font-bold w-12 text-right">{value.scrollDepth || 50}%</span>
          </div>
          <p className="text-xs text-black/50 mt-2">{t('scrollDepthHelp')}</p>
        </div>
      )}

      {/* Show Once */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={value.showOnce || false}
            onChange={(e) => updateConfig('showOnce', e.target.checked)}
            className="w-4 h-4 cursor-pointer"
          />
          <span className="text-sm font-bold text-black">{t('showOncePerSession')}</span>
        </label>
        <p className="text-xs text-black/50 mt-1">{t('showOnceHelp')}</p>
      </div>

      {/* Cooldown Hours */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-2">
          {t('cooldownHours')}
        </label>
        <input
          type="number"
          value={value.cooldownHours || 24}
          onChange={(e) => updateConfig('cooldownHours', Number.parseInt(e.target.value, 10) || 0)}
          placeholder="24"
          className="w-full px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors"
        />
        <p className="text-xs text-black/50 mt-1">{t('cooldownHoursHelp')}</p>
      </div>
    </div>
  );
}
