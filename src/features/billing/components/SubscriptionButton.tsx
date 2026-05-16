'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface SubscriptionButtonProps {
    plan: string;
    label: string;
    className?: string;
    isLoggedIn: boolean;
    loginLabel?: string;
}

export function SubscriptionButton({
    plan,
    label,
    className,
    isLoggedIn,
    loginLabel,
}: SubscriptionButtonProps) {
    const [isLoading, setIsLoading] = useState(false);
    const locale = useLocale();

    const handleSubscribe = async () => {
        if (!isLoggedIn) {
            window.location.href = `/auth/signup?redirect=/pricing`;
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/stripe/subscription-checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    plan,
                    locale,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to initiate checkout');
            }

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error('No checkout URL returned');
            }
        } catch (error) {
            console.error('Subscription error:', error);
            toast.error(error instanceof Error ? error.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleSubscribe}
            disabled={isLoading}
            className={className}
        >
            {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-current" />
            ) : (
                isLoggedIn ? label : (loginLabel || label)
            )}
        </button>
    );
}
