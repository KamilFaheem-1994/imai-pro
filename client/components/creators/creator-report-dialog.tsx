"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  Coins,
  FileText,
  Globe,
  Hash,
  Instagram,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
  Heart,
  MessageCircle,
  TrendingUp,
  AtSign,
  UserCheck,
} from "lucide-react";

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface CreatorReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creator: {
    username: string;
    platform: string;
    imaiReportId?: string | null;
  };
  /** Optional callback fired when a new report is generated, passes the new report ID */
  onReportGenerated?: (reportId: string) => void;
}

/** Represents a single age/gender demographic bucket from the IMAI report */
interface DemographicBucket {
  code?: string;
  name?: string;
  weight?: number;
}

/** Country or city entry */
interface GeoBucket {
  id?: number;
  name?: string;
  weight?: number;
  code?: string;
}

/** A similar user entry */
interface SimilarUser {
  user_id?: string;
  username?: string;
  fullname?: string;
  picture?: string;
  followers?: number;
  is_verified?: boolean;
}

/** Partial shape of the IMAI audience report (we pick what we display) */
interface ReportData {
  user_profile?: {
    user_id?: string;
    username?: string;
    fullname?: string;
    picture?: string;
    url?: string;
    followers?: number;
    following?: number;
    engagements?: number;
    engagement_rate?: number;
    avg_likes?: number;
    avg_comments?: number;
    avg_views?: number;
    is_verified?: boolean;
    is_business?: boolean;
    gender?: string;
    biography?: string;
  };
  audience_credibility?: number;
  audience_data?: {
    audience_ages?: DemographicBucket[];
    audience_genders?: DemographicBucket[];
    audience_geo?: {
      countries?: GeoBucket[];
      cities?: GeoBucket[];
    };
    audience_languages?: DemographicBucket[];
    audience_ethnicities?: DemographicBucket[];
    audience_brand_affinity?: DemographicBucket[];
    audience_interests?: DemographicBucket[];
  };
  audience_likers?: {
    data?: {
      audience_ages?: DemographicBucket[];
      audience_genders?: DemographicBucket[];
      audience_geo?: {
        countries?: GeoBucket[];
        cities?: GeoBucket[];
      };
    };
  };
  top_hashtags?: Array<{ tag?: string; weight?: number }>;
  top_mentions?: Array<{ tag?: string; weight?: number }>;
  contacts?: {
    emails?: Array<{ value?: string }>;
    phones?: Array<{ value?: string }>;
  };
  similar_users?: SimilarUser[];
  hashtags?: Array<{ tag?: string; weight?: number }>;
  mentions?: Array<{ tag?: string; weight?: number }>;
  // Fallback structures for varying IMAI response shapes
  [key: string]: unknown;
}

type DialogState =
  | "idle"
  | "checking"
  | "confirm"
  | "generating"
  | "polling"
  | "loading"
  | "ready"
  | "error";

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes

// ---------------------------------------------------------------------------
//  TikTok SVG icon (matches the creators page pattern)
// ---------------------------------------------------------------------------

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === "tiktok") return <TikTokIcon className={className} />;
  return <Instagram className={className} />;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function pct(value?: number): string {
  if (value === undefined || value === null) return "0%";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(n?: number | null): string {
  if (n === undefined || n === null) return "--";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function credibilityColor(score?: number): string {
  if (!score) return "text-muted-foreground";
  if (score >= 0.8) return "text-green-600";
  if (score >= 0.5) return "text-yellow-600";
  return "text-red-600";
}

function credibilityBadgeVariant(score?: number): "success" | "warning" | "destructive" | "secondary" {
  if (!score) return "secondary";
  if (score >= 0.8) return "success";
  if (score >= 0.5) return "warning";
  return "destructive";
}

// ---------------------------------------------------------------------------
//  Sub-components: Loading skeleton
// ---------------------------------------------------------------------------

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="ms-auto">
          <Skeleton className="h-12 w-12 rounded-full" />
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-lg" />
        ))}
      </div>

      {/* Content skeleton */}
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Skeleton className="h-[200px] rounded-lg" />
        <Skeleton className="h-[200px] rounded-lg" />
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Skeleton className="h-[180px] rounded-lg" />
        <Skeleton className="h-[180px] rounded-lg" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Sub-component: Horizontal bar row (used for demographics)
// ---------------------------------------------------------------------------

function BarRow({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const width = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground truncate">{label}</span>
        <span className="font-mono tabular-nums text-xs">{pct(value)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Sub-component: Gender split bar
// ---------------------------------------------------------------------------

function GenderBar({ genders }: { genders: DemographicBucket[] }) {
  const male = genders.find((g) => g.code === "MALE")?.weight ?? 0;
  const female = genders.find((g) => g.code === "FEMALE")?.weight ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-blue-600 font-medium">Male {pct(male)}</span>
        <span className="text-pink-600 font-medium">Female {pct(female)}</span>
      </div>
      <div className="flex h-3 w-full rounded-full overflow-hidden">
        <div
          className="bg-blue-500 transition-all duration-500"
          style={{ width: `${male * 100}%` }}
        />
        <div
          className="bg-pink-500 transition-all duration-500"
          style={{ width: `${female * 100}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Main component
// ---------------------------------------------------------------------------

export function CreatorReportDialog({
  open,
  onOpenChange,
  creator,
  onReportGenerated,
}: CreatorReportDialogProps) {
  const [state, setState] = useState<DialogState>("idle");
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportId, setReportId] = useState<string | null>(creator.imaiReportId ?? null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);

  // -----------------------------------------------------------------------
  //  Cleanup polling on unmount / close
  // -----------------------------------------------------------------------
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // -----------------------------------------------------------------------
  //  Fetch an existing report
  // -----------------------------------------------------------------------
  const fetchReport = useCallback(
    async (id: string) => {
      setState("loading");
      setError(null);

      try {
        const res = await fetch(`${API_URL}/api/imai/report/${id}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || `Failed to fetch report (${res.status})`);
        }

        const data = json.data ?? json;
        setReport(data);
        setReportId(id);
        setState("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch report");
        setState("error");
      }
    },
    []
  );

  // -----------------------------------------------------------------------
  //  Poll for report completion after generation
  // -----------------------------------------------------------------------
  const pollForReport = useCallback(
    (id: string) => {
      pollCountRef.current += 1;

      if (pollCountRef.current > MAX_POLL_ATTEMPTS) {
        setError("Report generation timed out. Please try again later.");
        setState("error");
        stopPolling();
        return;
      }

      pollRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`${API_URL}/api/imai/report/${id}`);
          const json = await res.json();

          if (res.ok && json.data) {
            const data = json.data;
            // Check if the report is actually ready (has audience data or user profile)
            if (data.user_profile || data.audience_data || data.audience_likers) {
              setReport(data);
              setReportId(id);
              setState("ready");
              stopPolling();
              onReportGenerated?.(id);
              return;
            }
          }

          // If we get an error that says "retry_later", keep polling
          if (!res.ok && json.code === "retry_later") {
            pollForReport(id);
            return;
          }

          // If 404 or other error that is not "retry_later", keep polling a few more times
          if (!res.ok) {
            pollForReport(id);
            return;
          }

          // Response OK but report might not be complete yet
          pollForReport(id);
        } catch {
          // Network error — retry
          pollForReport(id);
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling, onReportGenerated]
  );

  // -----------------------------------------------------------------------
  //  On open: fetch existing report or show idle
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!open) {
      // Reset state when dialog closes
      stopPolling();
      return;
    }

    const existingId = creator.imaiReportId;
    if (existingId) {
      setReportId(existingId);
      fetchReport(existingId);
    } else {
      setState("idle");
      setReport(null);
      setReportId(null);
      setError(null);
    }
  }, [open, creator.imaiReportId, fetchReport, stopPolling]);

  // -----------------------------------------------------------------------
  //  Step 1: Dry-run check
  // -----------------------------------------------------------------------
  const handleCheckCost = async () => {
    setState("checking");
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/imai/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: creator.platform,
          username: creator.username,
          dryRun: true,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `Dry-run check failed (${res.status})`);
      }

      setState("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check report availability");
      setState("error");
    }
  };

  // -----------------------------------------------------------------------
  //  Step 2: Generate report (real call)
  // -----------------------------------------------------------------------
  const handleGenerate = async () => {
    setState("generating");
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/imai/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: creator.platform,
          username: creator.username,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `Report generation failed (${res.status})`);
      }

      const data = json.data ?? json;

      // The create response may return the report ID directly
      const newId = data.report_id || data.reportId || data._id || data.id;

      if (newId) {
        setReportId(newId);
        setState("polling");
        pollCountRef.current = 0;
        pollForReport(newId);
      } else if (data.user_profile || data.audience_data || data.audience_likers) {
        // Report returned inline (already generated)
        setReport(data);
        setState("ready");
        onReportGenerated?.(newId || "");
      } else {
        throw new Error("Unexpected response: no report ID or report data returned");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
      setState("error");
    }
  };

  // -----------------------------------------------------------------------
  //  Resolve audience data from multiple possible response shapes
  // -----------------------------------------------------------------------
  const audienceData =
    report?.audience_data ??
    report?.audience_likers?.data ??
    null;

  const ages = audienceData?.audience_ages ?? [];
  const genders = audienceData?.audience_genders ?? [];
  const countries = audienceData?.audience_geo?.countries ?? [];
  const cities = audienceData?.audience_geo?.cities ?? [];

  const topHashtags =
    report?.top_hashtags ?? report?.hashtags ?? [];
  const topMentions =
    report?.top_mentions ?? report?.mentions ?? [];

  const emails = report?.contacts?.emails ?? [];
  const phones = report?.contacts?.phones ?? [];
  const similarUsers = report?.similar_users ?? [];

  const profile = report?.user_profile;
  const credibility = report?.audience_credibility;

  // -----------------------------------------------------------------------
  //  Render
  // -----------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Audience Report
          </DialogTitle>
          <DialogDescription>
            <span className="flex items-center gap-1.5">
              <PlatformIcon platform={creator.platform} className="h-3.5 w-3.5" />
              @{creator.username}
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="py-4 space-y-6">
            {/* --------------------------------------------------------- */}
            {/*  IDLE — No report, show generate button                   */}
            {/* --------------------------------------------------------- */}
            {state === "idle" && (
              <div className="py-12 text-center space-y-4">
                <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                <div>
                  <h3 className="text-lg font-semibold mb-1">No report available</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Generate an audience report to view demographics, credibility, and engagement data for @{creator.username}.
                  </p>
                </div>
                <Button onClick={handleCheckCost} size="lg">
                  <FileText className="mr-2 h-4 w-4" />
                  Generate Report
                </Button>
              </div>
            )}

            {/* --------------------------------------------------------- */}
            {/*  CHECKING — Dry-run in progress                           */}
            {/* --------------------------------------------------------- */}
            {state === "checking" && (
              <div className="py-12 text-center space-y-4">
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Checking report availability...</p>
              </div>
            )}

            {/* --------------------------------------------------------- */}
            {/*  CONFIRM — Show cost confirmation                          */}
            {/* --------------------------------------------------------- */}
            {state === "confirm" && (
              <div className="py-8 text-center space-y-6">
                <Coins className="mx-auto h-12 w-12 text-yellow-500" />
                <div>
                  <h3 className="text-lg font-semibold mb-1">Confirm Report Generation</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Generating an audience report for @{creator.username} will cost:
                  </p>
                </div>

                <Card className="mx-auto max-w-xs">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Audience report</span>
                      <Badge variant="warning" className="font-mono tabular-nums">1 token</Badge>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" onClick={() => setState("idle")}>
                    Cancel
                  </Button>
                  <Button onClick={handleGenerate}>
                    <Coins className="mr-2 h-4 w-4" />
                    Confirm (1 token)
                  </Button>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------- */}
            {/*  GENERATING / POLLING — Report is being created            */}
            {/* --------------------------------------------------------- */}
            {(state === "generating" || state === "polling") && (
              <div className="py-12 text-center space-y-4">
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
                <div>
                  <h3 className="text-lg font-semibold mb-1">
                    {state === "generating" ? "Generating report..." : "Processing audience data..."}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {state === "generating"
                      ? "Submitting report request to IMAI..."
                      : "This typically takes 15-60 seconds. Please wait."}
                  </p>
                </div>
                {state === "polling" && (
                  <Progress
                    value={Math.min((pollCountRef.current / MAX_POLL_ATTEMPTS) * 100, 95)}
                    className="mx-auto max-w-xs"
                  />
                )}
              </div>
            )}

            {/* --------------------------------------------------------- */}
            {/*  LOADING — Fetching existing report                        */}
            {/* --------------------------------------------------------- */}
            {state === "loading" && <ReportSkeleton />}

            {/* --------------------------------------------------------- */}
            {/*  ERROR state                                               */}
            {/* --------------------------------------------------------- */}
            {state === "error" && (
              <div className="py-12 text-center space-y-4">
                <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
                <div>
                  <h3 className="text-lg font-semibold mb-1">Something went wrong</h3>
                  <p className="text-sm text-destructive">{error}</p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      if (reportId) {
                        fetchReport(reportId);
                      } else {
                        handleCheckCost();
                      }
                    }}
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------- */}
            {/*  READY — Display the full report                           */}
            {/* --------------------------------------------------------- */}
            {state === "ready" && report && (
              <>
                {/* ----- Profile header ----- */}
                <div className="flex items-start gap-4">
                  <div className="relative">
                    {profile?.picture ? (
                      <img
                        src={profile.picture}
                        alt={`${profile.username || creator.username} avatar`}
                        className="h-16 w-16 rounded-full object-cover border-2 border-border"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-bold">
                        {creator.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {profile?.is_verified && (
                      <ShieldCheck className="absolute -bottom-0.5 -end-0.5 h-5 w-5 text-blue-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold truncate">
                      @{profile?.username || creator.username}
                    </h3>
                    {profile?.fullname && (
                      <p className="text-sm text-muted-foreground truncate">{profile.fullname}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="capitalize gap-1">
                        <PlatformIcon platform={creator.platform} className="h-3 w-3" />
                        {creator.platform}
                      </Badge>
                      {profile?.is_business && (
                        <Badge variant="secondary">Business</Badge>
                      )}
                    </div>
                  </div>

                  {/* Credibility score badge */}
                  {credibility !== undefined && credibility !== null && (
                    <div className="text-center shrink-0">
                      <div
                        className={`flex h-14 w-14 items-center justify-center rounded-full border-4 ${
                          credibility >= 0.8
                            ? "border-green-500"
                            : credibility >= 0.5
                              ? "border-yellow-500"
                              : "border-red-500"
                        }`}
                      >
                        <span className={`text-lg font-bold ${credibilityColor(credibility)}`}>
                          {Math.round(credibility * 100)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Credibility</p>
                    </div>
                  )}
                </div>

                {/* ----- Quick stats ----- */}
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  <Card>
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-lg font-bold leading-tight">{formatNumber(profile?.followers)}</p>
                          <p className="text-xs text-muted-foreground">Followers</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center gap-2">
                        <Heart className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-lg font-bold leading-tight">{formatNumber(profile?.avg_likes)}</p>
                          <p className="text-xs text-muted-foreground">Avg Likes</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-lg font-bold leading-tight">{formatNumber(profile?.avg_comments)}</p>
                          <p className="text-xs text-muted-foreground">Avg Comments</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-lg font-bold leading-tight">
                            {profile?.engagement_rate !== undefined && profile.engagement_rate !== null
                              ? `${profile.engagement_rate.toFixed(2)}%`
                              : "--"}
                          </p>
                          <p className="text-xs text-muted-foreground">Eng. Rate</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Separator />

                {/* ----- Tabs: Demographics / Content / Contact ----- */}
                <Tabs defaultValue="demographics" className="w-full">
                  <TabsList className="w-full grid grid-cols-3">
                    <TabsTrigger value="demographics">Demographics</TabsTrigger>
                    <TabsTrigger value="content">Content</TabsTrigger>
                    <TabsTrigger value="contact">Contact</TabsTrigger>
                  </TabsList>

                  {/* ---------- Demographics tab ---------- */}
                  <TabsContent value="demographics" className="space-y-4 mt-4">
                    {/* Credibility score card */}
                    {credibility !== undefined && credibility !== null && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4" />
                            Audience Credibility
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-3">
                            <Progress value={credibility * 100} className="flex-1" />
                            <Badge variant={credibilityBadgeVariant(credibility)}>
                              {Math.round(credibility * 100)}%
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {credibility >= 0.8
                              ? "High credibility -- most followers appear to be real, active accounts."
                              : credibility >= 0.5
                                ? "Moderate credibility -- some followers may be inactive or suspicious."
                                : "Low credibility -- a significant portion of followers may be bots or inactive."}
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                      {/* Gender split */}
                      {genders.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Gender Split
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <GenderBar genders={genders} />
                          </CardContent>
                        </Card>
                      )}

                      {/* Age ranges */}
                      {ages.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Age Distribution
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {ages.slice(0, 8).map((age, i) => (
                              <BarRow
                                key={i}
                                label={age.code || age.name || `Group ${i + 1}`}
                                value={age.weight ?? 0}
                              />
                            ))}
                          </CardContent>
                        </Card>
                      )}

                      {/* Top countries */}
                      {countries.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              <Globe className="h-4 w-4" />
                              Top Countries
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {countries.slice(0, 8).map((country, i) => (
                              <BarRow
                                key={i}
                                label={country.name || country.code || `Country ${i + 1}`}
                                value={country.weight ?? 0}
                              />
                            ))}
                          </CardContent>
                        </Card>
                      )}

                      {/* Top cities */}
                      {cities.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              Top Cities
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {cities.slice(0, 8).map((city, i) => (
                              <BarRow
                                key={i}
                                label={city.name || `City ${i + 1}`}
                                value={city.weight ?? 0}
                              />
                            ))}
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {/* No demographics available */}
                    {genders.length === 0 && ages.length === 0 && countries.length === 0 && cities.length === 0 && (
                      <div className="py-8 text-center">
                        <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No audience demographic data available for this creator.</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* ---------- Content tab ---------- */}
                  <TabsContent value="content" className="space-y-4 mt-4">
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                      {/* Top hashtags */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Hash className="h-4 w-4" />
                            Top Hashtags
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {topHashtags.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {topHashtags.slice(0, 15).map((h, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  #{h.tag}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No hashtag data available.</p>
                          )}
                        </CardContent>
                      </Card>

                      {/* Top mentions */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <AtSign className="h-4 w-4" />
                            Top Mentions
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {topMentions.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {topMentions.slice(0, 15).map((m, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  @{m.tag}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No mention data available.</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Engagement stats detail */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Engagement Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-x-8 gap-y-2 grid-cols-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Avg Likes</span>
                            <span className="font-mono tabular-nums">{formatNumber(profile?.avg_likes)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Avg Comments</span>
                            <span className="font-mono tabular-nums">{formatNumber(profile?.avg_comments)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Engagement Rate</span>
                            <span className="font-mono tabular-nums">
                              {profile?.engagement_rate !== undefined && profile.engagement_rate !== null
                                ? `${profile.engagement_rate.toFixed(2)}%`
                                : "--"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Avg Views</span>
                            <span className="font-mono tabular-nums">{formatNumber(profile?.avg_views)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Total Engagements</span>
                            <span className="font-mono tabular-nums">{formatNumber(profile?.engagements)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Following</span>
                            <span className="font-mono tabular-nums">{formatNumber(profile?.following)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ---------- Contact tab ---------- */}
                  <TabsContent value="contact" className="space-y-4 mt-4">
                    {/* Contact info */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Contact Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {emails.length > 0 || phones.length > 0 ? (
                          <div className="space-y-3">
                            {emails.map((e, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                                <a
                                  href={`mailto:${e.value}`}
                                  className="text-primary hover:underline truncate"
                                >
                                  {e.value}
                                </a>
                              </div>
                            ))}
                            {phones.map((p, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                                <a
                                  href={`tel:${p.value}`}
                                  className="text-primary hover:underline"
                                >
                                  {p.value}
                                </a>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No contact information available.</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Similar users */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <UserCheck className="h-4 w-4" />
                          Similar Users
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {similarUsers.length > 0 ? (
                          <div className="space-y-3">
                            {similarUsers.slice(0, 10).map((user, i) => (
                              <div key={i} className="flex items-center gap-3">
                                {user.picture ? (
                                  <img
                                    src={user.picture}
                                    alt={`${user.username} avatar`}
                                    className="h-8 w-8 rounded-full object-cover border border-border"
                                  />
                                ) : (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">
                                    {(user.username || "?").charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    @{user.username}
                                    {user.is_verified && (
                                      <ShieldCheck className="inline-block ms-1 h-3.5 w-3.5 text-blue-500" />
                                    )}
                                  </p>
                                  {user.fullname && (
                                    <p className="text-xs text-muted-foreground truncate">{user.fullname}</p>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatNumber(user.followers)} followers
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No similar users available.</p>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
