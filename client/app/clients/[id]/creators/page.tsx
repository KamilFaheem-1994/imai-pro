"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  getClient,
  getCreators,
  exportCreatorsCSV,
  discoverCreators,
  updateCreatorReportId,
  getShowCredits,
} from "@/db/queries";
import { Client, TrackedCreator } from "@/db/schema";
import {
  CreditEstimationDialog,
  CostLineItem,
  TOKEN_COSTS,
} from "@/components/credits/credit-estimation-dialog";
import { CreatorReportDialog } from "@/components/creators/creator-report-dialog";
import { CreatorsStatsGrid } from "@/components/creators/creators-stats-grid";
import { DiscoveryControls } from "@/components/creators/discovery-controls";
import { CreatorsTable } from "@/components/creators/creators-table";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ClientCreatorsPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [creators, setCreators] = useState<TrackedCreator[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<{
    discovered: number;
    errors: string[];
  } | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<
    "all" | "instagram" | "tiktok"
  >("all");
  const [platformFilter, setPlatformFilter] = useState<
    "all" | "instagram" | "tiktok"
  >("all");
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [creditLineItems, setCreditLineItems] = useState<CostLineItem[]>([]);
  const [showCreditsEnabled, setShowCreditsEnabled] = useState(true);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportCreator, setReportCreator] = useState<TrackedCreator | null>(
    null
  );
  const clientId = params.id as string;

  const filteredCreators =
    platformFilter === "all"
      ? creators
      : creators.filter((c) => c.platform === platformFilter);

  const igCount = creators.filter((c) => c.platform === "instagram").length;
  const ttCount = creators.filter((c) => c.platform === "tiktok").length;

  const hasMentionHandles = !!(
    client?.tracking?.instagram?.handle || client?.tracking?.tiktok?.handle
  );

  const loadData = async () => {
    const clientData = await getClient(clientId);
    if (clientData) {
      setClient(clientData);
      const [creatorsData, creditsFlag] = await Promise.all([
        getCreators(clientId),
        getShowCredits(),
      ]);
      setCreators(creatorsData);
      setShowCreditsEnabled(creditsFlag);
    } else {
      router.push("/clients");
    }
  };

  useEffect(() => {
    startTransition(() => {
      loadData();
    });
  }, [clientId, router]);

  // --- Discovery handlers ---

  const getDiscoveryHashtags = (): string[] => {
    if (!client) return [];
    const hashtags: string[] = [];
    if (selectedPlatform === "all" || selectedPlatform === "instagram") {
      if (client.tracking?.instagram?.hashtags)
        hashtags.push(...client.tracking.instagram.hashtags);
      if (client.tracking?.facebook?.hashtags)
        hashtags.push(...client.tracking.facebook.hashtags);
    }
    if (selectedPlatform === "all" || selectedPlatform === "tiktok") {
      if (client.tracking?.tiktok?.hashtags)
        hashtags.push(...client.tracking.tiktok.hashtags);
    }
    return hashtags;
  };

  const handleDiscoverCreators = async () => {
    if (!client) return;
    const hashtags = getDiscoveryHashtags();

    if (hashtags.length === 0) {
      setDiscoveryResult({
        discovered: 0,
        errors: ["No hashtags configured. Go to Edit to add hashtags."],
      });
      return;
    }

    if (showCreditsEnabled) {
      const isIg =
        selectedPlatform === "all" || selectedPlatform === "instagram";
      const isTt =
        selectedPlatform === "all" || selectedPlatform === "tiktok";
      const igHashtagCount = isIg
        ? (client.tracking?.instagram?.hashtags?.length ?? 0) +
          (client.tracking?.facebook?.hashtags?.length ?? 0)
        : 0;
      const ttHashtagCount = isTt
        ? (client.tracking?.tiktok?.hashtags?.length ?? 0)
        : 0;

      const items: CostLineItem[] = [];

      if (igHashtagCount > 0) {
        items.push({
          label: "IG hashtag feed lookup",
          operation: "raw_ig_hashtag_feed",
          count: igHashtagCount,
          unitCost: TOKEN_COSTS.raw_ig_hashtag_feed,
          totalCost: TOKEN_COSTS.raw_ig_hashtag_feed * igHashtagCount,
        });
        const estimatedCreators = igHashtagCount * 30;
        items.push({
          label: `IG user info (~${estimatedCreators} creators)`,
          operation: "raw_ig_user_info",
          count: estimatedCreators,
          unitCost: TOKEN_COSTS.raw_ig_user_info,
          totalCost: TOKEN_COSTS.raw_ig_user_info * estimatedCreators,
        });
      }

      if (ttHashtagCount > 0) {
        items.push({
          label: "TT challenge feed lookup",
          operation: "raw_tt_challenge_feed",
          count: ttHashtagCount,
          unitCost: TOKEN_COSTS.raw_tt_challenge_feed,
          totalCost: TOKEN_COSTS.raw_tt_challenge_feed * ttHashtagCount,
        });
        const estimatedCreators = ttHashtagCount * 30;
        items.push({
          label: `TT user info (~${estimatedCreators} creators)`,
          operation: "raw_tt_user_info",
          count: estimatedCreators,
          unitCost: TOKEN_COSTS.raw_tt_user_info,
          totalCost: TOKEN_COSTS.raw_tt_user_info * estimatedCreators,
        });
      }

      const locationCount =
        (isIg
          ? (client.tracking?.instagram?.locations?.filter(
              (l: { id: string }) => l && typeof l === "object" && l.id
            )?.length ?? 0)
          : 0) +
        (isTt
          ? (client.tracking?.tiktok?.locations?.filter(
              (l: { id: string }) => l && typeof l === "object" && l.id
            )?.length ?? 0)
          : 0);
      if (locationCount > 0) {
        items.push({
          label: `Location scrape (${locationCount} locations, via Apify)`,
          operation: "apify_location_scrape",
          count: locationCount,
          unitCost: 0,
          totalCost: 0,
        });
      }

      setCreditLineItems(items);
      setShowCreditDialog(true);
      return;
    }

    await runDiscovery(hashtags);
  };

  const runDiscovery = async (hashtags: string[]) => {
    if (!client) return;
    setIsDiscovering(true);
    setDiscoveryResult(null);

    try {
      const result = await discoverCreators(
        client.id,
        hashtags,
        selectedPlatform
      );
      setDiscoveryResult(result);
      startTransition(() => {
        loadData();
      });
    } catch (error) {
      setDiscoveryResult({
        discovered: 0,
        errors: [
          `Discovery failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        ],
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleDiscoverByMention = async () => {
    if (!client) return;
    const handles: { handle: string; platform: string }[] = [];
    if (client.tracking?.instagram?.handle) {
      handles.push({
        handle: client.tracking.instagram.handle,
        platform: "instagram",
      });
    }
    if (client.tracking?.tiktok?.handle) {
      handles.push({
        handle: client.tracking.tiktok.handle,
        platform: "tiktok",
      });
    }
    if (handles.length === 0) return;

    setIsDiscovering(true);
    setDiscoveryResult(null);

    let totalFound = 0;
    const errors: string[] = [];

    for (const { handle, platform } of handles) {
      try {
        const res = await fetch(`${apiUrl}/api/imai/discover-by-mention`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, platform, clientId }),
        });
        const data = await res.json();
        if (data.success) {
          totalFound += data.data?.tracked?.inserted || 0;
        } else {
          errors.push(
            data.error || `Mention search failed for @${handle}`
          );
        }
      } catch {
        errors.push(`Error searching mentions for @${handle}`);
      }
    }

    setDiscoveryResult({ discovered: totalFound, errors });
    setIsDiscovering(false);
    startTransition(() => {
      loadData();
    });
  };

  const handleExportCSV = async () => {
    const csv = await exportCreatorsCSV(clientId);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${client?.name || "creators"}-creators.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(creators, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${client?.name || "creators"}-creators.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Loading state ---
  if (!client) {
    return (
      <DashboardLayout title="Loading..." description="Tracked creators">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Skeleton className="h-10 w-[160px]" />
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-10 w-[140px]" />
              <Skeleton className="h-10 w-[160px]" />
              <Skeleton className="h-10 w-[120px]" />
              <Skeleton className="h-10 w-[120px]" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={`${client.name} - Creators`}
      description="Tracked creators for this client"
    >
      <div className="space-y-6">
        {/* Breadcrumbs */}
        <Breadcrumbs
          items={[
            { label: "Clients", href: "/clients" },
            { label: client.name, href: `/clients/${clientId}` },
            { label: "Creators" },
          ]}
        />

        {/* Discovery Controls */}
        <DiscoveryControls
          selectedPlatform={selectedPlatform}
          onSelectedPlatformChange={setSelectedPlatform}
          isDiscovering={isDiscovering}
          onDiscover={handleDiscoverCreators}
          onDiscoverByMention={handleDiscoverByMention}
          hasMentionHandles={hasMentionHandles}
          onExportCSV={handleExportCSV}
          onExportJSON={handleExportJSON}
          creatorsCount={creators.length}
          discoveryResult={discoveryResult}
          onDismissResult={() => setDiscoveryResult(null)}
        />

        {/* Stats Grid */}
        <CreatorsStatsGrid
          filteredCreators={filteredCreators}
          platformFilter={platformFilter}
          igCount={igCount}
          ttCount={ttCount}
        />

        {/* Creators Table */}
        <CreatorsTable
          creators={filteredCreators}
          allCreatorsCount={creators.length}
          platformFilter={platformFilter}
          onPlatformFilterChange={setPlatformFilter}
          onOpenReport={(creator) => {
            setReportCreator(creator);
            setReportDialogOpen(true);
          }}
          isDiscovering={isDiscovering}
          onDiscover={handleDiscoverCreators}
        />

        {/* Credit Estimation Dialog */}
        <CreditEstimationDialog
          open={showCreditDialog}
          onOpenChange={setShowCreditDialog}
          onProceed={() => runDiscovery(getDiscoveryHashtags())}
          title={`Search ${selectedPlatform === "all" ? "all platforms" : selectedPlatform} for creators`}
          lineItems={creditLineItems}
          isLoading={isDiscovering}
        />

        {/* Creator Report Dialog */}
        {reportCreator && (
          <CreatorReportDialog
            open={reportDialogOpen}
            onOpenChange={setReportDialogOpen}
            creator={{
              username: reportCreator.username,
              platform: reportCreator.platform,
              imaiReportId: reportCreator.imaiReportId,
            }}
            onReportGenerated={async (newReportId) => {
              await updateCreatorReportId(reportCreator.id, newReportId);
              setCreators((prev) =>
                prev.map((c) =>
                  c.id === reportCreator.id
                    ? { ...c, imaiReportId: newReportId }
                    : c
                )
              );
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
