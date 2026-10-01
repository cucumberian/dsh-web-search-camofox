# @deepseek-ai/dsh-web-search-camofox

Search provider for the DeepSeek Harness web capability seam (`ctx.web`), backed by a [camofox-browser](https://github.com/redf0x1/camofox-browser) headless browser server with anti-detection fingerprinting.

camofox-browser exposes no search endpoint. Each search opens its own tab, navigates it to a results page, reads the rendered accessibility snapshot, and closes the tab. The engine is therefore the route the tab navigates to: a camofox search macro, or a direct results-page URL.

## Installation

```bash
pnpm add @deepseek-ai/dsh-web-search-camofox
```

The package is not on the public registry yet — that command answers `404` today. Install it from a
checkout instead (the harness plugin manager takes a directory path or a git spec), and the registry
line starts working when it is published.

## Configuration

Every field is optional. Values come from, in precedence order, the Settings service section `web-search-camofox`, this plugin's `cordis.yml` config, and the launch environment. The Settings section is hot-reloaded: the provider reads the current section per search, so a committed change applies to the next search without re-registration.

Every field is declared `volatile`, which is what makes the section editable at all: the settings plane rejects a write to a path the schema did not mark volatile, and a volatile field reaches the plugin as an accessor whose `get()` always reads the current value. A field the schema left plain is therefore not writable through the settings plane at all — the plugin still sees the composition value, and a form can at best show that field read-only.

```yaml
# cordis.patch.yml
- insert:
    - id: web-search-camofox
      name: '@deepseek-ai/dsh-web-search-camofox'
      config:
        baseURL: "http://localhost:9377"   # camofox-browser REST API port
        engine: searx                      # search route (see Engines)
        maxSnapshotChars: 60000            # accessibility characters to parse
        concurrency: 1                     # searches one instance runs at once
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
| `searchUrl` | unset | Results-page URL template containing `{query}`. Overrides the engine's own route; carries any other SearxNG instance or results page. |
| `maxSnapshotChars` | `60000` | Snapshot characters the parser reads. Results past the bound are dropped. |
| `concurrency` | `1` | Searches one provider instance runs at once against one camofox user. `1` queues them. |
| `retries` | `2` | Fresh-tab attempts after a transient failure (`404`, `500`, `502`, `503`, `504`). `0` disables retrying. |
| `retryDelayMs` | `750` | Wait before a retry opens its fresh tab. |
| `closeSettleMs` | `300` | Wait the queue holds after a tab close before the next queued search opens its tab. camofox closes a user's persistent context asynchronously after its last tab closes, and a `POST /tabs` sent inside that window answers `HTTP 500`. Measured on 2.4.7: 150 ms still fails, 300 ms is clean. |

`dsh-tool-web`'s own `maxResults` caps the source list the model sees; this provider does not truncate.

### Settings page

`client.js` is this package's browser half (`package.json` → `dsh.client`). It contributes the row's
configuration to the Plugins page through the `plugins.row.config` slot, keyed
`@deepseek-ai/dsh-web-search-camofox#web-search-camofox`, so **Plugins → dsh-web-search-camofox** offers
a form over every field above: the engine select groups the three route families, each field writes on
commit (blur or Enter), and clearing a field re-inherits its default. Two properties of that slot shape
the code:

- the Plugins page **declares** `plugins.row.config` when it mounts, so the slot is usually absent while
  this entry materializes and a plain `ctx.slots.register` throws `slot "plugins.row.config" is not
  declared`; the entry therefore retries — the injection waits for a later declaration, a slot
  subscription reacts to the page mounting, and a slow timer covers hosts whose declaration
  notification never reaches a dynamically composed entry;
- the values arrive over `ctx.configForms`, so the form follows the settings plane: it degrades to one
  line when the namespace stops being served and reports the write it just committed.

## Engines

Three families of route are available, and each renders the accessibility tree differently, which is
what the parser has to absorb:

| Family | Engines | Route |
|--------|---------|-------|
| SearxNG instances | `searx` (default), `searx-ingres`, `searx-tiekoetter` | a public instance's `/search`, query in `q` |
| Direct result pages | `duckduckgo`, `yandex` | the site's own results page, `{query}` in its own parameter |
| camofox macros | `google`, `youtube`, `amazon`, `reddit`, `wikipedia`, `twitter`, `yelp`, `spotify`, `netflix`, `linkedin`, `instagram`, `tiktok`, `twitch` | camofox `@<engine>_search` |

SearxNG renders `article` blocks with `[level=3]` headings, direct result URLs, and `paragraph:`
snippets, which is why `searx` is the default. The direct pages need more of the parser: DuckDuckGo
answers at its `html` endpoint and annotates every result as a protocol-relative
`//duckduckgo.com/l/?uddg=<target>` redirect, which `resolveResultUrl` resolves and unwraps, and carries
the description as a fourth link over the same address; Yandex nests the result title in a `[level=2]`
heading inside the result link, cites one address twice (a fact card naming only the site, then the
organic result naming the page), and links its own tab bar, login, and footer directly, so those hosts
are dropped as chrome. Macro engines navigate through camofox, so their pages are subject to each
engine's bot defense: measured on this host's datacenter address, Google answers its consent wall and
returns no results, and Wikipedia returns its own search chrome.

Engines that answer nothing but a wall (Reddit's network security page, Mojeek's ALTCHA, Brave's proof
of work, Startpage, Ecosia) are not routes here; `searchUrl` carries any other instance or engine,
`{query}` marking where the encoded query lands. `google` and `wikipedia` stay listed because camofox
carries their macros, but measured here they return the wall or their own chrome rather than results, so
neither is a useful default.

## Authentication

camofox-browser with `CAMOFOX_AUTH_MODE=required` answers `403` to every `POST` unless the request carries `Authorization: Bearer <CAMOFOX_API_KEY>`. The key is resolved per search: the `credentials` seam's `resolve(apiKeyEnv)` first, then the launch environment. `~/.dsh/.credentials.yaml` and `~/.dsh/.env` both feed that resolution; both files must be readable only by their owner. A 401 or 403 fails with `camofox API error (HTTP <status>): <detail>; the camofox server requires a matching CAMOFOX_API_KEY`.

The `camofox-browser-mcp` MCP server is a separate consumer of the same container. It sends no
`Authorization` header outside its cookie-import tool, so its tab-creating tools fail against an
auth-required server; leaving that server open on loopback (`CAMOFOX_AUTH_MODE` unset) is what lets both
consumers share it.

## Usage

```typescript
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as webSearchCamofox from '@deepseek-ai/dsh-web-search-camofox'

const ctx = new Context()
await ctx.plugin(webSearchCamofox, { baseURL: 'http://localhost:9377', engine: 'searx' })
await ctx.plugin(WebRuntime, { searchProvider: 'camofox' })

const results = await ctx.web.search({ query: 'deepseek harness' })
```

This package exports `apply`, `inject`, `name`, and `Config` and has no default export, hence
the namespace import; `@deepseek-ai/dsh-web` provides its plugin as the default export. A composition
entry carries plain values, which the plugin reads through each field's volatile accessor.

## Architecture

This package follows the [web capability seam](https://github.com/deepseek-ai/dsh/blob/master/docs/glossary.md#capability-seam):

- **Service Definition**: `@deepseek-ai/dsh-web` (provides `ctx.web`)
- **Service Provider**: this package (registers the provider under id `camofox`)
- **Consumer**: any code calling `ctx.web.search()`, including `dsh-tool-web`

The provider:

1. Resolves the key and the current settings section per search.
2. Opens a tab, navigates it to the resolved route, reads its snapshot, closes it. A failed close leaves the tab in the user's pool and does not replace the search's outcome.
3. Queues searches per instance (`concurrency: 1` by default, `closeSettleMs` apart). camofox-browser 2.4.7 closes a user's persistent browser context when its tab count drops to zero: a search that closes its tab while another is still navigating fails the other with `NS_BINDING_ABORTED`, and a tab opened inside the asynchronous close window fails with `HTTP 500` (`can't access property "delayedStartupPromise", window is null`). `dsh-tool-web` runs its `queries` concurrently, so unqueued searches collide on every multi-query call.
4. Retries a transient failure (`404`, `500`, `502`, `503`, `504`) on a fresh tab, because the tab that failed is not recoverable.
5. Parses the accessibility tree into `WebSearchSource` entries: unwraps redirect annotations into the address behind them (`resolveResultUrl`), drops archive mirrors (`web.archive.org`), pagination and utility links (`cached`, `translate`, `next`, `previous`), and the search site's own chrome (DuckDuckGo's hosts, Yandex's hosts, a Bing related-search link), then merges the blocks that cite one address into one source.
6. Reports `truncated: false`; `dsh-tool-web` sets the flag when it caps the list.
7. Fails with `WEB_ABORTED` on an aborted request and `WEB_PROVIDER_ERROR` otherwise. A search cancelled while queued reports `WEB_ABORTED` at once, without waiting for the searches ahead of it.

## Tests

```bash
pnpm run test          # unit tests against src, recorded snapshots in tests/fixtures
pnpm run test:client   # client.js against fake slot/locale/settings services, rendered with React
pnpm run test:e2e      # live container; self-skips without $CAMOFOX_API_KEY
```

`tests/fixtures` records one real accessibility snapshot per engine family. Recapture one after changing
a route with the container API — `POST /tabs`, `POST /tabs/{id}/navigate`, then
`GET /tabs/{id}/snapshot?userId=default-user&offset=0` — and store it as `{ "url", "snapshot" }`.

## License

MIT
