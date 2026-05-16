/* eslint-disable @next/next/no-img-element */
'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { MarketingTemplate } from '../types';

interface TemplateSelectorProps {
  templates: MarketingTemplate[];
  value?: string | null;
  onChange: (templateId: string | null) => void;
}

export function TemplateSelector({ templates, value, onChange }: TemplateSelectorProps) {
  const t = useTranslations('marketing.templates');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* No Template Option */}
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`p-4 rounded-[16px] border-2 transition-all text-left ${
          !value
            ? 'border-kode01-pink bg-kode01-pink/5'
            : 'border-black/10 hover:border-black/20 bg-white'
        }`}
      >
        <div className="font-bold text-black">{t('noTemplate')}</div>
        <p className="text-xs text-black/60 mt-1">{t('customDesign')}</p>
      </button>

      {/* Template Options */}
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => onChange(template.id)}
          className={`p-4 rounded-[16px] border-2 transition-all text-left ${
            value === template.id
              ? 'border-kode01-pink bg-kode01-pink/5'
              : 'border-black/10 hover:border-black/20 bg-white'
          }`}
        >
          {template.preview_image_url && (
            <img
              src={template.preview_image_url}
              alt={template.name_en}
              className="w-full h-24 object-cover rounded-[8px] mb-3"
            />
          )}
          <div className="font-bold text-black text-sm">{template.name_en}</div>
          <p className="text-xs text-black/60 mt-1">{template.template_type}</p>
          {template.description_en && (
            <p className="text-xs text-black/50 mt-2 line-clamp-2">{template.description_en}</p>
          )}
        </button>
      ))}
    </div>
  );
}
