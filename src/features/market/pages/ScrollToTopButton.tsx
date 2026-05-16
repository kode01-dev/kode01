'use client';

import { ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ScrollToTopButton(): React.JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll(): void {
      setVisible(window.scrollY > 1200);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="lg:hidden fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full bg-kode01-noir text-white shadow-lg flex items-center justify-center hover:bg-kode01-pink hover:text-kode01-noir transition-all duration-200 cursor-pointer animate-in fade-in duration-300"
      aria-label="Back to top"
    >
      <ChevronUp size={22} />
    </button>
  );
}
