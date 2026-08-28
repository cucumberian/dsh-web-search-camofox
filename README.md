# @deepseek-ai/dsh-web-search-camofox

CamoFox-backed search provider for the DeepSeek Harness web capability seam (`ctx.web`).

Uses the [CamoFox](https://github.com/camofox/camofox) headless browser server with anti-detection fingerprinting to perform web searches through its search macros (Google, YouTube, Amazon, Reddit, Wikipedia, Twitter, etc.).

## Installation

```bash
pnpm add @deepseek-ai/dsh-web-search-camofox
```

## Configuration

All settings are optional and can be provided through:

1. **Plugin config** in `cordis.yml`
2. **Settings service** (hot-reloadable, per-session)
3. **Environment variables** (launch-time defaults)

```yaml
# cordis.yml
web-search-camofox:
  baseURL: "http://localhost:4444"    # CamoFox server endpoint
  engine: "google"                     # Search engine (see below)
  maxResults: 10                       # Maximum results per search
  apiKeyEnv: "CAMOFOX_API_KEY"         # Credential reference name
```

### Supported Engines

| Engine | Description |
|--------|-------------|
| `google` | Google web search (default) |
| `youtube` | YouTube video search |
| `amazon` | Amazon product search |
| `reddit` | Reddit post search |
| `reddit_subreddit` | Subreddit-specific search |
| `wikipedia` | Wikipedia article search |
| `twitter` | Twitter/X search |
| `yelp` | Yelp local business search |
| `spotify` | Spotify music/podcast search |
| `netflix` | Netflix content search |
| `linkedin` | LinkedIn professional search |
| `instagram` | Instagram content search |
| `tiktok` | TikTok video search |
| `twitch` | Twitch stream search |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `CAMOFOX_API_KEY` | API key for authenticated CamoFox server (optional) |
| `CAMOFOX_BASE_URL` | Override default `http://localhost:4444` |

## Usage

```typescript
import { createApp } from '@deepseek-ai/cordis'
import webSearchCamofox from '@deepseek-ai/dsh-web-search-camofox'

const app = createApp()
app.plugin(webSearchCamofox, {
  baseURL: 'http://localhost:4444',
  engine: 'google',
  maxResults: 10,
})

// The provider is now available through ctx.web
const results = await app.web.search({ query: 'deepseek harness' })
```

## Requirements

- **CamoFox server** running at the configured `baseURL`
- Server must have the search macros enabled
- Optional: `CAMOFOX_API_KEY` if server authentication is enabled

## Architecture

This package follows the [web capability seam](/docs/glossary.md#capability-seam):

- **Service Definition**: `@deepseek-ai/dsh-web` (provides `ctx.web`)
- **Service Provider**: This package (registers `CamoFoxSearchProvider`)
- **Consumer**: Any code calling `ctx.web.search()`

The provider:
1. Resolves credentials per-search (supports hot-reloaded settings)
2. Dispatches to CamoFox `/search` endpoint
3. Parses the accessibility snapshot into `WebSearchResult`
4. Records secret-free request metadata to session log (`web/camofox-search-request`)

## License

MIT