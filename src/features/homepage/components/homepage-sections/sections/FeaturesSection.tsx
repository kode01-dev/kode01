'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface FeaturesSectionProps {
    onOpenShop: () => void;
    onBrowse: () => void;
    template?: string;
}

export const FeaturesSection = ({
    onOpenShop,
    onBrowse,
    template = 'split',
}: FeaturesSectionProps) => {
    const t = useTranslations('artifacts_home.features');
    const compact = template === 'compact';
    return (
        <>
            <style>{`
                @media (max-width: 900px) {
                    .feat-section { gap: 10px !important; margin-bottom: 2.5rem !important; }
                    .feat-card { min-height: 200px !important; padding: 18px !important; border-radius: 20px !important; }
                    .feat-card .feat-label { font-size: 0.65rem !important; padding: 5px 10px !important; margin-bottom: 12px !important; }
                    .feat-card .feat-heading { font-size: 1.1rem !important; margin-bottom: 8px !important; }
                    .feat-card .feat-btn { padding: 10px 18px !important; font-size: 0.8rem !important; }
                    .feat-deco-circle { width: 100px !important; height: 100px !important; bottom: -15px !important; right: -15px !important; }
                    .feat-deco-arch { width: 70px !important; height: 100px !important; right: 15px !important; }
                }
            `}</style>
            <section className={`feat-section grid grid-cols-2 ${compact ? 'gap-4 mb-14' : 'gap-6 mb-20'}`}>
                <div
                    className="feat-card"
                    style={{
                        background: '#FFFFFF',
                        borderRadius: '32px',
                        padding: 'clamp(24px, 5vw, 48px)',
                        position: 'relative',
                        overflow: 'hidden',
                        minHeight: compact ? '320px' : '400px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                    }}
                >
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <span
                            className="feat-label"
                            style={{
                                display: 'inline-block',
                                padding: '8px 16px',
                                borderRadius: '999px',
                                background: 'rgba(0,0,0,0.05)',
                                fontWeight: 600,
                                marginBottom: '24px',
                            }}
                        >
                            {t('creators_label')}
                        </span>
                        <h2
                            className="feat-heading"
                            style={{
                                fontFamily: 'var(--font-fraunces), serif',
                                fontSize: 'clamp(2rem, 4vw, 2.5rem)',
                                lineHeight: 1,
                                marginBottom: '16px',
                                maxWidth: '80%',
                            }}
                        >
                            {t('creators_heading')}
                        </h2>
                    </div>
                    <button
                        onClick={onOpenShop}
                        suppressHydrationWarning
                        className="feat-btn"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '16px 32px',
                            borderRadius: '999px',
                            fontWeight: 700,
                            fontSize: '1.1rem',
                            cursor: 'pointer',
                            background: '#1A1A1A',
                            color: '#FFFFFF',
                            border: 'none',
                            alignSelf: 'flex-start',
                            transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            fontFamily: 'var(--font-dm-sans), sans-serif',
                            position: 'relative',
                            zIndex: 2,
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1.05)')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1)')}
                    >
                        {t('open_shop')}
                    </button>
                    <div
                        className="feat-deco-circle"
                        style={{
                            position: 'absolute',
                            bottom: '-20px',
                            right: '-20px',
                            width: '200px',
                            height: '200px',
                            borderRadius: '50%',
                            background: '#F291C8',
                        }}
                    />
                </div>

                <div
                    className="feat-card"
                    style={{
                        background: '#2B463C',
                        borderRadius: '32px',
                        padding: 'clamp(24px, 5vw, 48px)',
                        position: 'relative',
                        overflow: 'hidden',
                        minHeight: compact ? '320px' : '400px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        color: 'white',
                    }}
                >
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <span
                            className="feat-label"
                            style={{
                                display: 'inline-block',
                                padding: '8px 16px',
                                borderRadius: '999px',
                                background: 'rgba(255,255,255,0.2)',
                                fontWeight: 600,
                                marginBottom: '24px',
                            }}
                        >
                            {t('builders_label')}
                        </span>
                        <h2
                            className="feat-heading"
                            style={{
                                fontFamily: 'var(--font-fraunces), serif',
                                fontSize: 'clamp(2rem, 4vw, 2.5rem)',
                                lineHeight: 1,
                                marginBottom: '16px',
                                maxWidth: '80%',
                            }}
                        >
                            {t('builders_heading')}
                        </h2>
                    </div>
                    <button
                        onClick={onBrowse}
                        suppressHydrationWarning
                        className="feat-btn"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '16px 32px',
                            borderRadius: '999px',
                            fontWeight: 700,
                            fontSize: '1.1rem',
                            cursor: 'pointer',
                            background: '#F291C8',
                            color: '#1A1A1A',
                            border: 'none',
                            alignSelf: 'flex-start',
                            transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            fontFamily: 'var(--font-dm-sans), sans-serif',
                            position: 'relative',
                            zIndex: 2,
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1.05)')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = 'scale(1)')}
                    >
                        {t('browse_catalog')}
                    </button>
                    <div
                        className="feat-deco-arch"
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            right: '40px',
                            width: '150px',
                            height: '200px',
                            background: '#94A8B8',
                            borderTopLeftRadius: '100px',
                            borderTopRightRadius: '100px',
                        }}
                    />
                </div>
            </section>
        </>
    );
};