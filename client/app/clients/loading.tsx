import { DashboardLayout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <DashboardLayout title="Clients" description="Loading...">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-10 w-[300px]" />
          <Skeleton className="h-10 w-[120px]" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[200px] rounded-xl" />
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
