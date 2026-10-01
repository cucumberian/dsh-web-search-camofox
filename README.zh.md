# @deepseek-ai/dsh-web-search-camofox

由 [camofox-browser](https://github.com/redf0x1/camofox-browser) 无头浏览器服务器（带反检测指纹）支撑的 DeepSeek Harness Web 能力缝 (`ctx.web`) 搜索提供者。

camofox-browser 不提供搜索端点。每次搜索打开自己的标签页，将其导航到结果页，读取渲染后的无障碍快照，然后关闭标签页。因此引擎就是标签页导航的目标路由：一个 camofox 搜索宏，或者直接的结果页 URL。

## 安装

```bash
pnpm add @deepseek-ai/dsh-web-search-camofox
```

## 配置

每个字段都是可选的。取值优先级为：设置服务的 `web-search-camofox` 区段、本插件的 `cordis.yml` 配置、启动环境。设置区段支持热重载：提供者每次搜索都读取当前区段，因此提交的变更对下一次搜索立即生效，无需重新注册。

每个字段都声明为 `volatile`，这正是它可被编辑的前提：设置平面会拒绝对 schema 未标记为 volatile 的路径写入，而 volatile 字段以访问器形式到达插件，其 `get()` 永远读取当前值。schema 中未标记的字段在设置界面上既读不到也写不进——插件仍能看到组合配置里的值，但任何表单都不会提供它。

```yaml
# cordis.patch.yml
- insert:
    - id: web-search-camofox
      name: '@deepseek-ai/dsh-web-search-camofox'
      config:
        baseURL: "http://localhost:9377"   # camofox-browser REST API 端口
        engine: searx                      # 搜索路由（见"引擎"）
        maxSnapshotChars: 60000            # 要解析的无障碍字符数
        concurrency: 1                     # 单实例同时执行的搜索数
        apiKeyEnv: "CAMOFOX_API_KEY"       # 密钥的凭据引用
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: camofox                # 按 id 选择本提供者
```

| 字段 | 默认值 | 约定 |
|------|--------|------|
| `apiKey` | 未设置 | 字面密钥。优先于凭据解析；不要写入配置文件。 |
| `apiKeyEnv` | `CAMOFOX_API_KEY` | 每次搜索解析的凭据引用。 |
| `baseURL` | `http://localhost:9377` | camofox-browser REST 基础 URL。 |
| `userId` | `default-user` | 拥有标签页及其持久浏览器配置文件的 camofox 身份。 |
| `sessionKey` | `dsh-web-search` | 本提供者标签页所属的 camofox 标签组。 |
| `engine` | `searx` | 搜索路由，取自"引擎"表。 |
| `searchUrl` | 未设置 | 包含 `{query}` 的结果页 URL 模板。优先于引擎自身的路由；可承载任意 SearxNG 实例。 |
| `maxSnapshotChars` | `60000` | 解析器读取的快照字符数。超出上限的结果被丢弃。 |
| `concurrency` | `1` | 单个提供者实例针对同一 camofox 用户同时执行的搜索数。`1` 表示排队执行。 |
| `retries` | `2` | 瞬时失败（`404`、`500`、`502`、`503`、`504`）后在新标签页上的尝试次数。`0` 表示不重试。 |
| `retryDelayMs` | `750` | 重试打开新标签页前的等待毫秒数。 |
| `closeSettleMs` | `300` | 队列在标签页关闭后、下一次排队搜索打开标签页前的等待毫秒数。camofox 在用户最后一个标签页关闭后异步关闭其持久上下文，在这个时间窗口内发出的 `POST /tabs` 会返回 `HTTP 500`。在 2.4.7 上实测：150 ms 仍然失败，300 ms 正常。 |

`dsh-tool-web` 自身的 `maxResults` 决定模型可见的来源列表长度；本提供者不做截断。

### 设置页面

`client.js` 是本包的浏览器侧（`package.json` → `dsh.client`）。它通过 `plugins.row.config` 插槽把该行的
配置贡献给插件页面，键为 `@deepseek-ai/dsh-web-search-camofox#web-search-camofox`，因此
**插件 → dsh-web-search-camofox** 会为上述每个字段给出表单：引擎下拉按三个路由家族分组，每个字段在提交时
（失焦或回车）写入，清空字段即重新继承默认值。该插槽的两个特性决定了代码的写法：

- 插件页面在挂载时才**声明** `plugins.row.config`，所以本条目实体化时插槽常常还不存在，直接
  `ctx.slots.register` 会抛出 `slot "plugins.row.config" is not declared`；因此条目会重试——注入会等待稍后的
  声明，插槽订阅会对页面挂载作出反应，慢速定时器则覆盖那些声明通知到不了动态组合条目的宿主；
- 取值经由 `ctx.configForms` 到达，于是表单跟随设置平面：命名空间不再被服务时退化为一行，并报告刚提交的写入。

## 引擎

可用的路由分三个家族，每个家族渲染出的可达性树都不一样，这正是解析器需要消化的部分：

| 家族 | 引擎 | 路由 |
|------|------|------|
| SearxNG 实例 | `searx`（默认）、`searx-ingres`、`searx-tiekoetter` | 公共实例的 `/search`，查询放在 `q` |
| 直接结果页 | `duckduckgo`、`yandex` | 站点自身的结果页，`{query}` 用它自己的参数名 |
| camofox 宏 | `google`、`youtube`、`amazon`、`reddit`、`wikipedia`、`twitter`、`yelp`、`spotify`、`netflix`、`linkedin`、`instagram`、`tiktok`、`twitch` | camofox `@<engine>_search` |

SearxNG 渲染出带 `[level=3]` 标题、直接结果 URL 和 `paragraph:` 摘要的 `article` 块，这就是默认引擎为
`searx` 的原因。直接结果页需要解析器做更多工作：DuckDuckGo 在 `html` 端点应答，并把每条结果标注为
协议相对的 `//duckduckgo.com/l/?uddg=<target>` 重定向，由 `resolveResultUrl` 解析并展开，描述则作为同一地址上的
第四个链接给出；Yandex 把结果标题嵌在结果链接内部的 `[level=2]` 标题里，同一个地址会被引用两次（先是在
时间线卡片里只写站点名，然后是在自然结果里写页面名），并且直接链接自己的标签栏、登录与页脚，因此这些
域名被当作页面框架丢弃。宏引擎经 camofox 导航，其页面受各引擎反爬虫策略约束：在本主机的数据中心地址上
实测，Google 返回其同意墙且没有结果，Wikipedia 返回其自身的搜索框架。

完全屏蔽爬虫的引擎（Google 同意墙、Reddit 网络安全页、Mojeek 的 ALTCHA、Brave 的工作量证明、Startpage、Ecosia）不在路由之列；`searchUrl` 可承载任意其他实例或引擎。

## 认证

`CAMOFOX_AUTH_MODE=required` 的 camofox-browser 对每个 `POST` 请求返回 `403`，除非请求携带 `Authorization: Bearer <CAMOFOX_API_KEY>`。密钥按每次搜索解析：先经 `credentials` 缝的 `resolve(apiKeyEnv)`，再退到启动环境。`~/.dsh/.credentials.yaml` 与 `~/.dsh/.env` 都参与该解析；两个文件都必须仅对其所有者可读。401 或 403 失败时报 `camofox API error (HTTP <status>): <detail>; the camofox server requires a matching CAMOFOX_API_KEY`。

`camofox-browser-mcp` 这个 MCP 服务器是同一容器的另一个消费者。除 cookie 导入工具外它不发送 `Authorization` 头，所以其创建标签页的工具在需要认证的服务器上会失败；签名办法见 profile patch 中的 `camofox-mcp-auth.mjs` 预加载。

## 使用方法

```typescript
import { createApp } from '@deepseek-ai/cordis'
import webSearchCamofox from '@deepseek-ai/dsh-web-search-camofox'

const app = createApp()
app.plugin(webSearchCamofox, { baseURL: 'http://localhost:9377', engine: 'searx' })
app.plugin(web, { searchProvider: 'camofox' })

const results = await app.web.search({ query: 'deepseek harness' })
```

## 架构

本包遵循 [Web 能力缝](https://github.com/deepseek-ai/dsh/blob/master/docs/glossary.md#capability-seam)：

- **服务定义**：`@deepseek-ai/dsh-web`（提供 `ctx.web`）
- **服务提供者**：本包（以 id `camofox` 注册提供者）
- **消费者**：任何调用 `ctx.web.search()` 的代码，包括 `dsh-tool-web`

提供者：

1. 每次搜索解析密钥与当前设置区段。
2. 打开标签页、导航到解析出的路由、读取其快照、关闭标签页。关闭失败会把标签页留在该用户的标签池中，且不会取代本次搜索的结果。
3. 按实例对搜索排队（默认 `concurrency: 1`，间隔 `closeSettleMs`）。camofox-browser 2.4.7 在某个用户的标签页数降为零时会关闭其持久浏览器上下文：一个搜索在另一个仍在导航时关闭自己的标签页，会让后者以 `NS_BINDING_ABORTED` 失败；在异步关闭窗口内打开的新标签页会以 `HTTP 500`（`can't access property "delayedStartupPromise", window is null`）失败。`dsh-tool-web` 会并发执行它的 `queries`，所以未排队的搜索在每次多查询调用中都会相互冲突。
4. 对瞬时失败（`404`、`500`、`502`、`503`、`504`）在新标签页上重试，因为失败的标签页不可恢复。
5. 将无障碍树解析为 `WebSearchSource` 条目，丢弃归档镜像（`web.archive.org`）、分页与工具链接（`cached`、`translate`、`next`、`previous`）以及重复 URL。
6. 上报 `truncated: false`；`dsh-tool-web` 在截断列表时设置该标记。
7. 请求被中止时以 `WEB_ABORTED` 失败，其余情况以 `WEB_PROVIDER_ERROR` 失败。排队中被取消的搜索立即上报 `WEB_ABORTED`，无需等待排在前面的搜索完成。

## 测试

```bash
pnpm run test          # 针对 src 的单元测试，使用 tests/fixtures 中记录的快照
pnpm run test:client   # 用 fake 的插槽/语言/设置服务运行 client.js，并用 React 真实渲染
pnpm run test:e2e      # 真实容器；没有 $CAMOFOX_API_KEY 时自行跳过
```

## 许可证

MIT
