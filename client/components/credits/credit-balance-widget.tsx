"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CreditBalanceWidgetProps {
  warningThreshold?: number;
  compact?: boolean;
}

export function CreditBalanceWidget({
  warningThreshold = 10,
  compact = false,
}: CreditBalanceWidgetProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [balance, setBalance] = useState<number | null>(null);
  const [dailySpend, setDailySpend] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [creditsRes, historyRes] = await Promise.all([
        fetch(`${apiUrl}/api/imai/credits`),
        fetch(`${apiUrl}/api/imai/token-history?limit=1`),
      ]);

      if (creditsRes.ok) {
        const creditsData = await creditsRes.json();
        setBalance(creditsData.data?.credits ?? creditsData.credits ?? null);
      } else {
        setError("Failed to fetch balance");
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setDailySpend(historyData.data?.dailySpend ?? 0);
      }
    } catch {
      setError("Unable to reach API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getBadgeVariant = (): "success" | "warning" | "destructive" => {
    if (balance === null) return "warning";
    if (balance > 50) return "success";
    if (balance > warningThreshold) return "warning";
    return "destructive";
  };

  const isLow = balance !== null && balance <= warningThreshold;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-muted-foreground" />
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : error ? (
          <span className="text-xs text-muted-foreground">{error}</span>
        ) : (
          <Badge variant={getBadgeVariant()}>
            {balance?.toFixed(2) ?? "?"} tokens
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Token Balance</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Coins className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {balance?.toFixed(2) ?? "?"}
              </span>
              <Badge variant={getBadgeVariant()}>tokens</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {dailySpend > 0
                ? `${dailySpend.toFixed(2)} tokens used today`
                : "No tokens used today"}
            </p>
            {isLow && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" />
                Balance below warning threshold ({warningThreshold})
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
