# Instagram Web API Setup Guide

This guide explains how to use the `instagram-web-api` package to search Instagram posts.

## ⚠️ Important Warnings

1. **This uses an unofficial API** - Instagram may block or flag your account
2. **Not recommended for production** - Use Instagram Graph API for production apps
3. **Rate limits apply** - Too many requests will get you temporarily blocked
4. **Use a dedicated account** - Don't use your personal Instagram account
5. **Checkpoint challenges** - Instagram may require verification

## Setup Instructions

### Step 1: Create .env File

Create a `.env` file in the `backend` directory:

```bash
cp .env.example .env
```

### Step 2: Add Instagram Credentials

Edit `.env` and add your Instagram username and password:

```env
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password
PORT=4000
```

**Important:** Use a dedicated Instagram account, not your personal one!

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Start the Server

```bash
npm start
```

The server will automatically log in to Instagram when you make your first search request.

## How It Works

### Search by Hashtag

```bash
curl "http://localhost:4000/api/instagram/search?keyword=%23travel"
```

### Search by Username

```bash
curl "http://localhost:4000/api/instagram/search?keyword=@username"
```

### Search Both

```bash
curl "http://localhost:4000/api/instagram/search?keyword=travel"
```

## Features

✅ Search by hashtag (#keyword)
✅ Search by username (@username)
✅ Get post content, likes, comments
✅ Get media URLs and permalinks
✅ Automatic login and session management

## Common Issues

### Issue 1: Checkpoint Required

**Error:** `checkpoint_required`

**Solution:**
1. Log in to Instagram from a web browser
2. Complete any verification steps (phone, email, etc.)
3. Wait a few minutes and try again
4. Consider using a less active Instagram account

### Issue 2: Rate Limited

**Error:** `Please wait a few minutes before you try again`

**Solution:**
1. Wait 15-30 minutes before trying again
2. Reduce the frequency of your requests
3. Use a different Instagram account
4. Consider using Instagram Graph API for production

### Issue 3: Login Failed

**Error:** `login_required` or authentication error

**Solution:**
1. Check your username and password in `.env`
2. Make sure 2FA is disabled on the account
3. Log in to Instagram manually to verify the account isn't locked
4. Restart the server to create a new session

### Issue 4: 2FA Enabled

If your Instagram account has Two-Factor Authentication enabled:

1. Disable 2FA for the account you're using for API access, OR
2. Use Instagram Graph API instead (supports proper OAuth)

## Best Practices

1. **Use a dedicated account** - Create a new Instagram account just for API access
2. **Don't spam requests** - Space out your requests (wait 2-3 seconds between requests)
3. **Handle errors gracefully** - Always check for errors and handle them appropriately
4. **Monitor for checkpoints** - Watch for verification challenges
5. **Consider Graph API for production** - This unofficial API is best for development/testing

## Limitations

- Limited to 50 posts per search
- Subject to Instagram rate limits
- May trigger security checks
- Not suitable for production use
- Session may expire and require re-login

## Alternative: Instagram Graph API

For production applications, use the official Instagram Graph API instead:

**Pros:**
- Official API with proper authentication
- More reliable and stable
- Higher rate limits
- No account flagging issues
- Better for business use

**Cons:**
- Requires Facebook App setup
- Only works with Instagram Business Accounts
- More complex OAuth flow
- Requires access tokens

## Troubleshooting

### Check if logged in

The server logs will show:
```
🔐 Logging in to Instagram...
✅ Successfully logged in to Instagram
```

### Check search results

```
=== Instagram Search ===
Keyword: travel
🔍 Searching for hashtag: #travel
✅ Found 50 posts for hashtag #travel
📊 Total posts found: 50
✅ Search completed successfully
```

### View detailed errors

Check the console logs for detailed error messages and solutions.

## Support

If you encounter issues:
1. Check the console logs for error messages
2. Verify your credentials in `.env`
3. Try logging in to Instagram manually
4. Wait if rate-limited
5. Consider using Instagram Graph API for production

## Security Notes

- **Never commit `.env` file** - It's in `.gitignore` for a reason
- **Never share your Instagram password** - Keep it secure
- **Use environment variables** - Don't hardcode credentials
- **Consider Graph API** - For production, use official API
