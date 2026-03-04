"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export interface TerminalLog {
  timestamp: string;
  level: "info" | "success" | "error" | "warning";
  message: string;
  details?: string | Record<string, unknown>;
}

export interface CreatorStatus {
  username: string;
  status: "pending" | "processing" | "added" | "failed" | "skipped";
}

interface SSEMessage {
  type: "log" | "status" | "connected" | "progress" | "creators_update";
  timestamp?: string;
  level?: "info" | "success" | "error" | "warning" | "ai";
  message?: string;
  details?: string | Record<string, unknown>;
  status?: "starting" | "completed" | "error" | "stopped" | "stopping";
  error?: string;
  result?: unknown;
  // Progress fields
  current?: number;
  total?: number;
  added?: number;
  failed?: number;
  skipped?: number;
  currentCreator?: string;
  isRetry?: boolean;
  // Creators list fields
  creatorsList?: CreatorStatus[];
  currentCreatorIndex?: number;
}

export interface AgentProgress {
  current: number;
  total: number;
  added: number;
  failed: number;
  skipped: number;
  currentCreator?: string;
  isRetry?: boolean;
}

interface UseAgentStreamOptions {
  apiUrl?: string;
  autoConnect?: boolean;
}

export function useAgentStream(
  agentId: string,
  options: UseAgentStreamOptions = {}
) {
  const { apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000", autoConnect = true } = options;

  const [logs, setLogs] = useState<TerminalLog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState<"idle" | "running" | "error" | "completed" | "stopping">("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AgentProgress | null>(null);
  const [creatorsList, setCreatorsList] = useState<CreatorStatus[]>([]);
  const [currentCreatorIndex, setCurrentCreatorIndex] = useState<number>(-1);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 5;

  const connect = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    console.log(`[SSE] Connecting to agent ${agentId}...`);

    const eventSource = new EventSource(`${apiUrl}/api/agents/${agentId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[SSE] Connected to agent ${agentId}`);
      setIsConnected(true);
      setError(null);
      retryCountRef.current = 0; // Reset retries on successful connection
    };

    eventSource.onmessage = (event) => {
      try {
        const data: SSEMessage = JSON.parse(event.data);

        if (data.type === "connected") {
          console.log(`[SSE] Received connection confirmation`);
          return;
        }

        if (data.type === "log" && data.level && data.message) {
          const log: TerminalLog = {
            timestamp: data.timestamp || new Date().toISOString(),
            level: data.level === "ai" ? "info" : data.level,
            message: data.message,
            details: data.details,
          };

          setLogs((prev) => [...prev, log]);
        }

        if (data.type === "progress") {
          setProgress({
            current: data.current || 0,
            total: data.total || 0,
            added: data.added || 0,
            failed: data.failed || 0,
            skipped: data.skipped || 0,
            currentCreator: data.currentCreator,
            isRetry: data.isRetry,
          });
        }

        if (data.type === "creators_update") {
          if (data.creatorsList) {
            setCreatorsList(data.creatorsList);
          }
          if (typeof data.currentCreatorIndex === "number") {
            setCurrentCreatorIndex(data.currentCreatorIndex);
          }
        }

        if (data.type === "status") {
          switch (data.status) {
            case "starting":
              setAgentStatus("running");
              setProgress(null); // Reset progress
              setCreatorsList([]); // Reset creators list
              setCurrentCreatorIndex(-1);
              break;
            case "completed":
              setAgentStatus("completed");
              break;
            case "error":
              setAgentStatus("error");
              if (data.error) {
                setError(data.error);
              }
              break;
            case "stopping":
              setAgentStatus("stopping");
              break;
            case "stopped":
              setAgentStatus("idle");
              break;
          }
        }
      } catch (err) {
        console.error("[SSE] Failed to parse message:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error(`[SSE] Connection error:`, err);
      setIsConnected(false);
      eventSource.close();

      if (retryCountRef.current >= MAX_RETRIES) {
        console.error(`[SSE] Max retries (${MAX_RETRIES}) reached. Giving up.`);
        setError("Connection lost. Please refresh the page to reconnect.");
        return;
      }

      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
      retryCountRef.current++;

      console.log(`[SSE] Reconnect attempt ${retryCountRef.current}/${MAX_RETRIES} in ${delay}ms`);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [agentId, apiUrl]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const addLog = useCallback((log: TerminalLog) => {
    setLogs((prev) => [...prev, log]);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  const resetProgress = useCallback(() => {
    setProgress(null);
  }, []);

  const clearCreatorsList = useCallback(() => {
    setCreatorsList([]);
    setCurrentCreatorIndex(-1);
  }, []);

  return {
    logs,
    isConnected,
    agentStatus,
    error,
    progress,
    creatorsList,
    currentCreatorIndex,
    connect,
    disconnect,
    clearLogs,
    addLog,
    resetProgress,
    clearCreatorsList,
  };
}

// API functions for agent control
export async function runAgentNow(
  agentId: string,
  data: {
    client: {
      id: string;
      name: string;
      imaiCampaignId: string;
    };
    imaiCredentials: {
      email: string;
      password: string;
    };
    creators: Array<{ username: string }>;
    openRouterSettings?: {
      apiKey: string;
      model: string;
    };
  },
  apiUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const response = await fetch(`${apiUrl}/api/agents/${agentId}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return response.json();
}

export async function stopAgent(
  agentId: string,
  apiUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
): Promise<{ success: boolean; wasStopped?: boolean; error?: string }> {
  const response = await fetch(`${apiUrl}/api/agents/${agentId}/stop`, {
    method: "POST",
  });

  return response.json();
}

export async function getAgentStatus(
  agentId: string,
  apiUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
): Promise<{
  agentId: string;
  isScheduled: boolean;
  isRunning: boolean;
  nextRun: string | null;
}> {
  const response = await fetch(`${apiUrl}/api/agents/${agentId}/status`);
  return response.json();
}

export async function testImaiLogin(
  email: string,
  password: string,
  apiUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${apiUrl}/api/agents/test-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  return response.json();
}

export async function skipCurrentCreator(
  agentId: string,
  apiUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${apiUrl}/api/agents/${agentId}/skip`, {
    method: "POST",
  });

  return response.json();
}

export async function forceRelogin(
  agentId: string,
  apiUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${apiUrl}/api/agents/${agentId}/relogin`, {
    method: "POST",
  });

  return response.json();
}

export async function switchToCreator(
  agentId: string,
  username: string,
  apiUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await fetch(`${apiUrl}/api/agents/${agentId}/switch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username }),
  });

  return response.json();
}

export async function getCreatorsList(
  agentId: string,
  apiUrl: string = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
): Promise<{
  success: boolean;
  creatorsList: Array<{ username: string; status: string }>;
  currentCreatorIndex: number;
  isRunning: boolean;
}> {
  const response = await fetch(`${apiUrl}/api/agents/${agentId}/creators`);
  return response.json();
}
