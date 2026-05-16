'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ACCEPTED_IMAGE_TYPES, FileUpload, type UploadedFile } from '@/components/ui/file-upload';
import type { OrderIncidentIssueType } from '@/features/order-incidents/types';

type Props = {
  purchaseId: string;
  locale: string;
};

const ISSUE_TYPES: OrderIncidentIssueType[] = [
  'purchase_info_missing',
  'content_missing',
  'license_issue',
  'other',
];

export function ReportOrderIssueButton({ purchaseId, locale }: Props) {
  const t = useTranslations('dashboard.buyer.order_incidents');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issueType, setIssueType] = useState<OrderIncidentIssueType>('purchase_info_missing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<UploadedFile[]>([]);

  async function uploadEvidenceFile(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/order-incidents/uploads', {
      method: 'POST',
      body: formData,
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; url?: string } | null;
    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error ?? t('messages.upload_failed'));
    }
    return payload.url;
  }

  async function submitIncident() {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/order-incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseId,
          issueType,
          evidenceUrls: evidenceFiles.map((file) => file.url),
          locale,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(payload?.error ?? t('messages.created_failed'));
        return;
      }

      setOpen(false);
      setEvidenceFiles([]);
      window.location.reload();
    } catch (error) {
      console.error('Failed to create order incident:', error);
      setErrorMessage(t('messages.created_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-full border border-red-300 bg-red-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-700"
      >
        {t('report_cta')}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>{t('report_title')}</DialogTitle>
            <DialogDescription>{t('report_description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-kode01-noir/50">
              {t('issue_type')}
            </label>
            <select
              value={issueType}
              onChange={(event) => setIssueType(event.target.value as OrderIncidentIssueType)}
              className="h-11 w-full rounded-2xl border border-kode01-sauge/30 bg-white px-4 text-sm"
            >
              {ISSUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`issue_types.${type}`)}
                </option>
              ))}
            </select>

            <FileUpload
              label={t('evidence_label')}
              hint={t('evidence_hint')}
              accept={ACCEPTED_IMAGE_TYPES}
              multiple
              value={evidenceFiles}
              onChange={(files) => setEvidenceFiles(files.slice(0, 8))}
              onUpload={uploadEvidenceFile}
            />

            {errorMessage ? (
              <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 rounded-2xl border border-kode01-sauge/30 px-4 text-xs font-bold uppercase tracking-widest text-kode01-noir/70"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitIncident()}
              className="inline-flex h-10 items-center rounded-2xl bg-kode01-noir px-4 text-xs font-bold uppercase tracking-widest text-kode01-white disabled:opacity-60"
            >
              {submitting ? <Loader2 size={12} className="mr-2 animate-spin" /> : null}
              {submitting ? t('report_submitting') : t('report_submit')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
