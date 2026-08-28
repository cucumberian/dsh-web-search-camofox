# @deepseek-ai/dsh-web-search-camofox

基于 CamoFox 的搜索提供者，用于 DeepSeek Harness 的 Web 能力缝 (`ctx.web`)。

使用 [CamoFox](https://github.com/camofox/camofox) 无头浏览器服务器（带反检测指纹）通过其搜索宏（Google、YouTube、Amazon、Reddit、Wikipedia、Twitter 等）执行网络搜索。

## 安装

```bash
pnpm add @deepseek-ai/dsh-web-search-camofox
```

## 配置

所有设置均为可选，可通过以下方式提供：

1. **插件配置** 在 `cordis.yml` 中
2. **设置服务**（支持热重载，按会话）
3. **环境变量**（启动时默认值）

```yaml
# cordis.yml
web-search-camofox:
  baseURL: "http://localhost:4444"    # CamoFox 服务器端点
  engine: "google"                     # 搜索引擎（见下文）
  maxResults: 10                       # 每次搜索的最大结果数
  apiKeyEnv: "CAMOFOX_API_KEY"         # 凭据引用名称
```

### 支持的搜索引擎

| 引擎 | 说明 |
|------|------|
| `google` | Google 网页搜索（默认） |
| `youtube` | YouTube 视频搜索 |
| `amazon` | Amazon 商品搜索 |
| `reddit` | Reddit 帖子搜索 |
| `reddit_subreddit` | 子版块特定搜索 |
| `wikipedia` | Wikipedia 文章搜索 |
| `twitter` | Twitter/X 搜索 |
| `yelp` | Yelp 本地商家搜索 |
| `spotify` | Spotify 音乐/播客搜索 |
| `netflix` | Netflix 内容搜索 |
| `linkedin` | LinkedIn 专业搜索 |
| `instagram` | Instagram 内容搜索 |
| `tiktok` | TikTok 视频搜索 |
| `twitch` | Twitch 直播搜索 |

### 环境变量

| 变量 | 用途 |
|------|------|
| `CAMOFOX_API_KEY` | 认证 CamoFox 服务器的 API 密钥（可选） |
| `CAMOFOX_BASE_URL` | 覆盖默认的 `http://localhost:4444` |

## 使用方法

```typescript
import { createApp } from '@deepseek-ai/cordis'
import webSearchCamofox from '@deepseek-ai/dsh-web-search-camofox'

const app = createApp()
app.plugin(webSearchCamofox, {
  baseURL: 'http://localhost:4444',
  engine: 'google',
  maxResults: 10,
})

// 提供者现已通过 ctx.web 可用
const results = await app.web.search({ query: 'deepseek harness' })
```

## 要求

- **CamoFox 服务器**在配置的 `baseURL` 运行
- 服务器必须启用搜索宏
- 可选：如果服务器启用了认证，需要 `CAMOFOX_API_KEY`

## 架构

本包遵循 [Web 能力缝](/docs/glossary.md#capability-seam)：

- **服务定义**: `@deepseek-ai/dsh-web`（提供 `ctx.web`）
- **服务提供者**: 本包（注册 `CamoFoxSearchProvider`）
- **消费者**: 任何调用 `ctx.web.search()` 的代码

提供者：
1. 按搜索解析凭据（支持热重载设置）
2. 分发到 CamoFox `/search` 端点
3. 将无障碍快照解析为 `WebSearchResult`
4. 将无密钥的请求元数据记录到会话日志 (`web/camofox-search-request`)

## 许可证

MIT