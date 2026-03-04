"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Coins, AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

// Official IMAI token costs from API docs
export const TOKEN_COSTS: Record<string, number> = {
  raw_ig_hashtag_feed: 0.02,
  raw_ig_search_users: 0.02,
  raw_ig_user_info: 0.02,
  raw_tt_search_users: 0.02,
  raw_tt_user_info: 0.02,
  raw_tt_user_feed: 0.02,
  raw_tt_challenge_feed: 0.02,
  raw_tt_challenge_info: 0.02,
  reports_new: 1.0,
  reports_overlap: 1.0,
  exports_contacts: 0.04,
  exports_notable_users_1k: 0.04,
  exports_notable_users_5k: 0.06,
  match_emails: 0.04,
  market_scan_posts_search: 0.02,
} as const;

export function estimateCost(operation: string, count: number = 1): number {
  return (TOKEN_COSTS[operation] || 0) * count;
}

export interface CostLineItem {
  label: string;
  operation: string;
  count: number;
  unitCost: number;
  totalCost: number;
}

interface CreditEstimationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProceed: () => void;
  title: string;
  lineItems: CostLineItem[];
  isLoading?: boolean;
}

export function CreditEstimationDialog({
  open,
  onOpenChange,
  onProceed,
  title,
  lineItems,
  isLoading = false,
}: CreditEstimationDialogProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const estimatedTotal = lineItems.reduce((sum, item) => sum + item.totalCost, 0);
  const remainingAfter = balance !== null ? balance - estimatedTotal : null;
  const insufficientBalance = remainingAfter !== null && remainingAfter < 0;

  useEffect(() => {
    if (open) {
      setLoadingBalance(true);
      fetch(`${apiUrl}/api/imai/credits`)
        .then((r) => r.json())
        .then((data) => {
          setBalance(data.data?.credits ?? data.credits ?? null);
        })
        .catch(() => setBalance(null))
        .finally(() => setLoadingBalance(false));
    }
  }, [open, apiUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Token Cost Estimate
          </DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Line items */}
          <div className="space-y-2">
            {lineItems.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.label}
                  {item.count > 1 && (
                    <span className="ml-1 text-xs">
                      ({item.count} x {item.unitCost})
                    </span>
                  )}
                </span>
                <span className="font-mono tabular-nums">
                  {item.totalCost.toFixed(2)} tokens
                </span>
              </div>
            ))}
          </div>

          <Separator />

          {/* Estimated total */}
          <div className="flex items-center justify-between font-medium">
            <span>Estimated Total</span>
            <span className="font-mono tabular-nums">
              {estimatedTotal.toFixed(2)} tokens
            </span>
          </div>

          <Separator />

          {/* Balance info */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current Balance</span>
              {loadingBalance ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : balance !== null ? (
                <Badge variant={balance > 10 ? "success" : "warning"}>
                  {balance.toFixed(2)} tokens
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">
                  Unable to fetch
                </span>
              )}
            </div>
            {remainingAfter !== null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Remaining After</span>
                <span
                  className={`font-mono tabular-nums ${
                    insufficientBalance ? "text-red-600" : ""
                  }`}
                >
                  ~{remainingAfter.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Warning */}
          {insufficientBalance && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Insufficient token balance for this operation.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onProceed();
            }}
            disabled={isLoading || insufficientBalance}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Proceed"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
