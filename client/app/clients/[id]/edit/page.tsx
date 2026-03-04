"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout";
import { ClientForm } from "@/components/clients";
import { getClient } from "@/db/queries";
import { Client } from "@/db/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export default function EditClientPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const clientId = params.id as string;

  useEffect(() => {
    startTransition(async () => {
      const clientData = await getClient(clientId);
      if (clientData) {
        setClient(clientData);
      } else {
        router.push("/clients");
      }
      setLoading(false);
    });
  }, [clientId, router]);

  if (loading || isPending) {
    return (
      <DashboardLayout title="Edit Client" description="Loading...">
        <div className="mx-auto max-w-3xl space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!client) {
    return null;
  }

  // Map database schema to form data format
  const initialData = {
    name: client.name,
    logo: client.logo || undefined,
    description: client.description || undefined,
    tracking: client.tracking || {
      instagram: { handle: "", hashtags: [], locations: [] },
      facebook: { handle: "", hashtags: [], locations: [] },
      tiktok: { handle: "", hashtags: [] },
    },
    imai: {
      campaignId: client.imaiCampaignId || "",
    },
    checkInterval: client.checkInterval,
  };

  return (
    <DashboardLayout
      title={`Edit ${client.name}`}
      description="Update client details and tracking configuration"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <Breadcrumbs items={[
          { label: "Clients", href: "/clients" },
          { label: client.name, href: `/clients/${clientId}` },
          { label: "Edit" },
        ]} />
        <ClientForm
          initialData={initialData}
          clientId={clientId}
          isEditing
        />
      </div>
    </DashboardLayout>
  );
}
