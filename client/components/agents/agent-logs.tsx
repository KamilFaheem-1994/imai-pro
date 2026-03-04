"use client";

import { AgentLog } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, XCircle, Info } from "lucide-react";

interface AgentLogsProps {
  logs: AgentLog[];
}

export function AgentLogs({ logs }: AgentLogsProps) {
  const getIcon = (result: AgentLog["result"]) => {
    switch (result) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getBadge = (result: AgentLog["result"]) => {
    switch (result) {
      case "success":
        return "success";
      case "error":
        return "destructive";
      default:
        return "secondary";
    }
  };

  if (logs.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <Info className="mx-auto mb-2 h-8 w-8" />
        <p>No logs yet</p>
        <p className="text-sm">Logs will appear here when the agent runs</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            {getIcon(log.result)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={getBadge(log.result)} className="capitalize">
                  {log.result}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="font-medium">{log.action}</p>
              {log.details && (
                <p className="text-sm text-muted-foreground mt-1">
                  {log.details}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
