'use client';

import { Bot, ShieldCheck } from 'lucide-react';

interface BlueprintBadgeProps {
  locale: string;
}

export function AiBlueprintBadge({ locale }: BlueprintBadgeProps): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-violet-800">
      <Bot size={12} />
      {locale === 'fr' ? 'Plan IA' : 'AI Blueprint'}
    </span>
  );
}

interface VerifiedBadgeProps {
  locale: string;
}

export function BlueprintVerifiedBadge({ locale }: VerifiedBadgeProps): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
      <ShieldCheck size={12} />
      {locale === 'fr' ? 'Verifie' : 'Verified'}
    </span>
  );
}
