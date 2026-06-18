"use client";

import { useEffect, useMemo, useState } from "react";

declare const __DATA_CACHE_VERSION__: string | undefined;

type Summary = {
  gmv?: number | null;
  quantity?: number | null;
  orders?: number | null;
  users?: number | null;
  activityGmv?: number | null;
  subsidy?: number | null;
  couponCount?: number | null;
  naturalGmv?: number | null;
  activityShare?: number | null;
  promoFeeRatio?: number | null;
  activityRoi?: number | null;
};

type Breakdown = Summary & {
  platform?: string;
  region?: string;
  channel?: string;
  merchant?: string;
  brand?: string;
  product?: string;
  activityName?: string;
};

type FullRecord = {
  date: string;
  region: string;
  channel: string;
  brand: string;
  product: string;
  gmv?: number | null;
  quantity?: number | null;
  orders?: number | null;
  users?: number | null;
};

type BillRecord = {
  date: string;
  region: string;
  channel: string;
  brand: string;
  product: string;
  activityName: string;
  activityGmv?: number | null;
  subsidy?: number | null;
  orderId?: string | null;
};

type FlagshipData = {
  metadata: {
    title: string;
    generatedAt: string;
    definition: string;
    period: {
      id: string;
      label: string;
      start: string;
      end: string;
    };
    channelOrder: string[];
    detailFiles: {
      full: string;
      bill: string;
    };
    sourceStats: Array<{
      platformLabel: string;
      fullRows: number;
      billRows: number;
      fullGmv: number;
      billActivityGmv: number;
      billSubsidy: number;
    }>;
  };
  summary: Summary;
  breakdowns: {
    platforms: Breakdown[];
    regions: Breakdown[];
    channels: Breakdown[];
    merchants: Breakdown[];
    brands: Breakdown[];
    activities: Breakdown[];
    products: Breakdown[];
  };
  records?: {
    full: FullRecord[];
    bill: BillRecord[];
  };
};

const DATA_CACHE_VERSION =
  typeof __DATA_CACHE_VERSION__ === "string" ? __DATA_CACHE_VERSION__ : "local";
const DATA_FILE = "flagship-data.json";

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
  const script = document.querySelector<HTMLScriptElement>('script[src*="/assets/"]');
  const assetPath = script ? new URL(script.src, window.location.href).pathname : "";
  const marker = "/assets/";
  const assetIndex = assetPath.indexOf(marker);
  if (assetIndex >= 0) return withVersion(`${assetPath.slice(0, assetIndex + 1)}data/${cleanFile}`);

  const { pathname } = window.location;
  const currentBase = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return withVersion(`${currentBase}../data/${cleanFile}`);
}

function isRealNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numeric(value: number | null | undefined): number {
  return isRealNumber(value) ? value : 0;
}

function roundMetric(value: number | null | undefined, digits = 4): number | null {
  if (!isRealNumber(value)) return null;
  return Number(value.toFixed(digits));
}

function safeDiv(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function dateOffset(start: string, value: string): number {
  const diff = parseIsoDate(value).getTime() - parseIsoDate(start).getTime();
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatRangeLabel(start: string, startOffset: number, endOffset: number): string {
  const startDate = addDays(parseIsoDate(start), startOffset);
  const endDate = addDays(parseIsoDate(start), endOffset);
  if (startOffset === endOffset) return formatMonthDay(startDate);
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startDate.getMonth() + 1}月${startDate.getDate()}-${endDate.getDate()}日`;
  }
  return `${formatMonthDay(startDate)}-${formatMonthDay(endDate)}`;
}

function formatMoney(value: number | null | undefined): string {
  if (!isRealNumber(value)) return "";
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function buildDateOptions(data: FlagshipData) {
  const start = parseIsoDate(data.metadata.period.start);
  const endOffset = dateOffset(data.metadata.period.start, data.metadata.period.end);
  return Array.from({ length: endOffset + 1 }, (_, offset) => ({
    offset,
    label: formatMonthDay(addDays(start, offset)),
  }));
}

function regionOptions(data: FlagshipData): string[] {
  const values = new Set<string>();
  data.records?.full.forEach((row) => values.add(row.region));
  data.records?.bill.forEach((row) => values.add(row.region));
  return [...values].filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function matchesFilter(
  row: { date: string; region: string },
  data: FlagshipData,
  startOffset: number,
  endOffset: number,
  region: string,
) {
  const offset = dateOffset(data.metadata.period.start, row.date);
  const dateMatched = offset >= startOffset && offset <= endOffset;
  const regionMatched = region === "all" || row.region === region;
  return dateMatched && regionMatched;
}

function summarizeRows(full: FullRecord[], bill: BillRecord[]): Summary {
  const hasFullRows = full.length > 0;
  const gmv = full.reduce((sum, row) => sum + numeric(row.gmv), 0);
  const activityGmv = bill.reduce((sum, row) => sum + numeric(row.activityGmv), 0);
  const subsidy = bill.reduce((sum, row) => sum + numeric(row.subsidy), 0);
  const orderIds = new Set(bill.map((row) => row.orderId?.trim()).filter(Boolean));
  return {
    gmv: hasFullRows ? roundMetric(gmv, 2) : null,
    quantity: hasFullRows ? roundMetric(full.reduce((sum, row) => sum + numeric(row.quantity), 0), 2) : null,
    orders: hasFullRows ? roundMetric(full.reduce((sum, row) => sum + numeric(row.orders), 0), 2) : null,
    users: hasFullRows ? roundMetric(full.reduce((sum, row) => sum + numeric(row.users), 0), 2) : null,
    activityGmv: roundMetric(activityGmv, 2),
    subsidy: roundMetric(subsidy, 2),
    couponCount: orderIds.size,
    naturalGmv: hasFullRows ? roundMetric(gmv - activityGmv, 2) : null,
    activityShare: hasFullRows ? roundMetric(safeDiv(activityGmv, gmv)) : null,
    promoFeeRatio: hasFullRows ? roundMetric(safeDiv(subsidy, gmv)) : null,
    activityRoi: roundMetric(safeDiv(activityGmv, subsidy)),
  };
}

function aggregateFilteredRows(
  full: FullRecord[],
  bill: BillRecord[],
  fullKey: keyof FullRecord,
  billKey: keyof BillRecord,
  outputKey: keyof Breakdown,
  sortKey: keyof Summary = "gmv",
): Breakdown[] {
  const fullMap = new Map<string, FullRecord[]>();
  const billMap = new Map<string, BillRecord[]>();
  full.forEach((row) => {
    const key = String(row[fullKey] ?? "").trim();
    if (!key) return;
    fullMap.set(key, [...(fullMap.get(key) ?? []), row]);
  });
  bill.forEach((row) => {
    const key = String(row[billKey] ?? "").trim();
    if (!key) return;
    billMap.set(key, [...(billMap.get(key) ?? []), row]);
  });
  const keys = new Set([...fullMap.keys(), ...billMap.keys()]);
  const rows = [...keys].map((key) => ({
    [outputKey]: key,
    ...summarizeRows(fullMap.get(key) ?? [], billMap.get(key) ?? []),
  })) as Breakdown[];
  rows.sort((a, b) => numeric(b[sortKey]) - numeric(a[sortKey]));
  return rows;
}

function buildFilteredData(
  data: FlagshipData,
  startOffset: number,
  endOffset: number,
  region: string,
): Pick<FlagshipData, "summary" | "breakdowns"> {
  const full = (data.records?.full ?? []).filter((row) => matchesFilter(row, data, startOffset, endOffset, region));
  const bill = (data.records?.bill ?? []).filter((row) => matchesFilter(row, data, startOffset, endOffset, region));
  if (!data.records) {
    return { summary: data.summary, breakdowns: data.breakdowns };
  }
  return {
    summary: summarizeRows(full, bill),
    breakdowns: {
      platforms: [],
      regions: aggregateFilteredRows(full, bill, "region", "region", "region"),
      channels: aggregateFilteredRows(full, bill, "channel", "channel", "channel"),
      merchants: [],
      brands: aggregateFilteredRows(full, bill, "brand", "brand", "brand"),
      activities: aggregateFilteredRows([], bill, "product", "activityName", "activityName", "activityGmv"),
      products: aggregateFilteredRows(full, bill, "product", "product", "product"),
    },
  };
}

function formatNumber(value: number | null | undefined): string {
  if (!isRealNumber(value)) return "";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatPercent(value: number | null | undefined): string {
  if (!isRealNumber(value)) return "";
  return `${(value * 100).toFixed(1)}%`;
}

function formatRoi(value: number | null | undefined): string {
  if (!isRealNumber(value)) return "";
  return `${value.toFixed(1)}x`;
}

function generatedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Panel({ title, children, subtitle }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <p>{subtitle ?? "淘宝闪购 · 官旗四渠道 · 6月1-14日"}</p>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <article className="core-metric-card merged neutral">
      <div className="core-metric-topline">
        <div className="core-metric-label">{label}</div>
      </div>
      <div className="core-metric-value">{value}</div>
      <div className="core-metric-sub">{sub ?? ""}</div>
    </article>
  );
}

function tableRows(rows: Breakdown[], key: keyof Breakdown, limit = 10) {
  return rows
    .filter((row) => String(row[key] ?? "").trim())
    .slice(0, limit);
}

function SummaryTable({ rows, nameKey }: { rows: Breakdown[]; nameKey: keyof Breakdown }) {
  return (
    <div className="table-scroll">
      <table className="metric-table compact">
        <thead>
          <tr>
            <th>{nameKey === "activityName" ? "活动" : "名称"}</th>
            <th>全量GMV</th>
            <th>活动GMV</th>
            <th>活动GMV占比</th>
            <th>促销费</th>
            <th>促销费比</th>
            <th>ROI</th>
            <th>订单/核券量</th>
          </tr>
        </thead>
        <tbody>
          {tableRows(rows, nameKey).map((row) => (
            <tr key={`${nameKey}-${String(row[nameKey])}`}>
              <td>{String(row[nameKey] ?? "")}</td>
              <td>{formatMoney(row.gmv)}</td>
              <td>{formatMoney(row.activityGmv)}</td>
              <td>{formatPercent(row.activityShare)}</td>
              <td>{formatMoney(row.subsidy)}</td>
              <td>{formatPercent(row.promoFeeRatio)}</td>
              <td>{formatRoi(row.activityRoi)}</td>
              <td>{formatNumber(nameKey === "activityName" ? row.couponCount : row.orders)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildNotes(data: FlagshipData): string[] {
  const topChannel = data.breakdowns.channels[0];
  const topActivity = data.breakdowns.activities[0];
  return [
    topChannel
      ? `1. ${topChannel.channel}贡献最高，GMV ${formatMoney(topChannel.gmv)}，活动GMV ${formatMoney(topChannel.activityGmv)}。`
      : "",
    topActivity
      ? `2. TOP活动为${topActivity.activityName}，活动GMV ${formatMoney(topActivity.activityGmv)}。`
      : "",
  ].filter(Boolean);
}

function DetailLinks({ data }: { data: FlagshipData }) {
  const fullUrl = publicDataUrl(data.metadata.detailFiles.full);
  const billUrl = publicDataUrl(data.metadata.detailFiles.bill);
  return (
    <div className="download-links">
      <a href={fullUrl} download>
        下载全量明细 CSV
      </a>
      <a href={billUrl} download>
        下载账单明细 CSV
      </a>
    </div>
  );
}

export default function FlagshipReport() {
  const [data, setData] = useState<FlagshipData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dateStartOffset, setDateStartOffset] = useState(0);
  const [dateEndOffset, setDateEndOffset] = useState<number | null>(null);
  const [region, setRegion] = useState("all");

  useEffect(() => {
    let cancelled = false;
    fetchJson<FlagshipData>(publicDataUrl(DATA_FILE))
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "数据加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dateOptions = useMemo(() => (data ? buildDateOptions(data) : []), [data]);
  const maxDateOffset = dateOptions[dateOptions.length - 1]?.offset ?? 0;
  const selectedStartOffset = Math.min(dateStartOffset, maxDateOffset);
  const selectedEndOffset = Math.min(Math.max(dateEndOffset ?? maxDateOffset, selectedStartOffset), maxDateOffset);
  const selectedDateLabel = data
    ? formatRangeLabel(data.metadata.period.start, selectedStartOffset, selectedEndOffset)
    : "";
  const regions = useMemo(() => (data ? regionOptions(data) : []), [data]);
  const selectedRegionLabel = region === "all" ? "全国/全区域" : region;
  const visibleData = useMemo(
    () => (data ? buildFilteredData(data, selectedStartOffset, selectedEndOffset, region) : null),
    [data, selectedStartOffset, selectedEndOffset, region],
  );
  const notes = data && visibleData ? buildNotes({ ...data, ...visibleData }) : [];

  if (loadError) {
    return (
      <main className="dashboard-shell">
        <section className="loading-state">
          <h1>嘉士伯官旗即时零售周报</h1>
          <p>{loadError}</p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="dashboard-shell">
        <section className="loading-state">
          <h1>嘉士伯官旗即时零售周报</h1>
          <p>正在加载数据...</p>
        </section>
      </main>
    );
  }

  if (!visibleData) {
    return null;
  }

  const generated = generatedLabel(data.metadata.generatedAt);

  return (
    <main className="dashboard-shell flagship-report">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Carlsberg flagship weekly BI</p>
          <h1>嘉士伯官旗即时零售周报</h1>
          <p className="header-subtitle">淘宝闪购｜{data.metadata.period.label}</p>
          <div className="header-meta">
            <span>酒小二 / 惠宜选 / 永辉 / 西菲狸</span>
            <span>{selectedDateLabel}</span>
            <span>{selectedRegionLabel}</span>
            <span>数据生成 {generated}</span>
          </div>
        </div>
      </header>

      <section className="control-band flagship-controls">
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
                {dateOptions.map((item) => (
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
                {dateOptions.map((item) => (
                  <option value={item.offset} key={`end-${item.offset}`}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="control-group compact">
          <label htmlFor="flagship-region-select">区域</label>
          <select id="flagship-region-select" value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="all">全国/全区域</option>
            {regions.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="view-context">
        当前视角：淘宝闪购｜{selectedRegionLabel}｜{selectedDateLabel}。{data.metadata.definition}
      </section>

      <section className="core-matrix">
        <div className="metric-scope-block merged">
          <div className="metric-scope-title">官旗经营总览</div>
          <div className="core-metric-grid">
            <MetricCard label="全量GMV" value={formatMoney(visibleData.summary.gmv)} sub="目标达成率 " />
            <MetricCard label="活动GMV" value={formatMoney(visibleData.summary.activityGmv)} sub={`占比 ${formatPercent(visibleData.summary.activityShare)}`} />
            <MetricCard label="自然GMV" value={formatMoney(visibleData.summary.naturalGmv)} sub="全量GMV - 活动GMV" />
            <MetricCard label="促销费" value={formatMoney(visibleData.summary.subsidy)} sub={`费比 ${formatPercent(visibleData.summary.promoFeeRatio)}`} />
            <MetricCard label="活动ROI" value={formatRoi(visibleData.summary.activityRoi)} sub={`核券量 ${formatNumber(visibleData.summary.couponCount)}`} />
          </div>
        </div>
      </section>

      <section className="overview-grid">
        <Panel title="生意小结">
          <ul className="table-notes-list">
            {notes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="重点关注">
          <p className="empty-note">目标、预算和环同比数据暂未接入官旗口径，先保留为空白。</p>
        </Panel>
        <Panel title="行动建议">
          <p className="empty-note">先用官旗全量明细与账单明细核对商户、商品和活动口径，再补充目标和预算。</p>
        </Panel>
      </section>

      <section className="table-section">
        <Panel title="月度总览">
          <div className="table-scroll">
            <table className="metric-table compact">
              <thead>
                <tr>
                  <th>周期</th>
                  <th>全量GMV</th>
                  <th>活动GMV</th>
                  <th>自然GMV</th>
                  <th>活动GMV占比</th>
                  <th>促销费</th>
                  <th>促销费比</th>
                  <th>活动ROI</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{selectedDateLabel}</td>
                  <td>{formatMoney(visibleData.summary.gmv)}</td>
                  <td>{formatMoney(visibleData.summary.activityGmv)}</td>
                  <td>{formatMoney(visibleData.summary.naturalGmv)}</td>
                  <td>{formatPercent(visibleData.summary.activityShare)}</td>
                  <td>{formatMoney(visibleData.summary.subsidy)}</td>
                  <td>{formatPercent(visibleData.summary.promoFeeRatio)}</td>
                  <td>{formatRoi(visibleData.summary.activityRoi)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="区域表">
          <SummaryTable rows={visibleData.breakdowns.regions} nameKey="region" />
        </Panel>

        <Panel title="渠道表">
          <SummaryTable rows={visibleData.breakdowns.channels} nameKey="channel" />
        </Panel>

        <Panel title="TOP10商品表">
          <SummaryTable rows={visibleData.breakdowns.products.slice(0, 10)} nameKey="product" />
        </Panel>

        <Panel title="TOP10活动表">
          <SummaryTable rows={visibleData.breakdowns.activities} nameKey="activityName" />
        </Panel>

        <Panel title="官旗数据明细">
          <DetailLinks data={data} />
        </Panel>
      </section>
    </main>
  );
}
