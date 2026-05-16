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

type AppNotificationEmailProps = {
  title: string;
  message?: string | null;
  ctaUrl?: string | null;
  ctaLabel: string;
  footerText: string;
};

export function AppNotificationEmail({
  title,
  message,
  ctaUrl,
  ctaLabel,
  footerText,
}: AppNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading style={styles.heading}>{title}</Heading>
          </Section>
          <Section style={styles.content}>
            {message ? <Text style={styles.paragraph}>{message}</Text> : null}
            {ctaUrl ? (
              <Text style={styles.paragraph}>
                <Link href={ctaUrl} style={styles.link}>
                  {ctaLabel}
                </Link>
              </Text>
            ) : null}
            <Text style={styles.footer}>
              {footerText}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  main: {
    backgroundColor: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  container: {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '24px',
    borderRadius: '14px',
    maxWidth: '640px',
  },
  header: {
    marginBottom: '12px',
  },
  heading: {
    fontSize: '24px',
    lineHeight: '1.3',
    margin: '0',
    color: '#111111',
  },
  content: {
    marginTop: '8px',
  },
  paragraph: {
    fontSize: '15px',
    lineHeight: '1.6',
    color: '#333333',
    margin: '0 0 12px 0',
  },
  link: {
    color: '#1460ff',
    textDecoration: 'underline',
  },
  footer: {
    fontSize: '12px',
    color: '#777777',
    marginTop: '20px',
  },
};

export default AppNotificationEmail;
