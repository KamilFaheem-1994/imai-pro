import { DashboardLayout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <DashboardLayout title="Dashboard" description="Loading...">
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
        {/* Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[300px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
        </div>
        {/* Quick Actions */}
        <Skeleton className="h-[100px] rounded-xl" />
      </div>
    </DashboardLayout>
  );
}
