'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import { DashboardShellSkeleton } from '@/components/skeletons';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, ShieldAlert, Clock, Globe, Terminal, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

type BotActivity = {
    id: string;
    detected_at: string;
    source: string;
    reason: string;
    path: string | null;
    ip_address: string | null;
    user_agent: string | null;
    details: Record<string, unknown>;
    blocked: boolean;
};

function formatRelativeTime(dateStr: string, locale: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (diffInSeconds < 60) return rtf.format(-Math.max(1, diffInSeconds), 'second');
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return rtf.format(-diffInMinutes, 'minute');
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return rtf.format(-diffInHours, 'hour');
    const diffInDays = Math.floor(diffInHours / 24);
    return rtf.format(-diffInDays, 'day');
}

export function BotActivityList({ locale }: { locale: string }) {
    const t = useTranslations('dashboard.admin.bot_activity_list');
    const [activities, setActivities] = useState<BotActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();
    const copy = {
        title: t('title'),
        liveMonitoring: t('live_monitoring'),
        emptyState: t('empty_state'),
        blocked: t('blocked'),
        unknownIp: t('unknown_ip'),
        userAgent: t('user_agent'),
        na: t('not_available'),
        technicalDetails: t('technical_details'),
    };

    useEffect(() => {
        async function fetchActivity() {
            const { data, error } = await supabase
                .from('bot_activity')
                .select('*')
                .order('detected_at', { ascending: false })
                .limit(50);

            if (!error && data) {
                setActivities(data as BotActivity[]);
            }
            setLoading(false);
        }

        fetchActivity();

        // Real-time subscription
        const channel = supabase
            .channel('bot_activity_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_activity' }, (payload: RealtimePostgresInsertPayload<BotActivity>) => {
                setActivities((prev) => [payload.new as BotActivity, ...prev].slice(0, 50));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase]);

    if (loading) {
        return <DashboardShellSkeleton embedded cards={2} showCharts={false} showTable />;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-serif font-black text-kode01-noir">{copy.title}</h2>
                <div className="flex items-center gap-2 px-3 py-1 bg-kode01-blue/10 rounded-full">
                    <Shield size={16} className="text-kode01-blue" />
                    <span className="text-xs font-bold text-kode01-blue uppercase tracking-widest">{copy.liveMonitoring}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {activities.length === 0 ? (
                    <p className="text-center py-12 text-kode01-noir/40 bg-kode01-white border border-black/5 rounded-[32px]">
                        {copy.emptyState}
                    </p>
                ) : (
                    activities.map((activity) => (
                        <Card key={activity.id} className={`border-black/5 bg-kode01-white rounded-[24px] shadow-sm hover:shadow-md transition-all ${activity.blocked ? 'border-l-4 border-l-kode01-pink' : ''}`}>
                            <CardContent className="p-6">
                                <div className="flex flex-col md:flex-row md:items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${activity.blocked ? 'bg-kode01-pink/10' : 'bg-kode01-blue/10'}`}>
                                        {activity.blocked ? <ShieldAlert size={24} className="text-kode01-pink" /> : <Shield size={24} className="text-kode01-blue" />}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-black text-kode01-noir">{activity.reason}</span>
                                            <span className="text-[10px] font-bold px-2 py-0.5 bg-kode01-noir/5 rounded-full uppercase tracking-tighter text-kode01-noir/60">{activity.source}</span>
                                            {activity.blocked && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 bg-kode01-pink text-white rounded-full uppercase tracking-tighter">{copy.blocked}</span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            <div className="flex items-center gap-1.5 text-xs text-kode01-noir/50">
                                                <Globe size={12} />
                                                <span className="font-mono">{activity.ip_address || copy.unknownIp}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-kode01-noir/50">
                                                <Terminal size={12} />
                                                <span className="truncate max-w-[200px]">{activity.path || '/'}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-kode01-noir/50">
                                                <Clock size={12} />
                                                <span>{formatRelativeTime(activity.detected_at, locale)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right hidden md:block">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/30 mb-1">{copy.userAgent}</p>
                                        <p className="text-xs text-kode01-noir/60 max-w-[250px] truncate" title={activity.user_agent || ''}>
                                            {activity.user_agent || copy.na}
                                        </p>
                                    </div>
                                </div>

                                {Object.keys(activity.details).length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-black/5">
                                        <details className="group">
                                            <summary className="text-[10px] font-bold uppercase tracking-widest text-kode01-noir/40 cursor-pointer flex items-center justify-between group-open:mb-2 hover:text-kode01-blue transition-colors">
                                                {copy.technicalDetails}
                                                <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                                            </summary>
                                            <pre className="text-[10px] bg-kode01-noir/[0.02] p-3 rounded-lg overflow-x-auto font-mono text-kode01-noir/70 leading-relaxed">
                                                {JSON.stringify(activity.details, null, 2)}
                                            </pre>
                                        </details>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
