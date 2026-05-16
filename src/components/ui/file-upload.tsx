'use client';

import { type ChangeEvent, type DragEvent, useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const ACCEPTED_FILE_TYPES = new Set([
  ...ACCEPTED_IMAGE_TYPES,
  'application/zip',
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
]);

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface UploadedFile {
  url: string;
  name: string;
  size: number;
  type: string;
  bucket?: string;
  path?: string;
  kind?: string;
}

interface FileUploadProps {
  /** Accepted MIME set — defaults to images only */
  accept?: Set<string>;
  /** Whether multiple files can be uploaded */
  multiple?: boolean;
  /** Max file size in bytes */
  maxSize?: number;
  /** Already-uploaded files (controlled) */
  value?: UploadedFile[];
  /** Callback when files change */
  onChange?: (files: UploadedFile[]) => void;
  /** Upload handler receives the File and returns either a URL or an uploaded file descriptor. */
  onUpload: (file: File) => Promise<string | Partial<UploadedFile>>;
  /** Label text */
  label?: string;
  /** Helper text */
  hint?: string;
  /** Error message */
  error?: string;
  /** Disable interactions */
  disabled?: boolean;
  /** CSS class for the drop zone */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function FileUpload({
  accept = ACCEPTED_IMAGE_TYPES,
  multiple = false,
  maxSize = MAX_FILE_SIZE_BYTES,
  value = [],
  onChange,
  onUpload,
  label,
  hint,
  error,
  disabled = false,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /* ---- helpers ---- */

  const validate = useCallback(
    (file: File): string | null => {
      if (!accept.has(file.type)) {
        return `File type "${file.type}" is not supported.`;
      }
      if (file.size > maxSize) {
        return `File exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit.`;
      }
      return null;
    },
    [accept, maxSize],
  );

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (!multiple && files.length > 1) files.length = 1;

      setUploadError(null);
      setIsUploading(true);

      const uploaded: UploadedFile[] = [...value];

      for (const file of files) {
        const validationError = validate(file);
        if (validationError) {
          setUploadError(validationError);
          continue;
        }
        try {
          const result = await onUpload(file);
          const descriptor = typeof result === 'string' ? { url: result } : result;
          const url = descriptor.url ?? descriptor.path ?? file.name;
          uploaded.push({
            url,
            name: descriptor.name ?? file.name,
            size: descriptor.size ?? file.size,
            type: descriptor.type ?? file.type,
            bucket: descriptor.bucket,
            path: descriptor.path,
            kind: descriptor.kind,
          });
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed.');
        }
      }

      setIsUploading(false);
      onChange?.(uploaded);
    },
    [multiple, value, validate, onUpload, onChange],
  );

  /* ---- event handlers ---- */

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || !e.dataTransfer.files.length) return;
    void processFiles(e.dataTransfer.files);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    void processFiles(e.target.files);
    // Reset so same file can be re-selected
    e.target.value = '';
  }

  function handleRemove(index: number) {
    const next = value.filter((_, i) => i !== index);
    onChange?.(next);
  }

  /* ---- render ---- */

  const acceptString = Array.from(accept).join(',');
  const displayError = error || uploadError;

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium text-kode01-noir/70">{label}</label>
      )}

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        className={cn(
          'relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 transition-colors',
          isDragOver && !disabled
            ? 'border-kode01-pink bg-kode01-pink/5'
            : 'border-black/10 bg-kode01-cream/30 hover:border-kode01-pink/50 hover:bg-kode01-cream/50',
          disabled && 'cursor-not-allowed opacity-50',
          displayError && 'border-red-400/50',
          className,
        )}
      >
        {isUploading ? (
          <>
            <Loader2 size={24} className="animate-spin text-kode01-pink" />
            <p className="text-xs font-medium text-kode01-noir/50">Uploading...</p>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kode01-pink/10">
              {accept === ACCEPTED_IMAGE_TYPES ? (
                <ImagePlus size={20} className="text-kode01-pink" />
              ) : (
                <Upload size={20} className="text-kode01-pink" />
              )}
            </div>
            <p className="text-sm font-semibold text-kode01-noir/70">
              Drag & drop or <span className="text-kode01-pink underline">browse</span>
            </p>
            {hint && <p className="text-xs text-kode01-noir/40">{hint}</p>}
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={acceptString}
          multiple={multiple}
          onChange={handleInputChange}
          disabled={disabled}
          className="sr-only"
        />
      </div>

      {/* Error */}
      {displayError && (
        <p className="text-xs text-red-500">{displayError}</p>
      )}

      {/* Preview grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 mt-3">
          {value.map((file, index) => (
            <div
              key={file.url}
              className="group relative overflow-hidden rounded-xl border border-black/5 bg-kode01-white shadow-sm"
            >
              {file.type.startsWith('image/') ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={file.url}
                  alt={file.name}
                  className="h-28 w-full object-cover"
                />
              ) : (
                <div className="flex h-28 w-full items-center justify-center bg-kode01-cream/50">
                  <p className="text-xs font-bold text-kode01-noir/40 uppercase">
                    {file.name.split('.').pop()}
                  </p>
                </div>
              )}
              <div className="px-2 py-1.5">
                <p className="truncate text-xs font-medium text-kode01-noir/70">{file.name}</p>
                <p className="text-[10px] text-kode01-noir/35">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(index);
                }}
                className="absolute right-1.5 top-1.5 h-6 w-6 rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { ACCEPTED_IMAGE_TYPES, ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_BYTES };
