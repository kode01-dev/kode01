import { DashboardShellSkeleton } from '@/components/skeletons';

export default function Loading(): React.JSX.Element {
    return <DashboardShellSkeleton cards={4} showCharts showTable />;
}
