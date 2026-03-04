"use client";

import { useEffect } from "react";
import { DashboardLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Client page error:", error);
  }, [error]);

  return (
    <DashboardLayout title="Error" description="Client page error">
      <div className="flex flex-col items-center justify-center py-16">
        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load client</h2>
        <p className="text-muted-foreground mb-4 max-w-md text-center">
          {error.message || "Could not load the client details. Please try again."}
        </p>
        <div className="flex gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.href = "/clients"}>
            Back to clients
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
