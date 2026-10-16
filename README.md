# 口语小站 · 游戏化双端（v8）

线上地址：**https://glintforme.github.io/kouyu-xiaozhan/?v=8**

妹妹免登录练口语打卡升级；哥哥用密码进管理端看进度、偶尔发任务。教练 **ee** 布置任务与对话纠错。

> 当前仍在迭代，**暂未正式交给妹妹使用**。

## 谁用哪个入口

| 角色 | 怎么进 | 做什么 |
|------|--------|--------|
| **妹妹（主用户）** | 直接打开链接，默认学习端 `#home` | 做任务拿 XP、挑战测验、练发音/词汇/对话/微课 |
| **哥哥** | 右上角「管理」→ 确认 → `#admin` | 首次设置密码 → 账号 `brother`；看板、一键连通、发任务、云端拉取 |

## v8 本轮更新

- **手机发音**：移动端 / 国产浏览器默认在线美式（有道 → Worker TTS）；短音频 blob 缓存；首触解锁；失败 toast
- **学习流**：今日任务下「下一步建议」；全部完成后引导周测 / ee / 词汇
- **云同步摩擦**：学习端「🚀 快速启用同步」一键勾选 + 补码；连通 toast 带延迟 ms，失败可重试 / 导出备用
- **管理看板**：一屏速览行 + 任务完成率环形图 + 测验得分趋势柱
- **ee Workers AI**：换用非 deprecated 模型（fp8 / fast / 3.2-3b）；health `?deep=1` 可探活 AI
- **Worker**：version 8；TTS 缓存一周；ee/chat 在无 KV 时也可走 AI

## v7 已完成（仍有效）

- 默认 API Base live、一键初始化+连通、管理进度条 / 测验 chips

## 家庭同步码怎么用

1. 妹妹点「快速启用同步」或与哥哥约定同一短码（≥4）。
2. **哥哥**管理端填同步码 →「一键初始化 + 测试连通」。
3. **妹妹**「测试连通」确认延迟 → 学习自动推送。
4. **哥哥**「从云端拉取」。网络慢时用导出 JSON 备用。

## Cloudflare Worker

- URL：`https://kouyu-xiaozhan-api.kncrty.workers.dev`
- Health：`GET /api/health` → `ok`、`sync`、`ai`、`version:8`
- Deep：`GET /api/health?deep=1` → 含 `aiProbe`

## 本地预览

```bash
cd english-practice-site
python3 -m http.server 8765
# http://127.0.0.1:8765/?v=8
```

缓存参数：`?v=8`
