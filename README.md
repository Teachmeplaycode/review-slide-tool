# Review Slide Tool

个人知识复习库 Web 工具。它把带答案的 `docx`、Markdown 或文本题库解析成题目卡片，用 GSAP 横向幻灯片流程完成导入、预览、抽题、作答和复盘。

## Features

- 支持 `.docx`、`.md`、`.markdown`、`.txt` 本地导入。
- 支持选择题、判断题、填空题、简答题识别。
- 预览阶段可修改题型、题干、选项、答案，支持禁用题目、拆分和合并。
- 可配置随机抽题，并把部分简答题转换成挖空默写。
- 客观题精确判分，填空按空位判分，简答按文本相似度和关键词覆盖做半自动评分。
- 题库和答题记录保存在浏览器 IndexedDB，不上传到服务器。

## Stack

<p align="center">
  <img src="assets/Vue.png" alt="Vue" width="120" />
  <img src="assets/TypeScript.png" alt="TypeScript" width="120" />
  <img src="assets/Vite.png" alt="Vite" width="120" />
  <img src="assets/GSAP.png" alt="GSAP" width="120" />
</p>

- Vue 3
- TypeScript
- Vite
- Pinia
- GSAP
- mammoth
- idb
- Vitest

## Development

```bash
npm install
npm run dev
```

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Notes

This is a pure frontend app. It does not provide login, cloud sync, PDF/PPT parsing, or server-side file scanning in v1.
