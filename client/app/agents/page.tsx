"use client";

import { useEffect, useState, useTransition } from "react";
import { DashboardLayout } from "@/components/layout";
import { AgentCard } from "@/components/agents";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAgents, getAgentStats, getAgentLogCounts, updateAgentStatus, deleteAgent } from "@/db/queries";
import { Agent } from "@/db/schema";
import { Bot, Play, Pause, AlertCircle, CheckCircle } from "lucide-react";

interface AgentStats {
  totalAgents: number;
  runningAgents: number;
  idleAgents: number;
  errorAgents: number;
  pausedAgents: number;
  totalCreatorsAdded: number;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logCounts, setLogCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<AgentStats>({
    totalAgents: 0,
    runningAgents: 0,
    idleAgents: 0,
    errorAgents: 0,
    pausedAgents: 0,
    totalCreatorsAdded: 0,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = () => {
    startTransition(async () => {
      const [agentsData, statsData, logCountsData] = await Promise.all([
        getAgents(),
        getAgentStats(),
        getAgentLogCounts(),
      ]);
      setAgents(agentsData);
      setStats(statsData);
      setLogCounts(logCountsData);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = (id: string, status: Agent["status"]) => {
    startTransition(async () => {
      await updateAgentStatus(id, status);
      loadData();
    });
  };

  const handleDeleteClick = (id: string) => {
    setAgentToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (agentToDelete) {
      startTransition(async () => {
        await deleteAgent(agentToDelete);
        loadData();
        setDeleteDialogOpen(false);
        setAgentToDelete(null);
      });
    }
  };

  const handleStartAll = () => {
    startTransition(async () => {
      for (const agent of agents) {
        if (agent.status !== "running") {
          await updateAgentStatus(agent.id, "running");
        }
      }
      loadData();
    });
  };

  const handlePauseAll = () => {
    startTransition(async () => {
      for (const agent of agents) {
        if (agent.status === "running") {
          await updateAgentStatus(agent.id, "paused");
        }
      }
      loadData();
    });
  };

  return (
    <DashboardLayout
      title="Agents"
      description="Manage your automation agents"
    >
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAgents}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Running</CardTitle>
              <Play className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.runningAgents}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Paused</CardTitle>
              <Pause className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {stats.pausedAgents}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Errors</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stats.errorAgents}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Creators Added
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCreatorsAdded}</div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        {agents.length > 0 && (
          <div className="flex gap-2">
            <Button onClick={handleStartAll} variant="outline">
              <Play className="mr-2 h-4 w-4" />
              Start All
            </Button>
            <Button onClick={handlePauseAll} variant="outline">
              <Pause className="mr-2 h-4 w-4" />
              Pause All
            </Button>
          </div>
        )}

        {/* Agent Grid */}
        {agents.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Bot className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No agents yet</h3>
              <p className="text-muted-foreground">
                Create a client and spawn an agent to get started with
                automation
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                logsCount={logCounts[agent.id] || 0}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Agent</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this agent? This action cannot be
                undone. The agent will stop running and all logs will be deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
