"use client";

import { useEffect, useMemo, useState } from "react";

declare const __DATA_CACHE_VERSION__: string | undefined;

type MetricRow = {
  platformId: string;
  platformLabel?: string;
  sourcePlatform?: string;
  periodId: string;
  periodLabel?: string;
  periodKind?: string;
  date?: string;
  monthLabel?: string;
  timeProgress?: number | null;
  region: string;
  parent?: string;
  product?: string;
  gmv: number;
  quantity?: number | null;
  orders?: number | null;
  users?: number | null;
  activityGmv: number;
  subsidy: number;
  budget?: number | null;
  advertisingExposureFee?: number | null;
  buTarget?: number | null;
  targetGmv?: number | null;
  actualTmFeeRatio?: number | null;
  targetPromoFeeRatio?: number | null;
};

type BreakdownRow = MetricRow & {
  channel?: string;
  brand?: string;
  merchant?: string;
  product?: string;
};

type ActivityRow = {
  platformId: string;
  platformLabel?: string;
  periodId: string;
  periodLabel?: string;
  periodKind?: string;
  date?: string;
  region: string;
  parent?: string;
  product?: string;
  activityName: string;
  redemptionAmount: number;
  activityGmv: number;
  promoFeeRatio: number | null;
  activityRoi: number | null;
  couponCount: number;
};

type ActivitySummaryRow = {
  activityName: string;
  redemptionAmount: number;
  activityGmv: number;
  promoFeeRatio: number | null;
  activityRoi: number | null;
  couponCount: number;
};

type Aggregate = {
  gmv: number;
  quantity: number;
  orders: number;
  users: number;
  activityGmv: number;
  subsidy: number;
  budget: number;
  advertisingExposureFee: number;
  target: number;
  timeProgress: number | null;
  targetPromoFeeRatio: number | null;
  actualTmFeeRatio: number | null;
  activityShare: number | null;
  promoFeeRatio: number | null;
  activityDiscount: number | null;
  promoBudgetUsage: number | null;
  promoBudgetRemaining: number | null;
  targetAchievement: number | null;
  paceAchievement: number | null;
};

type NamedAggregate = { name: string } & Aggregate;

type DataShape = {
  metadata: {
    title: string;
    generatedAt: string;
    currentPeriodId: string;
    previousPeriodId: string;
    lastYearPeriodId: string;
    periods: Array<{
      id: string;
      label: string;
      shortLabel: string;
      kind: string;
      start: string;
      end: string;
      monthLabel: string;
      daysInMonth?: number;
      timeProgress: number;
    }>;
    platforms: Array<{
      id: string;
      label: string;
      sourcePlatform: string;
    }>;
    regionOrder: string[];
    channelOrder?: string[];
    regionParent: Record<string, string>;
    regionGroups: Record<string, string[]>;
    productOrder?: string[];
    productDataFiles?: string[];
    coreProductGroups?: CoreProductGroup[];
  };
  records: MetricRow[];
  productRecords?: MetricRow[];
  breakdowns: {
    channels: BreakdownRow[];
    channelsByProduct?: BreakdownRow[];
    brands: BreakdownRow[];
    brandsByProduct?: BreakdownRow[];
    merchants: BreakdownRow[];
    merchantsByProduct?: BreakdownRow[];
    products: BreakdownRow[];
    activities: ActivityRow[];
    activitiesByProduct?: ActivityRow[];
  };
  reconciliation: Array<Record<string, string | number>>;
};

const PLATFORM_ALL = "all";
const REGION_ALL = "all";
const PRODUCT_ALL = "all";
const DATE_RANGE_ALL = "all";
const DATA_FILE = "dashboard-data.json";
const DATA_CACHE_VERSION =
  typeof __DATA_CACHE_VERSION__ === "string" ? __DATA_CACHE_VERSION__ : "local";
const TOP_ROW_LIMIT = 10;
const OTHER_LABEL = "其它";
const GROUP_ORDER = ["CBC", "CIB", "NX", "XJ", "YN", "华中", "未识别"];
const CHANNEL_ORDER = [
  "酒类专营店",
  "乌苏啤酒/WUSU",
  "连锁便利店",
  "连锁超市",
  "仓店",
  "其他",
];
type CoreProductGroup = {
  id: string;
  label: string;
  alias?: string;
  description?: string;
  matchPattern: string;
  skuCount?: number;
  currentGmv?: number;
};

type DateRangeOption = {
  id: string;
  label: string;
  startOffset: number;
  endOffset: number;
};

type DateDayOption = {
  offset: number;
  label: string;
};

type ExpandedChart = {
  title: string;
  content: React.ReactNode;
};

const DEFAULT_DATE_RANGE: DateRangeOption = {
  id: DATE_RANGE_ALL,
  label: "全部日期",
  startOffset: 0,
  endOffset: 365,
};

const DEFAULT_CORE_PRODUCT_GROUPS: CoreProductGroup[] = [
  {
    id: "one_liter",
    label: "一升装（1L）",
    alias: "一生装",
    description: "按商品名中出现 1L/１L 的 SKU 识别",
    matchPattern: "(?:1\\s*[lLＬｌ]|１\\s*[lLＬｌ])",
  },
];
const EXCEL_REGION_ROWS = [
  "CBC-CQ",
  "CBC-SC",
  "CBC",
  "CIB东南",
  "CIB华北",
  "CIB华南",
  "CIB苏皖",
  "CIB",
  "NX",
  "XJ",
  "YN",
  "华中-湖南",
  "华中-非湖南",
  "华中",
  "总计",
];

function safeRatio(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

type ProductDataPayload = Pick<DataShape, "productRecords"> & {
  breakdowns: Pick<
    NonNullable<DataShape["breakdowns"]>,
    "channelsByProduct" | "brandsByProduct" | "merchantsByProduct" | "activitiesByProduct"
  >;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`数据加载失败：${response.status}`);
  return response.json() as Promise<T>;
}

function publicDataUrl(file: string): string {
  const cleanFile = file.replace(/^\/+/, "");
  const withVersion = (url: string) => {
    const dataUrl = new URL(url, window.location.href);
    dataUrl.searchParams.set("v", DATA_CACHE_VERSION);
    return `${dataUrl.pathname}${dataUrl.search}${dataUrl.hash}`;
  };

  if (typeof window === "undefined") return `/data/${cleanFile}`;

  const script = document.querySelector<HTMLScriptElement>('script[src*="/assets/"]');
  const assetPath = script ? new URL(script.src, window.location.href).pathname : "";
  const marker = "/assets/";
  const assetIndex = assetPath.indexOf(marker);
  if (assetIndex >= 0) return withVersion(`${assetPath.slice(0, assetIndex + 1)}data/${cleanFile}`);

  const { pathname } = window.location;
  const currentBase = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return withVersion(`${currentBase}data/${cleanFile}`);
}

async function loadDashboardData(): Promise<DataShape> {
  const coreData = await fetchJson<DataShape>(publicDataUrl(DATA_FILE));
  const productFiles = coreData.metadata.productDataFiles ?? [];
  if (!productFiles.length) return coreData;

  const productPayloads = await Promise.all(
    productFiles.map((file) => fetchJson<ProductDataPayload>(publicDataUrl(file))),
  );

  return productPayloads.reduce<DataShape>(
    (merged, payload) => ({
      ...merged,
      productRecords: [...(merged.productRecords ?? []), ...(payload.productRecords ?? [])],
      breakdowns: {
        ...merged.breakdowns,
        channelsByProduct: [
          ...(merged.breakdowns.channelsByProduct ?? []),
          ...(payload.breakdowns.channelsByProduct ?? []),
        ],
        brandsByProduct: [
          ...(merged.breakdowns.brandsByProduct ?? []),
          ...(payload.breakdowns.brandsByProduct ?? []),
        ],
        merchantsByProduct: [
          ...(merged.breakdowns.merchantsByProduct ?? []),
          ...(payload.breakdowns.merchantsByProduct ?? []),
        ],
        activitiesByProduct: [
          ...(merged.breakdowns.activitiesByProduct ?? []),
          ...(payload.breakdowns.activitiesByProduct ?? []),
        ],
      },
    }),
    {
      ...coreData,
      productRecords: [],
      breakdowns: {
        ...coreData.breakdowns,
        channelsByProduct: [],
        brandsByProduct: [],
        merchantsByProduct: [],
        activitiesByProduct: [],
      },
    },
  );
}

function leavesFor(data: DataShape, region: string): string[] {
  if (region === REGION_ALL || region === "总计") return data.metadata.regionOrder;
  return data.metadata.regionGroups[region] ?? [region];
}

function platformIds(data: DataShape, platform: string): string[] {
  if (platform === PLATFORM_ALL) return data.metadata.platforms.map((item) => item.id);
  return [platform];
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function formatMonthDayRange(start: Date, end: Date): string {
  const startMonth = start.getUTCMonth() + 1;
  const startDay = start.getUTCDate();
  const endMonth = end.getUTCMonth() + 1;
  const endDay = end.getUTCDate();
  if (startMonth === endMonth && startDay === endDay) return `${startMonth}月${startDay}日`;
  if (startMonth === endMonth) return `${startMonth}月${startDay}-${endDay}日`;
  return `${startMonth}月${startDay}日-${endMonth}月${endDay}日`;
}

function formatYearDotDateRange(start: Date, end: Date): string {
  const year = start.getUTCFullYear();
  const startText = `${year}.${start.getUTCMonth() + 1}.${start.getUTCDate()}`;
  const endText = `${end.getUTCMonth() + 1}.${end.getUTCDate()}`;
  return `${startText}-${endText}`;
}

function selectedDateSubtitle(data: DataShape, dateRange: DateRangeOption): string {
  const period = currentPeriod(data);
  if (!period) return dateRange.label;
  const start = addDays(parseIsoDate(period.start), dateRange.startOffset);
  const end = addDays(parseIsoDate(period.start), dateRange.endOffset);
  return formatYearDotDateRange(start, end);
}

function currentPeriod(data: DataShape) {
  return data.metadata.periods.find((item) => item.id === data.metadata.currentPeriodId);
}

function buildDateDayOptions(data: DataShape): DateDayOption[] {
  const period = currentPeriod(data);
  if (!period) return [{ offset: 0, label: "全部日期" }];
  const start = parseIsoDate(period.start);
  const end = parseIsoDate(period.end);
  const totalDays = dayDiff(start, end) + 1;
  const options: DateDayOption[] = [];
  for (let offset = 0; offset < totalDays; offset += 1) {
    const date = addDays(start, offset);
    options.push({
      offset,
      label: formatMonthDayRange(date, date),
    });
  }
  return options;
}

function buildSelectedDateRange(data: DataShape, startOffset: number, endOffset: number): DateRangeOption {
  const period = currentPeriod(data);
  if (!period) return DEFAULT_DATE_RANGE;
  const start = parseIsoDate(period.start);
  const rangeStart = addDays(start, startOffset);
  const rangeEnd = addDays(start, endOffset);
  return {
    id: `${startOffset}-${endOffset}`,
    label: formatMonthDayRange(rangeStart, rangeEnd),
    startOffset,
    endOffset,
  };
}

function rangeTimeProgress(data: DataShape, periodId: string, dateRange: DateRangeOption): number | null {
  const period = data.metadata.periods.find((item) => item.id === periodId);
  if (!period) return null;
  const selectedDays = dateRange.endOffset - dateRange.startOffset + 1;
  return selectedDays > 0 ? selectedDays / (period.daysInMonth ?? selectedDays) : null;
}

function rowMatchesDateRange(data: DataShape, row: { periodId: string; date?: string }, dateRange: DateRangeOption): boolean {
  if (!row.date) return true;
  const period = data.metadata.periods.find((item) => item.id === row.periodId);
  if (!period) return true;
  const offset = dayDiff(parseIsoDate(period.start), parseIsoDate(row.date));
  return offset >= dateRange.startOffset && offset <= dateRange.endOffset;
}

function coreProductGroups(data: DataShape): CoreProductGroup[] {
  const groups = data.metadata.coreProductGroups?.length
    ? data.metadata.coreProductGroups
    : DEFAULT_CORE_PRODUCT_GROUPS;
  return groups.filter((group) => (group.skuCount ?? 1) > 0);
}

function matchesCoreProduct(
  productName: string | null | undefined,
  selectedProduct: string,
  groups: CoreProductGroup[],
): boolean {
  if (selectedProduct === PRODUCT_ALL) return true;
  const normalized = String(productName ?? "").trim();
  if (!normalized || ["未识别", "nan", "None"].includes(normalized)) return false;
  const group = groups.find((item) => item.id === selectedProduct);
  if (!group) return normalized === selectedProduct;
  try {
    return new RegExp(group.matchPattern, "i").test(normalized);
  } catch {
    return false;
  }
}

function matchesAnyCoreProduct(
  productName: string | null | undefined,
  groups: CoreProductGroup[],
): boolean {
  return groups.some((group) => matchesCoreProduct(productName, group.id, groups));
}

function aggregateRows(rows: MetricRow[]): Aggregate {
  const uniquePlanKeys = new Set<string>();
  const totals = rows.reduce(
    (acc, row) => {
      acc.gmv += row.gmv || 0;
      acc.quantity += row.quantity || 0;
      acc.orders += row.orders || 0;
      acc.users += row.users || 0;
      acc.activityGmv += row.activityGmv || 0;
      acc.subsidy += row.subsidy || 0;
      const planKey = `${row.platformId}|${row.periodId}|${row.region}`;
      if (!uniquePlanKeys.has(planKey)) {
        acc.budget += row.budget || 0;
        acc.advertisingExposureFee += row.advertisingExposureFee || 0;
        acc.target += row.buTarget || 0;
        uniquePlanKeys.add(planKey);
      }
      if (row.timeProgress && !acc.timeProgress) acc.timeProgress = row.timeProgress;
      return acc;
    },
    {
      gmv: 0,
      quantity: 0,
      orders: 0,
      users: 0,
      activityGmv: 0,
      subsidy: 0,
      budget: 0,
      advertisingExposureFee: 0,
      target: 0,
      timeProgress: null as number | null,
    },
  );

  const targetAchievement = safeRatio(totals.gmv, totals.target);
  const targetPromoFeeRatio = weightedUniquePlatformRatio(rows, "targetPromoFeeRatio");
  return {
    ...totals,
    targetPromoFeeRatio,
    actualTmFeeRatio: averageUniquePlatformRatio(rows, "actualTmFeeRatio"),
    activityShare: safeRatio(totals.activityGmv, totals.gmv),
    promoFeeRatio: safeRatio(totals.subsidy, totals.gmv),
    activityDiscount:
      totals.activityGmv > 0 ? 1 - totals.subsidy / totals.activityGmv : null,
    promoBudgetUsage: safeRatio(totals.subsidy, totals.budget),
    promoBudgetRemaining: totals.budget ? totals.budget - totals.subsidy : null,
    targetAchievement,
    paceAchievement:
      targetAchievement !== null && totals.timeProgress
        ? targetAchievement / totals.timeProgress
        : null,
  };
}

function averageUniquePlatformRatio(
  rows: MetricRow[],
  key: "actualTmFeeRatio" | "targetPromoFeeRatio",
): number | null {
  const byPlatform = new Map<string, number>();
  rows.forEach((row) => {
    const value = row[key];
    if (value !== null && value !== undefined && !byPlatform.has(row.platformId)) {
      byPlatform.set(row.platformId, value);
    }
  });
  if (!byPlatform.size) return null;
  const values = Array.from(byPlatform.values());
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedUniquePlatformRatio(
  rows: MetricRow[],
  key: "targetPromoFeeRatio",
): number | null {
  const byPlatform = new Map<string, { value: number; target: number }>();
  rows.forEach((row) => {
    const value = row[key];
    const target = row.targetGmv || 0;
    if (value !== null && value !== undefined && !byPlatform.has(row.platformId)) {
      byPlatform.set(row.platformId, { value, target });
    }
  });
  const values = Array.from(byPlatform.values());
  const denominator = values.reduce((sum, item) => sum + item.target, 0);
  if (!denominator) return values.length ? values[0].value : null;
  return values.reduce((sum, item) => sum + item.value * item.target, 0) / denominator;
}

function metricRowsForProduct(data: DataShape, product: string): MetricRow[] {
  return product === PRODUCT_ALL ? data.records : data.productRecords ?? [];
}

function buildAggregate(
  data: DataShape,
  periodId: string,
  platform: string,
  region: string,
  product = PRODUCT_ALL,
  dateRange: DateRangeOption = DEFAULT_DATE_RANGE,
): Aggregate {
  const selectedLeaves = new Set(leavesFor(data, region));
  const selectedPlatforms = new Set(platformIds(data, platform));
  const groups = coreProductGroups(data);
  const aggregate = aggregateRows(
    metricRowsForProduct(data, product).filter(
      (row) =>
        row.periodId === periodId &&
        selectedPlatforms.has(row.platformId) &&
        selectedLeaves.has(row.region) &&
        rowMatchesDateRange(data, row, dateRange) &&
        matchesCoreProduct(row.product, product, groups),
    ),
  );
  const timeProgress = rangeTimeProgress(data, periodId, dateRange);
  return {
    ...aggregate,
    timeProgress,
    paceAchievement:
      aggregate.targetAchievement !== null && timeProgress
        ? aggregate.targetAchievement / timeProgress
        : null,
  };
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}元`;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatCount(value: number | null | undefined, unit: string): string {
  const formatted = formatNumber(value);
  return formatted === "-" ? formatted : `${formatted}${unit}`;
}

function formatRoi(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(1)}倍`;
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatPointDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}pp`;
}

function formatPointDistance(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${(Math.abs(value) * 100).toFixed(1)}pp`;
}

function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value)}`;
}

function trendTone(value: number | null | undefined, invert = false): string {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) {
    return "neutral";
  }
  const positive = invert ? value < 0 : value > 0;
  return positive ? "good" : "bad";
}

function classNames(...names: Array<string | false | null | undefined>): string | undefined {
  const value = names.filter(Boolean).join(" ");
  return value || undefined;
}

function targetProgressAlert(row: Pick<Aggregate, "targetAchievement" | "timeProgress">): string | null {
  if (row.targetAchievement === null || row.timeProgress === null) return null;
  return row.targetAchievement < row.timeProgress ? "alert-bad" : null;
}

function budgetProgressAlert(row: Pick<Aggregate, "promoBudgetUsage" | "timeProgress">): string | null {
  if (row.promoBudgetUsage === null || row.timeProgress === null) return null;
  return row.promoBudgetUsage - row.timeProgress > 0.1 ? "alert-warn" : null;
}

function promoFeeAlert(row: Pick<Aggregate, "promoFeeRatio" | "targetPromoFeeRatio">): string | null {
  if (row.promoFeeRatio === null || row.targetPromoFeeRatio === null) return null;
  return row.promoFeeRatio > row.targetPromoFeeRatio ? "alert-bad" : null;
}

function activityShareAlert(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value >= 0.7 ? "alert-warn" : null;
}

function customerizeNarrative(text: string): string {
  return [
    ["低效", "花钱效果偏弱"],
    ["活动机制", "活动规则"],
    ["机制", "规则"],
    ["控费比", "控制费用占比"],
    ["费比", "费用占GMV比例"],
  ].reduce((result, [from, to]) => result.replaceAll(from, to), text);
}

function periodLabel(data: DataShape, periodId: string): string {
  return data.metadata.periods.find((period) => period.id === periodId)?.label ?? periodId;
}

function selectedRegionLabel(region: string): string {
  return region === REGION_ALL ? "全国/全区域" : region;
}

function isOneLiterProduct(product: string): boolean {
  if (product === PRODUCT_ALL) return false;
  const normalized = product.replace(/\s+/g, "");
  return (
    /一升/.test(normalized) ||
    /(^|[^0-9.０-９．])(?:1|１)(?:l|ｌ|Ｌ|升)(?![0-9.０-９．])/i.test(normalized)
  );
}

function periodMonthText(data: DataShape, periodId: string): string {
  const p = data.metadata.periods.find((item) => item.id === periodId);
  if (!p) return periodId;
  const year = p.start.startsWith("2025") ? "Y25" : "Y26";
  const month = Number(p.start.slice(5, 7));
  const start = `${Number(p.start.slice(5, 7))}.${Number(p.start.slice(8, 10))}`;
  const end = `${Number(p.end.slice(5, 7))}.${Number(p.end.slice(8, 10))}`;
  return `${year} ${month}月(${start}-${end})`;
}

function regionTableNodes(data: DataShape, region: string): string[] {
  if (region === REGION_ALL) return EXCEL_REGION_ROWS;
  const children = data.metadata.regionGroups[region];
  if (children && children.length > 1) return [...children, region];
  return [region];
}

function colLabel(first: string, second?: string) {
  return (
    <>
      {first}
      {second ? (
        <>
          <br />
          {second}
        </>
      ) : null}
    </>
  );
}

function SegmentButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={active ? "segment active" : "segment"} onClick={onClick}>
      {children}
    </button>
  );
}

type CoreMetric = {
  label: string;
  value: string;
  sub: string;
  status: string;
  statusTone?: "good" | "bad" | "neutral" | "warn";
  tone?: "good" | "bad" | "neutral" | "warn";
};

type ScopeOption = {
  id: string;
  label: string;
  platform: string;
  variant: "merged" | "platform";
};

type ComboChartRow = {
  label: string;
  bar: number | null;
  barLabel?: string;
  bar2?: number | null;
  bar2Label?: string;
  primary?: number | null;
  primaryLabel?: string;
  secondary?: number | null;
  secondaryLabel?: string;
};

function CoreMetricCard({
  metric,
  variant,
}: {
  metric: CoreMetric;
  variant: "merged" | "platform";
}) {
  return (
    <article className={`core-metric-card ${variant} ${metric.tone ?? "neutral"}`}>
      <div className="core-metric-topline">
        <div className="core-metric-label">{metric.label}</div>
        <span className={`kpi-status ${metric.statusTone ?? metric.tone ?? "neutral"}`}>{metric.status}</span>
      </div>
      <div className="core-metric-value">{metric.value}</div>
      <div className="core-metric-sub">{metric.sub}</div>
    </article>
  );
}

function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function niceAmountMax(values: Array<number | null | undefined>): number {
  const max = Math.max(0, ...values.filter(finiteNumber));
  if (!max) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

function nicePercentMax(values: Array<number | null | undefined>, fallback = 1): number {
  const max = Math.max(0, ...values.filter(finiteNumber));
  if (!max) return fallback;
  if (max <= 0.4) return 0.4;
  if (max <= 0.6) return 0.6;
  if (max <= 0.8) return 0.8;
  if (max <= 1) return 1;
  return Math.ceil(max * 10) / 10;
}

function chartLabel(label: string): string {
  return label.length > 7 ? `${label.slice(0, 7)}…` : label;
}

function buildScopeOptions(data: DataShape, platform: string): ScopeOption[] {
  if (platform === PLATFORM_ALL) {
    return [
      {
        id: "merged",
        label: "双平台",
        platform: PLATFORM_ALL,
        variant: "merged",
      },
    ];
  }
  const selected = data.metadata.platforms.find((item) => item.id === platform);
  return [
    {
      id: platform,
      label: selected?.label ?? platform,
      platform,
      variant: "platform",
    },
  ];
}

function promoTargetText(row: Aggregate): string {
  if (row.promoFeeRatio === null || row.targetPromoFeeRatio === null) return "目标 -";
  const diff = row.promoFeeRatio - row.targetPromoFeeRatio;
  return `${diff >= 0 ? "高于目标" : "低于目标"} ${formatPointDistance(diff)}`;
}

function gmvStatus(row: Aggregate, rowWow: number | null, includeTargetBudget: boolean): CoreMetric["status"] {
  if (includeTargetBudget && row.targetAchievement !== null && row.timeProgress !== null) {
    return row.targetAchievement >= row.timeProgress ? "进度领先" : "需追赶";
  }
  if (rowWow === null) return "待观察";
  return rowWow >= 0 ? "环比增长" : "环比下降";
}

function targetStatus(row: Aggregate): CoreMetric["status"] {
  if (row.targetAchievement === null || row.timeProgress === null) return "待观察";
  const gap = row.targetAchievement - row.timeProgress;
  if (gap >= 0.03) return "进度领先";
  if (gap >= 0) return "正常";
  return "需追赶";
}

function promoStatus(row: Aggregate, includeTargetBudget: boolean): CoreMetric["status"] {
  if (!includeTargetBudget || row.promoFeeRatio === null || row.targetPromoFeeRatio === null) return "待观察";
  if (row.promoFeeRatio > row.targetPromoFeeRatio) return "需关注";
  return "费用健康";
}

function activityShareStatus(value: number | null | undefined): CoreMetric["status"] {
  if (value === null || value === undefined) return "待观察";
  if (value >= 0.7) return "偏高";
  if (value >= 0.6) return "需观察";
  return "正常";
}

type TrendLineDef = {
  key: string;
  name: string;
  color: string;
};

function TrendLineChart({
  title,
  rows,
  lines,
  valueFormatter = formatMoney,
  expanded = false,
  onExpand,
}: {
  title: string;
  rows: Array<{ label: string } & Record<string, number | null | undefined>>;
  lines: TrendLineDef[];
  valueFormatter?: (value: number | null | undefined) => string;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());
  const toggleLine = (key: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chartRows = rows;
  const width = expanded ? Math.max(1000, chartRows.length * 58 + 120) : 820;
  const height = expanded ? 460 : 380;
  const left = 64;
  const right = 16;
  const top = 44;
  const bottom = expanded ? 100 : 70;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const plotBottom = top + plotHeight;
  const step = plotWidth / Math.max(chartRows.length - 1, 1);

  const visibleLines = lines.filter((l) => !hiddenLines.has(l.key));
  const allValues = visibleLines.flatMap((l) => chartRows.flatMap((row) => [row[l.key]]));
  const maxVal = niceAmountMax(allValues);

  const xFor = (index: number) => (chartRows.length === 1 ? left + plotWidth / 2 : left + step * index);
  const yFor = (value: number) => plotBottom - (Math.max(value, 0) / maxVal) * plotHeight;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!onExpand) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onExpand();
    }
  };

  return (
    <article
      className={classNames("summary-chart-card", onExpand && "clickable-chart", expanded && "expanded-chart")}
      onClick={onExpand}
      onKeyDown={handleKeyDown}
      role={onExpand ? "button" : undefined}
      tabIndex={onExpand ? 0 : undefined}
    >
      <div className="summary-chart-heading">
        <h3>{title}</h3>
        <div className="chart-heading-tools">
          <div className="chart-legend" style={{ cursor: "pointer" }}>
            {lines.map((l) => (
              <span
                key={l.key}
                className={classNames("legend-trend", hiddenLines.has(l.key) && "legend-hidden")}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLine(l.key);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleLine(l.key);
                  }
                }}
                role="switch"
                aria-checked={!hiddenLines.has(l.key)}
                tabIndex={0}
                style={{ ["--trend-color" as string]: l.color }}
              >
                {l.name}
              </span>
            ))}
          </div>
          {onExpand ? <span className="chart-expand-hint">点击放大</span> : null}
        </div>
      </div>
      <svg
        className="summary-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        style={expanded ? { minWidth: width } : undefined}
      >
        {/* grid lines and Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = plotBottom - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line className="chart-grid-line" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="chart-axis-label" x={left - 8} y={y + 4} textAnchor="end">
                {valueFormatter(maxVal * ratio)}
              </text>
            </g>
          );
        })}
        {/* X-axis labels — show every Nth day to avoid crowding */}
        {chartRows.map((row, index) => {
          const showLabel = chartRows.length <= 10 || index % Math.ceil(chartRows.length / 10) === 0;
          if (!showLabel) return null;
          return (
            <text
              key={`x-${index}`}
              className="chart-axis-label"
              x={xFor(index)}
              y={plotBottom + 18}
              textAnchor="middle"
            >
              {row.label}
            </text>
          );
        })}
        {/* zero line */}
        <line className="chart-grid-line" x1={left} x2={width - right} y1={plotBottom} y2={plotBottom} />
        {/* line series */}
        {lines.map((l) => {
          if (hiddenLines.has(l.key)) return null;
          const points = chartRows
            .map((row, index) => {
              const value = row[l.key];
              return finiteNumber(value) ? `${xFor(index)},${yFor(value)}` : null;
            })
            .filter(Boolean)
            .join(" ");
          if (!points) return null;
          return (
            <g key={l.key}>
              <polyline
                className="chart-line"
                points={points}
                fill="none"
                stroke={l.color}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {chartRows.map((row, index) => {
                const value = row[l.key];
                if (!finiteNumber(value)) return null;
                return (
                  <circle
                    key={`${l.key}-${index}`}
                    cx={xFor(index)}
                    cy={yFor(value)}
                    r="4"
                    fill={l.color}
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </article>
  );
}

function ComboBarLineChart({
  title,
  rows,
  barName,
  bar2Name,
  primaryName,
  secondaryName,
  barFormatter = formatMoney,
  lineFormatter = formatPercent,
  lineMax,
  expanded = false,
  onExpand,
}: {
  title: string;
  rows: ComboChartRow[];
  barName: string;
  bar2Name?: string;
  primaryName: string;
  secondaryName?: string;
  barFormatter?: (value: number | null | undefined) => string;
  lineFormatter?: (value: number | null | undefined) => string;
  lineMax?: number;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const chartRows = expanded ? rows : rows.slice(0, 14);
  const width = expanded ? Math.max(900, chartRows.length * 72 + 116) : 760;
  const height = expanded ? 430 : 360;
  const left = 58;
  const right = 58;
  const top = 44;
  const bottom = expanded ? 112 : 82;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const plotBottom = top + plotHeight;
  const step = plotWidth / Math.max(chartRows.length, 1);
  const hasSecondBar = Boolean(bar2Name);
  const barWidth = Math.max(10, Math.min(hasSecondBar ? 22 : 34, step * (hasSecondBar ? 0.28 : 0.46)));
  const barMax = niceAmountMax(chartRows.flatMap((row) => [row.bar, row.bar2]));
  const computedLineMax =
    lineMax ??
    nicePercentMax(chartRows.flatMap((row) => [row.primary, row.secondary]), 1);
  const xFor = (index: number) => left + step * index + step / 2;
  const barY = (value: number) => plotBottom - (Math.max(value, 0) / barMax) * plotHeight;
  const lineY = (value: number) =>
    plotBottom - (Math.max(value, 0) / computedLineMax) * plotHeight;
  const linePoints = (key: "primary" | "secondary") =>
    chartRows
      .map((row, index) => {
        const value = row[key];
        return finiteNumber(value) ? `${xFor(index)},${lineY(value)}` : null;
      })
      .filter(Boolean)
      .join(" ");
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!onExpand) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onExpand();
    }
  };

  return (
    <article
      className={classNames("summary-chart-card", onExpand && "clickable-chart", expanded && "expanded-chart")}
      onClick={onExpand}
      onKeyDown={handleKeyDown}
      role={onExpand ? "button" : undefined}
      tabIndex={onExpand ? 0 : undefined}
    >
      <div className="summary-chart-heading">
        <h3>{title}</h3>
        <div className="chart-heading-tools">
          <div className="chart-legend">
            <span className="legend-bar">{barName}</span>
            {bar2Name ? <span className="legend-bar-2">{bar2Name}</span> : null}
            <span className="legend-primary">{primaryName}</span>
            {secondaryName ? <span className="legend-secondary">{secondaryName}</span> : null}
          </div>
          {onExpand ? <span className="chart-expand-hint">点击放大</span> : null}
        </div>
      </div>
      <svg
        className="summary-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        style={expanded ? { minWidth: width } : undefined}
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = plotBottom - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line className="chart-grid-line" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="chart-axis-label" x={left - 10} y={y + 4} textAnchor="end">
                {barFormatter(barMax * ratio)}
              </text>
              <text className="chart-axis-label" x={width - right + 10} y={y + 4}>
                {lineFormatter(computedLineMax * ratio)}
              </text>
            </g>
          );
        })}
        {chartRows.map((row, index) => {
          const value = row.bar ?? 0;
          const value2 = row.bar2 ?? 0;
          const x = xFor(index);
          const y = barY(value);
          const y2 = barY(value2);
          const heightValue = plotBottom - y;
          const heightValue2 = plotBottom - y2;
          const firstBarX = x - (hasSecondBar ? barWidth + 2 : barWidth / 2);
          const secondBarX = x + 2;
          return (
            <g key={`${row.label}-${index}`}>
              <rect
                className="chart-bar"
                x={firstBarX}
                y={y}
                width={barWidth}
                height={heightValue}
                rx={3}
              />
              {hasSecondBar ? (
                <rect
                  className="chart-bar secondary-bar"
                  x={secondBarX}
                  y={y2}
                  width={barWidth}
                  height={heightValue2}
                  rx={3}
                />
              ) : null}
              <text
                className="chart-value-label bar-label"
                x={hasSecondBar ? firstBarX + barWidth / 2 : x}
                y={Math.max(top + 14, y - 8)}
                textAnchor="middle"
              >
                {row.barLabel ?? barFormatter(row.bar)}
              </text>
              {hasSecondBar ? (
                <text className="chart-value-label bar2-label" x={secondBarX + barWidth / 2} y={Math.max(top + 30, y2 - 8)} textAnchor="middle">
                  {row.bar2Label ?? barFormatter(row.bar2)}
                </text>
              ) : null}
              <text
                className="chart-x-label"
                x={x}
                y={plotBottom + 28}
                textAnchor="end"
                transform={`rotate(-42 ${x} ${plotBottom + 28})`}
              >
                {expanded ? row.label : chartLabel(row.label)}
              </text>
            </g>
          );
        })}
        {linePoints("primary") ? (
          <polyline className="chart-line primary" points={linePoints("primary")} />
        ) : null}
        {linePoints("secondary") ? (
          <polyline className="chart-line secondary" points={linePoints("secondary")} />
        ) : null}
        {chartRows.map((row, index) => {
          const x = xFor(index);
          return (
            <g key={`${row.label}-points-${index}`}>
              {finiteNumber(row.primary) ? (
                <>
                  <circle className="chart-point primary" cx={x} cy={lineY(row.primary)} r={5} />
                  <text className="chart-value-label primary-label" x={x} y={lineY(row.primary) - 12} textAnchor="middle">
                    {row.primaryLabel ?? lineFormatter(row.primary)}
                  </text>
                </>
              ) : null}
              {finiteNumber(row.secondary) ? (
                <>
                  <circle className="chart-point secondary" cx={x} cy={lineY(row.secondary)} r={4} />
                  <text className="chart-value-label secondary-label" x={x} y={lineY(row.secondary) + 22} textAnchor="middle">
                    {row.secondaryLabel ?? lineFormatter(row.secondary)}
                  </text>
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
    </article>
  );
}

function SimpleBarChart({
  title,
  rows,
  barName,
  formatter = formatPercent,
  expanded = false,
  onExpand,
}: {
  title: string;
  rows: ComboChartRow[];
  barName: string;
  formatter?: (value: number | null | undefined) => string;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const chartRows = expanded ? rows : rows.slice(0, 14);
  const width = expanded ? Math.max(900, chartRows.length * 70 + 76) : 760;
  const height = expanded ? 400 : 330;
  const left = 54;
  const right = 22;
  const top = 42;
  const bottom = expanded ? 108 : 78;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const plotBottom = top + plotHeight;
  const step = plotWidth / Math.max(chartRows.length, 1);
  const barWidth = Math.max(16, Math.min(38, step * 0.5));
  const barMax = nicePercentMax(chartRows.map((row) => row.bar), 0.2);
  const xFor = (index: number) => left + step * index + step / 2;
  const yFor = (value: number) => plotBottom - (Math.max(value, 0) / barMax) * plotHeight;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!onExpand) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onExpand();
    }
  };

  return (
    <article
      className={classNames("summary-chart-card", onExpand && "clickable-chart", expanded && "expanded-chart")}
      onClick={onExpand}
      onKeyDown={handleKeyDown}
      role={onExpand ? "button" : undefined}
      tabIndex={onExpand ? 0 : undefined}
    >
      <div className="summary-chart-heading">
        <h3>{title}</h3>
        <div className="chart-heading-tools">
          <div className="chart-legend">
            <span className="legend-bar">{barName}</span>
          </div>
          {onExpand ? <span className="chart-expand-hint">点击放大</span> : null}
        </div>
      </div>
      <svg
        className="summary-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        style={expanded ? { minWidth: width } : undefined}
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = plotBottom - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line className="chart-grid-line" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="chart-axis-label" x={left - 10} y={y + 4} textAnchor="end">
                {formatter(barMax * ratio)}
              </text>
            </g>
          );
        })}
        {chartRows.map((row, index) => {
          const value = row.bar ?? 0;
          const x = xFor(index);
          const y = yFor(value);
          return (
            <g key={`${row.label}-${index}`}>
              <rect
                className="chart-bar"
                x={x - barWidth / 2}
                y={y}
                width={barWidth}
                height={plotBottom - y}
                rx={3}
              />
              <text className="chart-value-label bar-label" x={x} y={Math.max(top + 14, y - 8)} textAnchor="middle">
                {row.barLabel ?? formatter(row.bar)}
              </text>
              <text
                className="chart-x-label"
                x={x}
                y={plotBottom + 28}
                textAnchor="end"
                transform={`rotate(-42 ${x} ${plotBottom + 28})`}
              >
                {expanded ? row.label : chartLabel(row.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </article>
  );
}

function Panel({
  title,
  kicker,
  children,
}: {
  title?: string;
  kicker?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          {kicker ? <p>{kicker}</p> : null}
          {title ? <h2>{title}</h2> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function compareAggregate(current: Aggregate, baseline: Aggregate): number | null {
  return safeRatio(current.gmv - baseline.gmv, baseline.gmv);
}

function compareValue(current: number, baseline: number): number | null {
  return safeRatio(current - baseline, baseline);
}

function promoRatioChange(current: Aggregate, baseline: Aggregate): number | null {
  if (current.promoFeeRatio === null || baseline.promoFeeRatio === null) return null;
  return current.promoFeeRatio - baseline.promoFeeRatio;
}

type BreakdownKey = "channel" | "brand" | "merchant" | "product";

function collectBreakdown(
  data: DataShape,
  rows: BreakdownRow[],
  key: BreakdownKey,
  periodId: string,
  selectedPlatforms: Set<string>,
  selectedLeaves: Set<string>,
  selectedProduct = PRODUCT_ALL,
  groups: CoreProductGroup[] = DEFAULT_CORE_PRODUCT_GROUPS,
  dateRange: DateRangeOption = DEFAULT_DATE_RANGE,
) {
  const grouped = new Map<string, MetricRow[]>();
  rows
    .filter(
      (row) =>
        row.periodId === periodId &&
        selectedPlatforms.has(row.platformId) &&
        selectedLeaves.has(row.region) &&
        rowMatchesDateRange(data, row, dateRange) &&
        matchesCoreProduct(row.product, selectedProduct, groups),
    )
    .forEach((row) => {
      const name = String(row[key] ?? "未识别");
      const bucket = grouped.get(name) ?? [];
      bucket.push(row);
      grouped.set(name, bucket);
    });
  return Array.from(grouped.entries())
    .map(([name, bucket]) => ({ name, ...aggregateRows(bucket) }))
    .sort((a, b) => {
      if (key === "channel") {
        const aIndex = CHANNEL_ORDER.indexOf(a.name);
        const bIndex = CHANNEL_ORDER.indexOf(b.name);
        if (aIndex !== -1 || bIndex !== -1) {
          const safeAIndex = aIndex === -1 ? CHANNEL_ORDER.length : aIndex;
          const safeBIndex = bIndex === -1 ? CHANNEL_ORDER.length : bIndex;
          return safeAIndex - safeBIndex;
        }
      }
      return b.gmv - a.gmv;
    });
}

function collectActivities(
  data: DataShape,
  rows: ActivityRow[],
  periodId: string,
  selectedPlatforms: Set<string>,
  selectedLeaves: Set<string>,
  selectedProduct = PRODUCT_ALL,
  groups: CoreProductGroup[] = DEFAULT_CORE_PRODUCT_GROUPS,
  dateRange: DateRangeOption = DEFAULT_DATE_RANGE,
) {
  const grouped = new Map<
    string,
    { redemptionAmount: number; activityGmv: number; couponCount: number }
  >();
  rows
    .filter(
      (row) =>
        row.periodId === periodId &&
        selectedPlatforms.has(row.platformId) &&
        selectedLeaves.has(row.region) &&
        rowMatchesDateRange(data, row, dateRange) &&
        matchesCoreProduct(row.product, selectedProduct, groups),
    )
    .forEach((row) => {
      const bucket = grouped.get(row.activityName) ?? {
        redemptionAmount: 0,
        activityGmv: 0,
        couponCount: 0,
      };
      bucket.redemptionAmount += row.redemptionAmount || 0;
      bucket.activityGmv += row.activityGmv || 0;
      bucket.couponCount += row.couponCount || 0;
      grouped.set(row.activityName, bucket);
    });
  return Array.from(grouped.entries())
    .map(([activityName, value]) => ({
      activityName,
      ...value,
      promoFeeRatio: safeRatio(value.redemptionAmount, value.activityGmv),
      activityRoi: safeRatio(value.activityGmv, value.redemptionAmount),
    }))
    .sort((a, b) => b.redemptionAmount - a.redemptionAmount);
}

function collectCoreSkuRows(
  data: DataShape,
  periodId: string,
  selectedPlatforms: Set<string>,
  selectedLeaves: Set<string>,
  selectedProduct: string,
  groups: CoreProductGroup[],
  dateRange: DateRangeOption = DEFAULT_DATE_RANGE,
) {
  const grouped = new Map<string, MetricRow[]>();
  (data.productRecords ?? [])
    .filter(
      (row) =>
        row.periodId === periodId &&
        selectedPlatforms.has(row.platformId) &&
        selectedLeaves.has(row.region) &&
        rowMatchesDateRange(data, row, dateRange) &&
        (selectedProduct === PRODUCT_ALL
          ? matchesAnyCoreProduct(row.product, groups)
          : matchesCoreProduct(row.product, selectedProduct, groups)),
    )
    .forEach((row) => {
      const name = String(row.product ?? "未识别");
      const bucket = grouped.get(name) ?? [];
      bucket.push(row);
      grouped.set(name, bucket);
    });

  return Array.from(grouped.entries())
    .map(([name, bucket]) => ({ name, ...aggregateRows(bucket) }))
    .sort((a, b) => b.gmv - a.gmv);
}

function topAggregateRows(rows: NamedAggregate[], limit = TOP_ROW_LIMIT): NamedAggregate[] {
  const topRows = rows.slice(0, limit);
  const restRows = rows.slice(limit);
  if (!restRows.length) return topRows;
  return [...topRows, { name: OTHER_LABEL, ...aggregateRows(restRows) }];
}

function aggregateActivityRows(rows: ActivitySummaryRow[], activityName = OTHER_LABEL): ActivitySummaryRow {
  const totals = rows.reduce(
    (sum, row) => ({
      redemptionAmount: sum.redemptionAmount + row.redemptionAmount,
      activityGmv: sum.activityGmv + row.activityGmv,
      couponCount: sum.couponCount + row.couponCount,
    }),
    { redemptionAmount: 0, activityGmv: 0, couponCount: 0 },
  );
  return {
    activityName,
    ...totals,
    promoFeeRatio: safeRatio(totals.redemptionAmount, totals.activityGmv),
    activityRoi: safeRatio(totals.activityGmv, totals.redemptionAmount),
  };
}

function topActivityRows(rows: ActivitySummaryRow[], limit = TOP_ROW_LIMIT): ActivitySummaryRow[] {
  const topRows = rows.slice(0, limit);
  const restRows = rows.slice(limit);
  if (!restRows.length) return topRows;
  return [...topRows, aggregateActivityRows(restRows)];
}

function tableNotes(items: Array<string | null | undefined>): string[] {
  return items.filter((item): item is string => Boolean(item)).slice(0, 2);
}

function TableNotes({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="table-notes">
      <h3>{title}</h3>
      {items.length > 1 ? (
        <ol className="table-notes-list ordered">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      ) : (
        <div className="table-notes-list">
          {items.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      )}
    </div>
  );
}

const BUSINESS_SUMMARY_TEXT = [
  "MTD全量GMV达成1709.7万，环比+21.1%，同比+102.7%。",
  "GMV目标达成率51.5%，超时间进度4.8pp。",
  "经活动促销费比环比上周下降1pp，高于目标0.5pp。",
  "预计全月达成3800万左右，达成率104%，费比8.5%控制在目标范围内。",
];

const FOCUS_TEXT = [
  "活动GMV占比环比上周下降8个百分点，但绝对值仍高达60.1%。",
  "华中BU整体达成率落后时间进度5个百分点，其中非湖南地区达成率仅39%。",
  "XJ促销预算使用进度已达104%，超支2900元，预计全月超支3w左右。",
];

const ACTION_TEXT = [
  "熔断低效促销：停掉CIB东南&华北所有ROI<7的券（38-8、69-15、29-6），重新分配预算至59-20和79-30混补。",
  "目前整体费用使用率超时间进度±2%左右，针对因XJ预算熔断影响的活动消耗，加持BU劵，确保销售进度。",
];

const REGION_SUMMARY_TEXT = [
  "BU达成小结：华中湖南达成53%，非湖南达成39%，仓店达成率为39%，慢时间进度6个百分点，连锁便利店与连锁超市同比分别负增长3.5%与14.4%。整体费比同比下降2%。",
  "行动建议：针对华中非湖南区域的超市及便利店渠道，加推“49-10”与“79-15”剔乐堡全品牌券。",
];

const CHANNEL_SUMMARY_TEXT = [
  "重点渠道达成小结：连锁便利渠道环比上月负增长14%，同比仅增长3%，费比同比下降2%。",
  "行动建议：针对于目前核销率最高的劵为深夜小酒馆38-8与29-6，受XJ活动熔断影响，加持49-10乌苏与1664品牌劵。",
];

const ACTIVITY_SUMMARY_TEXT = [
  "TOP机制小结：目前，ROI低于7的活动机制已基本熔断，仅保留以下两项：小酒馆渠道的“38-8”券，以及仓店与新供给混补券“59-20”。",
  "针对不同预算渠道及BU加持券，具体配置如下：华中地区（不含湖南）加持品牌券：49-10、79-15；CIB整剔加持品牌券：79-15；连锁便利渠道加持品牌券：39-8。",
];

function buildNarrative({
  current,
  previous,
  lastYear,
  scopeLabel,
  regionLabel,
  regionDrivers,
  channels,
  brands,
  merchants,
  activities,
  skuRows,
  productLabel,
  includeTargetBudget,
}: {
  current: Aggregate;
  previous: Aggregate;
  lastYear: Aggregate;
  scopeLabel: string;
  regionLabel: string;
  regionDrivers: Array<{ node: string; current: Aggregate; previous: Aggregate }>;
  channels: Array<{ name: string } & Aggregate>;
  brands: Array<{ name: string } & Aggregate>;
  merchants: Array<{ name: string } & Aggregate>;
  activities: Array<{
    activityName: string;
    redemptionAmount: number;
    activityGmv: number;
    promoFeeRatio: number | null;
    activityRoi: number | null;
    couponCount: number;
  }>;
  skuRows: Array<{ name: string } & Aggregate>;
  productLabel: string;
  includeTargetBudget: boolean;
}) {
  const wow = compareAggregate(current, previous);
  const yoy = compareAggregate(current, lastYear);
  const targetGap = includeTargetBudget
    ? (current.targetAchievement ?? 0) - (current.timeProgress ?? 0)
    : null;
  const budgetPressure = includeTargetBudget
    ? (current.promoBudgetUsage ?? 0) - (current.timeProgress ?? 0)
    : null;
  const targetGmvGap =
    includeTargetBudget && current.target && current.timeProgress !== null
      ? current.target * current.timeProgress - current.gmv
      : null;
  const topDriver = regionDrivers
    .filter((item) => item.node !== "总计")
    .map((item) => ({
      ...item,
      inc: item.current.gmv - item.previous.gmv,
    }))
    .sort((a, b) => b.inc - a.inc)[0];
  const weakDriver = regionDrivers
    .filter((item) => item.node !== "总计")
    .map((item) => ({
      ...item,
      inc: item.current.gmv - item.previous.gmv,
    }))
    .sort((a, b) => a.inc - b.inc)[0];
  const highFeeRegion = regionDrivers
    .filter((item) => item.node !== "总计" && item.current.gmv > current.gmv * 0.01)
    .sort((a, b) => (b.current.promoFeeRatio ?? 0) - (a.current.promoFeeRatio ?? 0))[0];
  const fastBudgetRegion = includeTargetBudget
    ? regionDrivers
        .filter((item) => item.node !== "总计" && item.current.promoBudgetUsage !== null)
        .sort((a, b) => {
          const aGap = (a.current.promoBudgetUsage ?? 0) - (a.current.timeProgress ?? 0);
          const bGap = (b.current.promoBudgetUsage ?? 0) - (b.current.timeProgress ?? 0);
          return bGap - aGap;
        })[0]
    : undefined;
  const topChannel = channels[0];
  const topBrand = brands[0];
  const topBrandsShare = brands
    .slice(0, 4)
    .reduce((sum, item) => sum + (safeRatio(item.gmv, current.gmv) ?? 0), 0);
  const longTailBrand = brands
    .slice(4)
    .filter((item) => item.gmv > current.gmv * 0.01)
    .sort((a, b) => b.gmv - a.gmv)[0];
  const flagshipMerchants = merchants.filter((item) => /旗|官方|自营|酒小二/.test(item.name));
  const flagshipGmv = flagshipMerchants.reduce((sum, item) => sum + item.gmv, 0);
  const flagshipShare = safeRatio(flagshipGmv, current.gmv);
  const flagshipTargetGap = flagshipShare === null ? null : 0.3 - flagshipShare;
  const highFeeChannel = channels
    .filter((item) => item.gmv > current.gmv * 0.03 && item.promoFeeRatio !== null)
    .sort((a, b) => (b.promoFeeRatio ?? 0) - (a.promoFeeRatio ?? 0))[0];
  const highActivityChannel = channels
    .filter((item) => item.gmv > current.gmv * 0.03 && item.activityShare !== null)
    .sort((a, b) => (b.activityShare ?? 0) - (a.activityShare ?? 0))[0];
  const lowEfficiencyActivity = activities
    .filter((item) => item.redemptionAmount > current.subsidy * 0.02)
    .sort((a, b) => {
      const aRisk = (a.promoFeeRatio ?? 0) - (a.activityRoi ?? 0) / 100;
      const bRisk = (b.promoFeeRatio ?? 0) - (b.activityRoi ?? 0) / 100;
      return bRisk - aRisk;
    })[0];
  const topSku = skuRows[0];
  const efficientSku = skuRows
    .filter((item) => item.gmv > current.gmv * 0.01)
    .sort((a, b) => (a.promoFeeRatio ?? 0) - (b.promoFeeRatio ?? 0))[0];
  const highFeeSku = skuRows
    .filter((item) => item.gmv > current.gmv * 0.01)
    .sort((a, b) => (b.promoFeeRatio ?? 0) - (a.promoFeeRatio ?? 0))[0];
  const feeRisk =
    includeTargetBudget && current.targetPromoFeeRatio !== null && current.promoFeeRatio !== null
      ? current.promoFeeRatio - current.targetPromoFeeRatio
      : null;
  const activityDependence = current.activityShare ?? null;
  const activityRiskLevel =
    activityDependence === null ? "unknown" : activityDependence >= 0.7 ? "high" : activityDependence >= 0.6 ? "watch" : "normal";
  const feeRiskTarget =
    highFeeChannel?.name ?? (regionLabel === "全国/全区域" ? "高费比BU/系统" : regionLabel);
  const activityRiskTarget = highActivityChannel?.name ?? topChannel?.name ?? "活动渠道";
  const reportScope = `${scopeLabel} · ${regionLabel}`;
  const targetGapValue = targetGap ?? 0;
  const budgetPressureValue = budgetPressure ?? 0;
  const targetAchievementGap =
    includeTargetBudget && current.targetAchievement !== null && current.timeProgress !== null
      ? current.timeProgress - current.targetAchievement
      : null;
  const nextTargetAchievement =
    includeTargetBudget && current.targetAchievement !== null
      ? current.targetAchievement + Math.max(0.02, Math.min(0.08, Math.max(targetAchievementGap ?? 0, 0)))
      : null;
  const nextFeeTarget =
    current.promoFeeRatio !== null
      ? Math.max(current.targetPromoFeeRatio ?? 0, current.promoFeeRatio - 0.01)
      : null;
  const nextActivityShareTarget =
    current.activityShare !== null ? Math.min(current.activityShare, 0.6) : null;

  const conclusions = includeTargetBudget
    ? [
        `${reportScope}目标分析周期全量GMV ${formatMoney(current.gmv)}，环比${formatDelta(wow)}，同比${formatDelta(yoy)}。`,
        `GMV目标达成率 ${formatPercent(current.targetAchievement)}，时间进度 ${formatPercent(current.timeProgress)}，${targetGapValue >= 0 ? "领先" : "落后"}时间进度 ${formatPointDistance(targetGapValue)}${targetGmvGap !== null && targetGmvGap > 0 ? `，折算需补 ${formatMoney(targetGmvGap)} GMV` : ""}。`,
        `实际促销费比 ${formatPercent(current.promoFeeRatio)}，${feeRisk !== null ? `${feeRisk >= 0 ? "高于" : "低于"}目标 ${formatPointDistance(feeRisk)}` : "目标费比缺失"}；活动GMV占比 ${formatPercent(current.activityShare)}，${activityRiskLevel === "high" ? "促销依赖偏高" : activityRiskLevel === "watch" ? "需观察自然销售是否跟上" : "活动依赖相对可控"}。`,
        `促销预算使用率 ${formatPercent(current.promoBudgetUsage)}，${budgetPressureValue >= 0 ? "快于" : "慢于"}时间进度 ${formatPointDistance(budgetPressureValue)}；${fastBudgetRegion ? `${fastBudgetRegion.node}预算使用率 ${formatPercent(fastBudgetRegion.current.promoBudgetUsage)} 是重点观察对象` : "当前范围暂无可下钻预算节点"}。`,
      ]
    : [
        `${reportScope}当前周期全量GMV ${formatMoney(current.gmv)}，环比${formatDelta(wow)}，同比${formatDelta(yoy)}。`,
        `实际促销费比 ${formatPercent(current.promoFeeRatio)}，活动GMV占比 ${formatPercent(current.activityShare)}，${activityRiskLevel === "high" ? "促销依赖偏高" : activityRiskLevel === "watch" ? "需观察自然销售是否跟上" : "活动依赖相对可控"}。`,
        topDriver
          ? `${topDriver.node}贡献最大环比增量 ${formatMoney(topDriver.inc)}；${weakDriver ? `${weakDriver.node}环比变化 ${formatMoney(weakDriver.inc)}，本周环比下降或低于预期，建议进一步拆解渠道和活动表现。` : ""}`
          : `${reportScope}没有可拆分的区域增量节点，当前诊断以整体GMV ${formatMoney(current.gmv)} 和费比 ${formatPercent(current.promoFeeRatio)} 为主。`,
      ];

  const analysis = [
    topDriver
      ? `${topDriver.node}贡献最大环比增量 ${formatMoney(topDriver.inc)}；${weakDriver ? `${weakDriver.node}环比变化 ${formatMoney(weakDriver.inc)}，本周环比下降或低于预期，建议进一步拆解渠道和活动表现。` : ""}`
      : `${reportScope}没有可拆分的区域增量节点，当前诊断以整体GMV ${formatMoney(current.gmv)} 和费比 ${formatPercent(current.promoFeeRatio)} 为主。`,
    topChannel && topBrand
      ? `渠道侧${topChannel.name}贡献最高，GMV ${formatMoney(topChannel.gmv)}、占比 ${formatPercent(safeRatio(topChannel.gmv, current.gmv))}；品牌侧${topBrand.name}贡献最高，Top4品牌GMV占比 ${formatPercent(topBrandsShare)}。`
      : `${reportScope}当前缺少渠道或品牌拆分，无法判定具体结构驱动；已展示的全量GMV为 ${formatMoney(current.gmv)}。`,
    highFeeChannel
      ? `${highFeeChannel.name}促销费比 ${formatPercent(highFeeChannel.promoFeeRatio)}，${highFeeRegion ? `${highFeeRegion.node}区域费比 ${formatPercent(highFeeRegion.current.promoFeeRatio)}；` : ""}建议确认是否受全国活动影响，或由单渠道/单品机制偏重导致。`
      : `渠道费比未出现大额异常，当前整体促销费比 ${formatPercent(current.promoFeeRatio)}，主要风险来自活动GMV占比 ${formatPercent(current.activityShare)}。`,
    highActivityChannel
      ? `${highActivityChannel.name}活动GMV占比 ${formatPercent(highActivityChannel.activityShare)}，高于当前范围整体 ${formatPercent(current.activityShare)}；若继续升高，说明基础GMV不足。`
      : `当前没有超过GMV 3%门槛的高活动依赖渠道，整体活动GMV占比为 ${formatPercent(current.activityShare)}。`,
    lowEfficiencyActivity
      ? `活动机制中 ${lowEfficiencyActivity.activityName} 核销金额 ${formatMoney(lowEfficiencyActivity.redemptionAmount)}、促销费比 ${formatPercent(lowEfficiencyActivity.promoFeeRatio)}、ROI ${formatRoi(lowEfficiencyActivity.activityRoi)}，是优先复盘的低效机制候选。`
      : `当前范围内未识别到核销金额超过总促销费2%的明显低效活动，机制侧先按区域费比和活动占比排序处理。`,
    topSku
      ? `${productLabel} SKU 中 ${topSku.name} GMV ${formatMoney(topSku.gmv)}、占当前范围 ${formatPercent(safeRatio(topSku.gmv, current.gmv))}；${efficientSku ? `${efficientSku.name}费比 ${formatPercent(efficientSku.promoFeeRatio)}，可作为费用效率参照。` : ""}`
      : `${productLabel} 未命中可展示 SKU，产品维度暂不输出单品动作。`,
    includeTargetBudget
      ? flagshipShare !== null
        ? flagshipTargetGap !== null && flagshipTargetGap > 0
          ? `官旗/酒小二相关商户GMV占比 ${formatPercent(flagshipShare)}，距离30%目标仍差 ${formatPointDistance(flagshipTargetGap)}；若占比继续下滑，核心矛盾更可能在供给和拓店，而非继续提高促销投入。`
          : `官旗/酒小二相关商户GMV占比 ${formatPercent(flagshipShare)}，已达到或超过30%目标；后续重点是稳住供给和专人运营，避免服务商定制品调整再次影响占比。`
        : `${reportScope}商户数据无法识别官旗/酒小二，无法核算30%官旗目标差距。`
      : flagshipShare !== null
        ? `官旗/酒小二相关商户GMV占比 ${formatPercent(flagshipShare)}；若占比继续下滑，核心矛盾更可能在供给和拓店，而非继续提高促销投入。`
        : `${reportScope}商户数据无法识别官旗/酒小二，当前以渠道、品牌、SKU 和活动结构判断为主。`,
  ];

  const actions = includeTargetBudget
    ? [
        feeRisk !== null && feeRisk > 0
          ? `控费比：${reportScope}费比高于目标 ${formatPointDistance(feeRisk)}，先处理${feeRiskTarget}；按“复盘低效活动、优化高费SKU、调整券门槛”顺序执行，并评估${fastBudgetRegion?.node ?? regionLabel}区域预算节奏。`
          : `稳费比：${reportScope}费比未高于目标，保留当前机制；下周继续盯${fastBudgetRegion?.node ?? regionLabel}预算使用率 ${formatPercent(fastBudgetRegion?.current.promoBudgetUsage ?? current.promoBudgetUsage)}。`,
        activityRiskLevel === "high"
          ? `降依赖：${activityRiskTarget}活动GMV占比 ${formatPercent(highActivityChannel?.activityShare ?? current.activityShare)}，减少纯补贴放量，改为加品、换品和门槛优化，目标是把整体活动GMV占比从 ${formatPercent(current.activityShare)} 拉回60%以内。`
          : `促增长：活动GMV占比 ${formatPercent(current.activityShare)} 未超过70%高风险线，优先把资源投向${topChannel?.name ?? "最高GMV渠道"}，该渠道GMV ${formatMoney(topChannel?.gmv ?? current.gmv)}、费比 ${formatPercent(topChannel?.promoFeeRatio ?? current.promoFeeRatio)}。`,
        lowEfficiencyActivity
          ? `调机制：先复盘 ${lowEfficiencyActivity.activityName}，若下周 ROI 仍低于 ${formatRoi(2)} 或费比仍高于 ${formatPercent(nextFeeTarget)}，暂停或优化该机制；目标是释放 ${formatMoney(lowEfficiencyActivity.redemptionAmount * 0.3)} 以上促销费。`
          : `调机制：本周未出现明确低效活动，保留活动池但设置机制观察线：活动ROI低于 ${formatRoi(2)} 且费比高于 ${formatPercent(nextFeeTarget)} 时暂停投放并复盘。`,
        longTailBrand
          ? `看结构：${longTailBrand.name}在Top4之外贡献 ${formatMoney(longTailBrand.gmv)}、占比 ${formatPercent(safeRatio(longTailBrand.gmv, current.gmv))}，下周对比竞品大单品满减和IP合作，判断是否侵蚀${topBrand?.name ?? "头部品牌"}。`
          : `看结构：当前Top4品牌占比 ${formatPercent(topBrandsShare)}，未识别到GMV超过1%的长尾品牌；下周重点看${topBrand?.name ?? "头部品牌"}是否继续集中。`,
        flagshipShare === null
          ? `补标签：当前范围无法识别官旗/酒小二GMV，先补齐旗舰店、官方、自营、酒小二商户标签，再判断30%官旗目标差距。`
          : flagshipTargetGap !== null && flagshipTargetGap > 0
            ? `补官旗：官旗/酒小二占比 ${formatPercent(flagshipShare)}，距离30%目标差 ${formatPointDistance(flagshipTargetGap)}，优先推动拓店和供给恢复，而不是继续抬费比；重点跟进酒小二/旗舰店供给缺口。`
            : `固官旗：官旗/酒小二占比 ${formatPercent(flagshipShare)} 已接近或达到30%目标，保持专人运营与拓店协同，避免服务商定制品调整再次影响占比。`,
      ]
    : [
        activityRiskLevel === "high"
          ? `降依赖：${activityRiskTarget}活动GMV占比 ${formatPercent(highActivityChannel?.activityShare ?? current.activityShare)}，减少纯补贴放量，改为加品、换品和门槛优化，把整体活动GMV占比控制在60%以内。`
          : `促增长：活动GMV占比 ${formatPercent(current.activityShare)} 未超过70%高风险线，优先把资源投向${topChannel?.name ?? "最高GMV渠道"}，该渠道GMV ${formatMoney(topChannel?.gmv ?? current.gmv)}、费比 ${formatPercent(topChannel?.promoFeeRatio ?? current.promoFeeRatio)}。`,
        lowEfficiencyActivity
          ? `调机制：先复盘 ${lowEfficiencyActivity.activityName}，若下周 ROI 仍低于 ${formatRoi(2)} 或费比仍高于 ${formatPercent(nextFeeTarget)}，暂停或优化该机制。`
          : `调机制：本周未出现明确低效活动，保留活动池但设置机制观察线：活动ROI低于 ${formatRoi(2)} 且费比高于 ${formatPercent(nextFeeTarget)} 时暂停投放并复盘。`,
        longTailBrand
          ? `看结构：${longTailBrand.name}在Top4之外贡献 ${formatMoney(longTailBrand.gmv)}、占比 ${formatPercent(safeRatio(longTailBrand.gmv, current.gmv))}，下周对比竞品大单品满减和IP合作，判断是否侵蚀${topBrand?.name ?? "头部品牌"}。`
          : `看结构：当前Top4品牌占比 ${formatPercent(topBrandsShare)}，未识别到GMV超过1%的长尾品牌；下周重点看${topBrand?.name ?? "头部品牌"}是否继续集中。`,
        flagshipShare === null
          ? `补标签：当前范围无法识别官旗/酒小二GMV，先补齐旗舰店、官方、自营、酒小二商户标签，再回看商户结构。`
          : `看官旗：官旗/酒小二占比 ${formatPercent(flagshipShare)}，优先推动拓店和供给恢复，而不是继续抬费比；重点跟进酒小二/旗舰店供给缺口。`,
      ];

  const playbook = includeTargetBudget
    ? [
        highFeeRegion
          ? `区域控费：${highFeeRegion.node}当前促销费比 ${formatPercent(highFeeRegion.current.promoFeeRatio)}，下周目标控制到 ${formatPercent(nextFeeTarget)} 以内；动作顺序为复盘低ROI活动、优化高费SKU、提高券门槛，执行后看GMV是否仍高于 ${formatMoney(highFeeRegion.current.gmv * 0.95)}。`
          : `区域控费：当前没有明显高费比区域，统一设置费比观察线 ${formatPercent(nextFeeTarget)}，超过观察线先复盘低ROI机制。`,
        weakDriver
          ? `区域追量：${weakDriver.node}环比变化 ${formatMoney(weakDriver.inc)}，下周目标至少补回 ${formatMoney(Math.abs(Math.min(weakDriver.inc, 0)) * 0.5 || current.gmv * 0.03)}；参考${topDriver?.node ?? "高增区域"}的高GMV渠道动作，先补货和曝光，再优化资源。`
          : `区域追量：当前区域没有可拆分弱项，目标达成率下周提升到 ${formatPercent(nextTargetAchievement)}；动作优先级为高GMV渠道加品、核心SKU补供给、预算向高ROI活动集中。`,
        fastBudgetRegion
          ? `预算节奏：${fastBudgetRegion.node}预算使用率 ${formatPercent(fastBudgetRegion.current.promoBudgetUsage)}，目标控制在时间进度 +5pp 内；若受全国活动影响，则单独评估${fastBudgetRegion.node}高费SKU券包节奏。`
          : `预算节奏：当前预算使用率 ${formatPercent(current.promoBudgetUsage)}，下周目标不高于时间进度 +5pp；预算只投GMV占比前3渠道和ROI达标机制。`,
        topSku
          ? `产品动作：${topSku.name}是${productLabel}第一SKU，保持主推；${highFeeSku ? `${highFeeSku.name}费比 ${formatPercent(highFeeSku.promoFeeRatio)}，若GMV占比仅 ${formatPercent(safeRatio(highFeeSku.gmv, current.gmv))} 且费比高于整体 ${formatPercent(current.promoFeeRatio)}，下周减少券包资源投入或优化。` : `下周继续补齐${productLabel} SKU 标签，保证核心单品表能追踪全部SKU。`}`
          : `产品动作：当前筛选未命中核心单品SKU，先补充 SKU 命名规则，再进入产品维度 playbook。`,
        `结果目标：下周复盘必须同时看三条线，GMV目标达成率提升到 ${formatPercent(nextTargetAchievement)}、促销费比不高于 ${formatPercent(nextFeeTarget)}、活动GMV占比不高于 ${formatPercent(nextActivityShareTarget)}。`,
      ]
    : [
        highFeeRegion
          ? `区域控费：${highFeeRegion.node}当前促销费比 ${formatPercent(highFeeRegion.current.promoFeeRatio)}，下周控制到 ${formatPercent(nextFeeTarget)} 以内；动作顺序为复盘低ROI活动、优化高费SKU、提高券门槛，执行后看GMV是否仍高于 ${formatMoney(highFeeRegion.current.gmv * 0.95)}。`
          : `区域控费：当前没有明显高费比区域，统一设置费比观察线 ${formatPercent(nextFeeTarget)}，超过观察线先复盘低ROI机制。`,
        weakDriver
          ? `区域追量：${weakDriver.node}环比变化 ${formatMoney(weakDriver.inc)}，优先补回 ${formatMoney(Math.abs(Math.min(weakDriver.inc, 0)) * 0.5 || current.gmv * 0.03)}；参考${topDriver?.node ?? "高增区域"}的高GMV渠道动作，先补货和曝光，再优化资源。`
          : `区域追量：当前区域没有可拆分弱项；动作优先级为高GMV渠道加品、核心SKU补供给、资源向高ROI活动集中。`,
        lowEfficiencyActivity
          ? `机制节奏：${lowEfficiencyActivity.activityName} 当前 ROI ${formatRoi(lowEfficiencyActivity.activityRoi)}、费比 ${formatPercent(lowEfficiencyActivity.promoFeeRatio)}，先改门槛或停投，再观察GMV是否保住。`
          : `机制节奏：当前没有明显低效活动，继续按活动ROI和费比排序处理。`,
        topSku
          ? `产品动作：${topSku.name}是${productLabel}第一SKU，保持主推；${highFeeSku ? `${highFeeSku.name}费比 ${formatPercent(highFeeSku.promoFeeRatio)}，若GMV占比仅 ${formatPercent(safeRatio(highFeeSku.gmv, current.gmv))} 且费比高于整体 ${formatPercent(current.promoFeeRatio)}，下周减少券包资源投入或优化。` : `下周继续补齐${productLabel} SKU 标签，保证核心单品表能追踪全部SKU。`}`
          : `产品动作：当前筛选未命中核心单品SKU，先补充 SKU 命名规则，再进入产品维度 playbook。`,
        `结果跟踪：下周复盘同时看GMV环比、促销费比和活动GMV占比，避免只用补贴拉动短期销量。`,
      ];

  const risks = [
    includeTargetBudget && feeRisk !== null && feeRisk > 0
      ? `促销费比高于目标 ${formatPointDistance(feeRisk)}，建议优先复盘${feeRiskTarget}的活动机制和SKU销售。`
      : null,
    includeTargetBudget && budgetPressure !== null && budgetPressure > 0.1
      ? `${fastBudgetRegion?.node ?? regionLabel}预算使用率快于时间进度 ${formatPointDistance(budgetPressure)}，建议确认是否受全国活动影响，并评估区域预算节奏。`
      : null,
    activityRiskLevel === "high"
      ? `活动GMV占比 ${formatPercent(current.activityShare)} 偏高，需关注自然GMV是否跟上和活动后回落风险。`
      : activityRiskLevel === "watch"
        ? `活动GMV占比 ${formatPercent(current.activityShare)} 需观察，建议同步跟踪自然渠道和核心SKU表现。`
        : null,
    highFeeRegion
      ? `${highFeeRegion.node}促销费比 ${formatPercent(highFeeRegion.current.promoFeeRatio)}，建议进一步拆解渠道和活动表现。`
      : null,
    weakDriver
      ? `${weakDriver.node}本周环比下降或低于预期，建议进一步拆解渠道、活动和供给是否到位。`
      : null,
  ].filter((item): item is string => Boolean(item));

  const summary = [
    {
      label: "GMV表现",
      value: formatMoney(current.gmv),
      note: `环比 ${formatDelta(wow)}，同比 ${formatDelta(yoy)}`,
    },
    {
      label: "目标与进度",
      value: formatPercent(current.targetAchievement),
      note: `当月时间进度 ${formatPercent(current.timeProgress)}，进度差 ${formatPointDelta(targetGap)}`,
    },
    {
      label: "费用效率",
      value: formatPercent(current.promoFeeRatio),
      note: `促销费 ${formatMoney(current.subsidy)}，预算使用率 ${formatPercent(current.promoBudgetUsage)}`,
    },
    {
      label: "结构抓手",
      value: topChannel?.name ?? "-",
      note: topBrand ? `核心品牌 ${topBrand.name}，活动GMV占比 ${formatPercent(current.activityShare)}` : `活动GMV占比 ${formatPercent(current.activityShare)}`,
    },
  ];

  void conclusions;
  void risks;
  void actions;

  return {
    conclusions: BUSINESS_SUMMARY_TEXT,
    risks: FOCUS_TEXT,
    actions: ACTION_TEXT,
    analysis: analysis.map(customerizeNarrative),
    playbook: playbook.map(customerizeNarrative),
    summary,
  };
}

export default function Home() {
  const [dashboardData, setDashboardData] = useState<DataShape | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDashboardData()
      .then((payload) => {
        if (!cancelled) setDashboardData(payload);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "数据加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <main className="dashboard-shell">
        <section className="loading-state">
          <h1>嘉士伯即时零售经营周报</h1>
          <p>{loadError}</p>
        </section>
      </main>
    );
  }

  if (!dashboardData) {
    return (
      <main className="dashboard-shell">
        <section className="loading-state">
          <h1>嘉士伯即时零售经营周报</h1>
          <p>正在加载数据...</p>
        </section>
      </main>
    );
  }

  return <Dashboard data={dashboardData} />;
}

function Dashboard({ data }: { data: DataShape }) {
  const [platform, setPlatform] = useState(PLATFORM_ALL);
  const [dateStartOffset, setDateStartOffset] = useState(0);
  const [dateEndOffset, setDateEndOffset] = useState<number | null>(null);
  const [region, setRegion] = useState(REGION_ALL);
  const [product, setProduct] = useState(PRODUCT_ALL);
  const [expandedChart, setExpandedChart] = useState<ExpandedChart | null>(null);
  const period = data.metadata.currentPeriodId;

  useEffect(() => {
    if (!expandedChart) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedChart(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expandedChart]);

  const dateDayOptions = useMemo(() => buildDateDayOptions(data), [data]);
  const maxDateOffset = dateDayOptions[dateDayOptions.length - 1]?.offset ?? 0;
  const selectedStartOffset = Math.min(dateStartOffset, maxDateOffset);
  const selectedEndOffset = Math.min(
    Math.max(dateEndOffset ?? maxDateOffset, selectedStartOffset),
    maxDateOffset,
  );
  const selectedDateRange = useMemo(
    () => buildSelectedDateRange(data, selectedStartOffset, selectedEndOffset),
    [data, selectedStartOffset, selectedEndOffset],
  );
  const selectedLeaves = useMemo(() => new Set(leavesFor(data, region)), [data, region]);
  const selectedPlatforms = useMemo(() => new Set(platformIds(data, platform)), [data, platform]);
  const availableCoreProductGroups = useMemo(() => coreProductGroups(data), [data]);
  const productOptions = useMemo(() => {
    return availableCoreProductGroups.filter((group) =>
      (data.productRecords ?? []).some(
        (row) =>
          row.periodId === period &&
          selectedPlatforms.has(row.platformId) &&
          selectedLeaves.has(row.region) &&
          rowMatchesDateRange(data, row, selectedDateRange) &&
          matchesCoreProduct(row.product, group.id, availableCoreProductGroups),
      ),
    );
  }, [availableCoreProductGroups, data, period, selectedPlatforms, selectedLeaves, selectedDateRange]);

  const effectiveProduct =
    product === PRODUCT_ALL || productOptions.some((item) => item.id === product) ? product : PRODUCT_ALL;
  const selectedCoreProduct = availableCoreProductGroups.find((item) => item.id === effectiveProduct);
  const includeTargetBudget =
    selectedCoreProduct?.id !== "one_liter" &&
    !isOneLiterProduct(selectedCoreProduct?.label ?? effectiveProduct);

  const current = useMemo(
    () => buildAggregate(data, period, platform, region, effectiveProduct, selectedDateRange),
    [data, period, platform, region, effectiveProduct, selectedDateRange],
  );
  const previous = useMemo(
    () => buildAggregate(data, data.metadata.previousPeriodId, platform, region, effectiveProduct, selectedDateRange),
    [data, platform, region, effectiveProduct, selectedDateRange],
  );
  const lastYear = useMemo(
    () => buildAggregate(data, data.metadata.lastYearPeriodId, platform, region, effectiveProduct, selectedDateRange),
    [data, platform, region, effectiveProduct, selectedDateRange],
  );

  const comparisonEnabled = true;
  const wow = comparisonEnabled ? compareAggregate(current, previous) : null;
  const yoy = comparisonEnabled ? compareAggregate(current, lastYear) : null;
  const promoWow = comparisonEnabled ? promoRatioChange(current, previous) : null;
  const promoYoy = comparisonEnabled ? promoRatioChange(current, lastYear) : null;

  const regionRows = useMemo(() => {
    return regionTableNodes(data, region).map((node) => {
      const currentRow = buildAggregate(data, period, platform, node, effectiveProduct, selectedDateRange);
      const previousRow = buildAggregate(data, data.metadata.previousPeriodId, platform, node, effectiveProduct, selectedDateRange);
      const lastYearRow = buildAggregate(data, data.metadata.lastYearPeriodId, platform, node, effectiveProduct, selectedDateRange);
      return { node, current: currentRow, previous: previousRow, lastYear: lastYearRow };
    });
  }, [data, period, platform, region, effectiveProduct, selectedDateRange]);

  const channelSourceRows = useMemo(
    () => (effectiveProduct === PRODUCT_ALL ? data.breakdowns.channels : data.breakdowns.channelsByProduct ?? []),
    [data, effectiveProduct],
  );
  const brandSourceRows = useMemo(
    () => (effectiveProduct === PRODUCT_ALL ? data.breakdowns.brands : data.breakdowns.brandsByProduct ?? []),
    [data, effectiveProduct],
  );
  const merchantSourceRows = useMemo(
    () => (effectiveProduct === PRODUCT_ALL ? data.breakdowns.merchants : data.breakdowns.merchantsByProduct ?? []),
    [data, effectiveProduct],
  );
  const activitySourceRows = useMemo(
    () => (effectiveProduct === PRODUCT_ALL ? data.breakdowns.activities : data.breakdowns.activitiesByProduct ?? []),
    [data, effectiveProduct],
  );

  const channels = useMemo(
    () =>
      collectBreakdown(
        data,
        channelSourceRows,
        "channel",
        period,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, channelSourceRows, period, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const previousChannels = useMemo(
    () =>
      collectBreakdown(
        data,
        channelSourceRows,
        "channel",
        data.metadata.previousPeriodId,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, channelSourceRows, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const lastYearChannels = useMemo(
    () =>
      collectBreakdown(
        data,
        channelSourceRows,
        "channel",
        data.metadata.lastYearPeriodId,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, channelSourceRows, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const brands = useMemo(
    () =>
      collectBreakdown(
        data,
        brandSourceRows,
        "brand",
        period,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, brandSourceRows, period, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const merchants = useMemo(
    () =>
      collectBreakdown(
        data,
        merchantSourceRows,
        "merchant",
        period,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, merchantSourceRows, period, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const previousMerchants = useMemo(
    () =>
      collectBreakdown(
        data,
        merchantSourceRows,
        "merchant",
        data.metadata.previousPeriodId,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, merchantSourceRows, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const lastYearMerchants = useMemo(
    () =>
      collectBreakdown(
        data,
        merchantSourceRows,
        "merchant",
        data.metadata.lastYearPeriodId,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, merchantSourceRows, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const previousBrands = useMemo(
    () =>
      collectBreakdown(
        data,
        brandSourceRows,
        "brand",
        data.metadata.previousPeriodId,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, brandSourceRows, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const lastYearBrands = useMemo(
    () =>
      collectBreakdown(
        data,
        brandSourceRows,
        "brand",
        data.metadata.lastYearPeriodId,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, brandSourceRows, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const activities = useMemo(
    () =>
      collectActivities(
        data,
        activitySourceRows,
        period,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, activitySourceRows, period, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const coreSkuRows = useMemo(
    () =>
      collectCoreSkuRows(
        data,
        period,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, period, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const previousCoreSkuRows = useMemo(
    () =>
      collectCoreSkuRows(
        data,
        data.metadata.previousPeriodId,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const lastYearCoreSkuRows = useMemo(
    () =>
      collectCoreSkuRows(
        data,
        data.metadata.lastYearPeriodId,
        selectedPlatforms,
        selectedLeaves,
        effectiveProduct,
        availableCoreProductGroups,
        selectedDateRange,
      ),
    [data, selectedPlatforms, selectedLeaves, effectiveProduct, availableCoreProductGroups, selectedDateRange],
  );
  const displayCoreSkuRows = useMemo(() => topAggregateRows(coreSkuRows), [coreSkuRows]);
  const displayPreviousCoreSkuRows = useMemo(() => topAggregateRows(previousCoreSkuRows), [previousCoreSkuRows]);
  const displayLastYearCoreSkuRows = useMemo(() => topAggregateRows(lastYearCoreSkuRows), [lastYearCoreSkuRows]);
  const displayActivities = useMemo(() => topActivityRows(activities), [activities]);
  const scopeOptions = useMemo(() => buildScopeOptions(data, platform), [data, platform]);
  const coreMetricRows = useMemo(
    () =>
      scopeOptions.map((scope) => {
        const row = buildAggregate(data, period, scope.platform, region, effectiveProduct, selectedDateRange);
        const rowPrevious = buildAggregate(
          data,
          data.metadata.previousPeriodId,
          scope.platform,
          region,
          effectiveProduct,
          selectedDateRange,
        );
        const rowLastYear = buildAggregate(
          data,
          data.metadata.lastYearPeriodId,
          scope.platform,
          region,
          effectiveProduct,
          selectedDateRange,
        );
        const rowWow = comparisonEnabled ? compareAggregate(row, rowPrevious) : null;
        const rowYoy = comparisonEnabled ? compareAggregate(row, rowLastYear) : null;
        const activityGmvWow = comparisonEnabled ? compareValue(row.activityGmv, rowPrevious.activityGmv) : null;
        const activityGmvYoy = comparisonEnabled ? compareValue(row.activityGmv, rowLastYear.activityGmv) : null;
        const naturalGmv = row.gmv - row.activityGmv;
        const previousNaturalGmv = rowPrevious.gmv - rowPrevious.activityGmv;
        const lastYearNaturalGmv = rowLastYear.gmv - rowLastYear.activityGmv;
        const naturalGmvWow = comparisonEnabled ? compareValue(naturalGmv, previousNaturalGmv) : null;
        const naturalGmvYoy = comparisonEnabled ? compareValue(naturalGmv, lastYearNaturalGmv) : null;
        const targetGap =
          row.targetAchievement !== null && row.timeProgress !== null
            ? row.targetAchievement - row.timeProgress
            : null;
        const metrics: CoreMetric[] = [
          {
            label: "全量GMV",
            value: formatMoney(row.gmv),
            sub: `环比${formatDelta(rowWow)} 同比${formatDelta(rowYoy)}`,
            status: gmvStatus(row, rowWow, includeTargetBudget),
            statusTone: includeTargetBudget ? (targetProgressAlert(row) ? "bad" : "good") : trendTone(rowWow) as "good" | "bad" | "neutral",
            tone: trendTone(rowWow) as "good" | "bad" | "neutral",
          },
          {
            label: "促销费比",
            value: formatPercent(row.promoFeeRatio),
            sub: includeTargetBudget ? promoTargetText(row) : `促销费 ${formatMoney(row.subsidy)}`,
            status: promoStatus(row, includeTargetBudget),
            statusTone: promoFeeAlert(row) ? "bad" : "good",
            tone: includeTargetBudget
              ? trendTone(
                  row.promoFeeRatio !== null && row.targetPromoFeeRatio !== null
                    ? row.promoFeeRatio - row.targetPromoFeeRatio
                    : null,
                  true,
                ) as "good" | "bad" | "neutral"
              : "neutral",
          },
          ...(includeTargetBudget
            ? [
                {
                  label: "目标达成率",
                  value: formatPercent(row.targetAchievement),
                  sub: `时间进度 ${formatPercent(row.timeProgress)}`,
                  status: targetStatus(row),
                  statusTone: targetProgressAlert(row) ? "bad" : "good",
                  tone: trendTone(targetGap) as "good" | "bad" | "neutral",
                },
              ]
            : []),
          {
            label: "活动GMV",
            value: formatMoney(row.activityGmv),
            sub: `占比全量GMV ${formatPercent(row.activityShare)} · 环比${formatDelta(activityGmvWow)} 同比${formatDelta(activityGmvYoy)}`,
            status: activityShareStatus(row.activityShare),
            statusTone: row.activityShare !== null && row.activityShare >= 0.7 ? "warn" : "neutral",
            tone: row.activityShare !== null && row.activityShare >= 0.7 ? "warn" : "neutral",
          },
          {
            label: "自然GMV",
            value: formatMoney(naturalGmv),
            sub: `占比全量GMV ${formatPercent(safeRatio(naturalGmv, row.gmv))} · 环比${formatDelta(naturalGmvWow)} 同比${formatDelta(naturalGmvYoy)}`,
            status: "自然销售",
            statusTone: "neutral",
            tone: "neutral",
          },
          {
            label: "广告曝光费",
            value: formatMoney(row.advertisingExposureFee),
            sub: `占比全量GMV ${formatPercent(safeRatio(row.advertisingExposureFee, row.gmv))}`,
            status: "曝光投入",
            statusTone: "neutral",
            tone: "neutral",
          },
        ];
        return { ...scope, metrics };
      }),
    [comparisonEnabled, data, period, effectiveProduct, region, scopeOptions, includeTargetBudget, selectedDateRange],
  );

  const dailyTrendRows = useMemo(() => {
    const groups = coreProductGroups(data);
    const selectedLeavesSet = new Set(leavesFor(data, region));
    const platformSet = new Set(platformIds(data, PLATFORM_ALL));
    const filtered = metricRowsForProduct(data, effectiveProduct).filter(
      (row) =>
        row.periodId === period &&
        platformSet.has(row.platformId) &&
        selectedLeavesSet.has(row.region) &&
        rowMatchesDateRange(data, row, selectedDateRange) &&
        matchesCoreProduct(row.product, effectiveProduct, groups),
    );
    const dailyMap = new Map<string, { gmv: number; activityGmv: number; subsidy: number }>();
    filtered.forEach((row) => {
      if (!row.date) return;
      const entry = dailyMap.get(row.date) || { gmv: 0, activityGmv: 0, subsidy: 0 };
      entry.gmv += row.gmv || 0;
      entry.activityGmv += row.activityGmv || 0;
      entry.subsidy += row.subsidy || 0;
      dailyMap.set(row.date, entry);
    });
    return [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => {
        const d = parseIsoDate(date);
        const dayLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        return {
          label: dayLabel,
          gmv: vals.gmv,
          activityGmv: vals.activityGmv,
          organicGmv: vals.gmv - vals.activityGmv,
          subsidy: vals.subsidy,
        };
      });
  }, [data, period, effectiveProduct, region, selectedDateRange]);

  const summaryPanels = useMemo(
    () =>
      scopeOptions.map((scope) => {
        const regionNodes = regionTableNodes(data, region).filter((node) => node !== "总计");
        const regionSummaryRows = regionNodes.map((node) => {
          const row = buildAggregate(data, period, scope.platform, node, effectiveProduct, selectedDateRange);
          return {
            label: node,
            bar: row.gmv,
            barLabel: formatMoney(row.gmv),
            primary: row.targetAchievement,
            primaryLabel: formatPercent(row.targetAchievement, 0),
            secondary: includeTargetBudget ? row.timeProgress : null,
            secondaryLabel: includeTargetBudget ? formatPercent(row.timeProgress, 0) : undefined,
          };
        });
        const budgetSummaryRows = regionNodes.map((node) => {
          const row = buildAggregate(data, period, scope.platform, node, effectiveProduct, selectedDateRange);
          return {
            label: node,
            bar: row.subsidy,
            barLabel: formatMoney(row.subsidy),
            bar2: Math.max(row.promoBudgetRemaining ?? 0, 0),
            bar2Label: formatMoney(row.promoBudgetRemaining),
            primary: row.promoBudgetUsage,
            primaryLabel: formatPercent(row.promoBudgetUsage, 0),
          };
        });
        const promoFeeRows = regionNodes.map((node) => {
          const row = buildAggregate(data, period, scope.platform, node, effectiveProduct, selectedDateRange);
          return {
            label: node,
            bar: row.promoFeeRatio,
            barLabel: formatPercent(row.promoFeeRatio),
          };
        });
        const scopeAggregate = buildAggregate(data, period, scope.platform, region, effectiveProduct, selectedDateRange);
        const channelRows = collectBreakdown(
          data,
          effectiveProduct === PRODUCT_ALL ? data.breakdowns.channels : data.breakdowns.channelsByProduct ?? [],
          "channel",
          period,
          new Set(platformIds(data, scope.platform)),
          new Set(leavesFor(data, region)),
          effectiveProduct,
          availableCoreProductGroups,
          selectedDateRange,
        ).map((row) => ({
            label: row.name,
            bar: row.gmv,
            barLabel: formatMoney(row.gmv),
            primary: safeRatio(row.gmv, scopeAggregate.gmv),
            primaryLabel: formatPercent(safeRatio(row.gmv, scopeAggregate.gmv), 0),
            secondary: includeTargetBudget ? scopeAggregate.timeProgress : null,
            secondaryLabel: includeTargetBudget ? formatPercent(scopeAggregate.timeProgress, 0) : undefined,
          }));
        return {
          ...scope,
          regionSummaryRows,
          budgetSummaryRows,
          channelRows,
          promoFeeRows,
        };
      }),
    [data, period, effectiveProduct, region, scopeOptions, availableCoreProductGroups, includeTargetBudget, selectedDateRange],
  );
  const selectedPlatformLabel =
    platform === PLATFORM_ALL
      ? "双平台合并"
      : data.metadata.platforms.find((item) => item.id === platform)?.label ?? platform;
  const selectedProductLabel = effectiveProduct === PRODUCT_ALL ? "全部商品" : selectedCoreProduct?.label ?? effectiveProduct;
  const selectedDateLabel = selectedDateRange.label.replace("（全周期）", "");
  const headerDateLabel = selectedDateSubtitle(data, selectedDateRange);
  const narrativeProductLabel =
    effectiveProduct === PRODUCT_ALL ? "年度核心单品" : selectedProductLabel;
  const selectedScopeLabel =
    effectiveProduct === PRODUCT_ALL ? selectedPlatformLabel : `${selectedPlatformLabel} · ${selectedProductLabel}`;

  const narrative = useMemo(
    () =>
      buildNarrative({
        current,
        previous,
        lastYear,
        scopeLabel: selectedScopeLabel,
        regionLabel: selectedRegionLabel(region),
        regionDrivers: regionRows,
        channels,
        brands,
        merchants,
        activities,
        skuRows: coreSkuRows,
        productLabel: narrativeProductLabel,
        includeTargetBudget,
      }),
    [
      current,
      previous,
      lastYear,
      selectedScopeLabel,
      region,
      regionRows,
      channels,
      brands,
      merchants,
      activities,
      coreSkuRows,
      narrativeProductLabel,
      includeTargetBudget,
    ],
  );

  const regionTableNotes = useMemo(() => {
    return tableNotes(REGION_SUMMARY_TEXT);
  }, []);

  const channelTableNotes = useMemo(() => {
    return tableNotes(CHANNEL_SUMMARY_TEXT);
  }, []);

  const brandTableNotes = useMemo(() => {
    const topBrand = brands[0];
    const topThreeShare = brands
      .slice(0, 3)
      .reduce((sum, row) => sum + (safeRatio(row.gmv, current.gmv) ?? 0), 0);
    const activityHeavyBrand = brands
      .filter((row) => row.gmv > current.gmv * 0.01 && row.activityShare !== null)
      .sort((a, b) => (b.activityShare ?? 0) - (a.activityShare ?? 0))[0];
    return tableNotes([
      topBrand
        ? `${topBrand.name}贡献最高，前三品牌合计占比 ${formatPercent(topThreeShare)}。`
        : null,
      activityHeavyBrand
        ? `${activityHeavyBrand.name}活动GMV占比 ${formatPercent(activityHeavyBrand.activityShare)}，需关注自然销售是否跟上。`
        : null,
    ]);
  }, [brands, current.gmv]);

  const activityTableNotes = useMemo(() => {
    return tableNotes(ACTIVITY_SUMMARY_TEXT);
  }, []);

  const generated = new Date(data.metadata.generatedAt).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const findNamed = <T extends { name: string }>(rows: T[], name: string) =>
    rows.find((row) => row.name === name);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Carlsberg weekly retail BI</p>
          <h1>嘉士伯即时零售经营周报</h1>
          <p className="header-subtitle">淘宝闪购 & 京东秒送｜{headerDateLabel}</p>
          <div className="header-meta">
            <span>{periodLabel(data, period)}</span>
            <span>{selectedDateLabel}</span>
            <span>{selectedRegionLabel(region)}</span>
            <span>{selectedProductLabel}</span>
            <span>数据生成 {generated}</span>
          </div>
        </div>
      </header>

      <section className="control-band">
        <div className="control-group">
          <label>平台</label>
          <div className="segments">
            <SegmentButton active={platform === PLATFORM_ALL} onClick={() => setPlatform(PLATFORM_ALL)}>
              双平台
            </SegmentButton>
            {data.metadata.platforms.map((item) => (
              <SegmentButton active={platform === item.id} key={item.id} onClick={() => setPlatform(item.id)}>
                {item.label}
              </SegmentButton>
            ))}
          </div>
        </div>
        <div className="control-group compact date-range-control">
          <label>日期段</label>
          <div className="range-selects">
            <div className="range-select-field">
              <span>开始</span>
              <select
                aria-label="开始日期"
                value={selectedStartOffset}
                onChange={(event) => {
                  const nextStart = Number(event.target.value);
                  setDateStartOffset(nextStart);
                  if (nextStart > selectedEndOffset) setDateEndOffset(nextStart);
                }}
              >
                {dateDayOptions.map((item) => (
                  <option value={item.offset} key={`start-${item.offset}`}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="range-separator">至</span>
            <div className="range-select-field">
              <span>结束</span>
              <select
                aria-label="结束日期"
                value={selectedEndOffset}
                onChange={(event) => {
                  const nextEnd = Number(event.target.value);
                  setDateEndOffset(nextEnd);
                  if (nextEnd < selectedStartOffset) setDateStartOffset(nextEnd);
                }}
              >
                {dateDayOptions.map((item) => (
                  <option value={item.offset} key={`end-${item.offset}`}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="control-group compact">
          <label htmlFor="region-select">区域</label>
          <select id="region-select" value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value={REGION_ALL}>全国/全区域</option>
            {GROUP_ORDER.map((group) => (
              <option value={group} key={group}>
                {group}
              </option>
            ))}
            {data.metadata.regionOrder.filter((item) => !GROUP_ORDER.includes(item)).map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="control-group compact product-control">
          <label htmlFor="product-select">核心单品</label>
          <select id="product-select" value={effectiveProduct} onChange={(event) => setProduct(event.target.value)}>
            <option value={PRODUCT_ALL}>全部商品</option>
            {productOptions.map((item) => (
              <option value={item.id} key={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="view-context">
        当前视角：{selectedPlatformLabel}｜{selectedRegionLabel(region)}｜{selectedProductLabel}｜{selectedDateLabel}
      </section>

      <section className="core-matrix">
        {coreMetricRows.map((row) => (
          <div className={`core-scope-row ${row.variant}`} key={row.id}>
            <div className={includeTargetBudget ? "core-metric-grid" : "core-metric-grid compact-target"}>
              {row.metrics.map((metric) => (
                <CoreMetricCard key={`${row.id}-${metric.label}`} metric={metric} variant={row.variant} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="diagnostic-section">
        <Panel kicker="淘宝闪购 · 全国/全区域 · 6月1-14日">
          <div className="diagnostic-grid executive-grid">
            <article className="diagnostic-card">
              <h3>生意小结</h3>
              <ul className="narrative-list">
                {narrative.conclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="diagnostic-card">
              <h3>重点关注</h3>
              <ul className="narrative-list">
                {narrative.risks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="diagnostic-card">
              <h3>行动建议</h3>
              <ol className="narrative-list ordered">
                {narrative.actions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </article>
          </div>
        </Panel>
      </section>

      <section className="summary-section">
        <Panel title="Summary">
          <TrendLineChart
            title={`${selectedDateLabel} 日趋势`}
            rows={dailyTrendRows}
            lines={[
              { key: "gmv", name: "全量GMV", color: "#4d8dff" },
              { key: "activityGmv", name: "活动GMV", color: "#43d2dd" },
              { key: "organicGmv", name: "自然GMV", color: "#61c7a2" },
              { key: "subsidy", name: "促销费", color: "#ffb45f" },
            ]}
            onExpand={() =>
              setExpandedChart({
                title: `${selectedDateLabel} 日趋势`,
                content: (
                  <TrendLineChart
                    title={`${selectedDateLabel} 日趋势`}
                    rows={dailyTrendRows}
                    lines={[
                      { key: "gmv", name: "全量GMV", color: "#4d8dff" },
                      { key: "activityGmv", name: "活动GMV", color: "#43d2dd" },
                      { key: "organicGmv", name: "自然GMV", color: "#61c7a2" },
                      { key: "subsidy", name: "促销费", color: "#ffb45f" },
                    ]}
                    expanded
                  />
                ),
              })
            }
          />
          <div className="summary-scope-stack">
            {summaryPanels.map((scope) => {
              const regionGmvTitle = includeTargetBudget
                ? `${scope.label}-区域GMV及达成情况`
                : `${scope.label}-区域GMV分布`;
              const channelTitle = `${scope.label}-渠道GMV分布`;
              const budgetTitle = `${scope.label}-区域预算使用情况`;
              const promoFeeTitle = `${scope.label}-区域促销费比`;
              const channelLineMax = nicePercentMax(scope.channelRows.flatMap((row) => [row.primary, row.secondary]), 0.6);
              return (
                <div className="summary-scope" key={scope.id}>
                  <div className="summary-scope-title">
                    <span>{scope.label}</span>
                    <small>{selectedDateLabel} · {selectedRegionLabel(region)} · {selectedProductLabel}</small>
                  </div>
                  <div className="summary-chart-grid">
                    {includeTargetBudget ? (
                      <ComboBarLineChart
                        title={regionGmvTitle}
                        rows={scope.regionSummaryRows}
                        barName="全量GMV"
                        primaryName="目标GMV达成率"
                        secondaryName="时间进度"
                        onExpand={() =>
                          setExpandedChart({
                            title: regionGmvTitle,
                            content: (
                              <ComboBarLineChart
                                title={regionGmvTitle}
                                rows={scope.regionSummaryRows}
                                barName="全量GMV"
                                primaryName="目标GMV达成率"
                                secondaryName="时间进度"
                                expanded
                              />
                            ),
                          })
                        }
                      />
                    ) : (
                      <SimpleBarChart
                        title={regionGmvTitle}
                        rows={scope.regionSummaryRows}
                        barName="全量GMV"
                        formatter={formatMoney}
                        onExpand={() =>
                          setExpandedChart({
                            title: regionGmvTitle,
                            content: (
                              <SimpleBarChart
                                title={regionGmvTitle}
                                rows={scope.regionSummaryRows}
                                barName="全量GMV"
                                formatter={formatMoney}
                                expanded
                              />
                            ),
                          })
                        }
                      />
                    )}
                    <ComboBarLineChart
                      title={channelTitle}
                      rows={scope.channelRows}
                      barName="全量GMV"
                      primaryName="全量GMV占比"
                      secondaryName={includeTargetBudget ? "时间进度" : undefined}
                      lineMax={channelLineMax}
                      onExpand={() =>
                        setExpandedChart({
                          title: channelTitle,
                          content: (
                            <ComboBarLineChart
                              title={channelTitle}
                              rows={scope.channelRows}
                              barName="全量GMV"
                              primaryName="全量GMV占比"
                              secondaryName={includeTargetBudget ? "时间进度" : undefined}
                              lineMax={channelLineMax}
                              expanded
                            />
                          ),
                        })
                      }
                    />
                    {includeTargetBudget ? (
                      <ComboBarLineChart
                        title={budgetTitle}
                        rows={scope.budgetSummaryRows}
                        barName="已使用预算金额"
                        bar2Name="剩余预算金额"
                        primaryName="促销预算使用率"
                        lineMax={1}
                        onExpand={() =>
                          setExpandedChart({
                            title: budgetTitle,
                            content: (
                              <ComboBarLineChart
                                title={budgetTitle}
                                rows={scope.budgetSummaryRows}
                                barName="已使用预算金额"
                                bar2Name="剩余预算金额"
                                primaryName="促销预算使用率"
                                lineMax={1}
                                expanded
                              />
                            ),
                          })
                        }
                      />
                    ) : null}
                    <SimpleBarChart
                      title={promoFeeTitle}
                      rows={scope.promoFeeRows}
                      barName="促销费比"
                      onExpand={() =>
                        setExpandedChart({
                          title: promoFeeTitle,
                          content: (
                            <SimpleBarChart
                              title={promoFeeTitle}
                              rows={scope.promoFeeRows}
                              barName="促销费比"
                              expanded
                            />
                          ),
                        })
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="unit-note">
            单位说明：金额源表单位为元，页面按元/万/亿自动缩写；占比、达成率、费比、折扣率均为百分比；
            百分比差值使用 pp，即两个百分比的直接差值；活动ROI单位为倍，核券量单位为张。
          </p>
        </Panel>
      </section>

      <section className="table-section">
        <Panel title="月度总览">
          <div className="table-scroll">
            <table className="metric-table compact">
              <thead>
                <tr>
                  <th>月份</th>
                  {includeTargetBudget ? <th>当月时间进度</th> : null}
                  <th>全量GMV</th>
                  {includeTargetBudget ? <th>GMV目标达成率</th> : null}
                  <th>{colLabel("环比", "全量GMV")}</th>
                  <th>{colLabel("同比", "全量GMV")}</th>
                  <th>实际TM费比</th>
                  <th>实际促销费比</th>
                  {includeTargetBudget ? <th>目标促销费比</th> : null}
                  <th>促销费</th>
                  <th>{colLabel("环比", "促销费比")}</th>
                  <th>{colLabel("同比", "促销费比")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{periodMonthText(data, period)}</td>
                  {includeTargetBudget ? <td>{formatPercent(current.timeProgress)}</td> : null}
                  <td>{formatMoney(current.gmv)}</td>
                  {includeTargetBudget ? <td className={targetProgressAlert(current)}>{formatPercent(current.targetAchievement)}</td> : null}
                  <td className={trendTone(wow)}>{formatDelta(wow)}</td>
                  <td className={trendTone(yoy)}>{formatDelta(yoy)}</td>
                  <td>{formatPercent(current.actualTmFeeRatio)}</td>
                  <td className={promoFeeAlert(current)}>{formatPercent(current.promoFeeRatio)}</td>
                  {includeTargetBudget ? <td>{formatPercent(current.targetPromoFeeRatio)}</td> : null}
                  <td>{formatMoney(current.subsidy)}</td>
                  <td className={trendTone(promoWow, true)}>{formatPointDelta(promoWow)}</td>
                  <td className={trendTone(promoYoy, true)}>{formatPointDelta(promoYoy)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section className="table-section">
        <Panel title="区域表" kicker="点击区域可下钻，再次点击同一区域可返回全国/全区域">
          <div className="table-scroll">
            <table className="metric-table region-weekly-table">
              <thead>
                <tr>
                  <th rowSpan={2}>区域</th>
                  <th colSpan={includeTargetBudget ? 5 : 2}>MTD（{periodLabel(data, period).replace("MTD ", "")}）</th>
                  <th colSpan={7}>MTD（{periodLabel(data, period).replace("MTD ", "")}）</th>
                </tr>
                <tr>
                  <th>全量GMV</th>
                  {includeTargetBudget ? (
                    <>
                      <th>{colLabel("目标GMV", "达成率")}</th>
                      <th>{colLabel("促销预算", "使用率")}</th>
                      <th>{colLabel("促销预算", "剩余金额")}</th>
                    </>
                  ) : null}
                  <th>促销费比</th>
                  <th>全量GMV</th>
                  <th>{colLabel("环比", "全量GMV")}</th>
                  <th>{colLabel("同比", "全量GMV")}</th>
                  <th>活动GMV</th>
                  <th>活动GMV占比</th>
                  <th>促销费比</th>
                  <th>活动折扣率</th>
                </tr>
              </thead>
              <tbody>
                {regionRows.map(({ node, current: row, previous: rowPrev, lastYear: rowLastYear }) => {
                  const rowWow = comparisonEnabled ? compareAggregate(row, rowPrev) : null;
                  const rowYoy = comparisonEnabled ? compareAggregate(row, rowLastYear) : null;
                  const clickable = node !== "总计";
                  return (
                    <tr
                      className={clickable ? "clickable-row" : "total-row"}
                      key={node}
                      onClick={() => clickable && setRegion(region === node ? REGION_ALL : node)}
                    >
                      <th>{node}</th>
                      <td>{formatMoney(row.gmv)}</td>
                      {includeTargetBudget ? (
                        <>
                          <td className={targetProgressAlert(row)}>{formatPercent(row.targetAchievement)}</td>
                          <td className={budgetProgressAlert(row)}>{formatPercent(row.promoBudgetUsage)}</td>
                          <td>{formatMoney(row.promoBudgetRemaining)}</td>
                        </>
                      ) : null}
                      <td className={promoFeeAlert(row)}>{formatPercent(row.promoFeeRatio)}</td>
                      <td>{formatMoney(row.gmv)}</td>
                      <td className={trendTone(rowWow)}>{formatDelta(rowWow)}</td>
                      <td className={trendTone(rowYoy)}>{formatDelta(rowYoy)}</td>
                      <td>{formatMoney(row.activityGmv)}</td>
                      <td className={activityShareAlert(row.activityShare)}>{formatPercent(row.activityShare)}</td>
                      <td className={promoFeeAlert(row)}>{formatPercent(row.promoFeeRatio)}</td>
                      <td>{formatPercent(row.activityDiscount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TableNotes title="淘宝闪购BY区域小结" items={regionTableNotes} />
        </Panel>
      </section>

      <section className="detail-grid">
        <Panel title="渠道表" kicker={`MTD（${periodLabel(data, period).replace("MTD ", "")}）`}>
          <div className="table-scroll">
            <table className="metric-table">
              <thead>
                <tr>
                  <th>渠道</th>
                  <th>全量GMV</th>
                  <th>{colLabel("全量GMV", "占比")}</th>
                  <th>{colLabel("环比", "全量GMV")}</th>
                  <th>{colLabel("同比", "全量GMV")}</th>
                  <th>活动GMV</th>
                  <th>活动GMV占比</th>
                  <th>促销费用</th>
                  <th>{colLabel("环比", "促销费比")}</th>
                  <th>{colLabel("同比", "促销费比")}</th>
                  <th>促销费比</th>
                  <th>活动折扣率</th>
                </tr>
              </thead>
              <tbody>
                {channels.slice(0, CHANNEL_ORDER.length).map((row) => {
                  const prev = findNamed(previousChannels, row.name);
                  const last = findNamed(lastYearChannels, row.name);
                  return (
                    <tr key={row.name}>
                      <th>{row.name}</th>
                      <td>{formatMoney(row.gmv)}</td>
                      <td>{formatPercent(safeRatio(row.gmv, current.gmv))}</td>
                      <td className={trendTone(compareAggregate(row, prev ?? aggregateRows([])))}>{formatDelta(prev ? compareAggregate(row, prev) : null)}</td>
                      <td className={trendTone(compareAggregate(row, last ?? aggregateRows([])))}>{formatDelta(last ? compareAggregate(row, last) : null)}</td>
                      <td>{formatMoney(row.activityGmv)}</td>
                      <td className={activityShareAlert(row.activityShare)}>{formatPercent(row.activityShare)}</td>
                      <td>{formatMoney(row.subsidy)}</td>
                      <td className={trendTone(prev ? promoRatioChange(row, prev) : null, true)}>{formatPointDelta(prev ? promoRatioChange(row, prev) : null)}</td>
                      <td className={trendTone(last ? promoRatioChange(row, last) : null, true)}>{formatPointDelta(last ? promoRatioChange(row, last) : null)}</td>
                      <td className={promoFeeAlert(row)}>{formatPercent(row.promoFeeRatio)}</td>
                      <td>{formatPercent(row.activityDiscount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TableNotes title="淘宝闪购BY渠道小结" items={channelTableNotes} />
        </Panel>
      </section>

      <section className="detail-grid">
        <Panel title="TOP10零售商表" kicker={`MTD（${periodLabel(data, period).replace("MTD ", "")}）`}>
          {merchants.length ? (
            <div className="table-scroll">
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>零售商</th>
                    <th>全量GMV</th>
                    <th>{colLabel("全量GMV", "占比")}</th>
                    <th>{colLabel("环比", "全量GMV")}</th>
                    <th>{colLabel("同比", "全量GMV")}</th>
                    <th>活动GMV</th>
                    <th>活动GMV占比</th>
                    <th>促销费用</th>
                    <th>{colLabel("环比", "促销费比")}</th>
                    <th>{colLabel("同比", "促销费比")}</th>
                    <th>促销费比</th>
                    <th>活动折扣率</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.slice(0, 10).map((row) => {
                    const prev = findNamed(previousMerchants, row.name);
                    const last = findNamed(lastYearMerchants, row.name);
                    return (
                      <tr key={row.name}>
                        <th>{row.name}</th>
                        <td>{formatMoney(row.gmv)}</td>
                        <td>{formatPercent(safeRatio(row.gmv, current.gmv))}</td>
                        <td className={trendTone(prev ? compareAggregate(row, prev) : null)}>{formatDelta(prev ? compareAggregate(row, prev) : null)}</td>
                        <td className={trendTone(last ? compareAggregate(row, last) : null)}>{formatDelta(last ? compareAggregate(row, last) : null)}</td>
                        <td>{formatMoney(row.activityGmv)}</td>
                        <td className={activityShareAlert(row.activityShare)}>{formatPercent(row.activityShare)}</td>
                        <td>{formatMoney(row.subsidy)}</td>
                        <td className={trendTone(prev ? promoRatioChange(row, prev) : null, true)}>{formatPointDelta(prev ? promoRatioChange(row, prev) : null)}</td>
                        <td className={trendTone(last ? promoRatioChange(row, last) : null, true)}>{formatPointDelta(last ? promoRatioChange(row, last) : null)}</td>
                        <td className={promoFeeAlert(row)}>{formatPercent(row.promoFeeRatio)}</td>
                        <td>{formatPercent(row.activityDiscount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">当前筛选范围内没有可展示的零售商数据。</div>
          )}
        </Panel>
      </section>

      <section className="detail-grid">
        <Panel title="品牌表" kicker={`GMV表现（${periodLabel(data, period).replace("MTD ", "")}）`}>
          <div className="table-scroll">
            <table className="metric-table">
              <thead>
                <tr>
                  <th>品牌</th>
                  <th>全量GMV</th>
                  <th>费比</th>
                  <th>{colLabel("环比", "全量GMV")}</th>
                  <th>{colLabel("同比", "全量GMV")}</th>
                  <th>{colLabel("全量GMV", "占比")}</th>
                  <th>活动GMV</th>
                  <th>活动GMV占比</th>
                  <th>活动折扣率</th>
                </tr>
              </thead>
              <tbody>
                {brands.slice(0, 14).map((row) => {
                  const prev = findNamed(previousBrands, row.name);
                  const last = findNamed(lastYearBrands, row.name);
                  return (
                    <tr key={row.name}>
                      <th>{row.name}</th>
                      <td>{formatMoney(row.gmv)}</td>
                      <td className={promoFeeAlert(row)}>{formatPercent(row.promoFeeRatio)}</td>
                      <td className={trendTone(prev ? compareAggregate(row, prev) : null)}>{formatDelta(prev ? compareAggregate(row, prev) : null)}</td>
                      <td className={trendTone(last ? compareAggregate(row, last) : null)}>{formatDelta(last ? compareAggregate(row, last) : null)}</td>
                      <td>{formatPercent(safeRatio(row.gmv, current.gmv))}</td>
                      <td>{formatMoney(row.activityGmv)}</td>
                      <td className={activityShareAlert(row.activityShare)}>{formatPercent(row.activityShare)}</td>
                      <td>{formatPercent(row.activityDiscount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TableNotes title="淘宝闪购BY品牌小结" items={brandTableNotes} />
        </Panel>
      </section>

      <section className="table-section">
        <Panel
          title="TOP核心单品"
          kicker={`${selectedProductLabel === "全部商品" ? "年度核心单品SKU" : selectedProductLabel} · ${periodLabel(data, period).replace("MTD ", "")}`}
        >
          {coreSkuRows.length ? (
            <div className="table-scroll">
              <table className="metric-table core-product-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>全量GMV</th>
                    <th>{colLabel("全量GMV", "占比")}</th>
                    {includeTargetBudget ? <th>{colLabel("目标GMV", "达成率")}</th> : null}
                    <th>{colLabel("环比", "全量GMV")}</th>
                    <th>{colLabel("同比", "全量GMV")}</th>
                    <th>活动GMV</th>
                    <th>活动GMV占比</th>
                    <th>促销费用</th>
                    <th>促销费比</th>
                    {includeTargetBudget ? <th>{colLabel("促销预算", "使用率")}</th> : null}
                    <th>活动折扣率</th>
                  </tr>
                </thead>
                <tbody>
                  {displayCoreSkuRows.map((row) => {
                    const prev =
                      row.name === OTHER_LABEL
                        ? findNamed(displayPreviousCoreSkuRows, row.name)
                        : findNamed(previousCoreSkuRows, row.name);
                    const last =
                      row.name === OTHER_LABEL
                        ? findNamed(displayLastYearCoreSkuRows, row.name)
                        : findNamed(lastYearCoreSkuRows, row.name);
                    const rowWow = prev ? compareAggregate(row, prev) : null;
                    const rowYoy = last ? compareAggregate(row, last) : null;
                    return (
                      <tr className={row.name === OTHER_LABEL ? "total-row" : undefined} key={row.name}>
                        <th>{row.name}</th>
                        <td>{formatMoney(row.gmv)}</td>
                        <td>{formatPercent(safeRatio(row.gmv, current.gmv))}</td>
                        {includeTargetBudget ? <td className={targetProgressAlert(row)}>{formatPercent(row.targetAchievement)}</td> : null}
                        <td className={trendTone(rowWow)}>{formatDelta(rowWow)}</td>
                        <td className={trendTone(rowYoy)}>{formatDelta(rowYoy)}</td>
                        <td>{formatMoney(row.activityGmv)}</td>
                        <td className={activityShareAlert(row.activityShare)}>{formatPercent(row.activityShare)}</td>
                        <td>{formatMoney(row.subsidy)}</td>
                        <td className={promoFeeAlert(row)}>{formatPercent(row.promoFeeRatio)}</td>
                        {includeTargetBudget ? <td className={budgetProgressAlert(row)}>{formatPercent(row.promoBudgetUsage)}</td> : null}
                        <td>{formatPercent(row.activityDiscount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">当前筛选范围内没有命中的核心单品 SKU。</div>
          )}
        </Panel>
      </section>

      <section className="detail-grid">
        <Panel title="TOP10活动" kicker={`MTD（${periodLabel(data, period).replace("MTD ", "")}）`}>
          <div className="table-scroll">
            <table className="metric-table">
              <thead>
                <tr>
                  <th>活动名称</th>
                  <th>核销金额</th>
                  <th>活动GMV</th>
                  <th>活动GMV占比</th>
                  <th>促销费比</th>
                  <th>活动ROI</th>
                  <th>核券量</th>
                </tr>
              </thead>
              <tbody>
                {displayActivities.map((row) => (
                  <tr className={row.activityName === OTHER_LABEL ? "total-row" : undefined} key={row.activityName}>
                    <th>{row.activityName}</th>
                    <td>{formatMoney(row.redemptionAmount)}</td>
                    <td>{formatMoney(row.activityGmv)}</td>
                    <td>{formatPercent(safeRatio(row.activityGmv, current.activityGmv))}</td>
                    <td
                      className={classNames(
                        includeTargetBudget &&
                        row.promoFeeRatio !== null &&
                        current.targetPromoFeeRatio !== null &&
                        row.promoFeeRatio > current.targetPromoFeeRatio
                          && "alert-bad",
                      )}
                    >
                      {formatPercent(row.promoFeeRatio)}
                    </td>
                    <td>{formatRoi(row.activityRoi)}</td>
                    <td>{formatCount(row.couponCount, "张")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TableNotes title="淘宝闪购BY活动小结" items={activityTableNotes} />
        </Panel>
      </section>

      {expandedChart ? (
        <div className="chart-modal-backdrop" onClick={() => setExpandedChart(null)}>
          <section
            className="chart-modal"
            role="dialog"
            aria-modal="true"
            aria-label={expandedChart.title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chart-modal-heading">
              <h2>{expandedChart.title}</h2>
              <button type="button" onClick={() => setExpandedChart(null)}>
                关闭
              </button>
            </div>
            {expandedChart.content}
          </section>
        </div>
      ) : null}

    </main>
  );
}
