"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  Square,
  Terminal,
  Clock,
  RefreshCw,
  CheckCircle2,
  XCircle,
  SkipForward,
  Loader2,
  LogIn,
  ChevronDown,
  ChevronUp,
  Users,
  CircleDot,
  Circle,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TerminalLog, AgentProgress, CreatorStatus } from "@/hooks/useAgentStream";

interface AgentTerminalProps {
  agentId: string;
  clientName: string;
  status: "idle" | "running" | "error" | "paused" | "stopping";
  nextRun?: string;
  onRunNow: () => void;
  onStop: () => void;
  logs: TerminalLog[];
  isConnected: boolean;
  progress?: AgentProgress | null;
  creatorsList?: CreatorStatus[];
  currentCreatorIndex?: number;
  onSkip?: () => void;
  onRelogin?: () => void;
  onSwitchCreator?: (username: string) => void;
}

// Helper to derive progress from logs when SSE progress events aren't received
function deriveProgressFromLogs(logs: TerminalLog[]): AgentProgress | null {
  let added = 0;
  let failed = 0;
  let skipped = 0;
  let total = 0;
  let current = 0;
  let currentCreator = "";

  for (const log of logs) {
    const msg = log.message.toLowerCase();

    // Extract total from "Processing X creators" or "Starting to process X creators"
    const totalMatch = log.message.match(/Processing (\d+) creators?/i) ||
                       log.message.match(/(\d+) creators? to process/i);
    if (totalMatch) {
      total = parseInt(totalMatch[1], 10);
    }

    // Extract current creator from "Processing creator X/Y: @username" or "Adding @username"
    const creatorMatch = log.message.match(/Processing creator (\d+)\/(\d+):\s*@?(\w+)/i) ||
                         log.message.match(/Adding @(\w+)/i) ||
                         log.message.match(/\[(\d+)\/(\d+)\]\s*@?(\w+)/i);
    if (creatorMatch) {
      if (creatorMatch.length >= 4) {
        current = parseInt(creatorMatch[1], 10);
        total = parseInt(creatorMatch[2], 10);
        currentCreator = creatorMatch[3];
      } else if (creatorMatch[1]) {
        currentCreator = creatorMatch[1];
      }
    }

    // Count outcomes
    if (msg.includes("successfully added") || msg.includes("✓ added") || log.level === "success") {
      added++;
    }
    if (msg.includes("failed to add") || msg.includes("❌ failed") || (log.level === "error" && msg.includes("@"))) {
      failed++;
    }
    if (msg.includes("skipped") || msg.includes("already exists")) {
      skipped++;
    }
  }

  // If we found some progress indicators, return derived progress
  if (total > 0 || added > 0 || failed > 0 || skipped > 0) {
    return {
      current: current || (added + failed + skipped),
      total: total || (added + failed + skipped),
      added,
      failed,
      skipped,
      currentCreator,
      isRetry: false
    };
  }

  return null;
}

export function AgentTerminal({
  agentId,
  clientName,
  status,
  nextRun,
  onRunNow,
  onStop,
  logs,
  isConnected,
  progress,
  creatorsList = [],
  currentCreatorIndex = -1,
  onSkip,
  onRelogin,
  onSwitchCreator,
}: AgentTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showCreatorsList, setShowCreatorsList] = useState(false);

  // Derive progress from logs if SSE progress isn't available
  const derivedProgress = useMemo(() => deriveProgressFromLogs(logs), [logs]);

  // Use SSE progress if available, otherwise use derived progress
  const effectiveProgress = progress || derivedProgress;

  // Determine if agent is active (running or stopping)
  const isAgentActive = status === "running" || status === "stopping";

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getNextRunDisplay = () => {
    if (!nextRun) return null;
    const next = new Date(nextRun);
    const now = new Date();
    const diff = next.getTime() - now.getTime();

    if (diff <= 0) return "Soon";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "success":
        return "text-green-400";
      case "error":
        return "text-red-400";
      case "warning":
        return "text-yellow-400";
      default:
        return "text-blue-400";
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "success":
        return "SUCCESS";
      case "error":
        return "ERROR";
      case "warning":
        return "WARN";
      default:
        return "INFO";
    }
  };

  const getStatusBadgeVariant = () => {
    switch (status) {
      case "running":
        return "default" as const;
      case "stopping":
        return "secondary" as const;
      case "error":
        return "destructive" as const;
      case "paused":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  const progressPercent = effectiveProgress && effectiveProgress.total > 0
    ? Math.round((effectiveProgress.current / effectiveProgress.total) * 100)
    : 0;

  const getCreatorStatusIcon = (creatorStatus: CreatorStatus["status"]) => {
    switch (creatorStatus) {
      case "added":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "skipped":
        return <SkipForward className="h-4 w-4 text-yellow-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Circle className="h-4 w-4 text-zinc-500" />;
    }
  };

  const getCreatorStatusColor = (creatorStatus: CreatorStatus["status"]) => {
    switch (creatorStatus) {
      case "added":
        return "text-green-400";
      case "failed":
        return "text-red-400";
      case "skipped":
        return "text-yellow-400";
      case "processing":
        return "text-blue-400";
      default:
        return "text-zinc-400";
    }
  };

  return (
    <Card className="overflow-hidden border-zinc-800 bg-zinc-950">
      <CardHeader className="flex flex-col gap-0 border-b border-zinc-800 bg-zinc-900 p-0">
        {/* Top row: Title + Status + Main Actions */}
        <div className="flex flex-row items-center justify-between py-3 px-4">
          <div className="flex items-center gap-3">
            <Terminal className="h-5 w-5 text-zinc-400" />
            <div>
              <CardTitle className="text-sm font-medium text-white">
                IMAI Agent Console
              </CardTitle>
              <p className="text-xs text-zinc-500">{clientName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Connection indicator */}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  isConnected ? "bg-green-500 animate-pulse" : "bg-zinc-600"
                )}
              />
              <span className="text-xs text-zinc-500">
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>

            {/* Status badge */}
            <Badge variant={getStatusBadgeVariant()} className="capitalize">
              {status}
            </Badge>

            {/* Action buttons */}
            {isAgentActive ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={onStop}
                disabled={status === "stopping"}
                className="h-7 px-2"
              >
                {status === "stopping" ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Stopping...
                  </>
                ) : (
                  <>
                    <Square className="mr-1 h-3 w-3" />
                    Stop
                  </>
                )}
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={onRunNow}
                className="h-7 bg-green-600 hover:bg-green-700 px-2"
              >
                <Play className="mr-1 h-3 w-3" />
                Run Now
              </Button>
            )}
          </div>
        </div>

        {/* Control bar: ALWAYS visible when agent is running - Skip, Relogin, Creators */}
        {isAgentActive && (
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-t border-zinc-700/50">
            <div className="flex items-center gap-2">
              {/* Skip button */}
              {onSkip && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSkip}
                  className="h-7 px-3 text-yellow-500 border-yellow-500/50 hover:bg-yellow-500/10 hover:text-yellow-400"
                >
                  <SkipForward className="me-1.5 h-3.5 w-3.5" />
                  Skip Current
                </Button>
              )}
              {/* Relogin button */}
              {onRelogin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRelogin}
                  className="h-7 px-3 text-blue-500 border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
                >
                  <LogIn className="me-1.5 h-3.5 w-3.5" />
                  Relogin
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Creators list toggle */}
              {creatorsList.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreatorsList(!showCreatorsList)}
                  className="h-7 px-2 text-zinc-400 hover:text-white"
                >
                  <Users className="me-1 h-3 w-3" />
                  Creators ({creatorsList.length})
                  {showCreatorsList ? (
                    <ChevronUp className="ms-1 h-3 w-3" />
                  ) : (
                    <ChevronDown className="ms-1 h-3 w-3" />
                  )}
                </Button>
              )}

              {/* Running indicator */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                <span>Processing...</span>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      {/* Progress Bar and Counters - Shows when running and we have progress data */}
      {isAgentActive && effectiveProgress && (
        <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-zinc-400">
                Processing {effectiveProgress.current} of {effectiveProgress.total} creators
                {effectiveProgress.currentCreator && (
                  <span className="text-zinc-500"> • @{effectiveProgress.currentCreator}</span>
                )}
                {effectiveProgress.isRetry && (
                  <Badge variant="outline" className="ml-2 text-yellow-500 border-yellow-500 text-[10px] px-1 py-0">
                    RETRY
                  </Badge>
                )}
                {!progress && derivedProgress && (
                  <Badge variant="outline" className="ml-2 text-zinc-500 border-zinc-500 text-[10px] px-1 py-0">
                    DERIVED
                  </Badge>
                )}
              </span>
              <span className="text-xs text-zinc-500">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-1.5 bg-zinc-800" />
          </div>

          {/* Counters */}
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span className="text-zinc-400">Added:</span>
              <span className="text-green-400 font-semibold">{effectiveProgress.added}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-zinc-400">Failed:</span>
              <span className="text-red-400 font-semibold">{effectiveProgress.failed}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <SkipForward className="h-3.5 w-3.5 text-yellow-500" />
              <span className="text-zinc-400">Skipped:</span>
              <span className="text-yellow-400 font-semibold">{effectiveProgress.skipped}</span>
            </div>
          </div>
        </div>
      )}

      {/* Creators List Panel */}
      {showCreatorsList && creatorsList.length > 0 && isAgentActive && (
        <div className="border-b border-zinc-800 bg-zinc-900/30 px-4 py-2 max-h-48 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
            {creatorsList.map((creator, index) => (
              <button
                key={creator.username}
                onClick={() => {
                  if (creator.status === "pending" && onSwitchCreator) {
                    onSwitchCreator(creator.username);
                  }
                }}
                disabled={creator.status !== "pending"}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-start",
                  index === currentCreatorIndex && "bg-blue-500/20 ring-1 ring-blue-500/50",
                  creator.status === "pending" && "hover:bg-zinc-700/50 cursor-pointer",
                  creator.status !== "pending" && "cursor-default"
                )}
              >
                {getCreatorStatusIcon(creator.status)}
                <span className={cn(
                  "truncate",
                  getCreatorStatusColor(creator.status)
                )}>
                  @{creator.username}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {/* Terminal output */}
        <div
          ref={terminalRef}
          className="h-[400px] overflow-y-auto bg-zinc-950 p-4 font-mono text-sm"
          style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
        >
          {logs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-zinc-600">
              <div className="text-center">
                <Terminal className="mx-auto mb-2 h-8 w-8" />
                <p>No logs yet. Click &quot;Run Now&quot; to start the agent.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-zinc-600">&gt;</span>
                  <span className="text-zinc-500 shrink-0">
                    {formatTime(log.timestamp)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 w-16 text-xs font-semibold",
                      getLevelColor(log.level)
                    )}
                  >
                    [{getLevelBadge(log.level)}]
                  </span>
                  <span className="text-zinc-300">{log.message}</span>
                  {log.details && (
                    <span className="text-zinc-500">
                      {typeof log.details === "string"
                        ? ` ${log.details}`
                        : ` ${JSON.stringify(log.details)}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer status bar */}
        <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900 px-4 py-2">
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            {nextRun && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Next run: {getNextRunDisplay()}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              <span>{logs.length} log entries</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-zinc-400 hover:text-white"
              onClick={() => setAutoScroll(!autoScroll)}
            >
              {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
