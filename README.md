# 嘉士伯淘京周报数据看板

这是一个可部署的网页数据看板，用于承接嘉士伯淘宝闪购与京东秒送周报。看板默认展示目标分析周期，并用目标临近的上一个周期计算环比、历史同期计算同比；页面支持平台筛选、BU/区域下钻，以及渠道、品牌、商户、商品维度查看。

## 数据来源

默认读取本机源目录：

```text
/Users/luffy/Desktop/Project/A_即时零售交付新路线探索/嘉士伯周报数据源
```

数据整理脚本会读取：

- 各周期全量数据明细 CSV
- 各周期账单数据明细 CSV
- `目标GMV.xlsx`
- `分BU预算金额.xlsx`

取数逻辑见 [docs/取数逻辑说明.md](/Users/luffy/Documents/即时零售BI看板%202/docs/取数逻辑说明.md)。

## 常用命令

```bash
npm install
npm run build:data
npm run dev
npm run lint
npm run build
```

更新数据时，先替换源目录下的 CSV/XLSX，再运行：

```bash
npm run build:data
npm run build
```

## 本地预览

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

打开：

```text
http://127.0.0.1:3000/
```

## 部署

项目采用“测试先行、正式发布需群内确认”的发布规则，详见 [docs/发布流程.md](docs/发布流程.md)。

- 测试地址：`https://supercup.github.io/jsb-zhoubao-web/`
- 正式地址：`https://agent.ismartgo.com/carlsberg/weekly`

推送 `main` 后，GitHub Actions 会自动构建并发布到 `gh-pages` 分支，对应测试地址。正式地址不会自动发布，必须等群成员验证测试地址并明确允许后，才可通过 `agent.ismartgo.com` 上传接口发布。

Netlify 已弃用，不再更新。正式发布使用 `agent.ismartgo.com` 上传接口，发布步骤记录在 [docs/发布流程.md](docs/发布流程.md)。
