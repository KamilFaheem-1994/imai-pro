"use client";

// Force dynamic rendering — dashboard shows live stats
export const dynamic = "force-dynamic";

import { useEffect, useState, useTransition } from "react";
import { DashboardLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getClients,
  getAgents,
  getAgentStats,
  getCreatorsDiscoveredToday,
  getCreatorsDiscoveredThisWeek,
  getAgentRunsToday,
  getLastActivityTimestamp,
} from "@/db/queries";
import { Client, Agent } from "@/db/schema";
import {
  Users,
  Bot,
  UserPlus,
  TrendingUp,
  ArrowRight,
  Activity,
  Calendar,
  Clock,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { CreditBalanceWidget } from "@/components/credits/credit-balance-widget";

interface AgentStats {
  totalAgents: number;
  runningAgents: number;
  idleAgents: number;
  errorAgents: number;
  pausedAgents: number;
  totalCreatorsAdded: number;
}

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStats>({
    totalAgents: 0,
    runningAgents: 0,
    idleAgents: 0,
    errorAgents: 0,
    pausedAgents: 0,
    totalCreatorsAdded: 0,
  });
  const [creatorsToday, setCreatorsToday] = useState(0);
  const [creatorsThisWeek, setCreatorsThisWeek] = useState(0);
  const [agentRunsToday, setAgentRunsToday] = useState(0);
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const [clientsData, agentsData, statsData, todayCount, weekCount, runsToday, lastAct] =
        await Promise.all([
          getClients(),
          getAgents(),
          getAgentStats(),
          getCreatorsDiscoveredToday(),
          getCreatorsDiscoveredThisWeek(),
          getAgentRunsToday(),
          getLastActivityTimestamp(),
        ]);
      setClients(clientsData);
      setAgents(agentsData);
      setAgentStats(statsData);
      setCreatorsToday(todayCount);
      setCreatorsThisWeek(weekCount);
      setAgentRunsToday(runsToday);
      setLastActivity(lastAct);
    });
  }, []);

  const recentClients = clients.slice(0, 5);
  const recentAgents = agents.slice(0, 5);

  const formatRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <DashboardLayout
      title="Dashboard"
      description="Overview of your influencer tracking operations"
    >
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Total Clients
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clients.length}</div>
              <p className="text-xs text-muted-foreground">
                Brands being tracked
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Active Agents
              </CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {agentStats.runningAgents}
              </div>
              <p className="text-xs text-muted-foreground">
                {agentStats.totalAgents} total agents
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Creators Added
              </CardTitle>
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {agentStats.totalCreatorsAdded}
              </div>
              <p className="text-xs text-muted-foreground">
                Added to IMAI campaigns
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Agent Errors
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{agentStats.errorAgents}</div>
              <p className="text-xs text-muted-foreground">
                Requires attention
              </p>
            </CardContent>
          </Card>

          <CreditBalanceWidget />
        </div>

        {/* Time-Based Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Discovered Today</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{creatorsToday}</div>
              <p className="text-xs text-muted-foreground">creators found today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{creatorsThisWeek}</div>
              <p className="text-xs text-muted-foreground">creators this week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Agent Runs Today</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{agentRunsToday}</div>
              <p className="text-xs text-muted-foreground">runs completed today</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Last Activity</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {lastActivity ? formatRelativeTime(lastActivity) : "\u2014"}
              </div>
              <p className="text-xs text-muted-foreground">
                {lastActivity ? new Date(lastActivity).toLocaleString() : "No activity yet"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Clients */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Clients</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/clients">
                  View all <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentClients.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 h-8 w-8" />
                  <p>No clients yet</p>
                  <Button variant="link" asChild className="mt-2">
                    <Link href="/clients/new">Add your first client</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentClients.map((client) => (
                    <Link
                      key={client.id}
                      href={`/clients/${client.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{client.name}</p>
                          <p className="text-sm text-muted-foreground">
                            @{client.tracking?.instagram?.handle || "No handle"}
                          </p>
                        </div>
                      </div>
                      {client.agentId ? (
                        <Badge variant="success">Agent Active</Badge>
                      ) : (
                        <Badge variant="secondary">No Agent</Badge>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Agent Status */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Agent Status</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/agents">
                  View all <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentAgents.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Bot className="mx-auto mb-2 h-8 w-8" />
                  <p>No agents running</p>
                  <p className="text-sm">
                    Create a client and spawn an agent to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentAgents.map((agent) => (
                    <Link
                      key={agent.id}
                      href={`/agents/${agent.id}`}
                      className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            agent.status === "running"
                              ? "bg-green-100 text-green-600"
                              : agent.status === "error"
                              ? "bg-red-100 text-red-600"
                              : agent.status === "paused"
                              ? "bg-yellow-100 text-yellow-600"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          <Bot className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">{agent.clientName}</p>
                          <p className="text-sm text-muted-foreground">
                            {agent.creatorsAdded} creators added
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          agent.status === "running"
                            ? "success"
                            : agent.status === "error"
                            ? "destructive"
                            : agent.status === "paused"
                            ? "warning"
                            : "secondary"
                        }
                      >
                        {agent.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <Button asChild>
                <Link href="/clients/new">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add New Client
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/agents">
                  <Bot className="mr-2 h-4 w-4" />
                  Manage Agents
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/clients">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  View Reports
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
