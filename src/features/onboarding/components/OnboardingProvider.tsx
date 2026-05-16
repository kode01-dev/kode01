'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { WelcomeFlowModal } from './WelcomeFlowModal';

export function OnboardingProvider() {
  const { profile, loading } = useAuth();
  const [hasDismissed, setHasDismissed] = useState(false);

  const isOpen = !loading && !!profile && profile.role !== 'admin' && !profile.onboarding_completed && !hasDismissed;

  if (!isOpen) {
    return null;
  }


  return (
    <WelcomeFlowModal
      isOpen={isOpen}
      currentRole={profile.role as 'buyer' | 'seller'}
      onClose={(openVendorApplication) => {
        setHasDismissed(true);

        if (openVendorApplication) {
          // Signal BecomeVendorCard to open the VendorApplicationModal
          window.dispatchEvent(new CustomEvent('kode01:open-vendor-application'));
        }
      }}
    />
  );
}
