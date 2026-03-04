import { InstagramSearchResult } from "@/types/instagram";
import { TikTokSearchResult } from "@/types/tiktok";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Response types matching backend controller responses
export interface MediaSearchResponse {
  success: boolean;
  data: {
    keyword: string;
    totalPosts: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
    posts: any[];
  };
  message: string;
}

class MediaServiceClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || error.error || `API Error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Search Instagram posts by keyword (hashtag or username) with pagination
   * GET /api/instagram/search?keyword={keyword}&page={page}&limit={limit}&clientId={clientId}
   */
  async searchIGPosts(
    keyword: string,
    options: {
      page?: number;
      limit?: number;
      clientId?: string;
    } = {}
  ): Promise<MediaSearchResponse> {
    const { page = 1, limit = 10, clientId } = options;
    const params = new URLSearchParams({
      keyword,
      page: page.toString(),
      limit: limit.toString(),
    });

    if (clientId) {
      params.append("clientId", clientId);
    }

    return this.fetch<MediaSearchResponse>(`/api/instagram/search?${params}`);
  }

  async searchTTPosts(
    keyword: string,
    options: {
      page?: number;
      limit?: number;
      clientId?: string;
    } = {}
  ): Promise<MediaSearchResponse> {
    const { page = 1, limit = 10, clientId } = options;
    const params = new URLSearchParams({
      keyword,
      page: page.toString(),
      limit: limit.toString(),
    });

    if (clientId) {
      params.append("clientId", clientId);
    }

    return this.fetch<MediaSearchResponse>(`/api/tiktok/search?${params}`);
  }
}

// Export singleton instance
export const MediaService = new MediaServiceClient(API_BASE_URL);

// Legacy export for backward compatibility
export const api = MediaService;
