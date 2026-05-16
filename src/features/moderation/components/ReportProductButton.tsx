'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Flag, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { submitProductReport } from '../server/moderation-actions';
import { cn } from '@/lib/utils';

interface ReportProductButtonProps {
  productId: string;
  productTitle: string;
  variant?: 'outline' | 'ghost' | 'link';
  className?: string;
  showText?: boolean;
}

export function ReportProductButton({
  productId,
  productTitle,
  variant = 'ghost',
  className,
  showText = true,
}: ReportProductButtonProps) {
  const t = useTranslations('moderation');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<'illegal' | 'violence' | 'copyright' | 'spam' | 'other'>('spam');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await submitProductReport({
      product_id: productId,
      reason,
      details: details.trim() || undefined,
    });

    setIsSubmitting(false);

    if (result.success) {
      setIsSuccess(true);
      setTimeout(() => {
        setOpen(false);
        // Reset state after closing
        setTimeout(() => {
          setIsSuccess(false);
          setDetails('');
          setReason('spam');
        }, 300);
      }, 3000);
    } else {
      setError(result.error || 'error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          className={cn(
            'flex items-center gap-2 text-kode01-noir/40 hover:text-kode01-pink transition-colors font-bold uppercase tracking-widest text-[10px]',
            className
          )}
        >
          <Flag size={14} />
          {showText && <span>{t('report_title')}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-white rounded-[32px] border-none shadow-2xl p-8">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif font-black text-kode01-noir">
            {t('report_title')}
          </DialogTitle>
          <DialogDescription className="text-kode01-noir/60 font-medium">
            {t('report_subtitle')} (<strong>{productTitle}</strong>)
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-12 flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-kode01-green/10 rounded-full flex items-center justify-center text-kode01-green">
              <CheckCircle2 size={40} />
            </div>
            <div>
              <h4 className="text-xl font-bold text-kode01-noir">{t('success_title')}</h4>
              <p className="text-kode01-noir/60">{t('success_message')}</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 pt-4">
            <div className="space-y-3">
              <Label className="text-sm font-black uppercase tracking-widest text-kode01-noir/40">
                {t('reason_label')}
              </Label>
              <div className="grid grid-cols-1 gap-2">
                {(['illegal', 'violence', 'copyright', 'spam', 'other'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn(
                      'flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-bold transition-all',
                      reason === r
                        ? 'border-kode01-noir bg-kode01-noir text-white shadow-lg scale-[1.02]'
                        : 'border-black/5 bg-kode01-cream text-kode01-noir/60 hover:border-black/20'
                    )}
                  >
                    {t(`reason_${r}`)}
                    {reason === r && <CheckCircle2 size={16} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label htmlFor="details" className="text-sm font-black uppercase tracking-widest text-kode01-noir/40">
                {t('details_label')}
              </Label>
              <textarea
                id="details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={t('details_placeholder')}
                className="w-full min-h-[100px] px-4 py-3 bg-kode01-cream border border-black/5 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-kode01-noir/10 transition-all"
              />
            </div>

            {error && (
              <div className="p-3 bg-kode01-pink/10 border border-kode01-pink/20 rounded-xl flex items-center gap-2 text-kode01-pink text-xs font-bold">
                <AlertTriangle size={14} />
                {t('error_generic')}
              </div>
            )}

            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-kode01-noir text-white rounded-full py-6 font-serif font-black text-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                {isSubmitting ? t('submitting') : t('submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
