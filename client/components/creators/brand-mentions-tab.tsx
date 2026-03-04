"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  UserPlus,
  Heart,
  MessageCircle,
  Calendar,
  AlertCircle,
  Megaphone,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { ContactInfoPopover } from "./contact-info-popover";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Shape of a single sponsored post returned by the IMAI API. */
interface SponsoredPost {
  id?: string;
  username: string;
  platform: string;
  text: string;
  likes: number;
  comments: number;
  date: string;
  postUrl?: string;
  profilePicUrl?: string;
}

interface BrandMentionsTabProps {
  clientHandles: string[];
  clientId: string;
}

type TrackingState = "idle" | "loading" | "tracked" | "error";

/**
 * BrandMentionsTab -- shows sponsored posts that mention any of the client's
 * brand handles, with the ability to track individual creators.
 */
export function BrandMentionsTab({
  clientHandles,
  clientId,
}: BrandMentionsTabProps) {
  const [posts, setPosts] = useState<SponsoredPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track loading / success / error per row keyed by `username-date`
  const [trackingStates, setTrackingStates] = useState<
    Record<string, TrackingState>
  >({});

  /** Unique row key for tracking state map. */
  const rowKey = (post: SponsoredPost) =>
    `${post.username}-${post.date}-${post.platform}`;

  /** Fetch sponsored posts from the IMAI API. */
  const handleSearch = useCallback(async () => {
    if (clientHandles.length === 0) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

      const response = await fetch(`${API_BASE_URL}/api/imai/sponsored-posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            mentions: clientHandles.map((h) =>
              h.startsWith("@") ? h : `@${h}`
            ),
            created_at: {
              left_number: thirtyDaysAgo,
              right_number: now,
            },
          },
          paging: { limit: 100, skip: 0 },
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.message || `Failed to fetch sponsored posts (${response.status})`
        );
      }

      const data = await response.json();
      // Normalise: the endpoint may return `data`, `results`, or the array directly.
      const items: SponsoredPost[] = Array.isArray(data)
        ? data
        : Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.results)
        ? data.results
        : [];

      setPosts(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, [clientHandles]);

  /** Track a creator via discover-by-brand-mention endpoint. */
  const handleTrackCreator = async (post: SponsoredPost) => {
    const key = rowKey(post);
    setTrackingStates((prev) => ({ ...prev, [key]: "loading" }));

    try {
      const handle = post.username.startsWith("@")
        ? post.username
        : `@${post.username}`;

      const response = await fetch(
        `${API_BASE_URL}/api/imai/discover-by-brand-mention`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handles: [handle],
            clientId,
            daysBack: 30,
          }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.message || `Failed to track creator (${response.status})`
        );
      }

      setTrackingStates((prev) => ({ ...prev, [key]: "tracked" }));
    } catch {
      setTrackingStates((prev) => ({ ...prev, [key]: "error" }));
    }
  };

  /** Truncate text to a max length with ellipsis. */
  const truncate = (text: string, max = 80) =>
    text.length > max ? `${text.slice(0, max)}...` : text;

  /** Format a date string or epoch into a human-readable label. */
  const formatDate = (raw: string) => {
    const ms = Number(raw);
    const date = Number.isFinite(ms) && ms > 1e9 ? new Date(ms * 1000) : new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // ------------------------------------------------------------------ render

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Brand Mentions</CardTitle>
        </div>
        <Button
          onClick={handleSearch}
          disabled={isLoading || clientHandles.length === 0}
          size="sm"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          {isLoading ? "Searching..." : "Search Mentions"}
        </Button>
      </CardHeader>

      <CardContent>
        {/* Handles being searched */}
        {clientHandles.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">Searching for:</span>
            {clientHandles.map((handle) => (
              <Badge key={handle} variant="secondary">
                @{handle.replace(/^@/, "")}
              </Badge>
            ))}
          </div>
        )}

        {clientHandles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No handles configured for this client. Add handles in the tracking
              configuration to search for brand mentions.
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-[80px]" />
                <Skeleton className="h-4 w-[80px]" />
                <Skeleton className="h-4 w-[60px]" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && hasSearched && posts.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Megaphone className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">No mentions found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No sponsored posts mentioning these handles were found in the last
              30 days.
            </p>
          </div>
        )}

        {/* Results table */}
        {!isLoading && posts.length > 0 && (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {posts.length} sponsored post{posts.length !== 1 ? "s" : ""} found
            </p>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Creator</TableHead>
                  <TableHead>Post</TableHead>
                  <TableHead>Engagement</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => {
                  const key = rowKey(post);
                  const state = trackingStates[key] || "idle";

                  return (
                    <TableRow key={key}>
                      {/* Creator */}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>@{post.username.replace(/^@/, "")}</span>
                        </div>
                      </TableCell>

                      {/* Post text */}
                      <TableCell className="max-w-[280px]">
                        <p
                          className="truncate text-sm text-muted-foreground"
                          title={post.text}
                        >
                          {truncate(post.text)}
                        </p>
                      </TableCell>

                      {/* Engagement */}
                      <TableCell>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Heart className="h-3.5 w-3.5" />
                            {post.likes?.toLocaleString() ?? 0}
                          </span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {post.comments?.toLocaleString() ?? 0}
                          </span>
                        </div>
                      </TableCell>

                      {/* Date */}
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(post.date)}
                        </span>
                      </TableCell>

                      {/* Platform */}
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {post.platform || "instagram"}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <ContactInfoPopover
                            username={post.username.replace(/^@/, "")}
                            platform={post.platform || "instagram"}
                          />
                          <Button
                            size="sm"
                            variant={state === "tracked" ? "secondary" : "outline"}
                            disabled={state === "loading" || state === "tracked"}
                            onClick={() => handleTrackCreator(post)}
                          >
                            {state === "loading" && (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            )}
                            {state === "tracked" && (
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-500" />
                            )}
                            {state === "idle" && (
                              <UserPlus className="mr-1 h-3.5 w-3.5" />
                            )}
                            {state === "error" && (
                              <AlertCircle className="mr-1 h-3.5 w-3.5 text-destructive" />
                            )}
                            {state === "tracked"
                              ? "Tracked"
                              : state === "error"
                              ? "Retry"
                              : "Track"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
