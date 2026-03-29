# Phase 4: Social Media

## Status: NOT STARTED
## Depends on: Phase 1 complete

---

## 4A.1 - YouTube
**API**: YouTube Data API v3 (uses existing Google OAuth)
**Additional Scope**: `youtube.readonly`, `yt-analytics.readonly`
**Methods**: getSubscriptions, getWatchLater, searchVideos, getChannelVideos, getVideoDetails, getPlaylists, getLikedVideos
**MCP Tools**: youtube_subscriptions, youtube_search, youtube_playlists
**Widget**: Recent subscription uploads
**Risk**: Strict daily quota (10,000 units). Cache aggressively (subscriptions 1hr, video details 24hr)
**Package**: `googleapis` (shared)
**Files**: 5 new

## 4A.2 - Facebook
**API**: Graph API v19+ (separate OAuth flow)
**Auth**: Facebook OAuth 2.0, permissions: email, public_profile, user_posts, user_events, user_friends
**Methods**: getFeed, getEvents, getGroups, getGroupPosts, getNotifications
**MCP Tools**: facebook_feed, facebook_events, facebook_groups
**Widget**: Feed highlights + upcoming events
**Note**: Personal DMs NOT available via Graph API. App stays in Development mode (admin's own data only, no App Review needed)
**Playwright fallback**: If API access insufficient, can read feed via browser
**Files**: 6 new

## 4A.3 - Instagram
**API**: Instagram Graph API (requires Business/Creator account linked to Facebook Page)
**Auth**: Facebook OAuth with instagram_basic, instagram_manage_insights, pages_show_list
**Methods**: getFeed, getStories, getInsights, getMediaDetails, searchHashtag
**MCP Tools**: instagram_feed, instagram_insights
**Widget**: Recent posts
**MAJOR LIMITATION**: Basic Display API deprecated Dec 2024. Personal accounts CANNOT use the API. Business/Creator account required.
**Mitigation**: Document requirement clearly. Playwright fallback for personal feed viewing.
**Files**: 5 new

## 4A.4 - X/Twitter
**API**: X API v2 (OAuth 2.0 with PKCE)
**Auth**: Separate OAuth flow
**Scopes**: tweet.read, tweet.write, users.read, bookmark.read, dm.read, like.read, like.write, offline.access
**Methods**: getTimeline, getUserTweets, searchTweets, getBookmarks, postTweet, likeTweet, getDMs
**MCP Tools**: twitter_timeline, twitter_search, twitter_post, twitter_bookmarks
**Widget**: Timeline highlights + bookmarks
**Cost**: Free tier limited (1,500 tweets/month app-level). User context auth more generous. Cache aggressively.
**Files**: 6 new

## 4A.5 - Unified Social Feed
- Meta-plugin aggregating across all social platforms
- Normalizes posts: `{ source, author, content, media?, link, timestamp, engagement }`
- `GET /api/social/feed` - Unified feed sorted by timestamp
- `GET /api/social/feed/:source` - Filtered to one platform
- **MCP Tool**: social_feed ("What's happening on my social media?")
- **Widget**: SocialFeedWidget with source indicators
- **Files**: 4-5 new

---

## Phase 4 Completion Criteria

- [ ] YouTube: subscriptions and search via chat + widget
- [ ] Facebook: feed and events viewable (in dev mode)
- [ ] Instagram: feed viewable (if Business/Creator account)
- [ ] X/Twitter: timeline, search, post via chat + widget
- [ ] Unified social feed aggregates all enabled platforms
- [ ] Facebook events appear alongside Google Calendar events
