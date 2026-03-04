# Instagram Search API - Testing Guide

**Note:** This API now uses `instagram-private-api` for better reliability and features.

## Setup Instructions

### 1. Create .env File

Create a `.env` file in the backend directory with your Instagram credentials:

```env
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password
PORT=4000
NODE_ENV=development
```

**⚠️ IMPORTANT:**
- Use a dedicated Instagram account, NOT your personal account
- The account should NOT have 2FA (Two-Factor Authentication) enabled
- This uses an unofficial API and may flag your account

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Server

```bash
npm run dev
```

The server should start on http://localhost:4000

---

## API Endpoints

### 1. Test Connection

Test if Instagram login is working:

```bash
curl http://localhost:4000/api/instagram/test
```

**Response:**
```json
{
  "success": true,
  "message": "Instagram connection successful",
  "timestamp": "2026-01-20T12:00:00.000Z"
}
```

---

### 2. Search Posts by Keyword

Search for posts by hashtag or mention:

```bash
curl "http://localhost:4000/api/instagram/search?keyword=avneetkaur_13"
```

**This will search for:**
- Posts with hashtag `#avneetkaur_13`
- Posts from user `@avneetkaur_13`

**Response:**
```json
{
  "success": true,
  "data": {
    "keyword": "avneetkaur_13",
    "totalPosts": 125,
    "hashtagResults": {
      "count": 75,
      "posts": [
        {
          "postId": "1234567890",
          "shortcode": "CXyz123",
          "content": {
            "caption": "Post caption text...",
            "mediaType": "GraphImage",
            "displayUrl": "https://...",
            "thumbnailUrl": "https://...",
            "isVideo": false,
            "videoUrl": null
          },
          "creator": {
            "userId": "987654321",
            "username": "creator_username",
            "fullName": "Creator Full Name",
            "profilePicUrl": "https://...",
            "isVerified": false,
            "isPrivate": false
          },
          "timestamp": 1705756800,
          "date": "2026-01-20T12:00:00.000Z",
          "dateFormatted": "1/20/2026, 12:00:00 PM",
          "engagement": {
            "likes": 1234,
            "comments": 56,
            "views": null
          },
          "permalink": "https://www.instagram.com/p/CXyz123/",
          "dimensions": {
            "width": 1080,
            "height": 1350
          },
          "searchInfo": {
            "searchType": "hashtag",
            "searchTerm": "#avneetkaur_13"
          },
          "accessibility": "Photo caption",
          "location": {
            "id": "123456",
            "name": "Los Angeles, CA",
            "slug": "los-angeles-ca"
          }
        }
        // ... more posts
      ]
    },
    "mentionResults": {
      "count": 50,
      "posts": [
        // Posts from @avneetkaur_13
      ]
    },
    "allPosts": [
      // Combined posts from both hashtag and user search
    ]
  },
  "message": "Found 125 posts for keyword \"avneetkaur_13\""
}
```

---

### 3. Get Account Info

Get information about the logged-in Instagram account:

```bash
curl http://localhost:4000/api/instagram/account
```

**Response:**
```json
{
  "success": true,
  "data": {
    "username": "your_username",
    "fullName": "Your Full Name",
    "biography": "Your bio...",
    "isPrivate": false,
    "isVerified": false,
    "followerCount": 150,
    "followingCount": 200,
    "postCount": 25
  }
}
```

---

### 4. Logout

Logout from Instagram:

```bash
curl -X POST http://localhost:4000/api/instagram/logout
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Testing in Browser

You can also test in your browser by visiting:

- Test connection: http://localhost:4000/api/instagram/test
- Search: http://localhost:4000/api/instagram/search?keyword=avneetkaur_13
- Account info: http://localhost:4000/api/instagram/account

---

## Post Data Fields Explained

Each post object contains:

| Field | Description |
|-------|-------------|
| `postId` | Instagram post ID |
| `shortcode` | Short URL code for the post |
| `content.caption` | Post caption/description |
| `content.mediaType` | Type of media (GraphImage, GraphVideo, GraphSidecar) |
| `content.displayUrl` | Full-size image/video URL |
| `content.thumbnailUrl` | Thumbnail URL |
| `content.isVideo` | Boolean indicating if post is a video |
| `content.videoUrl` | Video URL (if video) |
| `creator.userId` | Instagram user ID of post creator |
| `creator.username` | Username of post creator |
| `creator.fullName` | Full name of post creator |
| `creator.profilePicUrl` | Profile picture URL |
| `creator.isVerified` | Boolean indicating verified account |
| `creator.isPrivate` | Boolean indicating private account |
| `timestamp` | Unix timestamp of post creation |
| `date` | ISO 8601 date string |
| `dateFormatted` | Human-readable date string |
| `engagement.likes` | Number of likes |
| `engagement.comments` | Number of comments |
| `engagement.views` | Number of views (videos only) |
| `permalink` | Direct Instagram URL to the post |
| `dimensions.width` | Media width in pixels |
| `dimensions.height` | Media height in pixels |
| `searchInfo.searchType` | Type of search (hashtag or username) |
| `searchInfo.searchTerm` | Search term used |
| `accessibility` | Accessibility caption |
| `location` | Location data (if available) |

---

## Features Implemented

✅ **Search by keyword** - Searches both hashtags and mentions
✅ **Hashtag search** - Finds posts with #keyword
✅ **Username search** - Finds posts from @username
✅ **Pagination** - Automatically fetches multiple pages of results
✅ **Complete post data** - Returns all requested information:
  - Post content
  - Post creator profile
  - Post date/time
  - Post ID
  - Engagement metrics
  - Media URLs
  - And more!
✅ **Creator name in results** - Each post includes full creator information
✅ **Automatic fetching** - Keeps fetching until no more data available (up to 5 pages per search)
✅ **Error handling** - Graceful error handling with helpful messages
✅ **Rate limiting protection** - Built-in delays to avoid Instagram rate limits

---

## Error Responses

### 400 Bad Request - Missing Keyword

```json
{
  "success": false,
  "error": "Keyword parameter is required",
  "usage": "GET /api/instagram/search?keyword=avneetkaur_13"
}
```

### 401 Unauthorized - Login Failed

```json
{
  "success": false,
  "error": "Instagram authentication failed",
  "message": "Please check your Instagram credentials in .env file",
  "details": "..."
}
```

### 403 Forbidden - Checkpoint Required

```json
{
  "success": false,
  "error": "Instagram checkpoint required",
  "message": "Please log in to Instagram from a web browser and complete the verification",
  "details": "..."
}
```

### 429 Too Many Requests - Rate Limited

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Please wait a few minutes before trying again",
  "details": "..."
}
```

---

## Troubleshooting

### Issue: Login Failed

**Solution:**
1. Check your credentials in `.env`
2. Make sure 2FA is disabled
3. Try logging in manually to verify account isn't locked
4. Use a dedicated Instagram account

### Issue: Checkpoint Required

**Solution:**
1. Log in to Instagram from a web browser
2. Complete any verification steps
3. Wait a few minutes and try again

### Issue: Rate Limited

**Solution:**
1. Wait 15-30 minutes
2. Reduce request frequency
3. Use a different Instagram account

### Issue: No Posts Found

**Solution:**
1. Check if the hashtag/username exists on Instagram
2. Try a different, more popular keyword
3. Check if the user's account is private

---

## Console Output

When running searches, you'll see helpful console output:

```
📡 API Request: Search for "avneetkaur_13"

=== Instagram Search ===
Keyword: avneetkaur_13
🔍 Searching for hashtag: #avneetkaur_13
   📄 Fetching page 2 for hashtag #avneetkaur_13...
   📄 Fetching page 3 for hashtag #avneetkaur_13...
✅ Found 75 posts for hashtag #avneetkaur_13
🔍 Searching for user posts: @avneetkaur_13
   📄 Fetching page 2 for user @avneetkaur_13...
✅ Found 50 posts from user @avneetkaur_13
📊 Total posts found: 125
✅ Search completed successfully
```

---

## Notes

- The API automatically logs in to Instagram on the first request
- Sessions are maintained between requests
- Each search type (hashtag/username) fetches up to 5 pages of results
- There's a 1-second delay between page fetches to avoid rate limiting
- All timestamps are in Unix format and also provided in ISO 8601 format
- The `allPosts` array combines results from both hashtag and username searches

---

## Production Considerations

⚠️ **This implementation uses an unofficial Instagram API and is NOT recommended for production use.**

For production applications, consider:
- Instagram Graph API (official, requires Business account)
- Proper OAuth authentication
- Higher rate limits
- Better reliability
- No account flagging issues

See the `INSTAGRAM_WEB_API_SETUP.md` file for more information.
