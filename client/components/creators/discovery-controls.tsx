"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Search, Loader2 } from "lucide-react";

interface DiscoveryControlsProps {
  selectedPlatform: "all" | "instagram" | "tiktok";
  onSelectedPlatformChange: (value: "all" | "instagram" | "tiktok") => void;
  isDiscovering: boolean;
  onDiscover: () => void;
  onDiscoverByMention?: () => void;
  hasMentionHandles?: boolean;
  onExportCSV: () => void;
  onExportJSON: () => void;
  creatorsCount: number;
  discoveryResult: { discovered: number; errors: string[] } | null;
  onDismissResult: () => void;
}

export function DiscoveryControls({
  selectedPlatform,
  onSelectedPlatformChange,
  isDiscovering,
  onDiscover,
  onDiscoverByMention,
  hasMentionHandles = false,
  onExportCSV,
  onExportJSON,
  creatorsCount,
  discoveryResult,
  onDismissResult,
}: DiscoveryControlsProps) {
  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedPlatform}
            onChange={(e) =>
              onSelectedPlatformChange(
                e.target.value as "all" | "instagram" | "tiktok"
              )
            }
            className="border rounded px-3 py-2 text-sm bg-background"
          >
            <option value="all">All Platforms</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
          </select>
          <Button
            onClick={onDiscover}
            disabled={isDiscovering}
            className="bg-green-600 hover:bg-green-700"
          >
            {isDiscovering ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Discovering...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Discover Creators
              </>
            )}
          </Button>
          {onDiscoverByMention && (
            <Button
              variant="outline"
              onClick={onDiscoverByMention}
              disabled={isDiscovering || !hasMentionHandles}
              title={
                !hasMentionHandles
                  ? "Configure a handle in Tracking Config first"
                  : "Search for creators who mentioned this brand"
              }
            >
              {isDiscovering ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Discover by Mention
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onExportCSV}
            disabled={creatorsCount === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={onExportJSON}
            disabled={creatorsCount === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Discovery Results */}
      {discoveryResult && (
        <Card
          className={
            discoveryResult.errors.length > 0 && discoveryResult.discovered === 0
              ? "border-red-500 bg-red-50 dark:bg-red-950/20"
              : "border-green-500 bg-green-50 dark:bg-green-950/20"
          }
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                {discoveryResult.discovered > 0 && (
                  <p className="text-green-700 dark:text-green-400 font-medium">
                    Found {discoveryResult.discovered} new creator
                    {discoveryResult.discovered !== 1 ? "s" : ""}!
                  </p>
                )}
                {discoveryResult.errors.length > 0 && (
                  <div className="text-sm text-red-700 dark:text-red-400 mt-1">
                    {discoveryResult.errors.map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </div>
                )}
                {discoveryResult.discovered === 0 &&
                  discoveryResult.errors.length === 0 && (
                    <p className="text-muted-foreground">
                      No new creators found. All creators from hashtags are
                      already tracked.
                    </p>
                  )}
              </div>
              <Button variant="ghost" size="sm" onClick={onDismissResult}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
