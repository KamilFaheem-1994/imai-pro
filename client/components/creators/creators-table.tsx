"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowUpDown,
  Users,
  ExternalLink,
  Search,
  Loader2,
  Instagram,
  FileText,
} from "lucide-react";
import { ContactInfoPopover } from "@/components/creators/contact-info-popover";
import type { TrackedCreator } from "@/db/schema";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function PlatformIcon({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  if (platform === "tiktok") {
    return <TikTokIcon className={className} />;
  }
  return <Instagram className={className} />;
}

function getCreatorProfileUrl(creator: TrackedCreator): string {
  if (creator.platform === "tiktok") {
    return `https://tiktok.com/@${creator.username}`;
  }
  return `https://instagram.com/${creator.username}`;
}

interface CreatorsTableProps {
  creators: TrackedCreator[];
  allCreatorsCount: number;
  platformFilter: "all" | "instagram" | "tiktok";
  onPlatformFilterChange: (value: "all" | "instagram" | "tiktok") => void;
  onOpenReport: (creator: TrackedCreator) => void;
  isDiscovering: boolean;
  onDiscover: () => void;
}

export function CreatorsTable({
  creators,
  allCreatorsCount,
  platformFilter,
  onPlatformFilterChange,
  onOpenReport,
  isDiscovering,
  onDiscover,
}: CreatorsTableProps) {
  // Sort state (owned by this component)
  const [sortField, setSortField] = useState<
    "username" | "platform" | "followers" | "discovered_at" | "imai_status"
  >("discovered_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  const sortedCreators = [...creators].sort((a, b) => {
    const dir = sortDirection === "asc" ? 1 : -1;
    switch (sortField) {
      case "username":
        return dir * a.username.localeCompare(b.username);
      case "platform":
        return dir * a.platform.localeCompare(b.platform);
      case "followers":
        return (
          dir *
          ((a.engagement?.followers ?? 0) - (b.engagement?.followers ?? 0))
        );
      case "discovered_at":
        return (
          dir *
          (new Date(a.discoveredAt).getTime() -
            new Date(b.discoveredAt).getTime())
        );
      case "imai_status":
        // imaiStatus might not exist on TrackedCreator; fallback to ""
        return (
          dir *
          ((a as any).imaiStatus ?? "pending").localeCompare(
            (b as any).imaiStatus ?? "pending"
          )
        );
      default:
        return 0;
    }
  });

  const totalPages = Math.ceil(sortedCreators.length / PAGE_SIZE);
  const paginatedCreators = sortedCreators.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const handlePlatformFilterChange = (
    value: "all" | "instagram" | "tiktok"
  ) => {
    onPlatformFilterChange(value);
    setCurrentPage(1);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle>Tracked Creators</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant={platformFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePlatformFilterChange("all")}
            >
              All
            </Button>
            <Button
              variant={platformFilter === "instagram" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePlatformFilterChange("instagram")}
              className="gap-1.5"
            >
              <Instagram className="h-3.5 w-3.5" />
              Instagram
            </Button>
            <Button
              variant={platformFilter === "tiktok" ? "default" : "outline"}
              size="sm"
              onClick={() => handlePlatformFilterChange("tiktok")}
              className="gap-1.5"
            >
              <TikTokIcon className="h-3.5 w-3.5" />
              TikTok
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {creators.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">
              {allCreatorsCount === 0
                ? "No creators yet"
                : "No creators match this filter"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {allCreatorsCount === 0
                ? 'Click "Discover Creators" to search for creators using your configured hashtags'
                : `No ${platformFilter} creators found. Try a different filter or discover more creators.`}
            </p>
            {allCreatorsCount === 0 && (
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
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort("username")}
                    >
                      Creator
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort("platform")}
                    >
                      Platform
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort("discovered_at")}
                    >
                      Discovered
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => toggleSort("imai_status")}
                    >
                      IMAI Status
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Engagement</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCreators.map((creator) => (
                  <TableRow key={creator.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage
                            src={creator.profilePicUrl || undefined}
                          />
                          <AvatarFallback>
                            {creator.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">@{creator.username}</p>
                          {creator.fullName && (
                            <p className="text-sm text-muted-foreground">
                              {creator.fullName}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize gap-1.5">
                        <PlatformIcon
                          platform={creator.platform}
                          className="h-3.5 w-3.5"
                        />
                        {creator.platform}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`font-medium ${
                          creator.sourceType === "hashtag"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            : creator.sourceType === "mention"
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                            : creator.sourceType === "location"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : ""
                        }`}
                      >
                        {creator.sourceValue}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(creator.discoveredAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {creator.addedToImai ? (
                        <Badge variant="success">Added</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {creator.engagement && (
                        <div className="text-sm space-y-0.5">
                         <p>{creator.engagement.followers} followers</p>
                         <p>{creator.engagement.followings} following</p>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => onOpenReport(creator)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {creator.imaiReportId ? "View" : "Generate"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <ContactInfoPopover
                          username={creator.username}
                          platform={creator.platform}
                        />
                        <Button variant="ghost" size="icon" asChild>
                          <a
                            href={getCreatorProfileUrl(creator)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {sortedCreators.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}&ndash;
            {Math.min(currentPage * PAGE_SIZE, sortedCreators.length)} of{" "}
            {sortedCreators.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
