"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Contact,
  Mail,
  Phone,
  Globe,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Shape returned by the contacts endpoint. */
interface ContactInfo {
  email?: string | string[];
  phone?: string | string[];
  website?: string;
  socialLinks?: Record<string, string>;
  [key: string]: unknown;
}

interface ContactInfoPopoverProps {
  username: string;
  platform: string;
}

/**
 * ContactInfoPopover -- a small popover button that lazily fetches and displays
 * a creator's contact information (email, phone, social links).
 * Results are cached so repeated opens do not re-fetch.
 */
export function ContactInfoPopover({
  username,
  platform,
}: ContactInfoPopoverProps) {
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simple in-memory cache keyed by platform+username so re-opens are instant.
  const cacheRef = useRef<Record<string, ContactInfo>>({});

  const cacheKey = `${platform}:${username}`;

  const fetchContact = useCallback(async () => {
    // Already have data for this creator -- skip fetch.
    if (cacheRef.current[cacheKey]) {
      setContactInfo(cacheRef.current[cacheKey]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ platform, username });
      const response = await fetch(
        `${API_BASE_URL}/api/imai/contacts?${params.toString()}`
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.message || `Failed to fetch contact info (${response.status})`
        );
      }

      const data: ContactInfo = await response.json();
      cacheRef.current[cacheKey] = data;
      setContactInfo(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load contact info"
      );
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, platform, username]);

  /** Normalise a value that can be a string or string[] into an array. */
  const toArray = (value: string | string[] | undefined): string[] => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };

  /** Check whether the fetched contact object contains any useful data. */
  const hasData = (info: ContactInfo | null): boolean => {
    if (!info) return false;
    const emails = toArray(info.email);
    const phones = toArray(info.phone);
    const links = info.socialLinks ? Object.keys(info.socialLinks) : [];
    return emails.length > 0 || phones.length > 0 || !!info.website || links.length > 0;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchContact}
          aria-label={`View contact info for ${username}`}
        >
          <Contact className="mr-1 h-3.5 w-3.5" />
          Contact
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">
            Contact Info{" "}
            <span className="font-normal text-muted-foreground">
              @{username}
            </span>
          </h4>

          {/* Loading */}
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* No data */}
          {!isLoading && !error && contactInfo && !hasData(contactInfo) && (
            <p className="text-sm text-muted-foreground">
              No contact information available for this creator.
            </p>
          )}

          {/* Data */}
          {!isLoading && !error && contactInfo && hasData(contactInfo) && (
            <div className="space-y-3">
              {/* Emails */}
              {toArray(contactInfo.email).length > 0 && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    Email
                  </p>
                  {toArray(contactInfo.email).map((email) => (
                    <a
                      key={email}
                      href={`mailto:${email}`}
                      className="block text-sm text-primary underline-offset-2 hover:underline"
                    >
                      {email}
                    </a>
                  ))}
                </div>
              )}

              {/* Phones */}
              {toArray(contactInfo.phone).length > 0 && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    Phone
                  </p>
                  {toArray(contactInfo.phone).map((phone) => (
                    <a
                      key={phone}
                      href={`tel:${phone}`}
                      className="block text-sm text-primary underline-offset-2 hover:underline"
                    >
                      {phone}
                    </a>
                  ))}
                </div>
              )}

              {/* Website */}
              {contactInfo.website && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    Website
                  </p>
                  <a
                    href={
                      contactInfo.website.startsWith("http")
                        ? contactInfo.website
                        : `https://${contactInfo.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
                  >
                    {contactInfo.website}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Social links */}
              {contactInfo.socialLinks &&
                Object.keys(contactInfo.socialLinks).length > 0 && (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <ExternalLink className="h-3 w-3" />
                      Social Links
                    </p>
                    <ul className="space-y-1">
                      {Object.entries(contactInfo.socialLinks).map(
                        ([name, url]) => (
                          <li key={name}>
                            <a
                              href={
                                url.startsWith("http") ? url : `https://${url}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm capitalize text-primary underline-offset-2 hover:underline"
                            >
                              {name}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
            </div>
          )}

          {/* Idle state -- only visible on first render before clicking */}
          {!isLoading && !error && !contactInfo && (
            <p className="text-sm text-muted-foreground">
              Click to load contact information.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
