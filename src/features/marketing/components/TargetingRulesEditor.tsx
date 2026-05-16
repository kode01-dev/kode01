'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import type { TargetingRules } from '../types';

interface TargetingRulesEditorProps {
  value: TargetingRules;
  onChange: (rules: TargetingRules) => void;
}

type DeviceType = TargetingRules['deviceTypes'][number];

const AVAILABLE_ROLES = ['all', 'admin', 'vendor', 'buyer'];
const AVAILABLE_LOCALES = ['en', 'fr'];
const AVAILABLE_DEVICES: DeviceType[] = ['desktop', 'mobile', 'tablet'];

export function TargetingRulesEditor({ value, onChange }: TargetingRulesEditorProps) {
  const t = useTranslations('marketing.form');
  const [newPage, setNewPage] = useState('');
  const [newExcludePage, setNewExcludePage] = useState('');

  const addPage = (page: string) => {
    if (page.trim() && !value.pages.includes(page.trim())) {
      onChange({
        ...value,
        pages: [...value.pages, page.trim()],
      });
      setNewPage('');
    }
  };

  const removePage = (index: number) => {
    onChange({
      ...value,
      pages: value.pages.filter((_, i) => i !== index),
    });
  };

  const addExcludePage = (page: string) => {
    if (page.trim() && !value.excludePages.includes(page.trim())) {
      onChange({
        ...value,
        excludePages: [...value.excludePages, page.trim()],
      });
      setNewExcludePage('');
    }
  };

  const removeExcludePage = (index: number) => {
    onChange({
      ...value,
      excludePages: value.excludePages.filter((_, i) => i !== index),
    });
  };

  const toggleRole = (role: string) => {
    onChange({
      ...value,
      userRoles: value.userRoles.includes(role)
        ? value.userRoles.filter((r) => r !== role)
        : [...value.userRoles, role],
    });
  };

  const toggleLocale = (locale: string) => {
    onChange({
      ...value,
      locales: value.locales.includes(locale)
        ? value.locales.filter((l) => l !== locale)
        : [...value.locales, locale],
    });
  };

  const toggleDevice = (device: DeviceType) => {
    onChange({
      ...value,
      deviceTypes: value.deviceTypes.includes(device)
        ? value.deviceTypes.filter((d) => d !== device)
        : [...value.deviceTypes, device],
    });
  };

  return (
    <div className="space-y-6">
      {/* Pages */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-3">
          {t('targetPages')}
        </label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newPage}
            onChange={(e) => setNewPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPage(newPage);
              }
            }}
            placeholder="e.g., /market, /news"
            className="flex-1 px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors text-sm"
          />
          <button
            type="button"
            onClick={() => addPage(newPage)}
            className="px-4 py-2.5 bg-kode01-pink text-white rounded-[12px] font-bold text-sm hover:opacity-90 transition-opacity"
          >
            {t('add')}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {value.pages.map((page, idx) => (
            <div
              key={idx}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-kode01-pink/10 border border-kode01-pink/30 rounded-full text-xs font-bold text-kode01-pink"
            >
              {page}
              <button
                type="button"
                onClick={() => removePage(idx)}
                className="hover:text-kode01-pink/70 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Exclude Pages */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-3">
          {t('excludePages')}
        </label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newExcludePage}
            onChange={(e) => setNewExcludePage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addExcludePage(newExcludePage);
              }
            }}
            placeholder="e.g., /admin, /private"
            className="flex-1 px-4 py-2.5 rounded-[12px] border border-black/10 focus:border-kode01-pink focus:outline-none transition-colors text-sm"
          />
          <button
            type="button"
            onClick={() => addExcludePage(newExcludePage)}
            className="px-4 py-2.5 bg-black/5 text-black rounded-[12px] font-bold text-sm hover:bg-black/10 transition-colors"
          >
            {t('add')}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {value.excludePages.map((page, idx) => (
            <div
              key={idx}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-black/5 border border-black/20 rounded-full text-xs font-bold text-black/60"
            >
              {page}
              <button
                type="button"
                onClick={() => removeExcludePage(idx)}
                className="hover:text-black/40 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* User Roles */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-3">
          {t('userRoles')}
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => toggleRole(role)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                value.userRoles.includes(role)
                  ? 'bg-kode01-pink text-white'
                  : 'bg-black/5 text-black hover:bg-black/10'
              }`}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* Locales */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-3">
          {t('locales')}
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_LOCALES.map((locale) => (
            <button
              key={locale}
              type="button"
              onClick={() => toggleLocale(locale)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                value.locales.includes(locale)
                  ? 'bg-kode01-pink text-white'
                  : 'bg-black/5 text-black hover:bg-black/10'
              }`}
            >
              {locale.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Device Types */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-black/60 mb-3">
          {t('deviceTypes')}
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_DEVICES.map((device) => (
            <button
              key={device}
                type="button"
                onClick={() => toggleDevice(device)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                value.deviceTypes.includes(device)
                  ? 'bg-kode01-pink text-white'
                  : 'bg-black/5 text-black hover:bg-black/10'
              }`}
            >
              {device}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
