# 口语小站 · 游戏化双端（v9）

线上地址：**https://glintforme.github.io/kouyu-xiaozhan/?v=9**

妹妹免登录练口语打卡升级；哥哥用密码进管理端看进度、偶尔发任务。教练 **ee** 布置任务与对话纠错。

> 当前仍在迭代，**暂未正式交给妹妹使用**。

## 谁用哪个入口

| 角色 | 怎么进 | 做什么 |
|------|--------|--------|
| **妹妹（主用户）** | 直接打开链接，默认学习端 `#home` | 做任务拿 XP、挑战测验、练发音/词汇/对话/微课 |
| **哥哥** | 右上角「管理」→ 确认 → `#admin` | 首次设置密码 → 账号 `brother`；看板、一键连通、发任务、云端拉取 |

## v9 本轮更新（国内连通）

- **根因**：`*.workers.dev` 在国内常被拦截 / 极慢；并非 CORS / 家庭码配置错误
- **主修复**：Worker 挂自定义域名 **https://kouyu-api.allovemiku.top**（Cloudflare zone `allovemiku.top`）
- **前端默认 API Base** 改为上述域名；旧 localStorage 里的 workers.dev 会自动迁移
- **多节点探活**：`/api/ping`（不碰 AI）→ `/api/health`；失败自动试备用 workers.dev
- **失败 UX**：一键重试 + 提示「导出给哥哥」；新增「复制同步包」方便微信传输
- Worker version **9**；探活与 AI 解耦

## 家庭同步码怎么用（国内）

1. 打开 `?v=9`，确认 API Base 是 `https://kouyu-api.allovemiku.top`（可点「重置国内域名」）。
2. 妹妹「快速启用同步」或兄妹约定同一短码（≥4）。
3. **哥哥**管理端填同步码 →「一键初始化 + 测试连通」。
4. **妹妹**「测试连通 / 一键重试」→ 学习自动推送。
5. **哥哥**「从云端拉取」。
6. **若仍不通**：妹妹「导出给哥哥」或「复制同步包」→ 哥哥管理端「导入她的进度」。

## Cloudflare Worker

| 节点 | URL |
|------|-----|
| **主（国内友好）** | `https://kouyu-api.allovemiku.top` |
| 备用 | `https://kouyu-xiaozhan-api.kncrty.workers.dev` |

- Ping：`GET /api/ping`（轻量，不探 AI）
- Health：`GET /api/health` → `ok`、`sync`、`ai`、`version:9`、`host`
- Deep：`GET /api/health?deep=1` → 含 `aiProbe`

## 本地预览

```bash
cd english-practice-site
python3 -m http.server 8765
# http://127.0.0.1:8765/?v=9
```

缓存参数：`?v=9`

## 语音对话 ee（v10）

学习端「对话」页：**按住说话** → 本机 Web Speech（Chrome/Edge）或云端 Whisper → ee 回复 → 可自动朗读英文。完整双工通话未做。
