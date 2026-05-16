import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text,
    Link,
} from '@react-email/components';
import * as React from 'react';

interface NewSaleEmailProps {
    sellerName: string;
    productName: string;
    revenue: string;
    dashboardUrl: string;
}

export const NewSaleEmail = ({
    sellerName,
    productName,
    revenue,
    dashboardUrl,
}: NewSaleEmailProps) => (
    <Html>
        <Head />
        <Preview>You made a new sale: {productName}</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section style={header}>
                    <Heading style={heading}>Cha-ching! 💸 New sale!</Heading>
                </Section>

                <Section style={body}>
                    <Text style={paragraph}>Congratulations {sellerName},</Text>
                    <Text style={paragraph}>
                        You just sold <strong>{productName}</strong>.
                    </Text>
                    <Text style={paragraph}>
                        Your earnings from this transaction: <strong style={{ color: '#58C86D' }}>{revenue}</strong>
                    </Text>

                    <Section style={btnContainer}>
                        <Link style={button} href={dashboardUrl}>
                            View Your Dashboard
                        </Link>
                    </Section>

                    <Text style={paragraph}>
                        Keep up the great work!
                    </Text>
                </Section>

                <Section style={footer}>
                    <Text style={footerText}>
                        © {new Date().getFullYear()} kode01 Marketplace. All rights reserved.
                    </Text>
                </Section>
            </Container>
        </Body>
    </Html>
);

const main = {
    backgroundColor: '#f6f9fc',
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '20px 0 48px',
    marginBottom: '64px',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
};

const header = {
    padding: '32px',
    textAlign: 'center' as const,
};

const heading = {
    fontSize: '24px',
    letterSpacing: '-0.5px',
    lineHeight: '1.3',
    fontWeight: '400',
    color: '#000000',
    padding: '0',
};

const body = {
    padding: '0 48px',
};

const paragraph = {
    fontSize: '16px',
    lineHeight: '26px',
    color: '#3c3f44',
};

const btnContainer = {
    textAlign: 'center' as const,
    margin: '32px 0',
};

const button = {
    backgroundColor: '#000000',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '16px',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'block',
    padding: '14px 24px',
    fontWeight: '600',
};

const footer = {
    padding: '0 48px',
    marginTop: '48px',
};

const footerText = {
    fontSize: '14px',
    color: '#8898aa',
    textAlign: 'center' as const,
};

export default NewSaleEmail;
