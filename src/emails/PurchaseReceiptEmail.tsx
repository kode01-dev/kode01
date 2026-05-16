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

interface PurchaseReceiptEmailProps {
    buyerName: string;
    productName: string;
    amount: string;
    downloadUrl: string;
}

export const PurchaseReceiptEmail = ({
    buyerName,
    productName,
    amount,
    downloadUrl,
}: PurchaseReceiptEmailProps) => (
    <Html>
        <Head />
        <Preview>Your receipt for {productName}</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section style={header}>
                    <Heading style={heading}>Thank you for your purchase!</Heading>
                </Section>

                <Section style={body}>
                    <Text style={paragraph}>Hi {buyerName},</Text>
                    <Text style={paragraph}>
                        Thank you for buying <strong>{productName}</strong> on kode01. We hope you enjoy it!
                    </Text>
                    <Text style={paragraph}>
                        Amount paid: <strong>{amount}</strong>
                    </Text>

                    <Section style={btnContainer}>
                        <Link style={button} href={downloadUrl}>
                            Access Your Product
                        </Link>
                    </Section>

                    <Text style={paragraph}>
                        If you have any questions, feel free to reply to this email.
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
    backgroundColor: '#52A7FF',
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

export default PurchaseReceiptEmail;
