from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

from build_dashboard_data import (
    PLATFORMS,
    SOURCE_DIR,
    clean_number,
    normalize_channel_fields,
    read_csv,
    round_float,
    safe_div,
)


WORKSPACE = Path(__file__).resolve().parents[1]
OUTPUT_DIR = WORKSPACE / "public" / "data"
OUTPUT_JSON = OUTPUT_DIR / "flagship-data.json"
FULL_DETAIL_CSV = OUTPUT_DIR / "flagship-full-detail.csv"
BILL_DETAIL_CSV = OUTPUT_DIR / "flagship-bill-detail.csv"

PERIOD = {
    "id": "0601-0614",
    "label": "2026.6.1-6.14",
    "start": "2026-06-01",
    "end": "2026-06-14",
    "sourceIds": ["0601-0607", "0608-0614"],
    "sourceOverrides": {
        "jd": {
            "账单数据明细-京东到家.csv": ["0601-0607", "0608-0612", "0613-0614"],
        },
    },
}

FLAGSHIP_PLATFORMS = {"taobao"}
FLAGSHIP_CHANNELS = ["酒小二", "惠宜选", "永辉", "西菲狸"]
HUIYIXUAN_PATTERN = re.compile(r"惠宜选|拾惠客|厉臣")
YONGHUI_PATTERN = re.compile(r"永辉")
XIFEILI_PATTERN = re.compile(r"西菲狸")


def source_files(platform_id: str, suffix: str) -> list[Path]:
    source_ids = (
        PERIOD.get("sourceOverrides", {})
        .get(platform_id, {})
        .get(suffix, PERIOD.get("sourceIds", [PERIOD["id"]]))
    )
    paths = [SOURCE_DIR / f"{source_id}嘉士伯周报{suffix}" for source_id in source_ids]
    missing = [path for path in paths if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing flagship source file(s): {', '.join(str(path) for path in missing)}")
    return paths


def read_period_frames(platform_id: str, suffix: str) -> pd.DataFrame:
    frames = [read_csv(path) for path in source_files(platform_id, suffix)]
    if not frames:
        return pd.DataFrame()
    frame = pd.concat(frames, ignore_index=True)
    return normalize_channel_fields(frame)


def text_series(df: pd.DataFrame, column: str) -> pd.Series:
    if column not in df.columns:
        return pd.Series([""] * len(df), index=df.index, dtype="object")
    return df[column].fillna("").astype(str).str.strip()


def first_existing(df: pd.DataFrame, columns: list[str]) -> pd.Series:
    result = pd.Series([""] * len(df), index=df.index, dtype="object")
    for column in columns:
        if column not in df.columns:
            continue
        values = text_series(df, column)
        result = result.mask(result.eq(""), values)
    return result


def parse_date(df: pd.DataFrame) -> pd.Series:
    raw = first_existing(df, ["日期", "账单时间", "业务发生时间", "订单完成时间"])
    parsed = pd.to_datetime(raw, errors="coerce")
    return parsed.dt.strftime("%Y-%m-%d").fillna("")


def flagship_mask(df: pd.DataFrame) -> pd.Series:
    return flagship_channel(df).ne("")


def flagship_channel(df: pd.DataFrame) -> pd.Series:
    clean_merchant = text_series(df, "清洗_商户")
    raw_merchant = first_existing(df, ["商户名称", "门店名称", "店铺名称", "商家名称", "零售商名称"])
    supplier = text_series(df, "供应商名称")
    channel = pd.Series([""] * len(df), index=df.index, dtype="object")
    channel = channel.mask(clean_merchant.eq("酒小二") | raw_merchant.str.contains("酒小二", na=False), "酒小二")
    channel = channel.mask(clean_merchant.eq("惠宜选") | raw_merchant.str.contains(HUIYIXUAN_PATTERN, na=False), "惠宜选")
    channel = channel.mask(clean_merchant.eq("永辉超市") | raw_merchant.str.contains(YONGHUI_PATTERN, na=False), "永辉")
    channel = channel.mask(supplier.str.contains(XIFEILI_PATTERN, na=False), "西菲狸")
    return channel


def normalize_full_detail(df: pd.DataFrame, platform_id: str, platform: dict[str, Any]) -> pd.DataFrame:
    order_col = platform.get("ordersColumn")
    detail = pd.DataFrame(
        {
            "sourceType": "full",
            "platformId": platform_id,
            "platformLabel": platform["label"],
            "date": parse_date(df),
            "region": text_series(df, "清洗_大区"),
            "channel": flagship_channel(df),
            "sourceChannel": text_series(df, "清洗_渠道"),
            "merchant": text_series(df, "清洗_商户"),
            "rawMerchant": first_existing(df, ["商户名称", "门店名称", "店铺名称", "商家名称"]),
            "brand": text_series(df, "清洗_品牌"),
            "product": text_series(df, "清洗_商品名"),
            "rawProduct": first_existing(df, ["商品名称", "商品名"]),
            "gmv": pd.to_numeric(df.get(platform["gmvColumn"], 0), errors="coerce").fillna(0),
            "quantity": pd.to_numeric(df.get(platform["quantityColumn"], 0), errors="coerce").fillna(0),
            "orders": pd.to_numeric(df.get(platform["ordersColumn"], 0), errors="coerce").fillna(0)
            if order_col and platform["label"] == "淘宝闪购" and order_col in df.columns
            else pd.Series([0] * len(df), index=df.index),
            "orderId": text_series(df, order_col) if order_col and order_col in df.columns else "",
            "users": pd.to_numeric(df.get(platform["usersColumn"], 0), errors="coerce").fillna(0)
            if platform.get("usersColumn") and platform["usersColumn"] in df.columns
            else pd.Series([0] * len(df), index=df.index),
        }
    )
    return detail


def normalize_bill_detail(df: pd.DataFrame, platform_id: str, platform: dict[str, Any]) -> pd.DataFrame:
    order_col = platform.get("billOrderColumn")
    detail = pd.DataFrame(
        {
            "sourceType": "bill",
            "platformId": platform_id,
            "platformLabel": platform["label"],
            "date": parse_date(df),
            "region": text_series(df, "清洗_大区"),
            "channel": flagship_channel(df),
            "sourceChannel": text_series(df, "清洗_渠道"),
            "merchant": text_series(df, "清洗_商户"),
            "rawMerchant": first_existing(df, ["商户名称", "门店名称", "店铺名称", "商家名称"]),
            "brand": text_series(df, "清洗_品牌"),
            "product": text_series(df, "清洗_商品名"),
            "rawProduct": first_existing(df, ["商品名称", "商品名"]),
            "activityName": text_series(df, platform["billCampaignColumn"]),
            "activityGmv": pd.to_numeric(df.get(platform["billActivityColumn"], 0), errors="coerce").fillna(0),
            "subsidy": pd.to_numeric(df.get(platform["billSubsidyColumn"], 0), errors="coerce").fillna(0),
            "orderId": text_series(df, order_col) if order_col else pd.Series([""] * len(df), index=df.index),
        }
    )
    return detail


def clean_detail_numbers(df: pd.DataFrame) -> pd.DataFrame:
    for column in ["gmv", "quantity", "orders", "users", "activityGmv", "subsidy"]:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce").fillna(0).round(2)
    return df


def count_orders(full: pd.DataFrame) -> float:
    if full.empty:
        return 0.0
    taobao_orders = clean_number(full.loc[full["platformId"].eq("taobao"), "orders"].sum())
    jd_order_ids = full.loc[~full["platformId"].eq("taobao"), "orderId"].fillna("").astype(str).str.strip()
    return taobao_orders + jd_order_ids[jd_order_ids.ne("")].nunique()


def aggregate_full(full: pd.DataFrame, column: str) -> pd.DataFrame:
    if full.empty or column not in full.columns:
        return pd.DataFrame(columns=[column, "gmv", "quantity", "orders", "users", "fullRows"])

    full_group = (
        full.groupby(column, dropna=False)
        .agg(
            gmv=("gmv", "sum"),
            quantity=("quantity", "sum"),
            taobaoOrders=("orders", "sum"),
            users=("users", "sum"),
            fullRows=("gmv", "size"),
        )
        .reset_index()
    )
    jd = full[~full["platformId"].eq("taobao")].copy()
    jd["orderId"] = jd["orderId"].fillna("").astype(str).str.strip()
    jd = jd[jd["orderId"].ne("")]
    if jd.empty:
        full_group["jdOrders"] = 0
    else:
        jd_orders = jd.groupby(column, dropna=False).agg(jdOrders=("orderId", "nunique")).reset_index()
        full_group = full_group.merge(jd_orders, on=column, how="left")
        full_group["jdOrders"] = pd.to_numeric(full_group["jdOrders"], errors="coerce").fillna(0)
    full_group["orders"] = full_group["taobaoOrders"] + full_group["jdOrders"]
    return full_group.drop(columns=["taobaoOrders", "jdOrders"])


def aggregate_bill(bill: pd.DataFrame, column: str) -> pd.DataFrame:
    if bill.empty or column not in bill.columns:
        return pd.DataFrame(columns=[column, "activityGmv", "subsidy", "couponCount", "billRows"])

    bill = bill.copy()
    bill["couponKey"] = bill["platformId"].astype(str) + "::" + bill["orderId"].fillna("").astype(str).str.strip()
    bill.loc[bill["couponKey"].str.endswith("::"), "couponKey"] = pd.NA
    return (
        bill.groupby(column, dropna=False)
        .agg(
            activityGmv=("activityGmv", "sum"),
            subsidy=("subsidy", "sum"),
            couponCount=("couponKey", "nunique"),
            billRows=("activityGmv", "size"),
        )
        .reset_index()
    )


def aggregate(
    full: pd.DataFrame,
    bill: pd.DataFrame,
    column: str,
    output_key: str,
    sort_key: str = "gmv",
) -> list[dict[str, Any]]:
    has_full_column = not full.empty and column in full.columns
    has_bill_column = not bill.empty and column in bill.columns
    full_group = aggregate_full(full, column)
    bill_group = aggregate_bill(bill, column)
    merged = full_group.merge(bill_group, on=column, how="outer")
    for metric_column in [
        "gmv",
        "quantity",
        "orders",
        "users",
        "fullRows",
        "activityGmv",
        "subsidy",
        "couponCount",
        "billRows",
    ]:
        if metric_column not in merged.columns:
            merged[metric_column] = 0
        merged[metric_column] = pd.to_numeric(merged[metric_column], errors="coerce").fillna(0)
    rows: list[dict[str, Any]] = []
    for _, row in merged.iterrows():
        has_full_value = has_full_column and clean_number(row.get("fullRows")) > 0
        has_bill_value = has_bill_column and clean_number(row.get("billRows")) > 0
        gmv = clean_number(row.get("gmv")) if has_full_value else None
        activity_gmv = clean_number(row.get("activityGmv")) if has_bill_value else None
        subsidy = clean_number(row.get("subsidy")) if has_bill_value else None
        activity_gmv_for_calc = activity_gmv or 0
        subsidy_for_calc = subsidy or 0
        gmv_for_calc = gmv or 0
        rows.append(
            {
                output_key: str(row.get(column) or "未识别"),
                "gmv": round_float(gmv, 2) if has_full_value else None,
                "quantity": round_float(row.get("quantity"), 2) if has_full_value else None,
                "orders": round_float(row.get("orders"), 2) if has_full_value else None,
                "users": round_float(row.get("users"), 2) if has_full_value else None,
                "activityGmv": round_float(activity_gmv, 2) if has_bill_value else None,
                "subsidy": round_float(subsidy, 2) if has_bill_value else None,
                "couponCount": round_float(row.get("couponCount"), 0) if has_bill_value else None,
                "activityShare": round_float(safe_div(activity_gmv_for_calc, gmv_for_calc)) if has_full_value else None,
                "promoFeeRatio": round_float(safe_div(subsidy_for_calc, gmv_for_calc)) if has_full_value else None,
                "activityRoi": round_float(safe_div(activity_gmv_for_calc, subsidy_for_calc)) if has_bill_value else None,
            }
        )
    rows.sort(key=lambda item: item.get(sort_key) or 0, reverse=True)
    return rows


def total_summary(full: pd.DataFrame, bill: pd.DataFrame) -> dict[str, Any]:
    gmv = clean_number(full["gmv"].sum())
    activity_gmv = clean_number(bill["activityGmv"].sum())
    subsidy = clean_number(bill["subsidy"].sum())
    bill_coupon_keys = bill["platformId"].astype(str) + "::" + bill["orderId"].fillna("").astype(str).str.strip()
    bill_coupon_keys = bill_coupon_keys[~bill_coupon_keys.str.endswith("::")]
    return {
        "gmv": round_float(gmv, 2),
        "quantity": round_float(full["quantity"].sum(), 2),
        "orders": round_float(count_orders(full), 2),
        "users": round_float(full["users"].sum(), 2),
        "activityGmv": round_float(activity_gmv, 2),
        "subsidy": round_float(subsidy, 2),
        "couponCount": round_float(bill_coupon_keys.nunique(), 0),
        "naturalGmv": round_float(gmv - activity_gmv, 2),
        "activityShare": round_float(safe_div(activity_gmv, gmv)),
        "promoFeeRatio": round_float(safe_div(subsidy, gmv)),
        "activityRoi": round_float(safe_div(activity_gmv, subsidy)),
    }


def json_records(df: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for _, row in df[columns].iterrows():
        record: dict[str, Any] = {}
        for column in columns:
            value = row.get(column)
            if pd.isna(value):
                record[column] = None
            elif isinstance(value, float):
                record[column] = round_float(value, 2)
            else:
                record[column] = value
        records.append(record)
    return records


def build() -> dict[str, Any]:
    full_frames: list[pd.DataFrame] = []
    bill_frames: list[pd.DataFrame] = []
    source_stats: list[dict[str, Any]] = []

    for platform_id, platform in PLATFORMS.items():
        if platform_id not in FLAGSHIP_PLATFORMS:
            continue
        full_df = read_period_frames(platform_id, platform["fullSuffix"])
        bill_df = read_period_frames(platform_id, platform["billSuffix"])

        full_flagship = normalize_full_detail(full_df[flagship_mask(full_df)].copy(), platform_id, platform)
        bill_flagship = normalize_bill_detail(bill_df[flagship_mask(bill_df)].copy(), platform_id, platform)
        full_flagship = clean_detail_numbers(full_flagship)
        bill_flagship = clean_detail_numbers(bill_flagship)
        full_frames.append(full_flagship)
        bill_frames.append(bill_flagship)
        source_stats.append(
            {
                "platformId": platform_id,
                "platformLabel": platform["label"],
                "fullRows": int(len(full_flagship)),
                "billRows": int(len(bill_flagship)),
                "fullGmv": round_float(full_flagship["gmv"].sum(), 2),
                "billActivityGmv": round_float(bill_flagship["activityGmv"].sum(), 2),
                "billSubsidy": round_float(bill_flagship["subsidy"].sum(), 2),
            }
        )

    full = pd.concat(full_frames, ignore_index=True) if full_frames else pd.DataFrame()
    bill = pd.concat(bill_frames, ignore_index=True) if bill_frames else pd.DataFrame()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    full.to_csv(FULL_DETAIL_CSV, index=False, encoding="utf-8-sig")
    bill.to_csv(BILL_DETAIL_CSV, index=False, encoding="utf-8-sig")

    data = {
        "metadata": {
            "title": "嘉士伯官旗即时零售周报",
            "generatedAt": pd.Timestamp.now().strftime("%Y-%m-%dT%H:%M:%S"),
            "period": PERIOD,
            "definition": "官旗口径：仅淘宝闪购，按酒小二、惠宜选、永辉、西菲狸四个渠道归类；西菲狸来自账单供应商名称，缺全量数据时展示为空白。",
            "channelOrder": FLAGSHIP_CHANNELS,
            "detailFiles": {
                "full": FULL_DETAIL_CSV.name,
                "bill": BILL_DETAIL_CSV.name,
            },
            "sourceStats": source_stats,
        },
        "summary": total_summary(full, bill),
        "breakdowns": {
            "platforms": aggregate(full, bill, "platformLabel", "platform"),
            "regions": aggregate(full, bill, "region", "region"),
            "channels": aggregate(full, bill, "channel", "channel"),
            "merchants": aggregate(full, bill, "merchant", "merchant"),
            "brands": aggregate(full, bill, "brand", "brand"),
            "activities": aggregate(full, bill, "activityName", "activityName", sort_key="activityGmv"),
            "products": aggregate(full, bill, "product", "product"),
        },
        "records": {
            "full": json_records(
                full,
                ["date", "region", "channel", "brand", "product", "gmv", "quantity", "orders", "users"],
            ),
            "bill": json_records(
                bill,
                ["date", "region", "channel", "brand", "product", "activityName", "activityGmv", "subsidy", "orderId"],
            ),
        },
    }
    OUTPUT_JSON.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return data


def main() -> None:
    data = build()
    print(f"Wrote {OUTPUT_JSON}")
    print(f"Wrote {FULL_DETAIL_CSV}")
    print(f"Wrote {BILL_DETAIL_CSV}")
    print(json.dumps({"summary": data["summary"], "sourceStats": data["metadata"]["sourceStats"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
