'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SocialLink } from '../types';
import { Twitter, Github, Linkedin, MessageSquare, Plus, Trash2, Save, RefreshCw, GripVertical, Facebook, Instagram, Youtube, Music2 } from 'lucide-react';
import { toast } from 'sonner';

interface SocialLinksAdminPanelProps {
  locale: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Twitter: Twitter,
  Github: Github,
  Linkedin: Linkedin,
  MessageSquare: MessageSquare,
  Facebook: Facebook,
  Instagram: Instagram,
  Youtube: Youtube,
  Music2: Music2,
};

export function SocialLinksAdminPanel({}: SocialLinksAdminPanelProps) {
  const t = useTranslations('admin.social_links');
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function fetchLinks() {
      try {
        const response = await fetch('/api/footer-social-links');
        const data = await response.json();
        if (data.links) {
          setLinks(data.links);
        }
      } catch (error) {
        console.error('Failed to fetch social links', error);
        toast.error(t('error'));
      } finally {
        setIsLoading(false);
      }
    }
    fetchLinks();
  }, [t]);

  const handleAddLink = () => {
    const newLink: SocialLink = {
      id: crypto.randomUUID(),
      platform: 'New Platform',
      label_en: 'New Link',
      label_fr: 'Nouveau lien',
      url: 'https://example.com',
      icon: 'Twitter', // Default icon
      order_index: links.length,
      is_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setLinks([...links, newLink]);
  };

  const handleUpdateLink = (id: string, updates: Partial<SocialLink>) => {
    setLinks(links.map(link => link.id === id ? { ...link, ...updates } : link));
  };

  const handleRemoveLink = (id: string) => {
    setLinks(links.filter(link => link.id !== id));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/footer-social-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: links.map(({ id, ...rest }, index) => ({ 
            id, 
            ...rest, 
            order_index: index 
          })) }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const details = Array.isArray(errorPayload?.details)
          ? errorPayload.details
            .map((detail: unknown) => {
              if (typeof detail === 'string') return detail;
              if (
                detail &&
                typeof detail === 'object' &&
                'message' in detail &&
                typeof (detail as { message?: unknown }).message === 'string'
              ) {
                return (detail as { message: string }).message;
              }
              return null;
            })
            .filter((detail: string | null): detail is string => Boolean(detail))
            .join(', ')
          : null;
        const message = (typeof errorPayload?.error === 'string' ? errorPayload.error : null) ?? details ?? 'Update failed';
        throw new Error(message);
      }
      
      toast.success(t('success'));
    } catch (error) {
      console.error('Failed to update social links', error);
      toast.error(error instanceof Error ? error.message : t('error'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="w-8 h-8 animate-spin text-kode01-pink" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Card className="border-kode01-pink/10 bg-white/50 backdrop-blur-sm rounded-[32px] shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
          <div>
            <CardTitle className="text-2xl font-serif font-black text-kode01-noir uppercase tracking-tight">
              {t('title')}
            </CardTitle>
            <p className="text-xs font-bold text-kode01-noir/40 uppercase tracking-widest mt-1">
              {t('subtitle')}
            </p>
          </div>
          <Button 
            onClick={handleAddLink}
            variant="outline"
            className="rounded-full border-kode01-pink/20 hover:border-kode01-pink text-kode01-pink font-bold"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('form.add_link')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {links.sort((a, b) => a.order_index - b.order_index).map((link) => {
            const Icon = ICON_MAP[link.icon] || Twitter;
            return (
              <div 
                key={link.id} 
                className="group relative bg-white border border-kode01-pink/10 p-6 rounded-3xl transition-all hover:border-kode01-pink/30 hover:shadow-md"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                  <div className="md:col-span-1 flex items-center justify-center pt-2">
                    <div className="w-10 h-10 rounded-full bg-kode01-pink/10 flex items-center justify-center text-kode01-pink">
                      <Icon size={20} />
                    </div>
                  </div>
                  
                  <div className="md:col-span-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-kode01-noir/40 ml-1">
                        {t('table.platform')}
                      </Label>
                      <Input 
                        value={link.platform} 
                        onChange={(e) => handleUpdateLink(link.id, { platform: e.target.value })}
                        placeholder={t('form.platform_placeholder')}
                        className="rounded-2xl border-kode01-pink/5 focus-visible:ring-kode01-pink"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-kode01-noir/40 ml-1">
                        {t('table.url')}
                      </Label>
                      <Input 
                        value={link.url} 
                        onChange={(e) => handleUpdateLink(link.id, { url: e.target.value })}
                        placeholder={t('form.url_placeholder')}
                        className="rounded-2xl border-kode01-pink/5 focus-visible:ring-kode01-pink"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-kode01-noir/40 ml-1">
                        {t('form.label_en')}
                      </Label>
                      <Input 
                        value={link.label_en} 
                        onChange={(e) => handleUpdateLink(link.id, { label_en: e.target.value })}
                        className="rounded-2xl border-kode01-pink/5 focus-visible:ring-kode01-pink"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-kode01-noir/40 ml-1">
                        {t('form.label_fr')}
                      </Label>
                      <Input 
                        value={link.label_fr} 
                        onChange={(e) => handleUpdateLink(link.id, { label_fr: e.target.value })}
                        className="rounded-2xl border-kode01-pink/5 focus-visible:ring-kode01-pink"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-kode01-noir/40 ml-1">
                        {t('table.icon')}
                      </Label>
                      <select 
                        value={link.icon} 
                        onChange={(e) => handleUpdateLink(link.id, { icon: e.target.value })}
                        className="w-full rounded-2xl border border-kode01-pink/5 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-kode01-pink transition-all"
                      >
                        <option value="Twitter">Twitter / X</option>
                        <option value="Github">GitHub</option>
                        <option value="Linkedin">LinkedIn</option>
                        <option value="MessageSquare">Discord / Chat</option>
                        <option value="Facebook">Facebook</option>
                        <option value="Instagram">Instagram</option>
                        <option value="Youtube">YouTube</option>
                        <option value="Music2">TikTok</option>
                      </select>
                    </div>

                    <div className="flex items-center space-x-2 pt-8">
                      <input 
                        type="checkbox"
                        checked={link.is_enabled} 
                        onChange={(e) => handleUpdateLink(link.id, { is_enabled: e.target.checked })}
                        id={`enabled-${link.id}`}
                        className="w-4 h-4 rounded border-kode01-pink/20 text-kode01-pink focus:ring-kode01-pink"
                      />
                      <Label htmlFor={`enabled-${link.id}`} className="text-xs font-bold uppercase tracking-widest text-kode01-noir/60 cursor-pointer">
                        {t('table.enabled')}
                      </Label>
                    </div>
                  </div>

                  <div className="md:col-span-1 flex flex-col items-center gap-2 pt-2">
                    <Button 
                      onClick={() => handleRemoveLink(link.id)}
                      variant="ghost" 
                      size="icon"
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                    >
                      <Trash2 size={18} />
                    </Button>
                    <div className="cursor-grab text-kode01-noir/20 hover:text-kode01-pink transition-colors">
                      <GripVertical size={18} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="pt-8 flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="bg-kode01-pink hover:bg-kode01-pink/90 text-white font-black uppercase tracking-widest px-10 py-6 rounded-full shadow-lg shadow-kode01-pink/20 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  {t('updating')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {t('update_button')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
