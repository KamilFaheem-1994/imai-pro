"use server";

import { db } from "./index";
import {
  clients,
  agents,
  agentLogs,
  trackedCreators,
  settings,
  creditTransactions,
  Client,
  NewClient,
  Agent,
  NewAgent,
  AgentLog,
  TrackedCreator,
  Setting,
  CreditTransaction,
} from "./schema";
import { eq, desc, count, sql as sqlTemplate, gte } from "drizzle-orm";

// ============= Client Operations =============

export async function getClients(): Promise<Client[]> {
  return db.select().from(clients).orderBy(desc(clients.createdAt));
}

export async function getClient(id: string): Promise<Client | undefined> {
  const result = await db.select().from(clients).where(eq(clients.id, id));
  return result[0];
}

export async function createClient(data: Omit<NewClient, "id" | "createdAt" | "updatedAt">): Promise<Client> {
  // Sanitize data: convert empty strings to null for optional fields
  const sanitizeString = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() !== "") return value;
    return null;
  };
  
  const sanitizedData = {
    ...data,
    logo: sanitizeString(data.logo),
    description: sanitizeString(data.description),
    imaiCampaignId: sanitizeString(data.imaiCampaignId),
  };
  console.log('Inserting Client....');
  const result = await db.insert(clients).values(sanitizedData).returning();
  const newClient = result[0];

  // Automatically call searchPosts API for all hashtags and handles
  // Run asynchronously so it doesn't block the response
  callSearchPostsForClient(newClient.id, newClient.tracking).catch((error) => {
    console.error(`Error calling searchPosts for client ${newClient.id}:`, error);
  });

  return newClient;
}

/**
 * Resolve which provider to use for Passes 1-3.
 * Priority: APIDirect (cheap, $0.006/req) -> IMAI (token-based) -> null (skip)
 */
async function resolveDiscoveryProvider(): Promise<"apidirect" | "imai" | null> {
  // Check DB settings first (set via Settings page)
  const apiDirectKey = await getSetting("apidirect_api_key");
  if (apiDirectKey) return "apidirect";

  const imaiKey = await getSetting("imai_api_key");
  if (imaiKey) return "imai";

  // Fall back to env var checks via backend test endpoints
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  try {
    const adRes = await fetch(`${apiUrl}/api/apidirect/test`, { signal: AbortSignal.timeout(5000) });
    if (adRes.ok) {
      const data = await adRes.json();
      if (data.success) return "apidirect";
    }
  } catch {}
  try {
    const imRes = await fetch(`${apiUrl}/api/imai/test`, { signal: AbortSignal.timeout(5000) });
    if (imRes.ok) {
      const data = await imRes.json();
      if (data.success) return "imai";
    }
  } catch {}

  return null;
}

/**
 * Call searchPosts API for a client's tracking configuration
 * Searches for all hashtags and handles mentioned in the agent config
 */
async function callSearchPostsForClient(
  clientId: string,
  tracking: Client["tracking"]
): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  // Resolve which discovery passes are enabled by the tier setting
  const tier = await getDiscoveryTier();
  const enabledPasses = await getTierPasses(tier);

  if (enabledPasses.length === 0) {
    console.log(`[Discovery] Tier "${tier}" has no passes enabled. Skipping.`);
    return;
  }

  console.log(`[Discovery] Tier "${tier}" — enabled passes: ${enabledPasses.join(", ")}`);

  const provider = await resolveDiscoveryProvider();
  console.log(`[Discovery] Resolved provider for Passes 1-3: ${provider || "none (all skipped)"}`);

  const searches: { keyword: string; platform: string }[] = [];

  // Extract Instagram hashtags (add # prefix)
  if (tracking?.instagram?.hashtags) {
    for (const hashtag of tracking.instagram.hashtags) {
      const cleanTag = hashtag.replace(/^#/, "");
      if (cleanTag.trim()) {
        searches.push({ keyword: `#${cleanTag.trim()}`, platform: "instagram" });
      }
    }
  }

  // Extract Instagram handle (add @ prefix)
  if (tracking?.instagram?.handle) {
    const cleanHandle = tracking.instagram.handle.replace(/^@/, "");
    if (cleanHandle.trim()) {
      searches.push({ keyword: `@${cleanHandle.trim()}`, platform: "instagram" });
    }
  }

  // Extract TikTok hashtags (add # prefix)
  if (tracking?.tiktok?.hashtags) {
    for (const hashtag of tracking.tiktok.hashtags) {
      const cleanTag = hashtag.replace(/^#/, "");
      if (cleanTag.trim()) {
        searches.push({ keyword: `#${cleanTag.trim()}`, platform: "tiktok" });
      }
    }
  }

  // Extract TikTok handle (add @ prefix)
  if (tracking?.tiktok?.handle) {
    const cleanHandle = tracking.tiktok.handle.replace(/^@/, "");
    if (cleanHandle.trim()) {
      searches.push({ keyword: `@${cleanHandle.trim()}`, platform: "tiktok" });
    }
  }

  if (searches.length === 0 && !enabledPasses.includes(2) && !enabledPasses.includes(3) && !enabledPasses.includes(4)) {
    console.log(`No keywords to search for client ${clientId}`);
    return;
  }

  console.log(`Auto-calling searchPosts for client ${clientId}: ${searches.map(s => `${s.keyword}(${s.platform})`).join(", ")}`);

  // Pass 1: Hashtag + handle search via APIDirect or IMAI
  if (enabledPasses.includes(1) && provider)
  for (const { keyword, platform } of searches) {
    try {
      const endpoint = provider === "apidirect"
        ? `${apiUrl}/api/apidirect/search?query=${encodeURIComponent(keyword)}&clientId=${encodeURIComponent(clientId)}&platform=${platform}`
        : `${apiUrl}/api/instagram/search?keyword=${encodeURIComponent(keyword)}&clientId=${encodeURIComponent(clientId)}&platform=${platform}&limit=50`;

      console.log(`   [Pass 1] ${provider}: ${keyword} (${platform})`);
      const response = await fetch(endpoint);

      if (!response.ok) {
        // Fallback: if APIDirect fails, try IMAI
        if (provider === "apidirect") {
          console.log(`   [Pass 1] APIDirect failed (${response.status}), falling back to IMAI for ${keyword}`);
          try {
            const fallback = await fetch(
              `${apiUrl}/api/instagram/search?keyword=${encodeURIComponent(keyword)}&clientId=${encodeURIComponent(clientId)}&platform=${platform}&limit=50`
            );
            if (fallback.ok) {
              const fbData = await fallback.json();
              console.log(`   [Pass 1] IMAI fallback: ${fbData.data?.totalPosts || 0} posts for ${keyword}`);
            } else {
              console.error(`   [Pass 1] Both providers failed for ${keyword}`);
            }
          } catch (fbErr) {
            console.error(`   [Pass 1] IMAI fallback also failed for ${keyword}`);
          }
          continue;
        }
        console.error(`   [Pass 1] Failed for ${keyword}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      if (data.success) {
        console.log(`   [Pass 1] ${provider}: Found ${data.data?.totalPosts || 0} posts for ${keyword} (provider: ${data.data?.provider || "imai"})`);
      } else {
        console.error(`   [Pass 1] ${provider} returned error for ${keyword}:`, data.error || data.message);
      }
    } catch (error) {
      console.error(`   [Pass 1] Error for ${keyword}:`, error instanceof Error ? error.message : "Unknown");
    }
  }

  // Pass 2: Mention-based discovery
  const handles: { handle: string; platform: string }[] = [];
  if (tracking?.instagram?.handle) {
    handles.push({ handle: tracking.instagram.handle, platform: "instagram" });
  }
  if (tracking?.tiktok?.handle) {
    handles.push({ handle: tracking.tiktok.handle, platform: "tiktok" });
  }

  if (enabledPasses.includes(2) && provider) {
    for (const { handle, platform } of handles) {
      try {
        console.log(`   [Pass 2] ${provider}: Mention search for @${handle} (${platform})`);

        if (provider === "apidirect") {
          const response = await fetch(
            `${apiUrl}/api/apidirect/search?query=${encodeURIComponent("@" + handle.replace(/^@/, ""))}&clientId=${encodeURIComponent(clientId)}&platform=${platform}`
          );
          if (response.ok) {
            const data = await response.json();
            console.log(`   [Pass 2] APIDirect @${handle}: ${data.data?.totalPosts || 0} posts, ${data.data?.tracked?.inserted || 0} new`);
          } else {
            // Fallback to IMAI
            console.log(`   [Pass 2] APIDirect failed, falling back to IMAI for @${handle}`);
            try {
              const fallback = await fetch(`${apiUrl}/api/imai/discover-by-mention`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ handle, platform, clientId }),
              });
              if (fallback.ok) {
                const fbData = await fallback.json();
                console.log(`   [Pass 2] IMAI fallback for @${handle}: ${fbData.data?.totalFound || 0} found`);
              }
            } catch {
              console.error(`   [Pass 2] IMAI fallback also failed for @${handle}`);
            }
          }
        } else {
          // IMAI provider path
          const response = await fetch(`${apiUrl}/api/imai/discover-by-mention`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle, platform, clientId }),
          });
          if (response.ok) {
            const data = await response.json();
            console.log(`   [Pass 2] IMAI mention @${handle}: ${data.data?.totalFound || 0} found, ${data.data?.tracked?.inserted || 0} new`);
          } else {
            console.error(`   [Pass 2] IMAI mention failed for @${handle}: ${response.statusText}`);
          }
        }
      } catch (error) {
        console.error(`   [Pass 2] Error for @${handle}:`, error instanceof Error ? error.message : "Unknown");
      }
    }
  } else if (!enabledPasses.includes(2)) {
    console.log(`   [Pass 2] Skipped (tier "${tier}" does not include pass 2)`);
  } else if (!provider) {
    console.log(`   [Pass 2] Skipped (no provider configured)`);
  }

  // Pass 3: Sponsored posts / brand mentions
  const allHandles = handles.map((h) => h.handle);
  if (enabledPasses.includes(3) && allHandles.length > 0 && provider) {
    try {
      console.log(`   [Pass 3] ${provider}: Brand mention search for: ${allHandles.join(", ")}`);

      if (provider === "apidirect") {
        for (const handle of allHandles) {
          try {
            const response = await fetch(
              `${apiUrl}/api/apidirect/search?query=${encodeURIComponent(handle)}&clientId=${encodeURIComponent(clientId)}&platform=instagram`
            );
            if (response.ok) {
              const data = await response.json();
              console.log(`   [Pass 3] APIDirect brand "${handle}": ${data.data?.totalPosts || 0} posts, ${data.data?.tracked?.inserted || 0} new`);
            } else {
              // Fallback to IMAI
              console.log(`   [Pass 3] APIDirect failed for "${handle}", falling back to IMAI`);
              try {
                const fallback = await fetch(`${apiUrl}/api/imai/discover-by-brand-mention`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ handles: [handle], clientId, daysBack: 30 }),
                });
                if (fallback.ok) {
                  const fbData = await fallback.json();
                  console.log(`   [Pass 3] IMAI fallback: ${fbData.data?.postsFound || 0} posts`);
                }
              } catch {
                console.error(`   [Pass 3] IMAI fallback also failed for "${handle}"`);
              }
            }
          } catch (error) {
            console.error(`   [Pass 3] Error for "${handle}":`, error instanceof Error ? error.message : "Unknown");
          }
        }
      } else {
        // IMAI provider path
        const response = await fetch(`${apiUrl}/api/imai/discover-by-brand-mention`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handles: allHandles, clientId, daysBack: 30 }),
        });
        if (response.ok) {
          const data = await response.json();
          console.log(`   [Pass 3] IMAI sponsored: ${data.data?.postsFound || 0} posts, ${data.data?.uniqueCreators || 0} creators, ${data.data?.tracked?.inserted || 0} new`);
        } else {
          console.error(`   [Pass 3] IMAI sponsored search failed: ${response.statusText}`);
        }
      }
    } catch (error) {
      console.error(`   [Pass 3] Error:`, error instanceof Error ? error.message : "Unknown");
    }
  } else if (!enabledPasses.includes(3)) {
    console.log(`   [Pass 3] Skipped (tier "${tier}" does not include pass 3)`);
  }

  // Pass 4: Apify location-based discovery
  // Scrape posts from Instagram location pages configured in tracking
  if (!enabledPasses.includes(4)) {
    console.log(`   [Pass 4] Skipped (tier "${tier}" does not include pass 4)`);
  }
  const locationEntries: { location: { id: string; name: string }; platform: string }[] = [];
  if (tracking?.instagram?.locations) {
    for (const loc of tracking.instagram.locations) {
      if (typeof loc === "object" && loc.id) {
        locationEntries.push({ location: loc, platform: "instagram" });
      }
    }
  }
  if (tracking?.tiktok?.locations) {
    for (const loc of tracking.tiktok.locations) {
      // TikTok uses Instagram location IDs (Apify only supports IG locations)
      if (typeof loc === "object" && loc.id) {
        locationEntries.push({ location: loc, platform: "instagram" });
      }
    }
  }
  if (tracking?.facebook?.locations) {
    for (const loc of tracking.facebook.locations) {
      if (typeof loc === "object" && loc.id) {
        locationEntries.push({ location: loc, platform: "instagram" });
      }
    }
  }

  if (enabledPasses.includes(4))
  for (const { location, platform } of locationEntries) {
    try {
      const locationUrl = `https://www.instagram.com/explore/locations/${location.id}/`;
      console.log(`   [Pass 4] Apify location scrape: ${location.name} (${locationUrl})`);
      const response = await fetch(`${apiUrl}/api/apify/discover-by-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationUrl,
          locationName: location.name,
          clientId,
          platform,
          maxPosts: 50,
        }),
      });

      if (!response.ok) {
        console.error(`   Location scrape failed for ${location.name}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      if (data.success) {
        console.log(`   Location scrape for ${location.name}: ${data.data?.postsScraped || 0} posts, ${data.data?.uniqueCreators || 0} creators, ${data.data?.tracked?.inserted || 0} new`);
      }
    } catch (error) {
      console.error(`   Error in location scrape for ${location.name}:`, error instanceof Error ? error.message : "Unknown error");
    }
  }

  console.log(`Auto searchPosts complete for client ${clientId} (4 passes done)`);
}

export async function updateClient(
  id: string,
  data: Partial<Omit<NewClient, "id" | "createdAt">>
): Promise<Client | undefined> {
  // Sanitize data: convert empty strings to null for optional fields
  const sanitizeString = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() !== "") return value;
    return null;
  };
  
  const sanitizedData: Partial<Omit<NewClient, "id" | "createdAt">> = {
    ...data,
    updatedAt: new Date(),
  };
  
  if (sanitizedData.logo !== undefined) {
    sanitizedData.logo = sanitizeString(sanitizedData.logo);
  }
  if (sanitizedData.description !== undefined) {
    sanitizedData.description = sanitizeString(sanitizedData.description);
  }
  if (sanitizedData.imaiCampaignId !== undefined) {
    sanitizedData.imaiCampaignId = sanitizeString(sanitizedData.imaiCampaignId);
  }
  
  const result = await db
    .update(clients)
    .set(sanitizedData)
    .where(eq(clients.id, id))
    .returning();
  return result[0];
}

export async function deleteClient(id: string): Promise<boolean> {
  const result = await db.delete(clients).where(eq(clients.id, id)).returning();
  return result.length > 0;
}

// ============= Agent Operations =============

export async function getAgents(): Promise<Agent[]> {
  return db.select().from(agents).orderBy(desc(agents.createdAt));
}

export async function getAgent(id: string): Promise<Agent | undefined> {
  const result = await db.select().from(agents).where(eq(agents.id, id));
  return result[0];
}

export async function getAgentByClientId(clientId: string): Promise<Agent | undefined> {
  const result = await db.select().from(agents).where(eq(agents.clientId, clientId));
  return result[0];
}

export async function createAgent(clientId: string, clientName: string): Promise<Agent> {
  const result = await db
    .insert(agents)
    .values({ clientId, clientName })
    .returning();

  // Update client with agent ID
  await db
    .update(clients)
    .set({ agentId: result[0].id, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  return result[0];
}

export async function updateAgentStatus(
  id: string,
  status: Agent["status"]
): Promise<Agent | undefined> {
  const updateData: Partial<Agent> = {
    status,
    updatedAt: new Date(),
  };

  if (status === "running") {
    updateData.lastRun = new Date();
  }

  const result = await db
    .update(agents)
    .set(updateData)
    .where(eq(agents.id, id))
    .returning();
  return result[0];
}

export async function incrementCreatorsAdded(id: string): Promise<Agent | undefined> {
  const result = await db
    .update(agents)
    .set({
      creatorsAdded: sqlTemplate`${agents.creatorsAdded} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, id))
    .returning();
  return result[0];
}

export async function updateCreatorsAdded(id: string, addedCount: number): Promise<Agent | undefined> {
  if (addedCount <= 0) return await getAgent(id);

  const result = await db
    .update(agents)
    .set({
      creatorsAdded: sqlTemplate`${agents.creatorsAdded} + ${addedCount}`,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, id))
    .returning();
  return result[0];
}

export async function deleteAgent(id: string): Promise<boolean> {
  // Get agent to find client
  const agent = await getAgent(id);
  if (agent) {
    // Remove agent reference from client
    await db
      .update(clients)
      .set({ agentId: null, updatedAt: new Date() })
      .where(eq(clients.id, agent.clientId));
  }

  const result = await db.delete(agents).where(eq(agents.id, id)).returning();
  return result.length > 0;
}

export async function getAgentStats() {
  const allAgents = await getAgents();
  return {
    totalAgents: allAgents.length,
    runningAgents: allAgents.filter((a) => a.status === "running").length,
    idleAgents: allAgents.filter((a) => a.status === "idle").length,
    errorAgents: allAgents.filter((a) => a.status === "error").length,
    pausedAgents: allAgents.filter((a) => a.status === "paused").length,
    totalCreatorsAdded: allAgents.reduce((sum, a) => sum + a.creatorsAdded, 0),
  };
}

// ============= Agent Log Operations =============

export async function getAgentLogs(agentId: string): Promise<AgentLog[]> {
  return db
    .select()
    .from(agentLogs)
    .where(eq(agentLogs.agentId, agentId))
    .orderBy(desc(agentLogs.timestamp))
    .limit(100);
}

export async function addAgentLog(
  agentId: string,
  data: { action: string; result: "success" | "error" | "info"; details?: string }
): Promise<AgentLog> {
  const result = await db
    .insert(agentLogs)
    .values({ agentId, ...data })
    .returning();
  return result[0];
}

export async function getAgentLogCounts(): Promise<Record<string, number>> {
  const result = await db
    .select({
      agentId: agentLogs.agentId,
      count: count(),
    })
    .from(agentLogs)
    .groupBy(agentLogs.agentId);

  return result.reduce((acc, row) => {
    acc[row.agentId] = row.count;
    return acc;
  }, {} as Record<string, number>);
}

// ============= Tracked Creator Operations =============

export async function getCreators(clientId?: string): Promise<TrackedCreator[]> {
  if (clientId) {
    return db
      .select()
      .from(trackedCreators)
      .where(eq(trackedCreators.clientId, clientId))
      .orderBy(desc(trackedCreators.discoveredAt));
  }
  return db.select().from(trackedCreators).orderBy(desc(trackedCreators.discoveredAt));
}

export async function addCreator(
  data: Omit<TrackedCreator, "id" | "discoveredAt"> & { discoveredAt?: Date }
): Promise<TrackedCreator> {
  const result = await db.insert(trackedCreators).values(data).returning();
  return result[0];
}

export async function markCreatorAddedToImai(id: string): Promise<TrackedCreator | undefined> {
  const result = await db
    .update(trackedCreators)
    .set({ addedToImai: true, imaiAddedAt: new Date() })
    .where(eq(trackedCreators.id, id))
    .returning();
  return result[0];
}

export async function updateCreatorReportId(id: string, reportId: string): Promise<TrackedCreator | undefined> {
  const result = await db
    .update(trackedCreators)
    .set({ imaiReportId: reportId })
    .where(eq(trackedCreators.id, id))
    .returning();
  return result[0];
}

export async function deleteCreator(id: string): Promise<boolean> {
  const result = await db
    .delete(trackedCreators)
    .where(eq(trackedCreators.id, id))
    .returning();
  return result.length > 0;
}

// ============= Export Operations =============

export async function exportCreatorsCSV(clientId?: string): Promise<string> {
  const creators = await getCreators(clientId);
  if (creators.length === 0) return "";

  const headers = [
    "Username",
    "Full Name",
    "Platform",
    "Source Type",
    "Source Value",
    "Discovered At",
    "Added to IMAI",
    "Likes",
    "Comments",
  ];

  const rows = creators.map((c) => [
    c.username,
    c.fullName || "",
    c.platform,
    c.sourceType,
    c.sourceValue,
    c.discoveredAt.toISOString(),
    c.addedToImai ? "Yes" : "No",
    c.engagement?.likes?.toString() || "",
    c.engagement?.comments?.toString() || "",
  ]);

  const escapeCSV = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => r.map(escapeCSV).join(","))].join("\n");
}

// ============= Settings Operations =============

export async function getSetting(key: string): Promise<string | null> {
  const result = await db.select().from(settings).where(eq(settings.key, key));
  return result[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<Setting> {
  const result = await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    })
    .returning();
  return result[0];
}

export async function getSettings(): Promise<Setting[]> {
  return db.select().from(settings);
}

export async function getImaiCredentials(): Promise<{ email: string; password: string } | null> {
  const email = await getSetting("imai_email");
  const password = await getSetting("imai_password");

  if (email && password) {
    return { email, password };
  }
  return null;
}

export async function setImaiCredentials(email: string, password: string): Promise<void> {
  await setSetting("imai_email", email);
  await setSetting("imai_password", password);
}

// ============= OpenRouter Settings =============

export interface OpenRouterSettings {
  apiKey: string;
  model: string;
}

export async function getOpenRouterSettings(): Promise<OpenRouterSettings | null> {
  const apiKey = await getSetting("openrouter_api_key");
  const model = await getSetting("openrouter_model");

  if (apiKey) {
    return {
      apiKey,
      model: model || "openai/gpt-4o-mini",
    };
  }
  return null;
}

export async function setOpenRouterSettings(apiKey: string, model: string): Promise<void> {
  await setSetting("openrouter_api_key", apiKey);
  await setSetting("openrouter_model", model);
}

// ============= IMAI API Settings =============

export async function getImaiApiKey(): Promise<string | null> {
  return getSetting("imai_api_key");
}

export async function setImaiApiKey(apiKey: string): Promise<void> {
  await setSetting("imai_api_key", apiKey);
}

export async function getImaiMode(): Promise<string> {
  return (await getSetting("imai_mode")) || "api";
}

export async function setImaiMode(mode: string): Promise<void> {
  await setSetting("imai_mode", mode);
}

export async function getShowCredits(): Promise<boolean> {
  const val = await getSetting("show_credits");
  return val !== "false"; // default true
}

export async function setShowCredits(show: boolean): Promise<void> {
  await setSetting("show_credits", String(show));
}

export async function getDefaultPlatform(): Promise<string> {
  return (await getSetting("default_platform")) || "instagram";
}

export async function setDefaultPlatform(platform: string): Promise<void> {
  await setSetting("default_platform", platform);
}

export async function getCreditWarningThreshold(): Promise<number> {
  const val = await getSetting("credit_warning_threshold");
  return val ? parseInt(val, 10) : 10;
}

export async function setCreditWarningThreshold(threshold: number): Promise<void> {
  await setSetting("credit_warning_threshold", String(threshold));
}

// ============= Discovery Tier =============

export type DiscoveryTier = "full" | "discovery" | "quick" | "location" | "push";

const TIER_PASSES: Record<string, number[]> = {
  full:      [1, 2, 3, 4],  // All passes + campaign push available
  discovery: [1, 2, 3, 4],  // All discovery passes, no push
  quick:     [1, 2, 3],     // Passes 1-3 only (no location scraping)
  location:  [4],           // Location-only
  push:      [],            // Campaign push only (no discovery)
};

export async function getDiscoveryTier(): Promise<DiscoveryTier> {
  const val = await getSetting("discovery_tier");
  if (val && val in TIER_PASSES) return val as DiscoveryTier;
  // Migrate from legacy tier values
  const legacyMode = await getSetting("imai_mode");
  if (legacyMode === "playwright") return "push";
  if (legacyMode === "hybrid") return "full";
  // Migrate old tier names
  if (val === "api_apify") return "discovery";
  if (val === "api") return "quick";
  if (val === "apify") return "location";
  return "discovery"; // new default
}

export async function setDiscoveryTier(tier: string): Promise<void> {
  await setSetting("discovery_tier", tier);
}

export async function getTierPasses(tier: string): Promise<number[]> {
  return TIER_PASSES[tier] || [1, 2, 3];
}

// ============= Apify Settings =============

export async function getApifyToken(): Promise<string | null> {
  return getSetting("apify_token");
}

export async function setApifyToken(token: string): Promise<void> {
  await setSetting("apify_token", token);
}

// ============= APIDirect Settings =============

export async function getApiDirectKey(): Promise<string | null> {
  return getSetting("apidirect_api_key");
}

export async function setApiDirectKey(key: string): Promise<void> {
  await setSetting("apidirect_api_key", key);
}

// ============= Credit / Token Tracking =============

export async function logTokenUsage(
  operation: string,
  tokensUsed: number,
  balanceAfter: number,
  opts?: { agentId?: string; clientId?: string; platform?: string; details?: Record<string, unknown> }
): Promise<CreditTransaction> {
  const result = await db
    .insert(creditTransactions)
    .values({
      operation,
      tokensUsed,
      balanceAfter,
      agentId: opts?.agentId ?? null,
      clientId: opts?.clientId ?? null,
      platform: opts?.platform ?? null,
      details: opts?.details ?? null,
    })
    .returning();
  return result[0];
}

export async function getTokenTransactions(
  limit: number = 50,
  offset: number = 0
): Promise<CreditTransaction[]> {
  return db
    .select()
    .from(creditTransactions)
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getDailyTokenSpend(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const result = await db
    .select({
      total: sqlTemplate<number>`COALESCE(SUM(${creditTransactions.tokensUsed}), 0)`,
    })
    .from(creditTransactions)
    .where(gte(creditTransactions.createdAt, startOfDay));

  return result[0]?.total ?? 0;
}

export async function getTokenBalance(): Promise<number | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  try {
    const response = await fetch(`${apiUrl}/api/imai/credits`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.credits ?? data.credits ?? null;
  } catch {
    return null;
  }
}

// ============= Creator Discovery =============

interface InstagramPost {
  postId: string;
  shortcode: string;
  creator: {
    username: string;
    fullName: string;
    profilePicUrl: string | null;
    isVerified?: boolean;
    userId?: number;
  };
  content: {
    caption: string;
    displayUrl: string;
    thumbnailUrl?: string;
  };
  engagement: {
    likes: number;
    comments: number;
  };
  timestamp: number;
  date: string;
  permalink: string;
  searchInfo?: {
    keyword: string;
    type: string;
  };
}

export async function discoverCreators(
  clientId: string,
  hashtags: string[],
  platform: "instagram" | "tiktok" | "all" = "all"
): Promise<{ discovered: number; errors: string[] }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const errors: string[] = [];
  let totalDiscovered = 0;

  // Auto-resolve provider for manual discovery too
  const provider = await resolveDiscoveryProvider();

  for (const hashtag of hashtags) {
    try {
      const cleanTag = hashtag.replace(/^#/, "");
      const searchPlatform = platform === "all" ? "instagram" : platform;
      console.log(`Searching for hashtag: #${cleanTag} on ${searchPlatform} (provider: ${provider || "none"})`);

      const endpoint = provider === "apidirect"
        ? `${apiUrl}/api/apidirect/search?query=%23${encodeURIComponent(cleanTag)}&clientId=${encodeURIComponent(clientId)}&platform=${searchPlatform}`
        : `${apiUrl}/api/instagram/search?keyword=%23${encodeURIComponent(cleanTag)}&limit=50&platform=${searchPlatform}`;

      let response = await fetch(endpoint);

      // Fallback: if APIDirect fails, try IMAI
      if (!response.ok && provider === "apidirect") {
        console.log(`APIDirect failed for #${cleanTag}, falling back to IMAI`);
        response = await fetch(
          `${apiUrl}/api/instagram/search?keyword=%23${encodeURIComponent(cleanTag)}&limit=50&platform=${searchPlatform}`
        );
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const errorMsg = errorBody?.message || response.statusText;
        errors.push(`Failed to search #${cleanTag}: ${errorMsg}`);
        continue;
      }

      const data = await response.json();

      const posts = data.data?.allPosts as InstagramPost[] | undefined;
      if (!data.success || !posts || posts.length === 0) {
        errors.push(`No results for #${cleanTag}`);
        continue;
      }

      // Get existing creators to avoid duplicates
      const existingCreators = await getCreators(clientId);
      const existingUsernames = new Set(
        existingCreators.map((c) => `${c.username.toLowerCase()}:${c.platform}`)
      );

      for (const post of posts) {
        const username = post.creator?.username || "unknown";
        const creatorPlatform = searchPlatform;
        const uniqueKey = `${username.toLowerCase()}:${creatorPlatform}`;

        // Skip if already tracked on this platform
        if (existingUsernames.has(uniqueKey)) {
          continue;
        }

        // Add creator
        await addCreator({
          clientId,
          username,
          fullName: post.creator?.fullName || null,
          profilePicUrl: post.creator?.profilePicUrl || null,
          platform: creatorPlatform,
          sourceType: "hashtag",
          sourceValue: `#${cleanTag}`,
          postId: post.postId,
          postCaption: post.content?.caption || null,
          postMediaUrl: post.content?.displayUrl || null,
          engagement: post.engagement,
          addedToImai: false,
          imaiAddedAt: null,
          platformUserId: null,
          followersCount: null,
          isVerified: post.creator?.isVerified || false,
          imaiReportId: null,
          imaiStatus: "pending",
        });

        existingUsernames.add(uniqueKey);
        totalDiscovered++;
      }
    } catch (error) {
      errors.push(`Error searching #${hashtag}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  return { discovered: totalDiscovered, errors };
}

// ============= Dashboard Metrics =============

export async function getCreatorsDiscoveredToday(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: count() })
    .from(trackedCreators)
    .where(gte(trackedCreators.discoveredAt, startOfDay));

  return result[0]?.count ?? 0;
}

export async function getCreatorsDiscoveredThisWeek(): Promise<number> {
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: count() })
    .from(trackedCreators)
    .where(gte(trackedCreators.discoveredAt, startOfWeek));

  return result[0]?.count ?? 0;
}

export async function getAgentRunsToday(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: count() })
    .from(agentLogs)
    .where(gte(agentLogs.timestamp, startOfDay));

  return result[0]?.count ?? 0;
}

export async function getLastActivityTimestamp(): Promise<Date | null> {
  const result = await db
    .select({ latest: agentLogs.timestamp })
    .from(agentLogs)
    .orderBy(desc(agentLogs.timestamp))
    .limit(1);

  return result[0]?.latest ?? null;
}
