'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from '@/i18n/routing';

type NotificationItem = {
  id: string;
  title: string;
  message: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  emailStatus: 'pending' | 'sent' | 'failed' | 'skipped';
};

type NotificationsResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

const DEFAULT_429_COOLDOWN_MS = 60_000;

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function parseRetryAfterMs(headerValue: string | null): number {
  if (!headerValue) return DEFAULT_429_COOLDOWN_MS;

  const numericSeconds = Number.parseInt(headerValue, 10);
  if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
    return numericSeconds * 1000;
  }

  const dateMs = Date.parse(headerValue);
  if (Number.isFinite(dateMs)) {
    const deltaMs = dateMs - Date.now();
    return deltaMs > 0 ? deltaMs : DEFAULT_429_COOLDOWN_MS;
  }

  return DEFAULT_429_COOLDOWN_MS;
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) return undefined;

  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === 'string' ? payload.error : undefined;
  } catch {
    return undefined;
  }
}

export function NotificationBell() {
  const t = useTranslations('dashboard.header');
  const { user } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [isPushUpdating, setIsPushUpdating] = useState(false);
  const isFetchingRef = useRef(false);
  const rateLimitedUntilRef = useRef(0);

  // Set mounted on client to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const locale = useMemo(() => {
    if (typeof navigator === 'undefined') return 'en';
    return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  }, []);

  const rtf = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }), [locale]);

  const formatRelativeDate = useCallback((value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const diffInSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const absSeconds = Math.abs(diffInSeconds);

    if (absSeconds < 60) return rtf.format(diffInSeconds, 'second');
    const minutes = Math.round(diffInSeconds / 60);
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
    const days = Math.round(hours / 24);
    return rtf.format(days, 'day');
  }, [rtf]);

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    if (Date.now() < rateLimitedUntilRef.current) {
      setIsLoading(false);
      return;
    }

    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const response = await fetch('/api/notifications?limit=20', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setNotifications([]);
          setUnreadCount(0);
          return;
        }

        if (response.status === 429) {
          rateLimitedUntilRef.current = Date.now() + parseRetryAfterMs(response.headers.get('retry-after'));
          return;
        }

        const errorMessage = await readErrorMessage(response);
        throw new Error(errorMessage ?? `Failed to load notifications (status ${response.status})`);
      }

      const payload = (await response.json()) as NotificationsResponse;
      setNotifications(payload.notifications ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to load notifications:', error);
      }
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setPushSupported(supported);
    if (!supported) return;

    setPushPermission(window.Notification.permission);
    navigator.serviceWorker
      .getRegistration('/sw.js')
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        setPushEndpoint(subscription?.endpoint ?? null);
      })
      .catch(() => {
        setPushEndpoint(null);
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void loadNotifications();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void loadNotifications();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user, loadNotifications]);

  const markNotification = useCallback(
    async (id: string, isRead: boolean) => {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead }),
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to update notification');
      }
    },
    [],
  );

  async function handleMarkAllRead() {
    if (isUpdating || unreadCount <= 0) return;
    setIsUpdating(true);
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to mark notifications as read');
      }
      setNotifications((prev) =>
        prev.map((item) => ({
          ...item,
          isRead: true,
        })),
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleTogglePush() {
    if (!pushSupported || isPushUpdating) return;
    setIsPushUpdating(true);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const existingSubscription = await registration.pushManager.getSubscription();

      if (existingSubscription) {
        await fetch('/api/notifications/push-subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existingSubscription.endpoint }),
          credentials: 'include',
        }).catch(() => null);
        await existingSubscription.unsubscribe();
        setPushEndpoint(null);
        return;
      }

      const configResponse = await fetch('/api/notifications/push-config', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const config = (await configResponse.json().catch(() => null)) as {
        enabled?: boolean;
        publicKey?: string | null;
      } | null;

      if (!config?.enabled || !config.publicKey) return;

      const permission = await window.Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== 'granted') return;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
      const subscriptionJson = subscription.toJSON();

      const response = await fetch('/api/notifications/push-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          expirationTime: subscriptionJson.expirationTime ?? null,
          keys: subscriptionJson.keys,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        await subscription.unsubscribe().catch(() => null);
        throw new Error('Failed to save push subscription');
      }

      setPushEndpoint(subscription.endpoint);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to update push subscription:', error);
      }
    } finally {
      setIsPushUpdating(false);
    }
  }

  async function handleNotificationClick(notification: NotificationItem) {
    try {
      if (!notification.isRead) {
        await markNotification(notification.id, true);
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === notification.id
              ? {
                ...item,
                isRead: true,
              }
              : item,
          ),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }

      if (notification.link) {
        router.push(notification.link);
      }
    } catch (error) {
      console.error('Failed to open notification:', error);
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 hover:bg-black/10 rounded-full text-kode01-noir/60 hover:text-kode01-noir transition-colors flex shrink-0 items-center justify-center overflow-visible"
        >
          <Bell size={20} className="shrink-0" />
          {mounted && unreadCount > 0 ? (
            <div className="absolute -top-0.5 -right-0.5 pointer-events-none flex items-center justify-center">
              <span className="absolute h-2 w-2 rounded-full bg-kode01-pink animate-ping opacity-75" />
              <span className="relative min-w-[16px] h-4 px-1 rounded-full bg-kode01-pink text-white text-[10px] font-black leading-4 text-center shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </div>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96 max-w-[95vw] shadow-2xl border border-kode01-sauge/10 bg-white/95 backdrop-blur-sm">
        <DropdownMenuLabel className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-bold text-kode01-noir">{t('notifications_title')}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-[10px] font-black uppercase tracking-widest text-kode01-pink hover:bg-kode01-pink/10 rounded-full"
            disabled={isUpdating || unreadCount === 0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleMarkAllRead();
            }}
          >
            {isUpdating ? <Loader2 size={12} className="animate-spin" /> : t('notifications_mark_all_read')}
          </Button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-kode01-sauge/10" />

        {mounted && pushSupported && pushPermission !== 'denied' ? (
          <div className="px-4 py-3 border-b border-kode01-sauge/10">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 rounded-full text-xs font-bold text-kode01-noir/70 hover:bg-kode01-sauge/5"
              disabled={isPushUpdating}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleTogglePush();
              }}
            >
              {isPushUpdating ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
              {pushEndpoint ? t('notifications_push_enabled') : t('notifications_push_enable')}
            </Button>
          </div>
        ) : null}

        <div className="max-h-[70vh] overflow-y-auto scrollbar-hide">
          {isLoading ? (
            <div className="px-4 py-8 text-sm text-kode01-noir/50 flex items-center justify-center gap-3">
              <Loader2 size={18} className="animate-spin text-kode01-pink" />
              <span className="font-medium">{t('notifications_loading')}</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-kode01-sauge/5 text-kode01-sauge/30 mb-3">
                <Bell size={24} />
              </div>
              <p className="text-sm font-medium text-kode01-noir/40 leading-relaxed max-w-[200px] mx-auto">
                {t('notifications_empty')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.slice(0, 8).map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  onClick={() => void handleNotificationClick(notification)}
                  className={cn(
                    "cursor-pointer items-start gap-4 px-4 py-4 focus:bg-kode01-sauge/5 transition-colors",
                    !notification.isRead && "bg-kode01-pink/[0.03]"
                  )}
                >
                  <div className="relative mt-1 flex h-2 w-2 shrink-0 rounded-full">
                    {!notification.isRead && <span className="h-full w-full rounded-full bg-kode01-pink" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "text-sm leading-tight",
                      notification.isRead ? "text-kode01-noir/70 font-medium" : "text-kode01-noir font-bold"
                    )}>
                      {notification.title}
                    </p>
                    {notification.message ? (
                      <p className="mt-1 text-xs text-kode01-noir/60 line-clamp-2 leading-normal">{notification.message}</p>
                    ) : null}
                    {mounted && (
                      <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-kode01-noir/30">
                        {formatRelativeDate(notification.createdAt)}
                      </p>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
