"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getClient, getCreators, getAgent, getAgentLogs, exportCreatorsCSV } from "@/db/queries";
import { Client, TrackedCreator, Agent, AgentLog } from "@/db/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Download, FileText, FileJson, Users } from "lucide-react";

export default function ClientReportsPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [creators, setCreators] = useState<TrackedCreator[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [isPending, startTransition] = useTransition();
  const clientId = params.id as string;

  useEffect(() => {
    startTransition(async () => {
      const clientData = await getClient(clientId);
      if (clientData) {
        setClient(clientData);
        const creatorsData = await getCreators(clientId);
        setCreators(creatorsData);
        if (clientData.agentId) {
          const agentData = await getAgent(clientData.agentId);
          setAgent(agentData || null);
          if (agentData) {
            const logs = await getAgentLogs(agentData.id);
            setAgentLogs(logs);
          }
        }
      } else {
        router.push("/clients");
      }
    });
  }, [clientId, router]);

  const handleExportCreatorsCSV = async () => {
    const csv = await exportCreatorsCSV(clientId);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${client?.name || "creators"}-creators.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCreatorsJSON = () => {
    const json = JSON.stringify(creators, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${client?.name || "creators"}-creators.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportClientData = () => {
    if (!client) return;
    const data = {
      client,
      creators,
      agent,
      agentLogs,
      exportedAt: new Date().toISOString(),
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${client.name}-full-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!client) {
    return (
      <DashboardLayout title="Loading..." description="Export reports and data">
        <div className="space-y-6">
          <Skeleton className="h-10 w-[160px]" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[200px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[150px] rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={`${client.name} - Reports`}
      description="Export reports and data"
    >
      <div className="space-y-6">
        {/* Breadcrumbs */}
        <Breadcrumbs items={[
          { label: "Clients", href: "/clients" },
          { label: client.name, href: `/clients/${clientId}` },
          { label: "Reports" },
        ]} />

        {/* Export Options */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle>Creators CSV</CardTitle>
              </div>
              <CardDescription>
                Export all tracked creators as a CSV file for use in spreadsheets
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 text-sm text-muted-foreground">
                <p>{creators.length} creators will be exported</p>
              </div>
              <Button onClick={handleExportCreatorsCSV} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                <CardTitle>Creators JSON</CardTitle>
              </div>
              <CardDescription>
                Export all tracked creators as a JSON file for developers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 text-sm text-muted-foreground">
                <p>Includes full creator data with engagement metrics</p>
              </div>
              <Button onClick={handleExportCreatorsJSON} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Download JSON
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                <CardTitle>Full Report</CardTitle>
              </div>
              <CardDescription>
                Export complete client data including config, creators, and agent logs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 text-sm text-muted-foreground">
                <p>Comprehensive backup of all client data</p>
              </div>
              <Button onClick={handleExportClientData} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Download Report
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Report Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Report Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Total Creators
                </p>
                <p className="text-2xl font-bold">{creators.length}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Added to IMAI
                </p>
                <p className="text-2xl font-bold">
                  {creators.filter((c) => c.addedToImai).length}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Pending
                </p>
                <p className="text-2xl font-bold">
                  {creators.filter((c) => !c.addedToImai).length}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Agent Runs
                </p>
                <p className="text-2xl font-bold">{agentLogs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
