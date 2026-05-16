import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from '@react-email/components';
import * as React from 'react';

interface ProductEmailProps {
    buyerName: string;
    productTitle: string;
    emailType: string;
    productLink: string;
    licenseKey?: string;
}

export const ProductEmail = ({
    buyerName,
    productTitle,
    emailType,
    productLink,
    licenseKey,
}: ProductEmailProps) => {
    let title = "Thank you for your purchase!";
    let body = `Hi ${buyerName}, thank you for purchasing ${productTitle}. You can access your product anytime by following the link below.`;

    if (emailType === 'day_1_followup') {
        title = `Checking in on your purchase of ${productTitle}`;
        body = `Hi ${buyerName}, just wanted to checking in! How are you finding ${productTitle} so far? If you have any questions, feel free to reply to this email.`;
    } else if (emailType === 'day_7_review') {
        title = `Would you like to share your feedback?`;
        body = `Hi ${buyerName}, it's been a week since you got ${productTitle}. We'd love to hear your thoughts! Sharing your feedback helps us improve and helps other creators too.`;
    }

    return (
        <Html>
            <Head />
            <Preview>{title}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={header}>
                        <Text style={logo}>kode01</Text>
                    </Section>
                    <Heading style={h1}>{title}</Heading>
                    <Text style={text}>{body}</Text>
                    {licenseKey && (
                        <Section style={keySection}>
                            <Text style={keyLabel}>Your License Key:</Text>
                            <Text style={keyCode}>{licenseKey}</Text>
                        </Section>
                    )}
                    <Section style={btnSection}>
                        <Link
                            href={productLink}
                            style={button}
                        >
                            Access Product
                        </Link>
                    </Section>
                    <Text style={footer}>
                        Sent via kode01 Marketplace. All rights reserved.
                    </Text>
                </Container>
            </Body>
        </Html>
    );
};

const main = {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '20px 0 48px',
    marginBottom: '64px',
    borderRadius: '12px',
    overflow: 'hidden',
};

const header = {
    padding: '0 48px',
    backgroundColor: '#1A1A1A',
    height: '60px',
    display: 'flex',
    alignItems: 'center',
};

const logo = {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: '900',
    margin: '0',
    letterSpacing: '-1px',
};

const h1 = {
    color: '#333',
    fontSize: '24px',
    fontWeight: 'bold',
    padding: '0 48px',
    margin: '30px 0',
};

const text = {
    color: '#333',
    fontSize: '16px',
    lineHeight: '26px',
    padding: '0 48px',
};

const btnSection = {
    padding: '24px 48px',
};

const button = {
    backgroundColor: '#52a7ff',
    borderRadius: '9999px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'block',
    padding: '12px 24px',
};

const keySection = {
    padding: '24px 48px',
    backgroundColor: '#f9fafb',
    border: '1px dashed #e5e7eb',
    margin: '0 48px',
    borderRadius: '8px',
};

const keyLabel = {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '4px',
    textTransform: 'uppercase' as const,
    fontWeight: 'bold',
};

const keyCode = {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#111827',
    fontFamily: 'monospace',
};

const footer = {
    color: '#8898aa',
    fontSize: '12px',
    lineHeight: '16px',
    padding: '0 48px',
    marginTop: '48px',
    textAlign: 'center' as const,
};

export default ProductEmail;
