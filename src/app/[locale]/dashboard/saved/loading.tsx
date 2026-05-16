import { DashboardShellSkeleton } from '@/components/skeletons';

export default function Loading(): React.JSX.Element {
    return <DashboardShellSkeleton cards={8} showCharts={false} showTable={false} />;
}
