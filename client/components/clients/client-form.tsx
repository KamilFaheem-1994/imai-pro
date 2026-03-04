"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient, updateClient, addCreator, getCreators } from "@/db/queries";
import { MediaService } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrackingConfig } from "./tracking-config";
import { useToast } from "@/components/ui/use-toast";
import type { GeoLocation } from "@/db/schema";

interface ClientFormData {
  name: string;
  logo?: string;
  description?: string;
  tracking: {
    instagram: { handle: string; hashtags: string[]; locations: GeoLocation[] };
    facebook: { handle: string; hashtags: string[]; locations: GeoLocation[] };
    tiktok: { handle: string; hashtags: string[]; locations: GeoLocation[] };
  };
  imai: {
    campaignId: string;
  };
  checkInterval: number;
}

const defaultFormData: ClientFormData = {
  name: "",
  logo: "",
  description: "",
  tracking: {
    instagram: { handle: "", hashtags: [], locations: [] },
    facebook: { handle: "", hashtags: [], locations: [] },
    tiktok: { handle: "", hashtags: [], locations: [] },
  },
  imai: {
    campaignId: "",
  },
  checkInterval: 720, // 12 hours in minutes
};

interface ClientFormProps {
  initialData?: ClientFormData;
  clientId?: string;
  isEditing?: boolean;
}

export function ClientForm({
  initialData,
  clientId,
  isEditing = false,
}: ClientFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [formData, setFormData] = useState<ClientFormData>(
    initialData || defaultFormData
  );
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      try {
        if (isEditing && clientId) {
          await updateClient(clientId, {
            name: formData.name,
            logo: formData.logo || null,
            description: formData.description || null,
            tracking: formData.tracking,
            imaiCampaignId: formData.imai.campaignId || null,
            checkInterval: formData.checkInterval,
          });
        } else {
            const clientData = {
                name: formData.name,
                logo: formData.logo || null,
                description: formData.description || null,
                tracking: formData.tracking,
                imaiCampaignId: formData.imai.campaignId || null,
                checkInterval: formData.checkInterval,
            };
            const newClient = await createClient(clientData);
          callSearchPostsForClient(newClient.id, newClient.tracking).catch((error) => {
              console.error(
                  `Error calling searchPosts for client ${newClient.id}:`,
                  error
              );
          });
        }
        toast({
          title: isEditing ? "Client updated" : "Client created",
          description: `${formData.name} has been ${isEditing ? "updated" : "created"} successfully.`,
        });
        router.push("/clients");
      } catch (error) {
        console.error("Error saving client:", error);
        toast({
          title: "Error saving client",
          description: error instanceof Error ? error.message : "An unexpected error occurred",
          variant: "destructive",
        });
      }
    });
  };

    /**
     * Save posts from API response to tracked_creators table
     * Works for both hashtags and mentions
     */
    const savePostsToTrackedCreators = async (
        clientId: string,
        posts: any[],
        keyword: string
    ): Promise<{ saved: number; duplicates: number; errors: number }> => {
        if (!posts || posts.length === 0) {
            return { saved: 0, duplicates: 0, errors: 0 };
        }

        try {
            // Determine source type and value based on keyword
            // #keyword = hashtag, @keyword = mention
            const sourceType = keyword.startsWith('@') ? 'mention' : 'hashtag';
            const sourceValue = keyword;

            console.log(`   📝 Processing ${posts.length} posts for ${sourceType}: ${keyword}`);

            // Get existing creators to avoid duplicates
            const existingCreators = await getCreators(clientId);
            const existingUsernames = new Set(
                existingCreators.map((c) => c.username.toLowerCase())
            );

            let savedCount = 0;
            let duplicateCount = 0;
            let errorCount = 0;

            // Process each post
            for (const post of posts) {
                try {
                    // Extract creator information - handle different response formats
                    let username = post.creator?.username;

                    // Fallback: try to extract from searchInfo or other fields
                    if (!username) {
                        username = post.searchInfo?.searchTerm?.replace(/^[@#]/, '') ||
                            post.username ||
                            'unknown';
                    }

                    // Skip if username is invalid
                    if (!username || username === 'unknown') {
                        console.warn(`   ⚠️  Skipping post with invalid username:`, post.postId || post.shortcode);
                        errorCount++;
                        continue;
                    }

                    // Skip if already tracked for this client
                    if (existingUsernames.has(username.toLowerCase())) {
                        duplicateCount++;
                        continue;
                    }

                    // Extract post information - handle different response formats
                    const postId = post.postId || post.shortcode || post.id || null;
                    const postCaption = post.content?.caption || post.caption || null;
                    const postMediaUrl = post.content?.displayUrl ||
                        post.content?.thumbnailUrl ||
                        post.mediaUrl ||
                        null;
                    const permalink = post.permalink || null;

                    // Extract engagement data
                    const engagement = post.engagement ? {
                        likes: post.engagement.likes || post.engagement.like_count || 0,
                        comments: post.engagement.comments || post.engagement.comments_count || 0,
                    } : null;

                    // Save creator to database
                    await addCreator({
                        clientId,
                        username,
                        fullName: post.creator?.fullName || null,
                        profilePicUrl: post.creator?.profilePicUrl || null,
                        platform: 'instagram',
                        sourceType: sourceType as 'mention' | 'hashtag',
                        sourceValue,
                        postId,
                        postCaption,
                        postMediaUrl,
                        permalink,
                        engagement: engagement as { followers: number; followings: number } | null,
                        addedToImai: false,
                        imaiAddedAt: null,
                    });

                    existingUsernames.add(username.toLowerCase());
                    savedCount++;
                } catch (error) {
                    console.error(`   ⚠️  Error saving creator from post:`, error);
                    errorCount++;
                }
            }

            console.log(`   💾 Saved ${savedCount} new creators, ${duplicateCount} duplicates, ${errorCount} errors`);
            return { saved: savedCount, duplicates: duplicateCount, errors: errorCount };
        } catch (error) {
            console.error(`   ❌ Error saving posts to tracked_creators:`, error);
            return { saved: 0, duplicates: 0, errors: posts.length };
        }
    };

    /**
     * Call searchPosts API for a client's tracking configuration
     * Searches for all hashtags and handles mentioned in the Instagram config
     */
    const callSearchPostsForClient = async (
        clientId: string,
        tracking: ClientFormData["tracking"]
    ): Promise<void> => {
        const IgKeywords: string[] = [];
        const TikTokKeywords: string[] = [];

        // Instagram hashtags & Mentions
        if (tracking?.instagram?.hashtags) {
            for (const hashtag of tracking.instagram.hashtags) {
                const cleanTag = hashtag.replace(/^#/, "");
                if (cleanTag.trim()) {
                    IgKeywords.push(`#${cleanTag.trim()}`);
                }
            }
        }
        if (tracking?.instagram?.handle) {
            const cleanHandle = tracking.instagram.handle.replace(/^@/, "");
            if (cleanHandle.trim()) {
                IgKeywords.push(`@${cleanHandle.trim()}`);
            }
        }

        if (IgKeywords.length === 0) {
            console.log(`No Instagram keywords to search for client ${clientId}`);
            return;
        }

        // TikTok hashtags & Mentions
        if (tracking?.tiktok?.hashtags) {
            for (const hashtag of tracking.tiktok.hashtags) {
                const cleanTag = hashtag.replace(/^#/, "");
                if (cleanTag.trim()) {
                    TikTokKeywords.push(`#${cleanTag.trim()}`);
                }
            }
        }
        if (tracking?.tiktok?.handle) {
            const cleanHandle = tracking.tiktok.handle.replace(/^@/, "");
            if (cleanHandle.trim()) {
                TikTokKeywords.push(`@${cleanHandle.trim()}`);
            }
        }

        if (TikTokKeywords.length === 0) {
            console.log(`No tiktok keywords to search for client ${clientId}`);
            return;
        }

        console.log(
            `🔍 Auto-calling searchPosts for client ${clientId}: ${IgKeywords.join(", ")} ${TikTokKeywords.join(", ")}`
        );

        //return;

        // Call IG searchPosts API for each keyword
        for (const keyword of IgKeywords) {
            try {
                console.log(`   Calling searchPosts API for: ${keyword}`);

                // Use searchPostsAll to get all posts (not paginated) for saving to database
                const response = await MediaService.searchIGPosts(keyword, {
                    page: 1,
                    limit: 100,
                    clientId: clientId,
                });

                if (response.success) {
                    const postCount = response.data?.totalPosts || 0;
                    const posts = response.data?.posts || [];
                    console.log(`   ✅ searchPosts successful for ${keyword}: Found ${postCount} posts`);

                    // Parse and save posts to tracked_creators (for both hashtags and mentions)
                    if (posts.length > 0) {
                        const savedResult = await savePostsToTrackedCreators(clientId, posts, keyword);
                        console.log(`   💾 Saved ${savedResult.saved} creators, ${savedResult.duplicates} duplicates for ${keyword}`);

                        // Show success toast with save information
                        toast({
                            variant: "default",
                            title: "Search completed",
                            description: `Found ${postCount} posts for ${keyword}. Saved ${savedResult.saved} new creators.`,
                        });
                    } else {
                        // Show toast even if no posts found
                        toast({
                            variant: "default",
                            title: "Search completed",
                            description: `No posts found for ${keyword}`,
                        });
                    }
                } else {
                    console.error(`   ❌ searchPosts failed for ${keyword}:`, response.message);
                    toast({
                        variant: "destructive",
                        title: "Search failed",
                        description: `Failed to search ${keyword}: ${response.message || "Unknown error"}`,
                    });
                }
            } catch (error) {
                console.error(`   ❌ Error calling searchPosts for ${keyword}:`, error instanceof Error ? error.message : "Unknown error");
                toast({
                    variant: "destructive",
                    title: "Search error",
                    description: `Error searching ${keyword}: ${error instanceof Error ? error.message : "Unknown error"}`,
                });
            }
        }

        // Call TT searchPosts API for each keyword
        for (const keyword of TikTokKeywords) {
            try {
                console.log(`   Calling searchPosts API for: ${keyword}`);

                // Use searchPostsAll to get all posts (not paginated) for saving to database
                const response = await MediaService.searchTTPosts(keyword, {
                    page: 1,
                    limit: 100,
                    clientId: clientId,
                });

                if (response.success) {
                    const postCount = response.data?.totalPosts || 0;
                    const posts = response.data?.posts || [];
                    console.log(`   ✅ searchPosts successful for ${keyword}: Found ${postCount} posts`);

                    // Parse and save posts to tracked_creators (for both hashtags and mentions)
                    if (posts.length > 0) {
                        const savedResult = await savePostsToTrackedCreators(clientId, posts, keyword);
                        console.log(`   💾 Saved ${savedResult.saved} creators, ${savedResult.duplicates} duplicates for ${keyword}`);

                        // Show success toast with save information
                        toast({
                            variant: "default",
                            title: "Search completed",
                            description: `Found ${postCount} posts for ${keyword}. Saved ${savedResult.saved} new creators.`,
                        });
                    } else {
                        // Show toast even if no posts found
                        toast({
                            variant: "default",
                            title: "Search completed",
                            description: `No posts found for ${keyword}`,
                        });
                    }
                } else {
                    console.error(`   ❌ searchPosts failed for ${keyword}:`, response.message);
                    toast({
                        variant: "destructive",
                        title: "Search failed",
                        description: `Failed to search ${keyword}: ${response.message || "Unknown error"}`,
                    });
                }
            } catch (error) {
                console.error(`   ❌ Error calling searchPosts for ${keyword}:`, error instanceof Error ? error.message : "Unknown error");
                toast({
                    variant: "destructive",
                    title: "Search error",
                    description: `Error searching ${keyword}: ${error instanceof Error ? error.message : "Unknown error"}`,
                });
            }
        }

        console.log(`✅ Auto searchPosts complete for client ${clientId}`);
    };

    const updateTracking = (
        platform: "instagram" | "facebook" | "tiktok",
        field: string,
        value: string | string[] | GeoLocation[]
    ) => {
        setFormData((prev) => ({
        ...prev,
        tracking: {
            ...prev.tracking,
            [platform]: {
            ...prev.tracking[platform],
            [field]: value,
            },
        },
        }));
    };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Client Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., Dubai Restaurants"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo">Logo URL</Label>
              <Input
                id="logo"
                value={formData.logo || ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, logo: e.target.value }))
                }
                placeholder="https://example.com/logo.png"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Brief description of the client..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tracking Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Tracking Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="instagram">
            <TabsList className="mb-4">
              <TabsTrigger value="instagram">Instagram</TabsTrigger>
              <TabsTrigger value="facebook">Facebook</TabsTrigger>
              <TabsTrigger value="tiktok">TikTok</TabsTrigger>
            </TabsList>

            <TabsContent value="instagram">
              <TrackingConfig
                platform="instagram"
                handle={formData.tracking.instagram.handle}
                hashtags={formData.tracking.instagram.hashtags}
                locations={formData.tracking.instagram.locations}
                onHandleChange={(value) =>
                  updateTracking("instagram", "handle", value)
                }
                onHashtagsChange={(value) =>
                  updateTracking("instagram", "hashtags", value)
                }
                onLocationsChange={(value) =>
                  updateTracking("instagram", "locations", value)
                }
                showLocations
              />
            </TabsContent>

            <TabsContent value="facebook">
              <TrackingConfig
                platform="facebook"
                handle={formData.tracking.facebook.handle}
                hashtags={formData.tracking.facebook.hashtags}
                locations={formData.tracking.facebook.locations}
                onHandleChange={(value) =>
                  updateTracking("facebook", "handle", value)
                }
                onHashtagsChange={(value) =>
                  updateTracking("facebook", "hashtags", value)
                }
                onLocationsChange={(value) =>
                  updateTracking("facebook", "locations", value)
                }
                showLocations
              />
            </TabsContent>

            <TabsContent value="tiktok">
              <TrackingConfig
                platform="tiktok"
                handle={formData.tracking.tiktok.handle}
                hashtags={formData.tracking.tiktok.hashtags}
                locations={formData.tracking.tiktok.locations}
                onHandleChange={(value) =>
                  updateTracking("tiktok", "handle", value)
                }
                onHashtagsChange={(value) =>
                  updateTracking("tiktok", "hashtags", value)
                }
                onLocationsChange={(value) =>
                  updateTracking("tiktok", "locations", value)
                }
                showLocations
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* IMAI Integration */}
      <Card>
        <CardHeader>
          <CardTitle>IMAI Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground mb-4">
            IMAI credentials are configured globally in Settings. Only the Campaign ID is needed per client.
          </p>
          <div className="space-y-2">
            <Label htmlFor="imaiCampaignId">IMAI Campaign ID</Label>
            <Input
              id="imaiCampaignId"
              value={formData.imai.campaignId}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  imai: { ...prev.imai, campaignId: e.target.value },
                }))
              }
              placeholder="Campaign ID to add creators to"
            />
            <p className="text-sm text-muted-foreground">
              Find this in your IMAI campaign URL (e.g., imai.co/campaigns/12345)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Agent Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="checkInterval">Check Interval (minutes)</Label>
            <Input
              id="checkInterval"
              type="number"
              min={1}
              max={10080}
              value={formData.checkInterval}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  checkInterval: parseInt(e.target.value) || 2,
                }))
              }
            />
            <p className="text-sm text-muted-foreground">
              How often the agent should check for new mentions (720 minutes = 12 hours for stories, 1440 minutes = 24 hours for feed posts recommended)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/clients")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Saving..."
            : isEditing
            ? "Update Client"
            : "Create Client"}
        </Button>
      </div>
    </form>
  );
}
