import {
    Body,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from '@react-email/components';
import * as React from 'react';

interface ConfirmSubscriptionEmailProps {
    /** Override for the confirmation URL (SendFox uses {{contact.confirmation_url}}) */
    confirmationUrl?: string;
    /** Override for the account/sender name */
    accountName?: string;
    /** Company name/sign-off */
    brandName?: string;
}

/**
 * ConfirmSubscriptionEmail - Combined Bilingual Version (EN/FR)
 * Optimized for SendFox
 */
export const ConfirmSubscriptionEmail = ({
    confirmationUrl = '{{contact.confirmation_url}}',
    accountName = 'kode01',
    brandName = 'kode01',
}: ConfirmSubscriptionEmailProps) => {
    const year = new Date().getFullYear();

    return (
        <Html>
            <Head />
            <Preview>Confirm your subscription / Confirmez votre inscription</Preview>
            <Body style={main}>
                <Container style={container}>
                    {/* ─── Header ────────────────────────────────── */}
                    <Section style={headerSection}>
                        <Text style={logoText}>{brandName}</Text>
                    </Section>

                    {/* ─── Main content ──────────────────────────── */}
                    <Section style={contentSection}>
                        {/* ENGLISH SECTION */}
                        <Heading style={heading}>Thanks for signing up!</Heading>
                        <Text style={subtitle}>Please confirm your subscription below.</Text>

                        {/* EN CTA */}
                        <Section style={ctaSection}>
                            <Link href={confirmationUrl} style={ctaButton}>
                                Confirm!
                            </Link>
                        </Section>

                        <Hr style={dividerLarge} />

                        {/* FRENCH SECTION */}
                        <Heading style={heading}>Merci pour votre inscription !</Heading>
                        <Text style={subtitle}>Veuillez confirmer votre abonnement ci-dessous.</Text>

                        {/* FR CTA */}
                        <Section style={ctaSection}>
                            <Link href={confirmationUrl} style={ctaButton}>
                                Confirmer !
                            </Link>
                        </Section>

                        <Hr style={divider} />

                        <Text style={closing}>Best, / Cordialement,</Text>
                        <Text style={accountNameStyle}>{accountName}</Text>
                    </Section>

                    {/* ─── Footer ────────────────────────────────── */}
                    <Section style={footerSection}>
                        <Text style={footerMain}>
                            © {year} {brandName}. All rights reserved. / Tous droits réservés.
                        </Text>
                        <Text style={footerNote}>
                            You received this email because you signed up for the {brandName} newsletter.
                            <br />
                            Vous avez reçu cet e-mail car vous vous êtes inscrit(e) à l&apos;infolettre {brandName}.
                        </Text>
                        <Section style={unsubscribeSection}>
                            <Link href="{{unsubscribe_url}}" style={unsubscribeLink}>
                                Unsubscribe / Se désabonner
                            </Link>
                        </Section>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
};

/* ═══════════════════════════════════════════
   kode01 Brand Styles
   ═══════════════════════════════════════════ */

const KODE01_NOIR = '#1A1A1A';
const KODE01_PINK = '#F291C8';
const KODE01_CREAM = '#F4F1EA';
const KODE01_WHITE = '#FFFFFF';
const KODE01_GREEN = '#2B463C';

const main: React.CSSProperties = {
    backgroundColor: KODE01_CREAM,
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
    padding: '40px 0',
};

const container: React.CSSProperties = {
    backgroundColor: KODE01_WHITE,
    margin: '0 auto',
    maxWidth: '560px',
    borderRadius: '0',
    border: `3px solid ${KODE01_NOIR}`,
    boxShadow: `6px 6px 0 ${KODE01_NOIR}`,
    overflow: 'hidden',
};

const headerSection: React.CSSProperties = {
    backgroundColor: KODE01_NOIR,
    padding: '24px 48px',
    textAlign: 'center' as const,
};

const logoText: React.CSSProperties = {
    color: KODE01_WHITE,
    fontSize: '28px',
    fontWeight: '900',
    margin: '0',
    letterSpacing: '-1px',
    textTransform: 'lowercase' as const,
};

const contentSection: React.CSSProperties = {
    padding: '40px 48px 32px',
};

const heading: React.CSSProperties = {
    color: KODE01_NOIR,
    fontSize: '28px',
    fontWeight: '900',
    lineHeight: '1.3',
    textAlign: 'center' as const,
    margin: '0 0 12px',
    letterSpacing: '-0.5px',
};

const subtitle: React.CSSProperties = {
    color: '#555555',
    fontSize: '16px',
    lineHeight: '26px',
    textAlign: 'center' as const,
    margin: '0 0 32px',
};

const ctaSection: React.CSSProperties = {
    textAlign: 'center' as const,
    margin: '0 0 32px',
};

const ctaButton: React.CSSProperties = {
    backgroundColor: KODE01_PINK,
    color: KODE01_NOIR,
    fontSize: '18px',
    fontWeight: '800',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    padding: '14px 40px',
    borderRadius: '0',
    border: `2px solid ${KODE01_NOIR}`,
    boxShadow: `3px 3px 0 ${KODE01_NOIR}`,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
};

const divider: React.CSSProperties = {
    borderColor: '#E5E5E5',
    borderStyle: 'solid',
    borderWidth: '1px 0 0 0',
    margin: '0 0 24px',
};

const dividerLarge: React.CSSProperties = {
    ...divider,
    margin: '0 0 32px',
};

const closing: React.CSSProperties = {
    color: KODE01_NOIR,
    fontSize: '16px',
    lineHeight: '24px',
    margin: '0',
};

const accountNameStyle: React.CSSProperties = {
    color: KODE01_GREEN,
    fontSize: '16px',
    fontWeight: '700',
    lineHeight: '24px',
    margin: '4px 0 0',
};

const footerSection: React.CSSProperties = {
    backgroundColor: KODE01_CREAM,
    padding: '24px 48px',
    borderTop: `2px solid ${KODE01_NOIR}`,
};

const footerMain: React.CSSProperties = {
    color: '#888888',
    fontSize: '13px',
    textAlign: 'center' as const,
    margin: '0 0 8px',
    fontWeight: '600',
};

const footerNote: React.CSSProperties = {
    color: '#aaaaaa',
    fontSize: '12px',
    lineHeight: '18px',
    textAlign: 'center' as const,
    margin: '0',
};

const unsubscribeSection: React.CSSProperties = {
    textAlign: 'center' as const,
    marginTop: '12px',
};

const unsubscribeLink: React.CSSProperties = {
    color: '#888888',
    textDecoration: 'underline',
    fontSize: '12px',
};

export default ConfirmSubscriptionEmail;
