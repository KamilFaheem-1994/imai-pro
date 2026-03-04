"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getClient,
  getAgent,
  getCreators,
  createAgent,
  updateAgentStatus,
} from "@/db/queries";
import { Client, Agent, TrackedCreator } from "@/db/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  Edit,
  Bot,
  Hash,
  MapPin,
  Instagram,
  Users,
  Play,
  Pause,
  FileText,
  Megaphone,
} from "lucide-react";
import { BrandMentionsTab } from "@/components/creators/brand-mentions-tab";

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [creators, setCreators] = useState<TrackedCreator[]>([]);
  const [isPending, startTransition] = useTransition();
  const clientId = params.id as string;

  const loadData = () => {
    startTransition(async () => {
      const clientData = await getClient(clientId);
      if (clientData) {
        setClient(clientData);
        if (clientData.agentId) {
          const agentData = await getAgent(clientData.agentId);
          setAgent(agentData || null);
        }
        const creatorsData = await getCreators(clientId);
        setCreators(creatorsData);
      } else {
        router.push("/clients");
      }
    });
  };

  useEffect(() => {
    loadData();
  }, [clientId, router]);

  const handleSpawnAgent = () => {
    if (client) {
      startTransition(async () => {
        const newAgent = await createAgent(client.id, client.name);
        setAgent(newAgent);
        const updatedClient = await getClient(clientId);
        setClient(updatedClient || null);
      });
    }
  };

  const handleToggleAgent = () => {
    if (agent) {
      startTransition(async () => {
        const newStatus = agent.status === "running" ? "paused" : "running";
        await updateAgentStatus(agent.id, newStatus);
        const updatedAgent = await getAgent(agent.id);
        setAgent(updatedAgent || null);
      });
    }
  };

  if (!client) {
    return (
      <DashboardLayout title="Loading..." description="Client details">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-[200px]" />
                <Skeleton className="h-4 w-[150px]" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-10 w-[140px]" />
              <Skeleton className="h-10 w-[80px]" />
              <Skeleton className="h-10 w-[120px]" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={client.name} description="Client details">
      <div className="space-y-6">
        {/* Breadcrumbs */}
        <Breadcrumbs items={[
          { label: "Clients", href: "/clients" },
          { label: client.name },
        ]} />

        {/* Header Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl font-semibold">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold">{client.name}</h2>
              {client.tracking?.instagram?.handle && (
                <p className="text-muted-foreground">
                  @{client.tracking.instagram.handle}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/clients/${clientId}/creators`}>
                <Users className="mr-2 h-4 w-4" />
                Discover Creators
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/clients/${clientId}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
            {!agent ? (
              <Button onClick={handleSpawnAgent}>
                <Bot className="mr-2 h-4 w-4" />
                Spawn Agent
              </Button>
            ) : (
              <Button
                variant={agent.status === "running" ? "secondary" : "default"}
                onClick={handleToggleAgent}
              >
                {agent.status === "running" ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" />
                    Pause Agent
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Start Agent
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Agent Status</p>
                  <p className="text-2xl font-bold capitalize">
                    {agent?.status || "None"}
                  </p>
                </div>
                <Bot
                  className={`h-8 w-8 ${
                    agent?.status === "running"
                      ? "text-green-500"
                      : "text-muted-foreground"
                  }`}
                />
              </div>
            </CardContent>
          </Card>
          <Link href={`/clients/${clientId}/creators`}>
            <Card className="cursor-pointer transition-colors hover:bg-muted/50 h-full">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total Creators
                    </p>
                    <p className="text-2xl font-bold">{creators.length}</p>
                  </div>
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Instagram Creators
                  </p>
                  <p className="text-2xl font-bold">
                    {creators.filter((c) => c.platform === "instagram").length}
                  </p>
                </div>
                <Instagram className="h-8 w-8 text-pink-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    TikTok Creators
                  </p>
                  <p className="text-2xl font-bold">
                    {creators.filter((c) => c.platform === "tiktok").length}
                  </p>
                </div>
                <svg
                  className="h-8 w-8 text-muted-foreground"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                </svg>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Hashtags Tracked
                  </p>
                  <p className="text-2xl font-bold">
                    {(client.tracking?.instagram?.hashtags?.length || 0) +
                      (client.tracking?.facebook?.hashtags?.length || 0) +
                      (client.tracking?.tiktok?.hashtags?.length || 0)}
                  </p>
                </div>
                <Hash className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Locations Tracked
                  </p>
                  <p className="text-2xl font-bold">
                    {(client.tracking?.instagram?.locations?.length || 0) +
                      (client.tracking?.facebook?.locations?.length || 0)}
                  </p>
                </div>
                <MapPin className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="tracking">
          <TabsList>
            <TabsTrigger value="tracking">Tracking Config</TabsTrigger>
            <TabsTrigger value="mentions">Brand Mentions</TabsTrigger>
            <TabsTrigger value="agent">Agent Status</TabsTrigger>
            <TabsTrigger value="imai">IMAI Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="tracking" className="mt-4">
            <div className="grid gap-6 md:grid-cols-3">
              {/* Instagram */}
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <Instagram className="h-5 w-5" />
                  <CardTitle className="text-base">Instagram</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Handle
                    </p>
                    <p>@{client.tracking?.instagram?.handle || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Hashtags
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {client.tracking?.instagram?.hashtags?.length > 0 ? (
                        client.tracking.instagram.hashtags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            #{tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Locations
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {client.tracking?.instagram?.locations?.length > 0 ? (
                        client.tracking.instagram.locations.map((loc) => (
                          <Badge key={typeof loc === "object" ? loc.id || loc.name : loc} variant="outline" title={typeof loc === "object" && loc.id ? `Location ID: ${loc.id}` : undefined}>
                            {typeof loc === "object" ? loc.name : loc}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Facebook */}
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  <CardTitle className="text-base">Facebook</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Handle
                    </p>
                    <p>@{client.tracking?.facebook?.handle || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Hashtags
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {client.tracking?.facebook?.hashtags?.length > 0 ? (
                        client.tracking.facebook.hashtags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            #{tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Locations
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {client.tracking?.facebook?.locations?.length > 0 ? (
                        client.tracking.facebook.locations.map((loc) => (
                          <Badge key={typeof loc === "object" ? loc.id || loc.name : loc} variant="outline" title={typeof loc === "object" && loc.id ? `Location ID: ${loc.id}` : undefined}>
                            {typeof loc === "object" ? loc.name : loc}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* TikTok */}
              <Card>
                <CardHeader className="flex flex-row items-center gap-2">
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                  </svg>
                  <CardTitle className="text-base">TikTok</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Handle
                    </p>
                    <p>@{client.tracking?.tiktok?.handle || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Hashtags
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {client.tracking?.tiktok?.hashtags?.length > 0 ? (
                        client.tracking.tiktok.hashtags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            #{tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Locations
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {client.tracking?.tiktok?.locations?.length > 0 ? (
                        client.tracking.tiktok.locations.map((loc: { id: string; name: string } | string) => (
                          <Badge key={typeof loc === "object" ? loc.id || loc.name : loc} variant="outline" title={typeof loc === "object" && loc.id ? `Location ID: ${loc.id}` : undefined}>
                            {typeof loc === "object" ? loc.name : loc}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="mentions" className="mt-4">
            <BrandMentionsTab
              clientHandles={[
                ...(client.tracking?.instagram?.handle ? [client.tracking.instagram.handle] : []),
                ...(client.tracking?.tiktok?.handle ? [client.tracking.tiktok.handle] : []),
                ...(client.tracking?.facebook?.handle ? [client.tracking.facebook.handle] : []),
              ].filter(Boolean)}
              clientId={clientId}
            />
          </TabsContent>

          <TabsContent value="agent" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Agent Information</CardTitle>
              </CardHeader>
              <CardContent>
                {agent ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Status
                        </p>
                        <Badge
                          variant={
                            agent.status === "running"
                              ? "success"
                              : agent.status === "error"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {agent.status}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Last Run
                        </p>
                        <p>
                          {agent.lastRun
                            ? new Date(agent.lastRun).toLocaleString()
                            : "Never"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Creators Added
                        </p>
                        <p>{agent.creatorsAdded}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" asChild>
                        <Link href={`/agents/${agent.id}`}>
                          <FileText className="mr-2 h-4 w-4" />
                          View Logs
                        </Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link href={`/clients/${clientId}/creators`}>
                          <Users className="mr-2 h-4 w-4" />
                          View Creators
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <Bot className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                    <p className="mb-4 text-muted-foreground">
                      No agent has been spawned for this client
                    </p>
                    <Button onClick={handleSpawnAgent}>
                      <Bot className="mr-2 h-4 w-4" />
                      Spawn Agent
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="imai" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>IMAI Integration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Campaign ID
                    </p>
                    <p>{client.imaiCampaignId || "Not configured"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Check Interval
                    </p>
                    <p>{client.checkInterval} minutes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
