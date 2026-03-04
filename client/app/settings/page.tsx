"use client";

import { useState, useTransition, useEffect } from "react";
import { DashboardLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getClients,
  getAgents,
  getCreators,
  getImaiCredentials,
  setImaiCredentials,
  getOpenRouterSettings,
  setOpenRouterSettings,
  getSetting,
  setSetting,
  getImaiApiKey,
  setImaiApiKey,
  getImaiMode,
  getShowCredits,
  setShowCredits as setShowCreditsAction,
  getDefaultPlatform,
  setDefaultPlatform as setDefaultPlatformAction,
  getCreditWarningThreshold,
  setCreditWarningThreshold as setCreditWarningThresholdAction,
  getDiscoveryTier,
  setDiscoveryTier as setDiscoveryTierAction,
  getApifyToken,
  setApifyToken as setApifyTokenAction,
  getApiDirectKey,
  setApiDirectKey as setApiDirectKeyAction,
} from "@/db/queries";
import {
  Key,
  Coins,
  Globe,
  Bell,
  Database,
  Bot,
  ChevronDown,
  Check,
  Loader2,
  AlertTriangle,
  Zap,
  Download,
  History,
  Layers,
} from "lucide-react";
import { CreditBalanceWidget } from "@/components/credits/credit-balance-widget";
import { useToast } from "@/hooks/use-toast";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Available OpenRouter models for AI vision
const OPENROUTER_MODELS = [
  {
    value: "openai/gpt-4o-mini",
    label: "GPT-4o Mini (Recommended)",
    description: "Fast and cost-effective",
  },
  {
    value: "openai/gpt-4o",
    label: "GPT-4o",
    description: "Most capable, higher cost",
  },
  {
    value: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    description: "Excellent reasoning",
  },
  {
    value: "anthropic/claude-3-haiku",
    label: "Claude 3 Haiku",
    description: "Fast and affordable",
  },
  {
    value: "google/gemini-2.0-flash-001",
    label: "Gemini 2.0 Flash",
    description: "Google's latest fast model",
  },
];

// Tier requirements — used for validation and display
const TIER_REQUIREMENTS: Record<
  string,
  { label: string; passes: string; description: string }
> = {
  full: {
    label: "Full Discovery + Push",
    passes: "Passes 1-4 + campaign push",
    description: "All discovery passes plus Playwright campaign automation",
  },
  discovery: {
    label: "Discovery Only (Recommended)",
    passes: "Passes 1-4",
    description: "Hashtag, mention, brand search + location scraping",
  },
  quick: {
    label: "Quick Discovery",
    passes: "Passes 1-3",
    description: "Hashtag, mention, and brand search (no location scraping)",
  },
  location: {
    label: "Location Only",
    passes: "Pass 4 only",
    description: "Location-based Instagram scraping via Apify",
  },
  push: {
    label: "Campaign Push Only",
    passes: "No discovery — push only",
    description: "Only push existing tracked creators to IMAI campaigns",
  },
};

export default function SettingsPage() {
  // ---------- IMAI API Key ----------
  const [imaiApiKey, setImaiApiKeyState] = useState("");
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(true);

  // ---------- Discovery Tier ----------
  const [discoveryTier, setDiscoveryTierState] = useState("api");

  // ---------- Apify Token ----------
  const [apifyToken, setApifyTokenState] = useState("");
  const [isSavingApifyToken, setIsSavingApifyToken] = useState(false);
  const [apifyTokenSaved, setApifyTokenSaved] = useState(false);

  // ---------- APIDirect ----------
  const [apiDirectKey, setApiDirectKeyState] = useState("");
  const [isSavingApiDirectKey, setIsSavingApiDirectKey] = useState(false);
  const [apiDirectKeySaved, setApiDirectKeySaved] = useState(false);
  const [isTestingApiDirect, setIsTestingApiDirect] = useState(false);
  const [apiDirectTestResult, setApiDirectTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // ---------- IMAI Test Connection ----------
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // ---------- Apify Test Connection ----------
  const [isTestingApify, setIsTestingApify] = useState(false);
  const [apifyTestResult, setApifyTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // ---------- Token Balance ----------
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // ---------- Credit Display ----------
  const [showCredits, setShowCreditsState] = useState(true);
  const [creditWarningThreshold, setCreditWarningThresholdState] = useState(10);

  // ---------- Platform ----------
  const [defaultPlatform, setDefaultPlatformState] = useState("instagram");

  // ---------- Notifications ----------
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoRunEnabled, setAutoRunEnabled] = useState(true);

  // ---------- Legacy IMAI Credentials ----------
  const [imaiEmail, setImaiEmail] = useState("");
  const [imaiPassword, setImaiPassword] = useState("");
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(true);

  // ---------- OpenRouter ----------
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [openRouterModel, setOpenRouterModel] = useState("openai/gpt-4o-mini");
  const [isLoadingOpenRouter, setIsLoadingOpenRouter] = useState(true);
  const [isSavingOpenRouter, setIsSavingOpenRouter] = useState(false);
  const [openRouterSaved, setOpenRouterSaved] = useState(false);

  // ---------- Legacy section expand ----------
  const [legacyExpanded, setLegacyExpanded] = useState(false);

  // ---------- Token History ----------
  const [tokenHistory, setTokenHistory] = useState<
    { id: string; operation: string; tokens_used: number; created_at: string }[]
  >([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [dailySpend, setDailySpend] = useState(0);

  // ---------- Export ----------
  const [isPending, startTransition] = useTransition();

  // ---------- Toast ----------
  const { toast } = useToast();

  // ---------- Derived configuration status ----------
  const isImaiConfigured = imaiApiKey.trim().length > 0;
  const isApifyConfigured = apifyToken.trim().length > 0;
  const isApiDirectConfigured = apiDirectKey.trim().length > 0;
  const isLegacyConfigured =
    imaiEmail.trim().length > 0 && imaiPassword.trim().length > 0;

  // ========== Load settings on mount ==========

  useEffect(() => {
    const loadAllSettings = async () => {
      try {
        const apiKey = await getImaiApiKey();
        if (apiKey) setImaiApiKeyState(apiKey);
        setIsLoadingApiKey(false);

        const tier = await getDiscoveryTier();
        setDiscoveryTierState(tier);

        const apToken = await getApifyToken();
        if (apToken) setApifyTokenState(apToken);

        const adKey = await getApiDirectKey();
        if (adKey) setApiDirectKeyState(adKey);

        const credits = await getShowCredits();
        setShowCreditsState(credits);

        const threshold = await getCreditWarningThreshold();
        setCreditWarningThresholdState(threshold);

        const platform = await getDefaultPlatform();
        setDefaultPlatformState(platform);

        const notifSetting = await getSetting("notifications_enabled");
        const autoRunSetting = await getSetting("auto_run_enabled");
        if (notifSetting !== null)
          setNotificationsEnabled(notifSetting === "true");
        if (autoRunSetting !== null)
          setAutoRunEnabled(autoRunSetting === "true");

        const credentials = await getImaiCredentials();
        if (credentials) {
          setImaiEmail(credentials.email);
          setImaiPassword(credentials.password);
        }
        setIsLoadingCredentials(false);

        const orSettings = await getOpenRouterSettings();
        if (orSettings) {
          setOpenRouterKey(orSettings.apiKey);
          setOpenRouterModel(orSettings.model);
        }
        setIsLoadingOpenRouter(false);
      } catch (error) {
        console.error("Error loading settings:", error);
        setIsLoadingApiKey(false);
        setIsLoadingCredentials(false);
        setIsLoadingOpenRouter(false);
      }
    };

    loadAllSettings();
  }, []);

  useEffect(() => {
    fetchTokenBalance();
    fetchTokenHistory();
  }, []);

  // ========== Handlers ==========

  const fetchTokenBalance = async () => {
    setIsLoadingBalance(true);
    setBalanceError(null);
    try {
      const response = await fetch(`${apiUrl}/api/imai/credits`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      const credits = data?.data?.credits ?? data?.credits ?? data?.balance;
      if (credits !== undefined) {
        setTokenBalance(credits);
      } else {
        setTokenBalance(null);
        setBalanceError("Unexpected response format");
      }
    } catch (error) {
      setBalanceError(
        error instanceof Error ? error.message : "Failed to fetch balance"
      );
      setTokenBalance(null);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const fetchTokenHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`${apiUrl}/api/imai/token-history?limit=20`);
      if (response.ok) {
        const data = await response.json();
        setTokenHistory(data.data?.transactions ?? []);
        setDailySpend(data.data?.dailySpend ?? 0);
      }
    } catch (error) {
      console.error("Error fetching token history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!imaiApiKey.trim()) {
      toast({ title: "Missing API key", description: "Please enter an API key", variant: "destructive" });
      return;
    }
    setIsSavingApiKey(true);
    setApiKeySaved(false);
    try {
      await setImaiApiKey(imaiApiKey);
      setApiKeySaved(true);
      toast({ title: "Saved", description: "IMAI API key saved successfully" });
      setTimeout(() => setApiKeySaved(false), 3000);
    } catch (error) {
      console.error("Error saving IMAI API key:", error);
      toast({ title: "Error", description: "Failed to save API key. Please try again.", variant: "destructive" });
    } finally {
      setIsSavingApiKey(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(`${apiUrl}/api/imai/test`);
      const data = await response.json();
      if (response.ok && data.success) {
        setTestResult({ success: true, message: data.message || "Connected" });
        fetchTokenBalance();
      } else {
        setTestResult({
          success: false,
          message: data.message || data.error || "Connection failed",
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to reach backend",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveApifyToken = async () => {
    if (!apifyToken.trim()) {
      toast({ title: "Missing token", description: "Please enter an Apify API token", variant: "destructive" });
      return;
    }
    setIsSavingApifyToken(true);
    setApifyTokenSaved(false);
    try {
      await setApifyTokenAction(apifyToken);
      setApifyTokenSaved(true);
      toast({ title: "Saved", description: "Apify token saved successfully" });
      setTimeout(() => setApifyTokenSaved(false), 3000);
    } catch (error) {
      console.error("Error saving Apify token:", error);
      toast({ title: "Error", description: "Failed to save Apify token", variant: "destructive" });
    } finally {
      setIsSavingApifyToken(false);
    }
  };

  const handleTestApifyConnection = async () => {
    setIsTestingApify(true);
    setApifyTestResult(null);
    try {
      const response = await fetch(`${apiUrl}/api/apify/test`);
      const data = await response.json();
      if (response.ok && data.success) {
        const info = data.data;
        setApifyTestResult({
          success: true,
          message: `Connected as ${info?.username || "unknown"} (${info?.plan || "unknown"} plan)`,
        });
      } else {
        setApifyTestResult({
          success: false,
          message: data.message || data.error || "Connection failed",
        });
      }
    } catch (error) {
      setApifyTestResult({
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to reach backend",
      });
    } finally {
      setIsTestingApify(false);
    }
  };

  const handleSaveApiDirectKey = async () => {
    if (!apiDirectKey.trim()) {
      toast({ title: "Missing API key", description: "Please enter an APIDirect API key", variant: "destructive" });
      return;
    }
    setIsSavingApiDirectKey(true);
    setApiDirectKeySaved(false);
    try {
      await setApiDirectKeyAction(apiDirectKey);
      setApiDirectKeySaved(true);
      toast({ title: "Saved", description: "APIDirect API key saved successfully" });
      setTimeout(() => setApiDirectKeySaved(false), 3000);
    } catch (error) {
      console.error("Error saving APIDirect key:", error);
      toast({ title: "Error", description: "Failed to save API key", variant: "destructive" });
    } finally {
      setIsSavingApiDirectKey(false);
    }
  };

  const handleTestApiDirectConnection = async () => {
    setIsTestingApiDirect(true);
    setApiDirectTestResult(null);
    try {
      const response = await fetch(`${apiUrl}/api/apidirect/test`);
      const data = await response.json();
      if (response.ok && data.success) {
        setApiDirectTestResult({
          success: true,
          message: `Connected — ${data.data?.platforms?.length || 0} platforms available`,
        });
      } else {
        setApiDirectTestResult({
          success: false,
          message: data.message || data.error || "Connection failed",
        });
      }
    } catch (error) {
      setApiDirectTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Failed to reach backend",
      });
    } finally {
      setIsTestingApiDirect(false);
    }
  };

  const handleTierChange = async (newTier: string) => {
    const req = TIER_REQUIREMENTS[newTier];
    if (!req) return;

    // Warn (but don't block) if no discovery providers are configured
    const needsDiscovery = ["full", "discovery", "quick"].includes(newTier);
    const needsLocation = ["full", "discovery", "location"].includes(newTier);
    const needsLegacy = newTier === "full";

    const warnings: string[] = [];
    if (needsDiscovery && !isApiDirectConfigured && !isImaiConfigured) {
      warnings.push("No discovery provider (APIDirect or IMAI) is configured — Passes 1-3 will be skipped");
    }
    if (needsLocation && !isApifyConfigured) {
      warnings.push("Apify is not configured — Pass 4 (location) will be skipped");
    }
    if (needsLegacy && !isLegacyConfigured) {
      warnings.push("Playwright credentials not configured — campaign push will be unavailable");
    }

    if (warnings.length > 0) {
      toast({
        title: "Heads up",
        description: warnings.join(". ") + ". Configure the API keys below to enable them.",
        variant: "default",
      });
    }

    setDiscoveryTierState(newTier);
    try {
      await setDiscoveryTierAction(newTier);
      toast({ title: "Updated", description: `Discovery tier set to ${req.label}` });
    } catch (error) {
      console.error("Error saving discovery tier:", error);
      toast({ title: "Error", description: "Failed to update discovery tier", variant: "destructive" });
    }
  };

  const handleSaveCredentials = async () => {
    if (!imaiEmail || !imaiPassword) {
      toast({ title: "Missing credentials", description: "Please enter both email and password", variant: "destructive" });
      return;
    }
    setIsSavingCredentials(true);
    setCredentialsSaved(false);
    try {
      await setImaiCredentials(imaiEmail, imaiPassword);
      setCredentialsSaved(true);
      toast({ title: "Saved", description: "Credentials saved successfully" });
      setTimeout(() => setCredentialsSaved(false), 3000);
    } catch (error) {
      console.error("Error saving IMAI credentials:", error);
      toast({ title: "Error", description: "Failed to save credentials. Please try again.", variant: "destructive" });
    } finally {
      setIsSavingCredentials(false);
    }
  };

  const handleSaveOpenRouter = async () => {
    if (!openRouterKey) {
      toast({ title: "Missing API key", description: "Please enter an OpenRouter API key", variant: "destructive" });
      return;
    }
    setIsSavingOpenRouter(true);
    setOpenRouterSaved(false);
    try {
      await setOpenRouterSettings(openRouterKey, openRouterModel);
      setOpenRouterSaved(true);
      toast({ title: "Saved", description: "AI settings saved successfully" });
      setTimeout(() => setOpenRouterSaved(false), 3000);
    } catch (error) {
      console.error("Error saving OpenRouter settings:", error);
      toast({ title: "Error", description: "Failed to save OpenRouter settings. Please try again.", variant: "destructive" });
    } finally {
      setIsSavingOpenRouter(false);
    }
  };

  const handleExportAll = async () => {
    startTransition(async () => {
      const [clients, agents, creators] = await Promise.all([
        getClients(),
        getAgents(),
        getCreators(),
      ]);
      const data = {
        clients,
        agents,
        creators,
        exportedAt: new Date().toISOString(),
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `imai-pro-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const getBalanceBadgeVariant = (): "success" | "warning" | "destructive" => {
    if (tokenBalance === null) return "warning";
    if (tokenBalance > 50) return "success";
    if (tokenBalance > creditWarningThreshold) return "warning";
    return "destructive";
  };

  // ========== Render ==========

  return (
    <DashboardLayout
      title="Settings"
      description="Configure your application settings"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {/* ===== Section 1: Discovery Tier ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              <CardTitle>Discovery Tier</CardTitle>
            </div>
            <CardDescription>
              Choose which discovery passes to run. The system automatically
              selects the best available provider for each pass based on your
              configured API keys below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="discoveryTier">Active Tier</Label>
              <Select
                value={discoveryTier}
                onValueChange={handleTierChange}
                disabled={isLoadingApiKey}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Discovery + Push</SelectItem>
                  <SelectItem value="discovery">Discovery Only (Recommended)</SelectItem>
                  <SelectItem value="quick">Quick Discovery</SelectItem>
                  <SelectItem value="location">Location Only</SelectItem>
                  <SelectItem value="push">Campaign Push Only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {TIER_REQUIREMENTS[discoveryTier]?.passes || "Select a tier"}
                {" — "}
                {TIER_REQUIREMENTS[discoveryTier]?.description || ""}
              </p>
            </div>

            <Separator />

            {/* Provider status row */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Provider Status</p>
              <p className="text-xs text-muted-foreground">
                Passes 1-3 use the first available: APIDirect → IMAI → skip. Pass 4: Apify. Push: Playwright.
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">APIDirect:</span>
                  <Badge variant={isApiDirectConfigured ? "success" : "warning"}>
                    {isApiDirectConfigured ? "Configured" : "Not configured"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">IMAI API:</span>
                  <Badge variant={isImaiConfigured ? "success" : "warning"}>
                    {isImaiConfigured ? "Configured" : "Not configured"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Apify:</span>
                  <Badge variant={isApifyConfigured ? "success" : "warning"}>
                    {isApifyConfigured ? "Configured" : "Not configured"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-muted-foreground">Legacy:</span>
                  <Badge variant={isLegacyConfigured ? "success" : "warning"}>
                    {isLegacyConfigured ? "Configured" : "Not configured"}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ===== Section 2: IMAI API Configuration ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              <CardTitle>IMAI API</CardTitle>
              <Badge variant={isImaiConfigured ? "success" : "warning"}>
                {isImaiConfigured ? "Configured" : "Not configured"}
              </Badge>
            </div>
            <CardDescription>
              Required for hashtag search, mention search, and sponsored posts
              discovery (Passes 1-3).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingApiKey ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading API settings...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="imaiApiKey">API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="imaiApiKey"
                      type="password"
                      value={imaiApiKey}
                      onChange={(e) => setImaiApiKeyState(e.target.value)}
                      placeholder="Enter your IMAI API key"
                      className="flex-1"
                    />
                    <Button
                      onClick={handleSaveApiKey}
                      disabled={isSavingApiKey}
                      className={
                        apiKeySaved ? "bg-green-600 hover:bg-green-600" : ""
                      }
                    >
                      {isSavingApiKey ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : apiKeySaved ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Test Connection & Token Balance */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Zap className="mr-2 h-4 w-4" />
                        Test Connection
                      </>
                    )}
                  </Button>

                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-muted-foreground" />
                    {isLoadingBalance ? (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading balance...
                      </span>
                    ) : balanceError ? (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {balanceError}
                      </span>
                    ) : tokenBalance !== null ? (
                      <Badge variant={getBalanceBadgeVariant()}>
                        {tokenBalance} credits
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No balance data
                      </span>
                    )}
                  </div>
                </div>

                {testResult && (
                  <div
                    className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
                      testResult.success
                        ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                        : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                    }`}
                  >
                    {testResult.success ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {testResult.message}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ===== Section 2b: APIDirect Configuration ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              <CardTitle>APIDirect</CardTitle>
              <Badge variant={isApiDirectConfigured ? "success" : "warning"}>
                {isApiDirectConfigured ? "Configured" : "Not configured"}
              </Badge>
            </div>
            <CardDescription>
              Primary provider for hashtag, mention, and brand discovery
              (Passes 1-3). Pay-per-request at $0.006/search with 50 free
              monthly requests per endpoint. Get your key from{" "}
              <a
                href="https://apidirect.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                apidirect.io
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiDirectKey">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="apiDirectKey"
                  type="password"
                  value={apiDirectKey}
                  onChange={(e) => setApiDirectKeyState(e.target.value)}
                  placeholder="ak_live_..."
                  className="flex-1"
                />
                <Button
                  onClick={handleSaveApiDirectKey}
                  disabled={isSavingApiDirectKey}
                  className={
                    apiDirectKeySaved ? "bg-green-600 hover:bg-green-600" : ""
                  }
                >
                  {isSavingApiDirectKey ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : apiDirectKeySaved ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                onClick={handleTestApiDirectConnection}
                disabled={isTestingApiDirect}
              >
                {isTestingApiDirect ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
            </div>

            {apiDirectTestResult && (
              <div
                className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
                  apiDirectTestResult.success
                    ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                    : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                }`}
              >
                {apiDirectTestResult.success ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {apiDirectTestResult.message}
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Falls back to the APIDIRECT_API_KEY environment variable if not
              set here.
            </p>
          </CardContent>
        </Card>

        {/* ===== Section 3: Apify Configuration ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              <CardTitle>Apify</CardTitle>
              <Badge variant={isApifyConfigured ? "success" : "warning"}>
                {isApifyConfigured ? "Configured" : "Not configured"}
              </Badge>
            </div>
            <CardDescription>
              Required for location-based Instagram scraping (Pass 4). Get your
              token from{" "}
              <a
                href="https://console.apify.com/account/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                console.apify.com
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apifyToken">API Token</Label>
              <div className="flex gap-2">
                <Input
                  id="apifyToken"
                  type="password"
                  value={apifyToken}
                  onChange={(e) => setApifyTokenState(e.target.value)}
                  placeholder="apify_api_..."
                  className="flex-1"
                />
                <Button
                  onClick={handleSaveApifyToken}
                  disabled={isSavingApifyToken}
                  className={
                    apifyTokenSaved ? "bg-green-600 hover:bg-green-600" : ""
                  }
                >
                  {isSavingApifyToken ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : apifyTokenSaved ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                onClick={handleTestApifyConnection}
                disabled={isTestingApify}
              >
                {isTestingApify ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
            </div>

            {apifyTestResult && (
              <div
                className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
                  apifyTestResult.success
                    ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                    : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
                }`}
              >
                {apifyTestResult.success ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {apifyTestResult.message}
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Falls back to the APIFY_TOKEN environment variable if not set
              here.
            </p>
          </CardContent>
        </Card>

        {/* ===== Section 4: Legacy / Playwright Settings ===== */}
        <Card>
          <CardHeader>
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setLegacyExpanded(!legacyExpanded)}
            >
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">
                      Legacy / Playwright
                    </CardTitle>
                    <Badge
                      variant={isLegacyConfigured ? "success" : "warning"}
                    >
                      {isLegacyConfigured ? "Configured" : "Not configured"}
                    </Badge>
                  </div>
                  <CardDescription className="mt-1">
                    IMAI browser credentials and AI configuration for campaign
                    push automation
                  </CardDescription>
                </div>
              </div>
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground transition-transform ${
                  legacyExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </CardHeader>
          {legacyExpanded && (
            <CardContent className="space-y-6">
              {/* IMAI Credentials */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold">
                  IMAI Browser Credentials
                </h4>
                {isLoadingCredentials ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading credentials...
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="imaiEmail">IMAI Email</Label>
                      <Input
                        id="imaiEmail"
                        type="email"
                        value={imaiEmail}
                        onChange={(e) => setImaiEmail(e.target.value)}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="imaiPassword">IMAI Password</Label>
                      <Input
                        id="imaiPassword"
                        type="password"
                        value={imaiPassword}
                        onChange={(e) => setImaiPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                    <Button
                      onClick={handleSaveCredentials}
                      disabled={isSavingCredentials}
                      className={
                        credentialsSaved
                          ? "bg-green-600 hover:bg-green-600"
                          : ""
                      }
                    >
                      {isSavingCredentials ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : credentialsSaved ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Saved!
                        </>
                      ) : (
                        "Save Credentials"
                      )}
                    </Button>
                  </>
                )}
              </div>

              <Separator />

              {/* OpenRouter AI Settings */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold">AI Configuration</h4>
                <p className="text-sm text-muted-foreground">
                  Configure the AI model used for intelligent page analysis
                  during Playwright automation. Get your API key from{" "}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    openrouter.ai/keys
                  </a>
                </p>
                {isLoadingOpenRouter ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading AI settings...
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="openRouterKey">
                        OpenRouter API Key
                      </Label>
                      <Input
                        id="openRouterKey"
                        type="password"
                        value={openRouterKey}
                        onChange={(e) => setOpenRouterKey(e.target.value)}
                        placeholder="sk-or-v1-..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="openRouterModel">AI Model</Label>
                      <Select
                        value={openRouterModel}
                        onValueChange={setOpenRouterModel}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                          {OPENROUTER_MODELS.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              <div className="flex flex-col">
                                <span>{model.label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {model.description}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        The AI analyzes screenshots to verify each step of the
                        automation
                      </p>
                    </div>
                    <Button
                      onClick={handleSaveOpenRouter}
                      disabled={isSavingOpenRouter}
                      className={
                        openRouterSaved
                          ? "bg-green-600 hover:bg-green-600"
                          : ""
                      }
                    >
                      {isSavingOpenRouter ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : openRouterSaved ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Saved!
                        </>
                      ) : (
                        "Save AI Settings"
                      )}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* ===== Section 5: Credit Display ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              <CardTitle>Credit Display</CardTitle>
            </div>
            <CardDescription>
              Configure how credit information is displayed across the
              application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Show Credits</p>
                <p className="text-sm text-muted-foreground">
                  Display credit balance in the dashboard and sidebar
                </p>
              </div>
              <Switch
                checked={showCredits}
                onCheckedChange={async (checked) => {
                  setShowCreditsState(checked);
                  try {
                    await setShowCreditsAction(checked);
                  } catch (error) {
                    console.error("Error saving show credits setting:", error);
                  }
                }}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="creditThreshold">Warning Threshold</Label>
              <Input
                id="creditThreshold"
                type="number"
                min={0}
                value={creditWarningThreshold}
                onChange={async (e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 0) {
                    setCreditWarningThresholdState(val);
                    try {
                      await setCreditWarningThresholdAction(val);
                    } catch (error) {
                      console.error("Error saving threshold:", error);
                    }
                  }
                }}
                className="max-w-[200px]"
              />
              <p className="text-sm text-muted-foreground">
                Show a red warning badge when credits fall at or below this
                number.
              </p>
            </div>

            <Separator />

            <CreditBalanceWidget warningThreshold={creditWarningThreshold} />
          </CardContent>
        </Card>

        {/* ===== Section 6: Platform Settings ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              <CardTitle>Platform Settings</CardTitle>
            </div>
            <CardDescription>
              Configure default platform preferences for creator discovery.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="defaultPlatform">Default Platform</Label>
              <Select
                value={defaultPlatform}
                onValueChange={async (value) => {
                  setDefaultPlatformState(value);
                  try {
                    await setDefaultPlatformAction(value);
                  } catch (error) {
                    console.error("Error saving default platform:", error);
                  }
                }}
              >
                <SelectTrigger className="max-w-[300px]">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                The default social platform used when creating new clients and
                searching for creators.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ===== Section 7: Notifications ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <CardTitle>Notifications</CardTitle>
            </div>
            <CardDescription>
              Configure how you receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Receive notifications when agents find new creators
                </p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={async (checked) => {
                  setNotificationsEnabled(checked);
                  try {
                    await setSetting(
                      "notifications_enabled",
                      String(checked)
                    );
                  } catch (error) {
                    console.error(
                      "Error saving notification setting:",
                      error
                    );
                  }
                }}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Auto-run Agents</p>
                <p className="text-sm text-muted-foreground">
                  Automatically run agents at scheduled intervals
                </p>
              </div>
              <Switch
                checked={autoRunEnabled}
                onCheckedChange={async (checked) => {
                  setAutoRunEnabled(checked);
                  try {
                    await setSetting("auto_run_enabled", String(checked));
                  } catch (error) {
                    console.error("Error saving auto-run setting:", error);
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* ===== Section 8: Token Usage History ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5" />
                <CardTitle>Token Usage</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {dailySpend > 0 && (
                  <Badge variant="secondary">
                    {dailySpend.toFixed(2)} tokens today
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchTokenHistory}
                  disabled={isLoadingHistory}
                >
                  {isLoadingHistory ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Refresh"
                  )}
                </Button>
              </div>
            </div>
            <CardDescription>
              Recent IMAI API token transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <div className="flex items-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading token history...
              </div>
            ) : tokenHistory.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground text-center">
                No token transactions recorded yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {tokenHistory.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-mono text-xs">
                        {tx.operation.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="font-mono tabular-nums">
                      {Number(tx.tokens_used).toFixed(2)} tokens
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ===== Section 9: Data Management ===== */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <CardTitle>Data Management</CardTitle>
            </div>
            <CardDescription>Export your application data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <Button
                variant="outline"
                onClick={handleExportAll}
                disabled={isPending}
              >
                <Download className="mr-2 h-4 w-4" />
                Export All Data
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ===== Section 10: About ===== */}
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong>IMAI Pro</strong> - Influencer Marketing Automation
                Platform
              </p>
              <p>Version 1.0.0</p>
              <p>
                Built with Next.js, TypeScript, Tailwind CSS, and ShadCN UI
              </p>
              <p className="text-green-600">
                Database: Neon Postgres with Drizzle ORM
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
