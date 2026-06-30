# English Vocabulary Review Tool

本地化英语背单词系统。项目使用 Vue3 + TypeScript 构建前端，用 Node/Express 提供本地 API，并通过 SQLite 保存词库、学习会话、答题记录和熟练度。

## Features

- 内置“英语基础词库”，包含英文、音标、词性、中文释义、例句、标签和难度。
- 支持词库查看、搜索、新增、编辑和禁用单词。
- 支持导入 `.txt`、`.md`、`.markdown`、`.docx`、`.doc` 文本词库。
- 支持配置 DeepSeek API，把上传文本整理成标准单词库；未启用 API 时使用本地规则解析。
- 支持认词选择、拼写练习、混合训练三种模式。
- 认词题自动生成 4 个中文选项，并包含正确答案。
- 拼写题忽略大小写和首尾空格，完全拼对才算正确。
- 使用 0-5 熟练度记录掌握情况；答对 +1，答错 -1。
- 最近答错或熟练度低于 3 的单词会进入错词复习。
- 学习记录、错词、统计数据保存在本地 SQLite，不上传服务器。

## Stack

<p align="center">
  <img src="assets/Vue.png" alt="Vue" width="120" />
  <img src="assets/TypeScript.png" alt="TypeScript" width="120" />
  <img src="assets/Vite.png" alt="Vite" width="120" />
  <img src="assets/GSAP.png" alt="GSAP" width="120" />
</p>

- Pinia
- Express
- SQLite
- better-sqlite3
- multer
- mammoth
- word-extractor
- Vitest

## Data

默认数据库文件：

```text
D:\pyPrj\review-slide-tool\data\vocab.sqlite
```

首次启动后端时会自动创建表并写入内置英语基础词库。可以通过环境变量覆盖数据库位置：

```powershell
$env:VOCAB_DB_PATH='D:\pyPrj\review-slide-tool\data\vocab.sqlite'
```

DeepSeek API Key 会保存到本地 SQLite 的 `api_settings` 表。`GET /api/settings/ai` 只返回脱敏后的 Key 预览，不返回完整 Key。

## Development

安装依赖时建议把 npm cache 指到 D 盘：

```powershell
$env:npm_config_cache='D:\npm-cache'
npm install
```

同时启动后端 API 和前端 Vite：

```bash
npm run dev
```

单独启动：

```bash
npm run server:dev
npm run client:dev
```

默认端口：

- 前端：Vite 默认端口
- 后端：`http://127.0.0.1:5174`
- 前端 `/api` 会代理到后端

## API

- `GET /api/health`
- `GET /api/books`
- `GET /api/books/:bookId/words?query=&limit=&offset=`
- `POST /api/books/:bookId/words`
- `PATCH /api/words/:wordId`
- `DELETE /api/words/:wordId`
- `GET /api/settings/ai`
- `PUT /api/settings/ai`
- `POST /api/import/vocab`
- `POST /api/study/start`
- `POST /api/study/:sessionId/answer`
- `GET /api/study/:sessionId`
- `GET /api/stats/overview?bookId=basic_english`

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Notes

第一版不提供登录、云同步、联网词典、语音朗读或复杂间隔重复算法。当前重点是课程设计所需的“数据库 + 前后端交互 + 学习记录 + 错词复习”闭环。

## Import Flow

导入入口在学习设置页下方。

1. 选择新建词库或合并当前词库。
2. 上传 `.txt`、`.md`、`.markdown`、`.docx` 或 `.doc` 文件。
3. 如果已启用 DeepSeek，后端调用 `deepseek-chat` 将文本整理为词条。
4. 如果未启用 DeepSeek，后端使用本地规则解析常见格式，例如：

```text
apple - 苹果
banana /bəˈnænə/ n. 香蕉
| word | phonetic | pos | meaning |
| book | /bʊk/ | n. | 书 |
```

同一词库中已存在的英文单词会跳过，不覆盖已有数据。
