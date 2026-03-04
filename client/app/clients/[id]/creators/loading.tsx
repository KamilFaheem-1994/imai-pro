import { DashboardLayout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";

export default function CreatorsLoading() {
  return (
    <DashboardLayout title="Loading..." description="Tracked creators">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Skeleton className="h-10 w-[160px]" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 w-[140px]" />
            <Skeleton className="h-10 w-[160px]" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    </DashboardLayout>
  );
}
