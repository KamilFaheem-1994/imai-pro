import { DashboardLayout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentLoading() {
  return (
    <DashboardLayout title="Loading..." description="Agent details">
      <div className="space-y-6">
        <Skeleton className="h-8 w-[300px]" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    </DashboardLayout>
  );
}
