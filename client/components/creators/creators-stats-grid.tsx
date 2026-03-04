"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Instagram } from "lucide-react";
import type { TrackedCreator } from "@/db/schema";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

interface CreatorsStatsGridProps {
  filteredCreators: TrackedCreator[];
  platformFilter: "all" | "instagram" | "tiktok";
  igCount: number;
  ttCount: number;
}

export function CreatorsStatsGrid({
  filteredCreators,
  platformFilter,
  igCount,
  ttCount,
}: CreatorsStatsGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold">{filteredCreators.length}</p>
            <p className="text-sm text-muted-foreground">
              {platformFilter === "all"
                ? "Total Creators"
                : `${platformFilter === "instagram" ? "Instagram" : "TikTok"} Creators`}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Instagram className="h-4 w-4 text-pink-500" />
              <p className="text-3xl font-bold">{igCount}</p>
            </div>
            <p className="text-sm text-muted-foreground">Instagram</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <TikTokIcon className="h-4 w-4" />
              <p className="text-3xl font-bold">{ttCount}</p>
            </div>
            <p className="text-sm text-muted-foreground">TikTok</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold">
              {filteredCreators.filter((c) => c.addedToImai).length}
            </p>
            <p className="text-sm text-muted-foreground">Added to IMAI</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold">
              {filteredCreators.filter((c) => c.sourceType === "hashtag").length}
            </p>
            <p className="text-sm text-muted-foreground">From Hashtags</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-3xl font-bold">
              {filteredCreators.filter((c) => c.sourceType === "location").length}
            </p>
            <p className="text-sm text-muted-foreground">From Locations</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
