# @deepseek-ai/dsh-web-search-camofox

Search provider for the DeepSeek Harness web capability seam (`ctx.web`), backed by a [camofox-browser](https://github.com/redf0x1/camofox-browser) headless browser server with anti-detection fingerprinting.

camofox-browser exposes no search endpoint. Each search opens its own tab, navigates it to a results page, reads the rendered accessibility snapshot, and closes the tab. The engine is therefore the route the tab navigates to: a camofox search macro, or a direct results-page URL.

## Installation

```bash
pnpm add @deepseek-ai/dsh-web-search-camofox
```

## Configuration

Every field is optional. Values come from, in precedence order, the Settings service section `web-search-camofox`, this plugin's `cordis.yml` config, and the launch environment. The Settings section is hot-reloaded: the provider reads the current section per search, so a committed change applies to the next search without re-registration.

```yaml
# cordis.patch.yml
- insert:
    - id: web-search-camofox
      name: '@deepseek-ai/dsh-web-search-camofox'
      config:
        baseURL: "http://localhost:9377"   # camofox-browser REST API port
        engine: searx                      # search route (see Engines)
        maxSnapshotChars: 60000            # accessibility characters to parse
        apiKeyEnv: "CAMOFOX_API_KEY"       # credential reference for the key
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: camofox                # selects this provider by id
```

| Field | Default | Contract |
|-------|---------|----------|
| `apiKey` | unset | Literal key. Wins over credential resolution; keep it out of configuration files. |
| `apiKeyEnv` | `CAMOFOX_API_KEY` | Credential reference resolved per search. |
| `baseURL` | `http://localhost:9377` | camofox-browser REST base URL. |
| `userId` | `default-user` | camofox identity that owns the tab and its persistent browser profile. |
| `sessionKey` | `dsh-web-search` | camofox tab group this provider's tabs belong to. |
| `engine` | `searx` | Search route, from the Engines table. |
| `searchUrl` | unset | Results-page URL template containing `{query}`. Overrides the engine's own route; carries any SearxNG instance. |
| `maxSnapshotChars` | `60000` | Snapshot characters the parser reads. Results past the bound are dropped. |

`dsh-tool-web`'s own `maxResults` caps the source list the model sees; this provider does not truncate.

## Engines

Macro engines navigate through camofox's `@<engine>_search` macros, so their result pages are subject to each engine's bot defense. Measured on this host's datacenter address, Google answers its consent wall and returns no results, and Wikipedia returns its own search chrome. The SearxNG routes are direct results-page URLs that render `article` blocks with `[level=3]` headings, direct result URLs, and `paragraph:` snippets, which is why `searx` is the default.

| Engine | Route |
|--------|-------|
| `searx` | `https://priv.au/search` (default) |
| `searx-ingres` | `https://search.inetol.net/search` |
| `searx-tiekoetter` | `https://searx.tiekoetter.com/search` |
| `google`, `youtube`, `amazon`, `reddit`, `wikipedia`, `twitter`, `yelp`, `spotify`, `netflix`, `linkedin`, `instagram`, `tiktok`, `twitch` | camofox macro `@<engine>_search` |

Engines that block bots outright (Google's consent wall, Reddit's network security page, Mojeek's ALTCHA, Brave's proof of work, Startpage, Ecosia) are not routes here; `searchUrl` carries any other instance or engine.

## Authentication

camofox-browser with `CAMOFOX_AUTH_MODE=required` answers `403` to every `POST` unless the request carries `Authorization: Bearer <CAMOFOX_API_KEY>`. The key is resolved per search: the `credentials` seam's `resolve(apiKeyEnv)` first, then the launch environment. `~/.dsh/.credentials.yaml` and `~/.dsh/.env` both feed that resolution; both files must be readable only by their owner. A 401 or 403 fails with `camofox API error (HTTP <status>): <detail>; the camofox server requires a matching CAMOFOX_API_KEY`.

The `camofox-browser-mcp` MCP server is a separate consumer of the same container. It sends no `Authorization` header outside its cookie-import tool, so its tab-creating tools fail against an auth-required server; see `camofox-mcp-auth.mjs` in the profile patch for the preload that signs them.

## Usage

```typescript
import { createApp } from '@deepseek-ai/cordis'
import webSearchCamofox from '@deepseek-ai/dsh-web-search-camofox'

const app = createApp()
app.plugin(webSearchCamofox, { baseURL: 'http://localhost:9377', engine: 'searx' })
app.plugin(web, { searchProvider: 'camofox' })

const results = await app.web.search({ query: 'deepseek harness' })
```

## Architecture

This package follows the [web capability seam](https://github.com/deepseek-ai/dsh/blob/master/docs/glossary.md#capability-seam):

- **Service Definition**: `@deepseek-ai/dsh-web` (provides `ctx.web`)
- **Service Provider**: this package (registers the provider under id `camofox`)
- **Consumer**: any code calling `ctx.web.search()`, including `dsh-tool-web`

The provider:

1. Resolves the key and the current settings section per search.
2. Opens a tab, navigates it to the resolved route, reads its snapshot, closes it. A failed close leaves the tab in the user's pool and does not replace the search's outcome.
3. Parses the accessibility tree into `WebSearchSource` entries, dropping archive mirrors (`web.archive.org`), pagination and utility links (`cached`, `translate`, `next`, `previous`), and duplicate URLs.
4. Reports `truncated: false`; `dsh-tool-web` sets the flag when it caps the list.
5. Fails with `WEB_ABORTED` on an aborted request and `WEB_PROVIDER_ERROR` otherwise.

## Tests

```bash
pnpm run test        # unit tests against src, recorded snapshots in tests/fixtures
pnpm run test:e2e    # live container; self-skips without $CAMOFOX_API_KEY
```

## License

MIT
