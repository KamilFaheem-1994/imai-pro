"use client";

import { DashboardLayout } from "@/components/layout";
import { ClientForm } from "@/components/clients";

export default function NewClientPage() {
  return (
    <DashboardLayout
      title="Add New Client"
      description="Create a new client to track social media mentions"
    >
      <div className="mx-auto max-w-3xl">
        <ClientForm />
      </div>
    </DashboardLayout>
  );
}
