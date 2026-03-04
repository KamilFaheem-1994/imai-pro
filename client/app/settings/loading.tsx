import { DashboardLayout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <DashboardLayout title="Settings" description="Loading...">
      <div className="mx-auto max-w-3xl space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[200px] rounded-xl" />
        ))}
      </div>
    </DashboardLayout>
  );
}
