from __future__ import annotations

import json
import math
import os
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd


WORKSPACE = Path(__file__).resolve().parents[1]
SOURCE_DIR = Path(
    os.environ.get(
        "SOURCE_DIR",
        "/Users/luffy/Desktop/Project/A_即时零售交付新路线探索/嘉士伯周报数据源",
    )
)
OUTPUT_JSON = Path(
    os.environ.get("OUTPUT_JSON", WORKSPACE / "public" / "data" / "dashboard-data.json")
)
LOGIC_DOC = Path(os.environ.get("LOGIC_DOC", WORKSPACE / "docs" / "取数逻辑说明.md"))
EXPENSE_UPDATE_FILE = SOURCE_DIR / "6月目标&费用更新.xlsx"

CURRENT_PERIOD_ID = "0601-0614"
PREVIOUS_PERIOD_ID = "0501-0514"
LAST_YEAR_PERIOD_ID = "25年0601-0614"


PERIODS = [
    {
        "id": PREVIOUS_PERIOD_ID,
        "label": "MTD 5.1-5.14",
        "shortLabel": "5.1-5.14",
        "kind": "previous",
        "start": "2026-05-01",
        "end": "2026-05-14",
        "monthKey": 202605,
        "monthLabel": "2026年5月",
        "sourceIds": ["0501-0507", "0508-0514"],
    },
    {
        "id": CURRENT_PERIOD_ID,
        "label": "MTD 6.1-6.14",
        "shortLabel": "6.1-6.14",
        "kind": "current",
        "start": "2026-06-01",
        "end": "2026-06-14",
        "monthKey": 202606,
        "monthLabel": "2026年6月",
        "sourceIds": ["0601-0607", "0608-0614"],
        "sourceOverrides": {
            "jd": {
                "账单数据明细-京东到家.csv": ["0601-0607", "0608-0612", "0613-0614"],
            },
        },
    },
    {
        "id": LAST_YEAR_PERIOD_ID,
        "label": "去年同期 6.1-6.14",
        "shortLabel": "2025 6.1-6.14",
        "kind": "last_year",
        "start": "2025-06-01",
        "end": "2025-06-14",
        "monthKey": 202506,
        "monthLabel": "2025年6月",
        "sourceIds": ["25年0601-0607", "25年0608-0614"],
    },
]

PLATFORMS = {
    "taobao": {
        "label": "淘宝闪购",
        "sourcePlatform": "饿了么",
        "fullSuffix": "全量数据明细-淘宝闪购.csv",
        "billSuffix": "账单数据明细-淘宝闪购.csv",
        "gmvColumn": "销售额",
        "quantityColumn": "销量",
        "ordersColumn": "订单量",
        "usersColumn": "下单用户数",
        "billActivityColumn": "商品原价总额",
        "billSubsidyColumn": "品牌补贴总额",
        "billOrderColumn": "饿了么订单号",
        "billCampaignColumn": "活动名称",
    },
    "jd": {
        "label": "京东秒送",
        "sourcePlatform": "京东到家",
        "fullSuffix": "全量数据明细-京东到家.csv",
        "billSuffix": "账单数据明细-京东到家.csv",
        "gmvColumn": "gmv（元）",
        "quantityColumn": "商品销量（件）",
        "ordersColumn": "订单编号",
        "usersColumn": None,
        "billActivityColumn": "商品gov",
        "billSubsidyColumn": "品牌计费金额-未税",
        "billOrderColumn": "营销订单id",
        "billCampaignColumn": "补贴名称",
    },
}

REGION_PARENT = {
    "CBC-CQ": "CBC",
    "CBC-SC": "CBC",
    "CIB东南": "CIB",
    "CIB华北": "CIB",
    "CIB华南": "CIB",
    "CIB苏皖": "CIB",
    "NX": "NX",
    "XJ": "XJ",
    "YN": "YN",
    "华中-湖南": "华中",
    "华中-非湖南": "华中",
    "未识别": "未识别",
}

REGION_GROUPS = {
    "CBC": ["CBC-CQ", "CBC-SC"],
    "CIB": ["CIB东南", "CIB华北", "CIB华南", "CIB苏皖"],
    "华中": ["华中-湖南", "华中-非湖南"],
    "NX": ["NX"],
    "XJ": ["XJ"],
    "YN": ["YN"],
    "未识别": ["未识别"],
}

REGION_ORDER = [
    "CBC-CQ",
    "CBC-SC",
    "CIB东南",
    "CIB华北",
    "CIB华南",
    "CIB苏皖",
    "NX",
    "XJ",
    "YN",
    "华中-湖南",
    "华中-非湖南",
    "未识别",
]

CORE_PRODUCT_GROUPS = [
    {
        "id": "one_liter",
        "label": "一升装（1L）",
        "alias": "一生装",
        "description": "会议中提到的年度核心单品，按商品名中出现 1L/１L 的规格识别。",
        "matchPattern": r"(?:1\s*[lLＬｌ]|１\s*[lLＬｌ])",
    }
]

CHANNEL_ORDER = ["酒类专营店", "乌苏啤酒/WUSU", "连锁便利店", "连锁超市", "仓店", "其他"]
CHANNEL_ALIASES = {
    "中仓店": "仓店",
    "闪电仓": "仓店",
}
WUSU_MERCHANT_NAME = "乌苏啤酒/WUSU"
SHANLIDA_CHANNEL_NAME = "闪力达"
TAOBAO_WAREHOUSE_BILL_MERCHANTS = {
    "瓜呱便利连锁管理",
    "百惠优选",
    "小飞象连锁超市",
    "佳佳超市连锁管理",
    "熊喵喝喝",
}
DATE_COLUMN_CANDIDATES = ["日期", "账单时间", "业务发生时间", "订单时间", "订单完成时间"]
EXPENSE_PLATFORM_MAP = {
    "淘宝闪购": "饿了么",
    "京东秒送": "京东到家",
}


def clean_number(value: Any) -> float:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return 0.0
    if isinstance(value, str):
        value = value.replace(",", "").replace("%", "").strip()
        if value in {"", "-", "*****"}:
            return 0.0
    return float(pd.to_numeric(value, errors="coerce") or 0.0)


def assign_group_metric(
    bu_budget: dict[tuple[str, int, str], dict[str, float]],
    platform: str,
    month_key: int,
    region: str,
    field: str,
    value: float,
) -> None:
    if region in REGION_PARENT:
        bu_budget.setdefault((platform, month_key, region), {})[field] = value
        return

    children = REGION_GROUPS.get(region)
    if not children:
        return

    weights = [
        clean_number(bu_budget.get((platform, month_key, child), {}).get("buTarget"))
        for child in children
    ]
    weight_total = sum(weights)
    if not weight_total:
        weights = [1.0 for _ in children]
        weight_total = sum(weights)

    allocated_total = 0.0
    for index, child in enumerate(children):
        if index == len(children) - 1:
            allocated = value - allocated_total
        else:
            allocated = value * weights[index] / weight_total
            allocated_total += allocated
        bu_budget.setdefault((platform, month_key, child), {})[field] = allocated


def apply_expense_update(
    bu_budget: dict[tuple[str, int, str], dict[str, float]],
) -> None:
    if not EXPENSE_UPDATE_FILE.exists():
        return

    raw = pd.read_excel(EXPENSE_UPDATE_FILE, sheet_name="6月整体费用", header=None)
    platform_label = ""
    for column_index in range(1, raw.shape[1]):
        header_platform = raw.iat[0, column_index]
        if pd.notna(header_platform):
            platform_label = str(header_platform).strip()
        metric_name = str(raw.iat[1, column_index]).strip()
        if metric_name != "广告曝光费":
            continue
        platform = EXPENSE_PLATFORM_MAP.get(platform_label)
        if not platform:
            continue
        for row_index in range(2, raw.shape[0]):
            region = str(raw.iat[row_index, 0]).strip()
            if region in {"", "nan", "None", "汇总", "总计"}:
                continue
            assign_group_metric(
                bu_budget,
                platform,
                202606,
                region,
                "advertisingExposureFee",
                clean_number(raw.iat[row_index, column_index]),
            )


def safe_div(numerator: float, denominator: float) -> float | None:
    if not denominator:
        return None
    return numerator / denominator


def round_float(value: Any, digits: int = 4) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return round(number, digits)


def normalize_channel_fields(df: pd.DataFrame) -> pd.DataFrame:
    if "清洗_渠道" not in df.columns:
        return df
    if {"渠道名称", "清洗_商户"}.issubset(df.columns):
        shanlida = df["渠道名称"].astype(str).str.strip().eq(SHANLIDA_CHANNEL_NAME)
        df.loc[shanlida, "清洗_商户"] = SHANLIDA_CHANNEL_NAME
        df.loc[shanlida, "清洗_渠道"] = "闪电仓"
    if {"饿了么订单号", "清洗_商户"}.issubset(df.columns):
        warehouse_bill_merchants = df["清洗_商户"].astype(str).str.strip().isin(TAOBAO_WAREHOUSE_BILL_MERCHANTS)
        df.loc[warehouse_bill_merchants, "清洗_渠道"] = "闪电仓"
    channel = df["清洗_渠道"].replace(CHANNEL_ALIASES)
    if "清洗_商户" in df.columns:
        merchant = df["清洗_商户"]
        channel = channel.mask(merchant.eq(WUSU_MERCHANT_NAME), WUSU_MERCHANT_NAME)
    df["清洗_渠道"] = channel.where(channel.isin(CHANNEL_ORDER), "其他")
    return df


def normalize_date_field(df: pd.DataFrame) -> pd.DataFrame:
    for column in DATE_COLUMN_CANDIDATES:
        if column not in df.columns:
            continue
        values = df[column].astype(str).str.strip()
        eight_digit = values.str.fullmatch(r"\d{8}")
        parsed = pd.to_datetime(values.where(eight_digit), format="%Y%m%d", errors="coerce")
        parsed = parsed.fillna(pd.to_datetime(values, errors="coerce"))
        df["date"] = parsed.dt.strftime("%Y-%m-%d").fillna("未识别")
        return df
    df["date"] = "未识别"
    return df


def channel_sort_rank(channel: Any) -> int:
    name = str(channel)
    return CHANNEL_ORDER.index(name) if name in CHANNEL_ORDER else len(CHANNEL_ORDER)


def period_date_offset(date_value: Any, period_id: str) -> int | None:
    period = next((item for item in PERIODS if item["id"] == period_id), None)
    if not period:
        return None
    try:
        row_date = datetime.fromisoformat(str(date_value)).date()
        start_date = datetime.fromisoformat(period["start"]).date()
    except ValueError:
        return None
    return (row_date - start_date).days


def matches_core_product_name(product: Any) -> bool:
    name = str(product)
    return any(re.search(group["matchPattern"], name, flags=re.IGNORECASE) for group in CORE_PRODUCT_GROUPS)


def read_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8-sig", low_memory=False)
    df = normalize_date_field(df)
    for col in ["清洗_大区", "清洗_渠道", "清洗_品牌", "清洗_商户", "清洗_商品名"]:
        if col in df.columns:
            df[col] = df[col].fillna("未识别").astype(str).str.strip().replace("", "未识别")
    return normalize_channel_fields(df)


def source_files(period: dict[str, Any], platform_id: str, suffix: str) -> list[Path]:
    source_ids = (
        period.get("sourceOverrides", {})
        .get(platform_id, {})
        .get(suffix, period.get("sourceIds", [period["id"]]))
    )
    paths = [SOURCE_DIR / f"{source_id}嘉士伯周报{suffix}" for source_id in source_ids]
    missing = [path for path in paths if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing source file(s): {', '.join(str(path) for path in missing)}")
    return paths


def read_period_csvs(period: dict[str, Any], platform_id: str, suffix: str) -> pd.DataFrame:
    frames = [read_csv(path) for path in source_files(period, platform_id, suffix)]
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def load_targets() -> tuple[dict[tuple[str, int], dict[str, float]], dict[tuple[str, int, str], dict[str, float]]]:
    target_df = pd.read_excel(SOURCE_DIR / "目标GMV.xlsx")
    budget_df = pd.read_excel(SOURCE_DIR / "分BU预算金额.xlsx")

    platform_targets: dict[tuple[str, int], dict[str, float]] = {}
    for _, row in target_df.iterrows():
        key = (str(row["平台"]).strip(), int(row["年月"]))
        platform_targets[key] = {
            "targetGmv": clean_number(row.get("本年目标gmv")),
            "lastYearTargetGmv": clean_number(row.get("24年目标gmv")),
            "actualTmFeeRatio": clean_number(row.get("本年实际tm费比")),
            "lastYearTmFeeRatio": clean_number(row.get("上年实际tm费比")),
            "targetPromoFeeRatio": clean_number(row.get("目标促销费比")),
        }

    bu_budget: dict[tuple[str, int, str], dict[str, float]] = {}
    for _, row in budget_df.iterrows():
        key = (str(row["平台"]).strip(), int(row["年月"]), str(row["bu区域"]).strip())
        bu_budget[key] = {
            "budget": clean_number(row.get("预算")),
            "buTarget": clean_number(row.get("目标")),
            "supportBudget": clean_number(row.get("加持目标预算")),
        }

    apply_expense_update(bu_budget)
    return platform_targets, bu_budget


def month_days(period: dict[str, Any]) -> tuple[int, int, float]:
    start = datetime.fromisoformat(period["start"]).date()
    end = datetime.fromisoformat(period["end"]).date()
    elapsed = (end - date(end.year, end.month, 1)).days + 1
    next_month = date(end.year + (end.month == 12), 1 if end.month == 12 else end.month + 1, 1)
    days_in_month = (next_month - date(end.year, end.month, 1)).days
    return elapsed, days_in_month, elapsed / days_in_month


def summarize_full(
    df: pd.DataFrame,
    platform: dict[str, Any],
    group_cols: list[str],
) -> pd.DataFrame:
    gmv_col = platform["gmvColumn"]
    df = df.copy()
    df[gmv_col] = pd.to_numeric(df[gmv_col], errors="coerce").fillna(0)
    aggregations: dict[str, tuple[str, str]] = {"gmv": (gmv_col, "sum")}

    quantity_col = platform.get("quantityColumn")
    if quantity_col and quantity_col in df.columns:
        df[quantity_col] = pd.to_numeric(df[quantity_col], errors="coerce").fillna(0)
        aggregations["quantity"] = (quantity_col, "sum")

    orders_col = platform.get("ordersColumn")
    if orders_col and orders_col in df.columns:
        if platform["label"] == "淘宝闪购":
            df[orders_col] = pd.to_numeric(df[orders_col], errors="coerce").fillna(0)
            aggregations["orders"] = (orders_col, "sum")
        else:
            aggregations["orders"] = (orders_col, "nunique")

    users_col = platform.get("usersColumn")
    if users_col and users_col in df.columns:
        df[users_col] = pd.to_numeric(df[users_col], errors="coerce").fillna(0)
        aggregations["users"] = (users_col, "sum")

    return df.groupby(group_cols, dropna=False).agg(**aggregations).reset_index()


def summarize_bill(
    df: pd.DataFrame,
    platform: dict[str, Any],
    group_cols: list[str],
) -> pd.DataFrame:
    activity_col = platform["billActivityColumn"]
    subsidy_col = platform["billSubsidyColumn"]
    df = df.copy()
    df[activity_col] = pd.to_numeric(df[activity_col], errors="coerce").fillna(0)
    df[subsidy_col] = pd.to_numeric(df[subsidy_col], errors="coerce").fillna(0)
    aggregations: dict[str, tuple[str, str]] = {
        "activityGmv": (activity_col, "sum"),
        "subsidy": (subsidy_col, "sum"),
    }
    order_col = platform.get("billOrderColumn")
    if order_col and order_col in df.columns:
        aggregations["activityOrders"] = (order_col, "nunique")
    return df.groupby(group_cols, dropna=False).agg(**aggregations).reset_index()


def merge_metric_frames(
    full_summary: pd.DataFrame,
    bill_summary: pd.DataFrame,
    group_cols: list[str],
) -> pd.DataFrame:
    merged = full_summary.merge(bill_summary, on=group_cols, how="outer")
    for col in ["gmv", "quantity", "orders", "users", "activityGmv", "subsidy", "activityOrders"]:
        if col not in merged.columns:
            merged[col] = 0
        merged[col] = pd.to_numeric(merged[col], errors="coerce").fillna(0)
    return merged


def enrich_record(base: dict[str, Any]) -> dict[str, Any]:
    gmv = base.get("gmv", 0.0) or 0.0
    activity = base.get("activityGmv", 0.0) or 0.0
    subsidy = base.get("subsidy", 0.0) or 0.0
    budget = base.get("budget", 0.0) or 0.0
    target = base.get("buTarget", 0.0) or 0.0
    time_progress = base.get("timeProgress", 0.0) or 0.0

    base["activityShare"] = round_float(safe_div(activity, gmv))
    base["promoFeeRatio"] = round_float(safe_div(subsidy, gmv))
    base["activityDiscount"] = round_float(1 - subsidy / activity if activity else None)
    base["targetAchievement"] = round_float(safe_div(gmv, target))
    base["paceAchievement"] = round_float(safe_div(safe_div(gmv, target) or 0, time_progress))
    base["budgetUsage"] = round_float(safe_div(subsidy, budget))
    base["budgetRemaining"] = round_float(budget - subsidy, 2) if budget else None

    for key in [
        "gmv",
        "quantity",
        "orders",
        "users",
        "activityGmv",
        "subsidy",
        "budget",
        "buTarget",
        "supportBudget",
        "advertisingExposureFee",
        "targetGmv",
        "lastYearTargetGmv",
    ]:
        if key in base:
            base[key] = round_float(base[key], 2)
    for key in ["actualTmFeeRatio", "lastYearTmFeeRatio", "targetPromoFeeRatio"]:
        if key in base:
            base[key] = round_float(base[key])
    return base


def add_comparisons(records: list[dict[str, Any]]) -> None:
    by_key = {
        (r["platformId"], r["region"], r["periodId"], period_date_offset(r.get("date"), r["periodId"])): r
        for r in records
    }
    for record in records:
        if record["periodKind"] != "current":
            record["wowGmvChange"] = None
            record["yoyGmvChange"] = None
            record["promoFeeRatioChange"] = None
            continue
        offset = period_date_offset(record.get("date"), record["periodId"])
        previous = by_key.get((record["platformId"], record["region"], PREVIOUS_PERIOD_ID, offset))
        last_year = by_key.get((record["platformId"], record["region"], LAST_YEAR_PERIOD_ID, offset))
        record["wowGmvChange"] = round_float(
            safe_div(record["gmv"] - previous["gmv"], previous["gmv"]) if previous else None
        )
        record["yoyGmvChange"] = round_float(
            safe_div(record["gmv"] - last_year["gmv"], last_year["gmv"]) if last_year else None
        )
        current_ratio = record.get("promoFeeRatio")
        previous_ratio = previous.get("promoFeeRatio") if previous else None
        record["promoFeeRatioChange"] = round_float(
            current_ratio - previous_ratio
            if current_ratio is not None and previous_ratio is not None
            else None
        )


def build_breakdown(
    full_df: pd.DataFrame,
    bill_df: pd.DataFrame,
    platform: dict[str, Any],
    period: dict[str, Any],
    platform_id: str,
    dimension_col: str,
    dimension_key: str,
    top_n_per_region: int | None = None,
    product_scoped: bool = False,
) -> list[dict[str, Any]]:
    group_cols = ["date", "清洗_大区"]
    if product_scoped:
        group_cols.append("清洗_商品名")
    group_cols.append(dimension_col)
    full = summarize_full(full_df, platform, group_cols)
    bill = summarize_bill(bill_df, platform, group_cols)
    merged = merge_metric_frames(full, bill, group_cols)
    rename_cols = {"清洗_大区": "region", dimension_col: dimension_key}
    if product_scoped:
        rename_cols["清洗_商品名"] = "product"
    merged = merged.rename(columns=rename_cols)

    rows: list[dict[str, Any]] = []
    for _, row in merged.iterrows():
        region = str(row["region"])
        if region not in REGION_PARENT:
            continue
        if product_scoped and not matches_core_product_name(row["product"]):
            continue
        record = {
            "platformId": platform_id,
            "platformLabel": platform["label"],
            "periodId": period["id"],
            "periodLabel": period["label"],
            "periodKind": period["kind"],
            "date": str(row["date"]),
            "region": region,
            "parent": REGION_PARENT[region],
            dimension_key: str(row[dimension_key]),
            "gmv": clean_number(row.get("gmv")),
            "quantity": clean_number(row.get("quantity")),
            "orders": clean_number(row.get("orders")),
            "users": clean_number(row.get("users")),
            "activityGmv": clean_number(row.get("activityGmv")),
            "subsidy": clean_number(row.get("subsidy")),
            "activityOrders": clean_number(row.get("activityOrders")),
        }
        if product_scoped:
            record["product"] = str(row["product"])
        rows.append(enrich_record(record))

    if dimension_key == "channel":
        rows.sort(key=lambda item: (channel_sort_rank(item.get("channel")), item["region"], item.get("product", "")))

    if top_n_per_region:
        limited: list[dict[str, Any]] = []
        buckets: dict[tuple[str, str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            product_key = row.get("product", "")
            buckets[(row["platformId"], row["periodId"], row["region"], row["date"], product_key)].append(row)
        for bucket_rows in buckets.values():
            limited.extend(sorted(bucket_rows, key=lambda item: item["gmv"], reverse=True)[:top_n_per_region])
        return limited
    return rows


def build_product_records(
    full_df: pd.DataFrame,
    bill_df: pd.DataFrame,
    platform: dict[str, Any],
    period: dict[str, Any],
    platform_id: str,
    platform_target: dict[str, float],
    bu_budget: dict[tuple[str, int, str], dict[str, float]],
) -> list[dict[str, Any]]:
    group_cols = ["date", "清洗_大区", "清洗_商品名"]
    full = summarize_full(full_df, platform, group_cols)
    bill = summarize_bill(bill_df, platform, group_cols)
    merged = merge_metric_frames(full, bill, group_cols)

    rows: list[dict[str, Any]] = []
    for _, row in merged.iterrows():
        region = str(row["清洗_大区"])
        product = str(row["清洗_商品名"]).strip() or "未识别"
        if region not in REGION_PARENT or product in {"nan", "None"} or not matches_core_product_name(product):
            continue
        budget_key = (platform["sourcePlatform"], period["monthKey"], region)
        budget = bu_budget.get(budget_key, {})
        rows.append(
            enrich_record(
                {
                    "platformId": platform_id,
                    "platformLabel": platform["label"],
                    "sourcePlatform": platform["sourcePlatform"],
                    "periodId": period["id"],
                    "periodLabel": period["label"],
                    "periodKind": period["kind"],
                    "date": str(row["date"]),
                    "monthKey": period["monthKey"],
                    "monthLabel": period["monthLabel"],
                    "timeProgress": period["timeProgress"],
                    "region": region,
                    "parent": REGION_PARENT[region],
                    "product": product,
                    "gmv": clean_number(row.get("gmv")),
                    "quantity": clean_number(row.get("quantity")),
                    "orders": clean_number(row.get("orders")),
                    "users": clean_number(row.get("users")),
                    "activityGmv": clean_number(row.get("activityGmv")),
                    "subsidy": clean_number(row.get("subsidy")),
                    "activityOrders": clean_number(row.get("activityOrders")),
                    "budget": clean_number(budget.get("budget")),
                    "buTarget": clean_number(budget.get("buTarget")),
                    "supportBudget": clean_number(budget.get("supportBudget")),
                    "advertisingExposureFee": clean_number(budget.get("advertisingExposureFee")),
                    "targetGmv": clean_number(platform_target.get("targetGmv")),
                    "lastYearTargetGmv": clean_number(platform_target.get("lastYearTargetGmv")),
                    "actualTmFeeRatio": clean_number(platform_target.get("actualTmFeeRatio")),
                    "lastYearTmFeeRatio": clean_number(platform_target.get("lastYearTmFeeRatio")),
                    "targetPromoFeeRatio": clean_number(platform_target.get("targetPromoFeeRatio")),
                }
            )
        )
    return rows


def build_activity_breakdown(
    bill_df: pd.DataFrame,
    platform: dict[str, Any],
    period: dict[str, Any],
    platform_id: str,
    top_n_per_region: int = 16,
    product_scoped: bool = False,
) -> list[dict[str, Any]]:
    campaign_col = platform["billCampaignColumn"]
    if campaign_col not in bill_df.columns:
        return []
    group_cols = ["date", "清洗_大区"]
    if product_scoped:
        group_cols.append("清洗_商品名")
    group_cols.append(campaign_col)
    bill = summarize_bill(bill_df, platform, group_cols)
    rename_cols = {"清洗_大区": "region", campaign_col: "activityName"}
    if product_scoped:
        rename_cols["清洗_商品名"] = "product"
    bill = bill.rename(columns=rename_cols)

    rows: list[dict[str, Any]] = []
    for _, row in bill.iterrows():
        region = str(row["region"])
        activity_name = str(row["activityName"]).strip() or "未识别"
        if region not in REGION_PARENT or activity_name in {"nan", "None"}:
            continue
        if product_scoped and not matches_core_product_name(row["product"]):
            continue
        subsidy = clean_number(row.get("subsidy"))
        activity_gmv = clean_number(row.get("activityGmv"))
        rows.append(
            {
                "platformId": platform_id,
                "platformLabel": platform["label"],
                "periodId": period["id"],
                "periodLabel": period["label"],
                "periodKind": period["kind"],
                "date": str(row["date"]),
                "region": region,
                "parent": REGION_PARENT[region],
                "activityName": activity_name,
                **({"product": str(row["product"])} if product_scoped else {}),
                "redemptionAmount": round_float(subsidy, 2),
                "activityGmv": round_float(activity_gmv, 2),
                "promoFeeRatio": round_float(safe_div(subsidy, activity_gmv)),
                "activityRoi": round_float(safe_div(activity_gmv, subsidy)),
                "couponCount": round_float(clean_number(row.get("activityOrders")), 0),
            }
        )

    limited: list[dict[str, Any]] = []
    buckets: dict[tuple[str, str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
            product_key = row.get("product", "")
            buckets[(row["platformId"], row["periodId"], row["region"], row["date"], product_key)].append(row)
    for bucket_rows in buckets.values():
        limited.extend(
            sorted(bucket_rows, key=lambda item: item["redemptionAmount"] or 0, reverse=True)[:top_n_per_region]
        )
    return limited


def aggregate_platform_reconciliation(
    records: list[dict[str, Any]],
    period: dict[str, Any],
    platform_id: str,
    platform: dict[str, Any],
    full_df: pd.DataFrame,
    bill_df: pd.DataFrame,
) -> dict[str, Any]:
    record_total = sum(
        row["gmv"]
        for row in records
        if row["periodId"] == period["id"] and row["platformId"] == platform_id
    )
    full_total = clean_number(pd.to_numeric(full_df[platform["gmvColumn"]], errors="coerce").sum())
    activity_total = clean_number(pd.to_numeric(bill_df[platform["billActivityColumn"]], errors="coerce").sum())
    subsidy_total = clean_number(pd.to_numeric(bill_df[platform["billSubsidyColumn"]], errors="coerce").sum())
    return {
        "platformId": platform_id,
        "platformLabel": platform["label"],
        "periodId": period["id"],
        "fullGmvFromSource": round_float(full_total, 2),
        "fullGmvFromRegionSum": round_float(record_total, 2),
        "activityGmvFromBill": round_float(activity_total, 2),
        "subsidyFromBill": round_float(subsidy_total, 2),
        "gmvDiff": round_float(record_total - full_total, 2),
    }


def build_data() -> dict[str, Any]:
    platform_targets, bu_budget = load_targets()
    periods = []
    for period in PERIODS:
        elapsed, days_in_month, progress = month_days(period)
        periods.append(
            {
                **period,
                "elapsedDaysInMonth": elapsed,
                "daysInMonth": days_in_month,
                "timeProgress": round_float(progress),
            }
        )

    records: list[dict[str, Any]] = []
    product_records: list[dict[str, Any]] = []
    channels: list[dict[str, Any]] = []
    channels_by_product: list[dict[str, Any]] = []
    brands: list[dict[str, Any]] = []
    brands_by_product: list[dict[str, Any]] = []
    merchants: list[dict[str, Any]] = []
    merchants_by_product: list[dict[str, Any]] = []
    products: list[dict[str, Any]] = []
    activities: list[dict[str, Any]] = []
    activities_by_product: list[dict[str, Any]] = []
    reconciliation: list[dict[str, Any]] = []

    for period in periods:
        for platform_id, platform in PLATFORMS.items():
            full_df = read_period_csvs(period, platform_id, platform["fullSuffix"])
            bill_df = read_period_csvs(period, platform_id, platform["billSuffix"])

            full_region = summarize_full(full_df, platform, ["date", "清洗_大区"])
            bill_region = summarize_bill(bill_df, platform, ["date", "清洗_大区"])
            region_summary = merge_metric_frames(full_region, bill_region, ["date", "清洗_大区"])

            target_key = (platform["sourcePlatform"], period["monthKey"])
            platform_target = platform_targets.get(target_key, {})
            if period["kind"] == "last_year":
                current_target_key = (platform["sourcePlatform"], 202606)
                platform_target = platform_targets.get(current_target_key, platform_target)

            for _, row in region_summary.iterrows():
                region = str(row["清洗_大区"])
                if region not in REGION_PARENT:
                    continue
                budget_key = (platform["sourcePlatform"], period["monthKey"], region)
                budget = bu_budget.get(budget_key, {})
                record = {
                    "platformId": platform_id,
                    "platformLabel": platform["label"],
                    "sourcePlatform": platform["sourcePlatform"],
                    "periodId": period["id"],
                    "periodLabel": period["label"],
                    "periodKind": period["kind"],
                    "date": str(row["date"]),
                    "monthKey": period["monthKey"],
                    "monthLabel": period["monthLabel"],
                    "timeProgress": period["timeProgress"],
                    "region": region,
                    "parent": REGION_PARENT[region],
                    "gmv": clean_number(row.get("gmv")),
                    "quantity": clean_number(row.get("quantity")),
                    "orders": clean_number(row.get("orders")),
                    "users": clean_number(row.get("users")),
                    "activityGmv": clean_number(row.get("activityGmv")),
                    "subsidy": clean_number(row.get("subsidy")),
                    "activityOrders": clean_number(row.get("activityOrders")),
                    "budget": clean_number(budget.get("budget")),
                    "buTarget": clean_number(budget.get("buTarget")),
                    "supportBudget": clean_number(budget.get("supportBudget")),
                    "advertisingExposureFee": clean_number(budget.get("advertisingExposureFee")),
                    "targetGmv": clean_number(platform_target.get("targetGmv")),
                    "lastYearTargetGmv": clean_number(platform_target.get("lastYearTargetGmv")),
                    "actualTmFeeRatio": clean_number(platform_target.get("actualTmFeeRatio")),
                    "lastYearTmFeeRatio": clean_number(platform_target.get("lastYearTmFeeRatio")),
                    "targetPromoFeeRatio": clean_number(platform_target.get("targetPromoFeeRatio")),
                }
                records.append(enrich_record(record))

            product_records.extend(
                build_product_records(full_df, bill_df, platform, period, platform_id, platform_target, bu_budget)
            )
            channels.extend(
                build_breakdown(full_df, bill_df, platform, period, platform_id, "清洗_渠道", "channel")
            )
            channels_by_product.extend(
                build_breakdown(
                    full_df,
                    bill_df,
                    platform,
                    period,
                    platform_id,
                    "清洗_渠道",
                    "channel",
                    product_scoped=True,
                )
            )
            brands.extend(
                build_breakdown(full_df, bill_df, platform, period, platform_id, "清洗_品牌", "brand")
            )
            brands_by_product.extend(
                build_breakdown(
                    full_df,
                    bill_df,
                    platform,
                    period,
                    platform_id,
                    "清洗_品牌",
                    "brand",
                    product_scoped=True,
                )
            )
            merchants.extend(
                build_breakdown(
                    full_df, bill_df, platform, period, platform_id, "清洗_商户", "merchant", top_n_per_region=18
                )
            )
            merchants_by_product.extend(
                build_breakdown(
                    full_df,
                    bill_df,
                    platform,
                    period,
                    platform_id,
                    "清洗_商户",
                    "merchant",
                    top_n_per_region=18,
                    product_scoped=True,
                )
            )
            products.extend(
                build_breakdown(
                    full_df, bill_df, platform, period, platform_id, "清洗_商品名", "product", top_n_per_region=18
                )
            )
            activities.extend(build_activity_breakdown(bill_df, platform, period, platform_id))
            activities_by_product.extend(
                build_activity_breakdown(bill_df, platform, period, platform_id, product_scoped=True)
            )
            reconciliation.append(
                aggregate_platform_reconciliation(records, period, platform_id, platform, full_df, bill_df)
            )

    add_comparisons(records)
    product_totals: dict[str, float] = defaultdict(float)
    for row in product_records:
        if row["periodId"] == CURRENT_PERIOD_ID and row.get("product"):
            product_totals[str(row["product"])] += row.get("gmv", 0) or 0
    core_product_groups: list[dict[str, Any]] = []
    for group in CORE_PRODUCT_GROUPS:
        pattern = re.compile(group["matchPattern"], re.IGNORECASE)
        matched_skus = {
            str(row.get("product"))
            for row in product_records
            if row["periodId"] == CURRENT_PERIOD_ID
            and row.get("product")
            and pattern.search(str(row.get("product")))
        }
        core_product_groups.append(
            {
                **group,
                "skuCount": len(matched_skus),
                "currentGmv": round_float(
                    sum(product_totals.get(sku, 0.0) for sku in matched_skus), 2
                ),
            }
        )

    return {
        "metadata": {
            "title": "嘉士伯淘京周报数据看板",
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
            "sourceRoot": str(SOURCE_DIR),
            "currentPeriodId": CURRENT_PERIOD_ID,
            "previousPeriodId": PREVIOUS_PERIOD_ID,
            "lastYearPeriodId": LAST_YEAR_PERIOD_ID,
            "periods": periods,
            "platforms": [
                {"id": platform_id, **platform}
                for platform_id, platform in PLATFORMS.items()
            ],
            "regionOrder": REGION_ORDER,
            "channelOrder": CHANNEL_ORDER,
            "regionParent": REGION_PARENT,
            "regionGroups": REGION_GROUPS,
            "productOrder": [
                product
                for product, _ in sorted(product_totals.items(), key=lambda item: item[1], reverse=True)
                if product not in {"未识别", "nan", "None", ""}
            ],
            "coreProductGroups": core_product_groups,
        },
        "records": records,
        "productRecords": product_records,
        "breakdowns": {
            "channels": channels,
            "channelsByProduct": channels_by_product,
            "brands": brands,
            "brandsByProduct": brands_by_product,
            "merchants": merchants,
            "merchantsByProduct": merchants_by_product,
            "products": products,
            "activities": activities,
            "activitiesByProduct": activities_by_product,
        },
        "reconciliation": reconciliation,
    }


def write_logic_doc(data: dict[str, Any]) -> None:
    md = f"""# 嘉士伯淘京周报网页看板取数逻辑

生成时间：{data["metadata"]["generatedAt"]}

## 数据源

- 源目录：`{SOURCE_DIR}`
- 周期：`0501-0514`、`0601-0614`、`25年0601-0614`
- 页面默认展示目标分析周期 `0601-0614`，不提供周期筛选；`0501-0514` 仅用于环比参照，`25年0601-0614` 仅用于同比参照。
- 源文件合并：`0601-0614` 由 `0601-0607` + `0608-0614` 补充文件合并，其中京东秒送账单由 `0601-0607` + `0608-0612` + `0613-0614` 合并；`0501-0514` 由 `0501-0507` + `0508-0514` 合并；`25年0601-0614` 由 `25年0601-0607` + `25年0608-0614` 合并。
- 平台映射：前端展示 `淘宝闪购` 对应目标/预算表中的 `饿了么`；前端展示 `京东秒送` 对应目标/预算表中的 `京东到家`。
- 区域字段：所有源表统一使用 `清洗_大区` 做区域匹配，使用脚本内置层级聚合为 `CBC`、`CIB`、`华中`、`NX`、`XJ`、`YN`。清洗后仍为空的记录保留在 `未识别`，不并入正式 BU。
- 核心单品筛选字段：使用源表 `清洗_商品名`。会议中提到的 `一生装` 按业务口径识别为 `一升装（1L）`，匹配商品名中出现 `1L/１L` 的 SKU。网页默认展示全部商品，选择核心单品后，核心指标、AI诊断、Summary、区域表和下钻表按该核心单品重算。
- 数据文件：核心数据输出到 `public/data/dashboard-data.json`，核心单品命中的商品明细按平台拆分到 `public/data/product-data-*.json`，网页运行时合并加载。最终 JSON 只保留页面筛选、聚合和展示需要的字段，不输出未使用的全量商品 breakdown。

## 核心指标口径

| 指标 | 淘宝闪购 | 京东秒送 |
|---|---|---|
| 全量 GMV | 全量数据明细 `销售额` 汇总 | 全量数据明细 `gmv（元）` 汇总 |
| 活动 GMV | 账单数据明细 `商品原价总额` 汇总 | 账单数据明细 `商品gov` 汇总 |
| 促销费 | 账单数据明细 `品牌补贴总额` 汇总 | 账单数据明细 `品牌计费金额-未税` 汇总 |
| 促销费比 | `促销费 / 全量 GMV` | `促销费 / 全量 GMV` |
| 活动 GMV 占比 | `活动 GMV / 全量 GMV` | `活动 GMV / 全量 GMV` |
| 活动折扣率 | `1 - 促销费 / 活动 GMV` | `1 - 促销费 / 活动 GMV` |
| 目标 GMV | `目标GMV.xlsx` 按平台+年月匹配 | `目标GMV.xlsx` 按平台+年月匹配 |
| BU 目标与预算 | `分BU预算金额.xlsx` 按平台+年月+区域匹配 | `分BU预算金额.xlsx` 按平台+年月+区域匹配 |
| 广告曝光费 | `6月目标&费用更新.xlsx` 的 `6月整体费用` 按平台+BU匹配 | `6月目标&费用更新.xlsx` 的 `6月整体费用` 按平台+BU匹配 |

## 单位说明

- 金额类字段源表单位为元，网页展示按元/万/亿自动缩写。
- 占比、达成率、费比、折扣率均展示为百分比。
- `pp` 是 percentage point 的缩写，用于展示两个百分比之间的直接差值。例如促销费比从 7.1% 到 10.2%，变化为 +3.1pp。
- `活动ROI` 单位为倍，计算为 `活动GMV / 核销金额`。
- `核券量` 单位为张。

## 对比逻辑

- 周环比：当前周期 `0601-0614` 对比指定环比基准周期 `0501-0514`。
- 同比：当前周期 `0601-0614` 对比去年同期 `25年0601-0614`。
- 日期段筛选：源表日期统一清洗为 `date` 字段；选择当前周期内任意日期段时，当前周期、环比基准和去年同期按相同起止 offset 取数。例如选择 6.1-6.3 时，环比取 5.1-5.3，同比取 2025.6.1-6.3。
- 月度目标达成率：`周期全量 GMV / 当月 BU 目标`。
- 进度校正达成：`目标达成率 / 当月已过天数比例`。例如 6.1-6.14 使用 `14 / 30`。
- 预算使用率：`促销费 / BU 预算`。

## 下钻数据

网页下钻按同一套区域筛选同时更新：

- 区域明细：11 个正式叶子区域 + `未识别` 兜底区域，可点击切换。
- BU 聚合：CBC、CIB、华中按子区域求和；NX、XJ、YN 为独立区域。
- 渠道下钻：全量表按清洗后的 `清洗_渠道` 统计 GMV，账单表按同字段补充活动 GMV 和促销费；淘宝闪购全量表 `渠道名称=闪力达` 时补充 `清洗_商户=闪力达`、`清洗_渠道=闪电仓`；淘宝闪购账单表中 `清洗_商户` 为 `瓜呱便利连锁管理`、`百惠优选`、`小飞象连锁超市`、`佳佳超市连锁管理`、`熊喵喝喝` 时补充 `清洗_渠道=闪电仓`；`中仓店` 与 `闪电仓` 合并为 `仓店`，`清洗_商户` 为 `乌苏啤酒/WUSU` 时渠道同步归为 `乌苏啤酒/WUSU`，其余未列渠道合并为 `其他`。
- 品牌下钻：按 `清洗_品牌` 聚合。
- 商户下钻：每个平台、周期、区域保留 GMV Top 18，用于页面明细查看；商品维度仅保留核心单品相关数据。
- 核心单品筛选下的区域汇总：按 `清洗_大区 + 清洗_商品名` 聚合后，再按核心单品规则合并 SKU；目标/预算仍按平台、年月、BU区域匹配，多 SKU 合并时按 `平台+周期+区域` 去重，避免重复累加 BU 目标和预算。
- TOP核心单品：选择 `一升装（1L）` 时展示命中 SKU 的 GMV、费比、目标达成率、活动GMV占比、预算使用率、环比和同比，超过 Top10 的 SKU 合并到 `其它`。
- TOP10活动：淘宝闪购按账单表 `活动名称` 聚合，京东秒送按账单表 `补贴名称` 聚合，输出 `核销金额`、`活动GMV`、`活动GMV占比`、`促销费比`、`活动ROI`、`核券量`，超过 Top10 的活动合并到 `其它`。

## 校验

脚本会在 `dashboard-data.json` 中写入 `reconciliation`，校验每个平台每个周期：

- 区域汇总 GMV 是否等于全量源表 GMV。
- 活动 GMV 与促销费是否来自账单源表合计。

截至本次生成，所有平台/周期的区域汇总 GMV 与全量源表 GMV 差异应为 0 或仅有四舍五入误差。
"""
    LOGIC_DOC.parent.mkdir(parents=True, exist_ok=True)
    LOGIC_DOC.write_text(md, encoding="utf-8")


METRIC_EXPORT_KEYS = [
    "platformId",
    "periodId",
    "date",
    "timeProgress",
    "region",
    "product",
    "gmv",
    "quantity",
    "orders",
    "users",
    "activityGmv",
    "subsidy",
    "budget",
    "advertisingExposureFee",
    "buTarget",
    "targetGmv",
    "actualTmFeeRatio",
    "targetPromoFeeRatio",
]

BREAKDOWN_EXPORT_KEYS = [
    "platformId",
    "periodId",
    "date",
    "region",
    "channel",
    "brand",
    "merchant",
    "product",
    "gmv",
    "quantity",
    "orders",
    "users",
    "activityGmv",
    "subsidy",
]

ACTIVITY_EXPORT_KEYS = [
    "platformId",
    "periodId",
    "date",
    "region",
    "product",
    "activityName",
    "redemptionAmount",
    "activityGmv",
    "couponCount",
]


def compact_row(row: dict[str, Any], keys: list[str]) -> dict[str, Any]:
    compacted: dict[str, Any] = {}
    for key in keys:
        value = row.get(key)
        if value is not None:
            compacted[key] = value
    return compacted


def compact_rows(rows: list[dict[str, Any]], keys: list[str]) -> list[dict[str, Any]]:
    return [compact_row(row, keys) for row in rows]


def main() -> None:
    data = build_data()
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    product_files: list[str] = []
    for platform_id in PLATFORMS:
        product_file = OUTPUT_JSON.parent / f"product-data-{platform_id}.json"
        product_files.append(product_file.name)
        product_payload = {
            "productRecords": compact_rows(
                [row for row in data["productRecords"] if row["platformId"] == platform_id],
                METRIC_EXPORT_KEYS,
            ),
            "breakdowns": {
                "channelsByProduct": compact_rows(
                    [
                        row
                        for row in data["breakdowns"]["channelsByProduct"]
                        if row["platformId"] == platform_id
                    ],
                    BREAKDOWN_EXPORT_KEYS,
                ),
                "brandsByProduct": compact_rows(
                    [
                        row
                        for row in data["breakdowns"]["brandsByProduct"]
                        if row["platformId"] == platform_id
                    ],
                    BREAKDOWN_EXPORT_KEYS,
                ),
                "merchantsByProduct": compact_rows(
                    [
                        row
                        for row in data["breakdowns"]["merchantsByProduct"]
                        if row["platformId"] == platform_id
                    ],
                    BREAKDOWN_EXPORT_KEYS,
                ),
                "activitiesByProduct": compact_rows(
                    [
                        row
                        for row in data["breakdowns"]["activitiesByProduct"]
                        if row["platformId"] == platform_id
                    ],
                    ACTIVITY_EXPORT_KEYS,
                ),
            },
        }
        product_file.write_text(
            json.dumps(product_payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

    core_breakdowns = {
        "channels": compact_rows(data["breakdowns"]["channels"], BREAKDOWN_EXPORT_KEYS),
        "brands": compact_rows(data["breakdowns"]["brands"], BREAKDOWN_EXPORT_KEYS),
        "merchants": compact_rows(data["breakdowns"]["merchants"], BREAKDOWN_EXPORT_KEYS),
        "activities": compact_rows(data["breakdowns"]["activities"], ACTIVITY_EXPORT_KEYS),
    }
    core_data = {
        **data,
        "metadata": {
            **data["metadata"],
            "productDataFiles": product_files,
        },
        "records": compact_rows(data["records"], METRIC_EXPORT_KEYS),
        "breakdowns": core_breakdowns,
    }
    core_data.pop("productRecords", None)
    OUTPUT_JSON.write_text(json.dumps(core_data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write_logic_doc(data)
    print(f"Wrote {OUTPUT_JSON}")
    for product_file in product_files:
        print(f"Wrote {OUTPUT_JSON.parent / product_file}")
    print(f"Wrote {LOGIC_DOC}")
    for item in data["reconciliation"]:
        print(
            item["platformLabel"],
            item["periodId"],
            "source",
            item["fullGmvFromSource"],
            "region_sum",
            item["fullGmvFromRegionSum"],
            "diff",
            item["gmvDiff"],
        )


if __name__ == "__main__":
    main()
