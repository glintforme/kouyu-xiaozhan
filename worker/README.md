# 口语小站 Worker（云同步 + ee API）

> **诚实说明：Worker 尚未部署。**  
> Cloudflare 账号连上 Grok Bot 并执行下方步骤之前，**云同步不是 live 的**。  
> GitHub Pages 上的前端（v6）已带「家庭同步码 / API Base」设置；未填 API Base 时仍完全本地可用（导出/导入 + 本地 ee）。

## 提供的接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/family/init` | 一次性创建家庭房间 `{ familyCode, adminPasswordHash }` |
| POST | `/api/sync/push` | 妹妹推进度 `{ familyCode, role, payload, updatedAt }` |
| GET | `/api/sync/pull?familyCode=&role=brother` | 哥哥拉进度（头 `X-Admin-Token` = init 时的 hash） |
| POST | `/api/ee/chat` | ee 对话（默认规则引擎；有 `OPENAI_API_KEY` 或 AI binding 则走模型） |
| POST | `/api/ee/tasks/generate` | 生成每日任务 JSON |

可选请求头：`X-Family-Secret`（若设置了 `FAMILY_SECRET` 环境变量）。

KV 键：

- `family:{code}:admin` → `{ hash, createdAt }`
- `family:{code}:sister` → `{ role, payload, updatedAt, receivedAt }`

## Cloudflare 连上之后怎么部署

1. 在 Cloudflare Dashboard 创建 **Workers KV** 命名空间，例如 `kouyu-sync`。
2. 编辑本目录 `wrangler.toml`，把 `id` / `preview_id` 换成真实 KV id。
3. 在本机或 CI 登录：`npx wrangler login`（或在已连接的 Cloudflare 集成里部署）。
4. 部署：
   ```bash
   cd worker
   npx wrangler deploy
   ```
5. 记下输出的 URL，例如：  
   `https://kouyu-xiaozhan-api.<你的子域>.workers.dev`
6. （可选）设置密钥：
   ```bash
   npx wrangler secret put FAMILY_SECRET
   npx wrangler secret put OPENAI_API_KEY
   ```
7. 打开口语小站 → 首页「云同步设置」：
   - 填 **家庭同步码**（兄妹约定，如 `kncre-mei-01`，至少 4 位字母数字）
   - 填 **API Base** = 上面的 Worker URL（不要末尾斜杠）
   - 打开「启用云同步」
   - 哥哥端：先在本机设好管理密码，点「初始化家庭房间」，再用「从云端拉取」看妹妹进度

## 家庭同步码怎么工作

1. 兄妹商量一个短码（不要用真实密码当同步码）。
2. **哥哥**在管理端 / 设置里用管理密码的哈希调用 `/api/family/init`，房间创建一次。
3. **妹妹**学习时，进度防抖推到 `family:{code}:sister`。
4. **哥哥**用 `X-Admin-Token`（与 init 时相同的 password hash）拉取，不会和妹妹界面数据混写。

未部署 Worker 时：继续用「导出同步包 / 导入」即可。

## 本地快速试 Worker（可选）

```bash
cd worker
# 需要先填好 wrangler.toml 的 KV id，或使用:
npx wrangler dev
```

然后在前端 API Base 填 `http://127.0.0.1:8787`。

## 与 Pages 的关系

- 站点本体仍在 **GitHub Pages**：`https://glintforme.github.io/kouyu-xiaozhan/`
- API 在 **Workers**：另有独立域名
- 前端 CORS 已允许 `*.github.io` 与 `localhost`
