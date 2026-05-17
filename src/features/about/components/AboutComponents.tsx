'use client';

import { useTranslations } from 'next-intl';
import { Zap, Search, Globe, ArrowRight } from 'lucide-react';
import { useRouter } from '@/i18n/routing';

/* ─── Hero ──────────────────────────────────────────────────────────── */
export const AboutHero = () => {
  const t = useTranslations('about.hero');
  return (
    <>
      <style>{`
        .about-hero-title {
          font-family: var(--font-fraunces), serif;
          font-size: clamp(3rem, 8vw, 5.5rem);
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: #1A1A1A;
          max-width: 900px;
          margin: 0 auto 32px;
        }
        .about-hero-sub {
          font-size: clamp(1.05rem, 2vw, 1.35rem);
          color: #888888;
          max-width: 620px;
          margin: 0 auto;
          line-height: 1.65;
        }
      `}</style>
      <section style={{ textAlign: 'center', position: 'relative', paddingBottom: '80px' }}>
        <h1 className="about-hero-title">{t('title')}</h1>
        <p className="about-hero-sub">{t('subtitle')}</p>
        {/* Decorative floating orbs */}
        <div style={{
          position: 'absolute', top: '-60px', left: '-80px',
          width: '220px', height: '220px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(242,145,200,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-40px', right: '-60px',
          width: '180px', height: '180px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(148,168,184,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
      </section>
    </>
  );
};

/* ─── Mission ───────────────────────────────────────────────────────── */
export const AboutMission = () => {
  const t = useTranslations('about.mission');
  return (
    <section
      style={{
        background: '#2B463C',
        borderRadius: '40px',
        padding: 'clamp(40px, 8vw, 80px)',
        position: 'relative',
        overflow: 'hidden',
        marginBottom: '64px',
        color: '#FFFFFF',
      }}
    >
      {/* Decorative arch */}
      <div style={{
        position: 'absolute', bottom: 0, right: '60px',
        width: '140px', height: '190px',
        background: '#94A8B8',
        borderTopLeftRadius: '100px', borderTopRightRadius: '100px',
        opacity: 0.35,
      }} />
      {/* Decorative circle */}
      <div style={{
        position: 'absolute', top: '-50px', left: '-50px',
        width: '180px', height: '180px', borderRadius: '50%',
        background: '#F291C8', opacity: 0.15,
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '680px', margin: '0 auto', textAlign: 'center' }}>
        <span style={{
          display: 'inline-block',
          padding: '8px 18px',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.15)',
          fontWeight: 700,
          fontSize: '0.75rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          marginBottom: '28px',
          color: '#F291C8',
        }}>
          {t('title')}
        </span>
        <p style={{
          fontFamily: 'var(--font-fraunces), serif',
          fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          lineHeight: 1.45,
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'rgba(255,255,255,0.9)',
        }}>
          &ldquo;{t('description')}&rdquo;
        </p>
      </div>
    </section>
  );
};

/* ─── Values ────────────────────────────────────────────────────────── */

const valueIcons = [Zap, Search, Globe] as const;
const valueColors = ['#F291C8', '#94A8B8', '#8A9A5B'] as const;

export const AboutValues = () => {
  const t = useTranslations('about.values');
  const keys = ['speed', 'curation', 'innovation'] as const;

  return (
    <>
      <style>{`
        .about-value-card {
          background: #FFFFFF;
          border-radius: 32px;
          padding: clamp(28px, 5vw, 40px);
          position: relative;
          overflow: hidden;
          transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease;
          border: 1px solid rgba(0,0,0,0.06);
        }
        .about-value-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 50px rgba(0,0,0,0.08);
        }
        @media (max-width: 768px) {
          .about-values-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <div
        className="about-values-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '24px',
          marginBottom: '80px',
        }}
      >
        {keys.map((key, i) => {
          const Icon = valueIcons[i];
          const color = valueColors[i];
          return (
            <div key={key} className="about-value-card">
              {/* Decorative number watermark */}
              <span style={{
                position: 'absolute', top: '-12px', right: '16px',
                fontFamily: 'var(--font-fraunces), serif',
                fontSize: '8rem', fontWeight: 900,
                color: color, opacity: 0.06,
                lineHeight: 1, pointerEvents: 'none',
              }}>
                {i + 1}
              </span>

              <div style={{
                width: '56px', height: '56px',
                borderRadius: '18px',
                background: `${color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '24px',
                position: 'relative', zIndex: 1,
              }}>
                <Icon size={26} color={color} />
              </div>
              <h3 style={{
                fontFamily: 'var(--font-fraunces), serif',
                fontSize: '1.35rem',
                fontWeight: 900,
                color: '#1A1A1A',
                marginBottom: '12px',
                position: 'relative', zIndex: 1,
              }}>
                {t(`${key}.title`)}
              </h3>
              <p style={{
                color: 'rgba(26,26,26,0.55)',
                lineHeight: 1.65,
                fontSize: '0.95rem',
                position: 'relative', zIndex: 1,
              }}>
                {t(`${key}.description`)}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
};

/* ─── Audience ──────────────────────────────────────────────────────── */
export const AboutAudience = () => {
  const t = useTranslations('about.audience');
  return (
    <>
      <style>{`
        .about-audience-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 80px;
        }
        .about-audience-card {
          border-radius: 40px;
          padding: clamp(32px, 6vw, 56px);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 380px;
          transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .about-audience-card:hover {
          transform: scale(1.015);
        }
        @media (max-width: 768px) {
          .about-audience-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <div className="about-audience-grid">
        {/* Creators card – dark */}
        <div
          className="about-audience-card"
          style={{ background: '#1A1A1A', color: '#FFFFFF' }}
        >
          <div style={{ position: 'relative', zIndex: 1 }}>
            <span style={{
              display: 'inline-block',
              padding: '8px 16px', borderRadius: '999px',
              background: 'rgba(242,145,200,0.2)',
              fontWeight: 700, fontSize: '0.75rem',
              letterSpacing: '0.08em', textTransform: 'uppercase' as const,
              color: '#F291C8', marginBottom: '20px',
            }}>
              {t('creators.label')}
            </span>
            <h3 style={{
              fontFamily: 'var(--font-fraunces), serif',
              fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
              fontWeight: 900, lineHeight: 1.15,
              marginBottom: '16px',
            }}>
              {t('creators.title')}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.05rem', lineHeight: 1.6 }}>
              {t('creators.description')}
            </p>
          </div>
          {/* Decorative pink circle */}
          <div style={{
            position: 'absolute', bottom: '-30px', right: '-30px',
            width: '180px', height: '180px', borderRadius: '50%',
            background: '#F291C8', opacity: 0.2,
          }} />
        </div>

        {/* Builders card – cream */}
        <div
          className="about-audience-card"
          style={{ background: '#F4F1EA', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div style={{ position: 'relative', zIndex: 1 }}>
            <span style={{
              display: 'inline-block',
              padding: '8px 16px', borderRadius: '999px',
              background: 'rgba(43,70,60,0.08)',
              fontWeight: 700, fontSize: '0.75rem',
              letterSpacing: '0.08em', textTransform: 'uppercase' as const,
              color: '#2B463C', marginBottom: '20px',
            }}>
              {t('builders.label')}
            </span>
            <h3 style={{
              fontFamily: 'var(--font-fraunces), serif',
              fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
              fontWeight: 900, lineHeight: 1.15,
              marginBottom: '16px', color: '#1A1A1A',
            }}>
              {t('builders.title')}
            </h3>
            <p style={{ color: 'rgba(26,26,26,0.55)', fontSize: '1.05rem', lineHeight: 1.6 }}>
              {t('builders.description')}
            </p>
          </div>
          {/* Decorative arch */}
          <div style={{
            position: 'absolute', bottom: 0, right: '40px',
            width: '120px', height: '160px',
            background: '#2B463C', opacity: 0.08,
            borderTopLeftRadius: '80px', borderTopRightRadius: '80px',
          }} />
        </div>
      </div>
    </>
  );
};

/* ─── Location ──────────────────────────────────────────────────────── */
/* ─── CTA ───────────────────────────────────────────────────────────── */
export const AboutCta = () => {
  const t = useTranslations('about.cta');
  const router = useRouter();
  return (
    <>
      <style>{`
        .about-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 18px 36px;
          border-radius: 999px;
          font-weight: 700;
          font-size: 1.1rem;
          cursor: pointer;
          border: none;
          font-family: var(--font-dm-sans), sans-serif;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .about-cta-btn:hover {
          transform: scale(1.06);
        }
      `}</style>
      <section
        style={{
          background: '#1A1A1A',
          borderRadius: '40px',
          padding: 'clamp(48px, 8vw, 80px)',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative elements */}
        <div style={{
          position: 'absolute', top: '-40px', left: '-40px',
          width: '160px', height: '160px', borderRadius: '50%',
          background: '#F291C8', opacity: 0.12,
        }} />
        <div style={{
          position: 'absolute', bottom: '-30px', right: '-30px',
          width: '140px', height: '140px', borderRadius: '50%',
          background: '#94A8B8', opacity: 0.12,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{
            fontFamily: 'var(--font-fraunces), serif',
            fontSize: 'clamp(1.8rem, 5vw, 3rem)',
            fontWeight: 900, color: '#FFFFFF',
            marginBottom: '16px', lineHeight: 1.1,
          }}>
            {t('title')}
          </h2>
          <p style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: '1.1rem',
            marginBottom: '36px',
            maxWidth: '500px',
            margin: '0 auto 36px',
            lineHeight: 1.6,
          }}>
            {t('subtitle')}
          </p>
          <button
            className="about-cta-btn"
            style={{ background: '#F291C8', color: '#1A1A1A' }}
            onClick={() => router.push('/market')}
          >
            {t('button')}
            <ArrowRight size={20} />
          </button>
        </div>
      </section>
    </>
  );
};
