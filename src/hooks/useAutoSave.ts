'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions<T> {
  /** The data to auto-save */
  data: T;
  /** Async function that persists the data */
  onSave: (data: T) => Promise<void>;
  /** Debounce delay in ms (default: 30000 = 30s) */
  delay?: number;
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean;
  /** A unique key to store/restore from localStorage (optional) */
  storageKey?: string;
  /** Maximum persistence duration in localStorage (default: 24h) */
  storageTtlMs?: number;
  /** Top-level keys removed before persisting to localStorage */
  storageExcludeKeys?: string[];
}

interface UseAutoSaveReturn {
  /** Current auto-save status */
  status: AutoSaveStatus;
  /** Manually trigger a save */
  saveNow: () => void;
  /** Last saved timestamp (ms) or null */
  lastSavedAt: number | null;
}

type PersistedAutoSavePayload = {
  version: 2;
  savedAt: number;
  expiresAt: number;
  data: unknown;
};

function stripExcludedTopLevelKeys<T>(input: T, excludedKeys: string[]): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }

  if (excludedKeys.length === 0) {
    return input;
  }

  const clone = { ...(input as Record<string, unknown>) };
  for (const key of excludedKeys) {
    if (typeof key === 'string' && key.length > 0) {
      delete clone[key];
    }
  }

  return clone;
}

/**
 * Hook that auto-saves form data with a debounced delay.
 * Optionally persists to localStorage with TTL and key exclusion.
 */
export function useAutoSave<T>({
  data,
  onSave,
  delay = 30_000,
  enabled = true,
  storageKey,
  storageTtlMs = 24 * 60 * 60 * 1000,
  storageExcludeKeys = [],
}: UseAutoSaveOptions<T>): UseAutoSaveReturn {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  const initialRender = useRef(true);

  // Keep data ref current
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const persistToLocalStorage = useCallback((input: T) => {
    if (!storageKey) return;

    const now = Date.now();
    const payload: PersistedAutoSavePayload = {
      version: 2,
      savedAt: now,
      expiresAt: now + Math.max(60_000, storageTtlMs),
      data: stripExcludedTopLevelKeys(input, storageExcludeKeys),
    };

    localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [storageExcludeKeys, storageKey, storageTtlMs]);

  const save = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setStatus('saving');
    try {
      await onSave(dataRef.current);
      setStatus('saved');
      setLastSavedAt(Date.now());

      // Clear "saved" indicator after 3 seconds.
      setTimeout(() => setStatus('idle'), 3_000);
    } catch {
      setStatus('error');
    }
  }, [onSave]);

  // Persist to localStorage on every change.
  useEffect(() => {
    if (!storageKey || initialRender.current) return;
    try {
      persistToLocalStorage(data);
    } catch {
      // Silently fail - localStorage might be full or unavailable.
    }
  }, [data, persistToLocalStorage, storageKey]);

  // Debounced auto-save
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    if (!enabled) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, delay, enabled, save]);

  // Save on page unload
  useEffect(() => {
    if (!enabled) return;

    function handleBeforeUnload() {
      try {
        persistToLocalStorage(dataRef.current);
      } catch {
        // ignore
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, persistToLocalStorage]);

  return { status, saveNow: save, lastSavedAt };
}

/**
 * Restore auto-saved data from localStorage.
 * Returns null if no data found, expired, or parsing fails.
 */
export function restoreAutoSave<T>(storageKey: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const candidate = parsed as Partial<PersistedAutoSavePayload>;
      if (candidate.version === 2) {
        if (typeof candidate.expiresAt === 'number' && Date.now() > candidate.expiresAt) {
          localStorage.removeItem(storageKey);
          return null;
        }
        return (candidate.data ?? null) as T | null;
      }
    }

    // Legacy format fallback (raw serialized data).
    return parsed as T;
  } catch {
    return null;
  }
}

/**
 * Clear auto-saved data from localStorage (for example after successful submit).
 */
export function clearAutoSave(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

