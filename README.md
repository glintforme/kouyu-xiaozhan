# 口语小站 · 游戏化双端（v6）

线上地址：**https://glintforme.github.io/kouyu-xiaozhan/?v=6**

妹妹免登录练口语打卡升级；哥哥用密码进管理端看进度、偶尔发任务。教练 **ee** 布置任务与对话纠错。

> 当前仍在迭代，**暂未正式交给妹妹使用**。

## 谁用哪个入口

| 角色 | 怎么进 | 做什么 |
|------|--------|--------|
| **妹妹（主用户）** | 直接打开链接，默认学习端 `#home` | 做任务拿 XP、挑战测验、练发音/词汇/对话/微课 |
| **哥哥** | 右上角「管理」→ 确认 → `#admin` | 首次设置密码 → 账号 `brother`；看板、发任务、云端拉取 / 导入同步包 |

## v6 本轮更新（云同步 + ee 就绪，Worker 未部署）

- **前端**：家庭同步码、API Base、启用云同步开关；妹妹进度防抖推送；哥哥「初始化家庭房间 / 从云端拉取」
- **对话**：配置了 API Base 时请求 `/api/ee/chat`；失败或未配置则无缝回落本地教练
- **任务**：可从 Worker `/api/ee/tasks/generate` 拉取每日任务；否则仍本地按日生成
- **Worker 源码**：见仓库 `worker/`（KV 同步 + 规则 ee；可插 Workers AI / OpenAI）
- **诚实说明**：**云同步现在还不是 live。** Cloudflare 未连接、Worker 未部署前，请继续用导出/导入。页面上有醒目提示。

## 家庭同步码怎么用（部署 Worker 之后）

1. 兄妹约定一个短码（如 `kncre-mei-01`，≥4 位字母数字，**不要**用银行卡密码）。
2. 两边都在首页「云同步设置」填同一同步码 + 同一 API Base（Worker URL）。
3. **哥哥**设好管理密码后，在管理端点「初始化家庭房间」（把本机密码哈希登记到 KV）。
4. **妹妹**勾选「启用云同步」并保存 → 学习时自动防抖推送。
5. **哥哥**点「从云端拉取」看进度（请求头带管理密码哈希，与妹妹数据隔离）。

未部署前：导出 JSON → 导入，逻辑不变。

## 同步限制

| 状态 | 行为 |
|------|------|
| 未填 API Base | 纯本地；导出/导入 |
| 已填但 Worker 未上线 | 「测试连接」会失败；本地仍可用 |
| Worker 已部署并启用同步 | 妹妹自动推；哥哥拉取 |

管理密码仍是**家庭演示级**（本机加盐 SHA-256），请勿用重要密码。

## 游戏循环

- **任务**：ee 每日自动 + 可选周测提示；哥哥可额外发布。
- **XP / 等级**：每 100 XP 升 1 级。
- **挑战**：周 / 月 / 半年 / 年测，≥60% 拿满奖励与徽章。

## Cloudflare 连上后要做什么

详见 **`worker/README.md`**：

1. 创建 KV，改 `worker/wrangler.toml` 的 id  
2. `npx wrangler deploy`  
3. 把得到的 `https://….workers.dev` 填进站点「API Base」  
4. （可选）`wrangler secret put FAMILY_SECRET` / `OPENAI_API_KEY`

**在得到 Worker URL 之前，不要宣称云同步已上线。**

## 本地预览

```bash
cd english-practice-site
python3 -m http.server 8765
# http://127.0.0.1:8765/?v=6
```

## 页面 Hash

| Hash | 说明 |
|------|------|
| `#home` | 任务 HUD、云同步设置、本地导出 |
| `#challenges` / `#progress` | 测验 / 徽章 |
| `#vocab` `#pronounce` `#chat` `#knowledge` `#review` `#path` | 学习模块 |
| `#admin` | 哥哥管理端（密码门） |

缓存参数：`?v=6`
