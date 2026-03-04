"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Plus, MapPin, Loader2 } from "lucide-react";
import type { GeoLocation } from "@/db/schema";

interface TrackingConfigProps {
  platform: "instagram" | "facebook" | "tiktok";
  handle: string;
  hashtags: string[];
  locations?: GeoLocation[];
  onHandleChange: (value: string) => void;
  onHashtagsChange: (value: string[]) => void;
  onLocationsChange?: (value: GeoLocation[]) => void;
  showLocations?: boolean;
}

interface LocationResult {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

export function TrackingConfig({
  platform,
  handle,
  hashtags,
  locations = [],
  onHandleChange,
  onHashtagsChange,
  onLocationsChange,
  showLocations = false,
}: TrackingConfigProps) {
  const [hashtagInput, setHashtagInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [apifyAvailable, setApifyAvailable] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiUrl = typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
    : "";

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced location search
  const searchLocations = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (query.length < 2) {
        setLocationResults([]);
        setShowDropdown(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const res = await fetch(
            `${apiUrl}/api/imai/dict/geos?q=${encodeURIComponent(query)}&limit=8`
          );
          if (!res.ok) {
            setLocationResults([]);
            setShowDropdown(false);
            return;
          }
          const data = await res.json();
          if (data.success && Array.isArray(data.data)) {
            const mapped: LocationResult[] = data.data.map((g: { id: number; name: string; title?: string }) => ({
              id: String(g.id),
              name: g.name,
              address: g.title || g.name,
              lat: null,
              lng: null,
            }));
            setLocationResults(mapped);
            setShowDropdown(mapped.length > 0);
          }
        } catch {
          setLocationResults([]);
          setShowDropdown(false);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [apiUrl]
  );

  const addHashtag = () => {
    if (hashtagInput.trim()) {
      const tag = hashtagInput.trim().replace(/^#/, "");
      if (!hashtags.includes(tag)) {
        onHashtagsChange([...hashtags, tag]);
      }
      setHashtagInput("");
    }
  };

  const removeHashtag = (tag: string) => {
    onHashtagsChange(hashtags.filter((h) => h !== tag));
  };

  const selectLocation = (loc: LocationResult) => {
    if (!onLocationsChange) return;
    const geo: GeoLocation = { id: loc.id, name: loc.name };
    if (!locations.some((l) => l.id === geo.id)) {
      onLocationsChange([...locations, geo]);
    }
    setLocationInput("");
    setShowDropdown(false);
    setLocationResults([]);
  };

  // Fallback: add plain text location (when Apify is not configured)
  const addPlainLocation = () => {
    if (locationInput.trim() && onLocationsChange) {
      const geo: GeoLocation = { id: "", name: locationInput.trim() };
      if (!locations.some((l) => l.name === geo.name)) {
        onLocationsChange([...locations, geo]);
      }
      setLocationInput("");
    }
  };

  const removeLocation = (loc: GeoLocation) => {
    if (onLocationsChange) {
      onLocationsChange(
        locations.filter((l) => !(l.id === loc.id && l.name === loc.name))
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter") {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="space-y-6">
      {/* Handle */}
      <div className="space-y-2">
        <Label htmlFor={`${platform}-handle`}>@Handle to Monitor</Label>
        <Input
          id={`${platform}-handle`}
          value={handle}
          onChange={(e) => onHandleChange(e.target.value.replace(/^@/, ""))}
          placeholder={`${platform} username (without @)`}
        />
        <p className="text-sm text-muted-foreground">
          Track mentions of @{handle || "username"}
        </p>
      </div>

      {/* Hashtags */}
      <div className="space-y-2">
        <Label>Hashtags to Track</Label>
        <div className="flex gap-2">
          <Input
            value={hashtagInput}
            onChange={(e) => setHashtagInput(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, addHashtag)}
            placeholder="Enter hashtag (without #)"
          />
          <Button type="button" onClick={addHashtag} size="icon">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {hashtags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {hashtags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                #{tag}
                <button
                  type="button"
                  onClick={() => removeHashtag(tag)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Locations */}
      {showLocations && (
        <div className="space-y-2">
          <Label>Locations to Track</Label>
          <p className="text-sm text-muted-foreground">
            Search for cities and regions to discover local creators
          </p>
          <div className="relative" ref={dropdownRef}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  value={locationInput}
                  onChange={(e) => {
                    setLocationInput(e.target.value);
                    if (apifyAvailable) {
                      searchLocations(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (!apifyAvailable) {
                      handleKeyDown(e, addPlainLocation);
                    }
                  }}
                  placeholder={
                    apifyAvailable
                      ? "Search cities or regions..."
                      : "Enter location name"
                  }
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              {!apifyAvailable && (
                <Button type="button" onClick={addPlainLocation} size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Autocomplete dropdown */}
            {showDropdown && locationResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                <ul className="max-h-60 overflow-auto py-1">
                  {locationResults.map((loc) => (
                    <li key={loc.id}>
                      <button
                        type="button"
                        onClick={() => selectLocation(loc)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{loc.name}</div>
                          {loc.address && (
                            <div className="text-xs text-muted-foreground">
                              {loc.address}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {locations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {locations.map((loc) => (
                <Badge
                  key={`${loc.id}-${loc.name}`}
                  variant="secondary"
                  className="gap-1"
                >
                  <MapPin className="h-3 w-3" />
                  {loc.name}
                  {!loc.id && (
                    <span className="text-xs text-yellow-600" title="Update via search to enable location discovery">
                      (no ID)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeLocation(loc)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {locations.length >= 5 && (
            <p className="text-xs text-muted-foreground">
              Maximum 5 locations per platform
            </p>
          )}
        </div>
      )}
    </div>
  );
}
