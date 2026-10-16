# 口语小站 · 游戏化双端（v7）

线上地址：**https://glintforme.github.io/kouyu-xiaozhan/?v=7**

妹妹免登录练口语打卡升级；哥哥用密码进管理端看进度、偶尔发任务。教练 **ee** 布置任务与对话纠错。

> 当前仍在迭代，**暂未正式交给妹妹使用**。

## 谁用哪个入口

| 角色 | 怎么进 | 做什么 |
|------|--------|--------|
| **妹妹（主用户）** | 直接打开链接，默认学习端 `#home` | 做任务拿 XP、挑战测验、练发音/词汇/对话/微课 |
| **哥哥** | 右上角「管理」→ 确认 → `#admin` | 首次设置密码 → 账号 `brother`；看板、一键连通、发任务、云端拉取 |

## v7 本轮更新（云同步 LIVE）

- **默认 API Base**：`https://kouyu-xiaozhan-api.kncrty.workers.dev`（仍可改）
- **一键连通**：管理端「⚡ 一键初始化 + 测试连通」= 健康检查 + 创建/复用家庭房间；学习端「⚡ 测试连通」= 健康检查
- **管理看板**：任务完成率进度条、测验成绩总览（周/月/半年/年最佳分）、上次同步/拉取时间
- **ee**：Worker 优先 Workers AI，失败回落规则引擎；中英双语纠错提示词加强
- **手机 TTS**：Web Speech（优选自然 en 音色）→ 有道短音频 → Worker `/api/tts` 代理；适配 Vivo/QQ/微信 WebView
- **Worker / KV**：已 live（见 `worker/README.md`）

## 家庭同步码怎么用

1. 兄妹约定一个短码（如 `kncre-mei-01`，≥4 位字母数字，**不要**用银行卡密码）。
2. 两边都确认 API Base 为 live Worker（默认已填）。
3. **哥哥**设好管理密码 → 管理端填同步码 → 点「一键初始化 + 测试连通」。
4. **妹妹**勾选「启用云同步」并保存 → 学习时自动防抖推送；可点「测试连通」确认。
5. **哥哥**点「从云端拉取」看进度。

导出 JSON → 导入仍作跨设备备用。

## 同步状态

| 状态 | 行为 |
|------|------|
| 默认（API 已填） | 可测连通；勾选启用后妹妹自动推 |
| 启用同步 + 同家庭码 | 妹妹推；哥哥拉 |
| 网络失败 | 本地仍可用；导出/导入备用 |

管理密码是**家庭演示级**（本机加盐 SHA-256），请勿用重要密码。

## 游戏循环

- **任务**：ee 每日自动 + 可选周测提示；哥哥可额外发布。
- **XP / 等级**：每 100 XP 升 1 级。
- **挑战**：周 / 月 / 半年 / 年测，≥60% 拿满奖励与徽章。

## Cloudflare Worker（已上线）

- URL：`https://kouyu-xiaozhan-api.kncrty.workers.dev`
- Health：`GET /api/health` → `ok`、`sync:true`、`ai:true`
- 源码与部署说明：`worker/README.md`

## 本地预览

```bash
cd english-practice-site
python3 -m http.server 8765
# http://127.0.0.1:8765/?v=7
```

## 页面 Hash

| Hash | 说明 |
|------|------|
| `#home` | 任务 HUD、云同步设置、本地导出 |
| `#challenges` / `#progress` | 测验 / 徽章 |
| `#vocab` `#pronounce` `#chat` `#knowledge` `#review` `#path` | 学习模块 |
| `#admin` | 哥哥管理端（密码门） |

缓存参数：`?v=7`
