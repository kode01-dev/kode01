'use client';

import { Link } from '@/i18n/routing';
import { ManageCookiePreferencesButton } from '@/features/cookies/ManageCookiePreferencesButton';
import { useLocale, useTranslations } from 'next-intl';
import { Github, Linkedin, Twitter, MessageSquare, Facebook, Instagram, Youtube, Music2, LucideIcon } from 'lucide-react';
import { NewsletterForm } from './NewsletterForm';
import { AskAiSection } from './AskAiSection';
import { ScrollToTopButton } from './ScrollToTopButton';
import { useEffect, useState } from 'react';
import type { SocialLink } from '@/features/footer-social-links/types';

const ICON_MAP: Record<string, LucideIcon> = {
    Twitter: Twitter,
    Github: Github,
    Linkedin: Linkedin,
    MessageSquare: MessageSquare,
    Facebook: Facebook,
    Instagram: Instagram,
    Youtube: Youtube,
    Music2: Music2,
};

export function BaseFooter() {
    const locale = useLocale();
    const t = useTranslations('layout.footer');
    const n = useTranslations('layout.nav');
    const l = useTranslations('legal');
    const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);

    useEffect(() => {
        let isMounted = true;

        async function loadSocialLinks() {
            try {
                const response = await fetch('/api/footer-social-links');
                if (!response.ok) {
                    return;
                }

                const payload = (await response.json()) as { links?: SocialLink[] };
                if (isMounted && Array.isArray(payload.links)) {
                    setSocialLinks(payload.links);
                }
            } catch {
                // Keep footer functional even if social links cannot be loaded.
            }
        }

        loadSocialLinks();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <footer className="bg-kode01-noir text-white py-16 md:py-20 border-t border-white/5 relative shadow-[0_-12px_40px_-20px_rgba(255,107,157,0.3)] overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-kode01-pink/20 to-transparent" />
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 md:px-12">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-16 md:gap-8">
                    {/* Brand Section */}
                    <div className="md:col-span-5 flex flex-col items-start gap-6">
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-4">
                                <h2 className="text-3xl md:text-4xl font-black tracking-tighter leading-none uppercase max-w-md">
                                    {t('newsletter.title')}
                                </h2>
                                <p className="text-white/60 font-medium text-lg leading-relaxed max-w-sm font-sans">
                                    {t('newsletter.subtitle')}
                                </p>
                            </div>
                            <NewsletterForm />
                        </div>

                        <div className="w-full h-px bg-white/5 max-w-sm" />

                        <AskAiSection />
                    </div>

                    {/* Links Grid */}
                    <div className="md:col-span-7 grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 lg:gap-12">
                        <div className="group">
                            <h4 className="font-black text-xs uppercase tracking-[0.3em] text-kode01-pink mb-8 border-b-2 border-kode01-pink/20 pb-2 inline-block group-hover:border-kode01-pink transition-colors">
                                {t('marketplace')}
                            </h4>
                            <ul className="space-y-4 font-bold text-sm list-none p-0">
                                <li><Link href="/market" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{n('explore')}</Link></li>
                                <li><Link href="/creators" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{n('creators')}</Link></li>
                                <li><Link href="/bundles" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{n('bundles')}</Link></li>
                                <li><Link href="/pricing" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{n('pricing')}</Link></li>
                            </ul>
                        </div>

                            {/* Resources */}
                        <div className="group">
                            <h4 className="font-black text-xs uppercase tracking-[0.3em] text-kode01-pink mb-8 border-b-2 border-kode01-pink/20 pb-2 inline-block group-hover:border-kode01-pink transition-colors">
                                {t('resources')}
                            </h4>
                            <ul className="space-y-4 font-bold text-sm list-none p-0">
                                <li><Link href="/cli-faq" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{t('cli_faq')}</Link></li>
                                <li><Link href="/news" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{t('blog')}</Link></li>
                                <li><Link href="/blog" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{t('editorial_blog')}</Link></li>
                            </ul>
                        </div>

                        {/* Company */}
                        <div className="group">
                            <h4 className="font-black text-xs uppercase tracking-[0.3em] text-kode01-pink mb-8 border-b-2 border-kode01-pink/20 pb-2 inline-block group-hover:border-kode01-pink transition-colors">
                                {t('company')}
                            </h4>
                            <ul className="space-y-4 font-bold text-sm list-none p-0">
                                <li><Link href="/about" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{t('about')}</Link></li>
                                <li><Link href="/how-it-works" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{t('how_it_works')}</Link></li>
                                <li><Link href="/contact" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{t('contact')}</Link></li>
                            </ul>
                        </div>

                        {/* Legal */}
                        <div className="group">
                            <h4 className="font-black text-xs uppercase tracking-[0.3em] text-kode01-pink mb-8 border-b-2 border-kode01-pink/20 pb-2 inline-block group-hover:border-kode01-pink transition-colors">
                                {t('legal')}
                            </h4>
                            <ul className="space-y-4 font-bold text-sm list-none p-0">
                                <li><Link href="/privacy" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{t('privacy')}</Link></li>
                                <li><Link href="/terms" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{t('terms')}</Link></li>
                                <li><Link href="/cookies" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{l('cookies.title')}</Link></li>
                                <li><Link href="/canada-privacy" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{l('canada.title')}</Link></li>
                                <li><Link href="/gdpr-ccpa" className="text-white/40 hover:text-kode01-pink transition-all no-underline font-sans flex items-center gap-2 group/item"><span className="w-0 h-0.5 bg-kode01-pink group-hover/item:w-3 transition-all"></span>{l('gdpr_ccpa.title')}</Link></li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Footer Bottom */}
                <div className="mt-8 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 md:gap-8">
                    <div className="flex flex-col items-center gap-6 md:flex-row md:gap-10">
                        <div className="flex flex-wrap items-center justify-center gap-3 text-white/30 font-black text-[10px] uppercase tracking-[0.2em]">
                            <span>&copy; {new Date().getFullYear()} KODE01</span>
                            <span className="w-1.5 h-1.5 bg-kode01-pink rotate-45" />
                            <span>{t('rights')}</span>
                        </div>

                        {/* Dynamic Social Links */}
                        <div className="flex flex-wrap items-center justify-center gap-4">
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest mr-2">{t('social_follow')}</span>
                            {socialLinks.map((link) => {
                                const Icon = ICON_MAP[link.icon] || Twitter;
                                return (
                                    <a 
                                        key={link.id}
                                        href={link.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:bg-kode01-pink hover:text-kode01-noir transition-all duration-300"
                                        title={locale === 'fr' ? link.label_fr : link.label_en}
                                    >
                                        <Icon size={14} />
                                    </a>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <ScrollToTopButton />
                        <div className="h-8 w-px bg-white/10 hidden md:block" />
                        <ManageCookiePreferencesButton variant="inline" />
                    </div>
                </div>
            </div>
        </footer>
    );
}
