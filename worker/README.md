# 口语小站 Worker（云同步 + ee API）

> **状态：LIVE**  
> URL：`https://kouyu-xiaozhan-api.kncrty.workers.dev`  
> Health：`GET /api/health` → `{ ok: true, sync: true, ai: true, version: 7 }`  
> KV：`kouyu-sync`（id `db6288cfc0bc40539357e7406a166d99`）  
> 前端默认 API Base 已指向此地址（`?v=8` · Worker version 8）。

## 提供的接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/family/init` | 创建家庭房间 `{ familyCode, adminPasswordHash }` |
| POST | `/api/sync/push` | 妹妹推进度 `{ familyCode, role, payload, updatedAt }` |
| GET | `/api/sync/pull?familyCode=&role=brother` | 哥哥拉进度（头 `X-Admin-Token` = init 时的 hash） |
| POST | `/api/ee/chat` | ee 对话（优先 Workers AI → OpenAI → 规则引擎） |
| POST | `/api/ee/tasks/generate` | 生成每日任务 JSON |
| GET | `/api/tts?text=&lang=en` | 英文短音频代理（有道→Google，供国产手机浏览器） |

可选请求头：`X-Family-Secret`（若设置了 `FAMILY_SECRET`）。

KV 键：

- `family:{code}:admin` → `{ hash, createdAt }`
- `family:{code}:sister` → `{ role, payload, updatedAt, receivedAt }`

## 重新部署

```bash
cd worker
# wrangler.toml 已含真实 KV id 与 AI binding
npx wrangler deploy
```

或通过已连接的 Cloudflare 集成上传脚本（multipart + bindings：SYNC KV + AI）。

可选密钥：

```bash
npx wrangler secret put FAMILY_SECRET
npx wrangler secret put OPENAI_API_KEY
```

## 前端一键连通

1. 打开 https://glintforme.github.io/kouyu-xiaozhan/?v=8
2. 哥哥：管理端设密码 → 填家庭同步码 →「⚡ 一键初始化 + 测试连通」
3. 妹妹：同一同步码 → 启用云同步 →「⚡ 测试连通」→ 学习自动推送

## 与 Pages 的关系

- 站点：**GitHub Pages** `https://glintforme.github.io/kouyu-xiaozhan/`
- API：**Workers** `https://kouyu-xiaozhan-api.kncrty.workers.dev`
- CORS 已允许 `*.github.io` 与 `localhost`
