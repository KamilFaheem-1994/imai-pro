"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout";
import { AgentTerminal } from "@/components/agents/agent-terminal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAgent,
  getClient,
  getAgentLogs,
  updateAgentStatus,
  addAgentLog,
  getImaiCredentials,
  getCreators,
  getOpenRouterSettings,
  updateCreatorsAdded,
} from "@/db/queries";
import {
  useAgentStream,
  runAgentNow,
  stopAgent,
  skipCurrentCreator,
  forceRelogin,
  switchToCreator,
} from "@/hooks/useAgentStream";
import { Agent, Client, AgentLog } from "@/db/schema";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Play,
  Pause,
  Users,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [dbLogs, setDbLogs] = useState<AgentLog[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isRunning, setIsRunning] = useState(false);
  const agentId = params.id as string;

  // SSE connection for real-time logs
  const {
    logs: streamLogs,
    isConnected,
    clearLogs,
    addLog,
    progress,
    agentStatus: streamStatus,
    creatorsList,
    currentCreatorIndex,
  } = useAgentStream(agentId);

  const loadData = () => {
    startTransition(async () => {
      const agentData = await getAgent(agentId);
      if (agentData) {
        setAgent(agentData);
        setIsRunning(agentData.status === "running");
        const [clientData, logsData] = await Promise.all([
          getClient(agentData.clientId),
          getAgentLogs(agentId),
        ]);
        if (clientData) {
          setClient(clientData);
        }
        setDbLogs(logsData);
      } else {
        router.push("/agents");
      }
    });
  };

  useEffect(() => {
    loadData();
  }, [agentId, router]);

  const handleStatusChange = async (status: Agent["status"]) => {
    if (agent) {
      await updateAgentStatus(agent.id, status);
      // Don't call loadData() here - it can reset isRunning prematurely
      // The status will be updated via SSE
    }
  };

  const handleRunNow = async () => {
    if (!agent || !client) {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: "Agent or client data not loaded",
      });
      return;
    }

    // Get IMAI credentials
    const credentials = await getImaiCredentials();
    if (!credentials) {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: "IMAI credentials not configured. Go to Settings to add them.",
      });
      return;
    }

    if (!client.imaiCampaignId) {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: "Client does not have an IMAI Campaign ID configured.",
      });
      return;
    }

    // Get OpenRouter settings
    const openRouterSettings = await getOpenRouterSettings();
    if (!openRouterSettings) {
      addLog({
        timestamp: new Date().toISOString(),
        level: "warning",
        message: "OpenRouter API key not configured. Using server default.",
      });
    }

    // Get creators to add
    const creators = await getCreators(client.id);
    const creatorsToAdd = creators.filter((c) => !c.addedToImai);

    if (creatorsToAdd.length === 0) {
      addLog({
        timestamp: new Date().toISOString(),
        level: "info",
        message: "No new creators to add. All tracked creators have already been added to IMAI.",
      });
      return;
    }

    // Agent runs use Playwright for campaign management — no IMAI API tokens consumed
    setIsRunning(true);
    await handleStatusChange("running");

    // Log the start locally
    addLog({
      timestamp: new Date().toISOString(),
      level: "info",
      message: `Starting agent run with ${creatorsToAdd.length} creators...`,
    });

    try {
      const result = await runAgentNow(agentId, {
        client: {
          id: client.id,
          name: client.name,
          imaiCampaignId: client.imaiCampaignId,
        },
        imaiCredentials: credentials,
        creators: creatorsToAdd.map((c) => ({ username: c.username })),
        openRouterSettings: openRouterSettings || undefined,
      });

      if (result.success) {
        addLog({
          timestamp: new Date().toISOString(),
          level: "success",
          message: "Agent run completed successfully",
          details: result.result as Record<string, unknown> | undefined,
        });

        // Update creators added count in database
        const runResult = result.result as { added?: number } | undefined;
        if (runResult?.added && runResult.added > 0) {
          await updateCreatorsAdded(agent.id, runResult.added);
        }

        // Log to database
        await addAgentLog(agent.id, {
          action: "Agent run completed",
          result: "success",
          details: JSON.stringify(result.result),
        });
      } else {
        addLog({
          timestamp: new Date().toISOString(),
          level: "error",
          message: `Agent run failed: ${result.error}`,
        });

        await addAgentLog(agent.id, {
          action: "Agent run failed",
          result: "error",
          details: result.error,
        });
      }
    } catch (error) {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: `Agent run error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setIsRunning(false);
      await handleStatusChange("idle");
      loadData();
    }
  };

  const handleStop = async () => {
    if (!agent) return;

    addLog({
      timestamp: new Date().toISOString(),
      level: "warning",
      message: "Stopping agent...",
    });

    try {
      await stopAgent(agentId);
      await handleStatusChange("idle");
      setIsRunning(false);

      addLog({
        timestamp: new Date().toISOString(),
        level: "info",
        message: "Agent stopped",
      });

      await addAgentLog(agent.id, {
        action: "Agent manually stopped",
        result: "info",
      });
    } catch (error) {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: `Failed to stop agent: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }

    loadData();
  };

  const handleSkip = async () => {
    try {
      const result = await skipCurrentCreator(agentId);
      if (result.success) {
        addLog({
          timestamp: new Date().toISOString(),
          level: "warning",
          message: "Skip command sent...",
        });
      } else {
        addLog({
          timestamp: new Date().toISOString(),
          level: "error",
          message: result.error || "Failed to skip creator",
        });
      }
    } catch (error) {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: `Skip error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  };

  const handleRelogin = async () => {
    try {
      const result = await forceRelogin(agentId);
      if (result.success) {
        addLog({
          timestamp: new Date().toISOString(),
          level: "info",
          message: "Relogin command sent...",
        });
      } else {
        addLog({
          timestamp: new Date().toISOString(),
          level: "error",
          message: result.error || "Failed to relogin",
        });
      }
    } catch (error) {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: `Relogin error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  };

  const handleSwitchCreator = async (username: string) => {
    try {
      const result = await switchToCreator(agentId, username);
      if (result.success) {
        addLog({
          timestamp: new Date().toISOString(),
          level: "info",
          message: `Switching to @${username}...`,
        });
      } else {
        addLog({
          timestamp: new Date().toISOString(),
          level: "error",
          message: result.error || `Failed to switch to @${username}`,
        });
      }
    } catch (error) {
      addLog({
        timestamp: new Date().toISOString(),
        level: "error",
        message: `Switch error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  };

  if (!agent) {
    return (
      <DashboardLayout title="Loading..." description="Agent details and real-time console">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Skeleton className="h-10 w-[160px]" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-[100px]" />
            </div>
          </div>
          <Skeleton className="h-[350px] rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-[250px] rounded-xl lg:col-span-2" />
            <Skeleton className="h-[250px] rounded-xl" />
          </div>
          <Skeleton className="h-[100px] rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "success";
      case "stopping":
        return "warning";
      case "error":
        return "destructive";
      case "paused":
        return "warning";
      default:
        return "secondary";
    }
  };

  // Calculate next run time based on last run and interval
  const getNextRunTime = () => {
    if (!agent.lastRun || !client?.checkInterval) return undefined;
    const lastRun = new Date(agent.lastRun);
    const nextRun = new Date(lastRun.getTime() + client.checkInterval * 60 * 1000); // convert minutes to milliseconds
    return nextRun.toISOString();
  };

  return (
    <DashboardLayout
      title={`Agent - ${agent.clientName}`}
      description="Agent details and real-time console"
    >
      <div className="space-y-6">
        {/* Breadcrumbs */}
        <Breadcrumbs items={[
          { label: "Agents", href: "/agents" },
          { label: agent.clientName },
        ]} />

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div />
          <div className="flex gap-2">
            {isRunning ? (
              <Button
                variant="secondary"
                onClick={() => handleStatusChange("paused")}
              >
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            ) : (
              <Button onClick={() => handleStatusChange("running")}>
                <Play className="mr-2 h-4 w-4" />
                Start
              </Button>
            )}
          </div>
        </div>

        {/* Agent Terminal Console */}
        <AgentTerminal
          agentId={agentId}
          clientName={agent.clientName}
          status={
            // Priority: SSE status > local isRunning > database status
            streamStatus === "stopping" ? "stopping" :
            streamStatus === "running" ? "running" :
            isRunning ? "running" :
            agent.status
          }
          nextRun={getNextRunTime()}
          onRunNow={handleRunNow}
          onStop={handleStop}
          logs={streamLogs}
          isConnected={isConnected}
          progress={progress}
          creatorsList={creatorsList}
          currentCreatorIndex={currentCreatorIndex}
          onSkip={handleSkip}
          onRelogin={handleRelogin}
          onSwitchCreator={handleSwitchCreator}
        />

        {/* Agent Info */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Agent Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Client
                  </p>
                  <p className="font-medium">{agent.clientName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Status
                  </p>
                  <Badge variant={getStatusColor(
                    streamStatus === "stopping" ? "stopping" :
                    streamStatus === "running" ? "running" :
                    isRunning ? "running" :
                    agent.status
                  )}>
                    {streamStatus === "stopping" ? "stopping" :
                     streamStatus === "running" ? "running" :
                     isRunning ? "running" :
                     agent.status}
                  </Badge>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">
                    IMAI Campaign ID
                  </p>
                  <p className="font-mono text-sm truncate" title={client?.imaiCampaignId || "Not configured"}>
                    {client?.imaiCampaignId || "Not configured"}
                  </p>
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
                    Check Interval
                  </p>
                  <p>{client?.checkInterval || 720} minutes</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Agent ID
                  </p>
                  <p className="font-mono text-sm">{agent.id}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>Creators Added</span>
                </div>
                <span className="text-xl font-bold">{agent.creatorsAdded}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Total Runs</span>
                </div>
                <span className="text-xl font-bold">
                  {dbLogs.filter((l) => l.action.includes("run")).length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  <span>Errors</span>
                </div>
                <span className="text-xl font-bold text-red-600">
                  {(agent.errors as string[] || []).length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/clients/${agent.clientId}`}>
                  <Bot className="mr-2 h-4 w-4" />
                  View Client
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/clients/${agent.clientId}/creators`}>
                  <Users className="mr-2 h-4 w-4" />
                  View Creators
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/clients/${agent.clientId}/edit`}>
                  Edit Tracking Config
                </Link>
              </Button>
              <Button variant="outline" onClick={clearLogs}>
                Clear Console
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
