"use client";

import Link from "next/link";
import { Agent } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  Play,
  Pause,
  Trash2,
  FileText,
  Bot,
  Users,
} from "lucide-react";

interface AgentCardProps {
  agent: Agent;
  logsCount?: number;
  onStatusChange: (id: string, status: Agent["status"]) => void;
  onDelete: (id: string) => void;
}

export function AgentCard({ agent, logsCount = 0, onStatusChange, onDelete }: AgentCardProps) {
  const getStatusColor = (status: Agent["status"]) => {
    switch (status) {
      case "running":
        return "bg-green-100 text-green-600";
      case "error":
        return "bg-red-100 text-red-600";
      case "paused":
        return "bg-yellow-100 text-yellow-600";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getStatusBadge = (status: Agent["status"]) => {
    switch (status) {
      case "running":
        return "success";
      case "error":
        return "destructive";
      case "paused":
        return "warning";
      default:
        return "secondary";
    }
  };

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${getStatusColor(
              agent.status
            )}`}
          >
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-lg">{agent.clientName}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Agent ID: {agent.id.slice(0, 8)}...
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {agent.status === "running" ? (
              <DropdownMenuItem
                onClick={() => onStatusChange(agent.id, "paused")}
              >
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => onStatusChange(agent.id, "running")}
              >
                <Play className="mr-2 h-4 w-4" />
                Start
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href={`/agents/${agent.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                View Logs
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(agent.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant={getStatusBadge(agent.status)}>{agent.status}</Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Creators Added</p>
            <p className="font-semibold">{agent.creatorsAdded}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Last Run</p>
            <p className="text-sm">
              {agent.lastRun
                ? new Date(agent.lastRun).toLocaleDateString()
                : "Never"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Logs</p>
            <p className="text-sm">{logsCount} entries</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <Link href={`/agents/${agent.id}`}>
              <FileText className="mr-2 h-4 w-4" />
              View Details
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <Link href={`/clients/${agent.clientId}/creators`}>
              <Users className="mr-2 h-4 w-4" />
              Creators
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
