"""
Stock Comparison backend.

A tiny Flask API that fetches historical daily prices via the free `yfinance`
library (which reads Yahoo Finance's public data — no API key, no cost) and
returns two series for a ticker:

  - "price"        : raw closing price
  - "total_return" : dividend/split-adjusted close, normalized so it can be
                     compared against another stock as a growth-of-$100 curve.

yfinance returns dividend/split-adjusted closes when called with
`auto_adjust=True`, which is what makes "total return" possible for free.
See README for details.
"""

from __future__ import annotations

import csv
import io
import math
import time
from datetime import datetime

import requests
import yfinance as yf
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Small in-memory cache so we don't hammer Yahoo while you click around.
# key -> (timestamp, payload)
_CACHE: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL_SECONDS = 60 * 15  # 15 minutes

# CPI (inflation) series on FRED — free, no API key. Values are monthly.
#   Canada: CANCPIALLMINMEI (StatCan CPI, all items, 1914-present)
#   US:     CPIAUCSL         (BLS CPI-U, all items, seasonally adjusted)
CPI_SERIES = {
    "CA": "CANCPIALLMINMEI",
    "US": "CPIAUCSL",
}
_FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"

# Separate, longer cache for CPI (it only updates monthly).
_CPI_CACHE: dict[str, tuple[float, list[dict]]] = {}
_CPI_TTL_SECONDS = 60 * 60 * 24  # 1 day


class DataFetchError(Exception):
    """Raised when the data provider request fails (network/provider issue)."""


def fetch_cpi(country: str) -> list[dict]:
    """
    Return monthly CPI as a list of {date, index} dicts (oldest first).

    Pulls a CSV from FRED (no API key). The 'index' is a price level, so
    inflation between two dates is the ratio of their index values.
    """
    country = (country or "CA").upper()
    series_id = CPI_SERIES.get(country)
    if series_id is None:
        raise LookupError(f"Unsupported country '{country}'. Use CA or US.")

    cached = _CPI_CACHE.get(country)
    if cached and (time.time() - cached[0]) < _CPI_TTL_SECONDS:
        return cached[1]

    try:
        resp = requests.get(_FRED_CSV, params={"id": series_id}, timeout=20)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise DataFetchError(f"CPI provider error: {e}") from e

    rows: list[dict] = []
    reader = csv.DictReader(io.StringIO(resp.text))
    for row in reader:
        date = row.get("observation_date") or row.get("DATE")
        raw = row.get(series_id)
        if not date or raw in (None, "", "."):
            continue
        try:
            idx = float(raw)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(idx):
            continue
        rows.append({"date": date, "index": idx})

    if not rows:
        raise DataFetchError("No CPI data returned from provider.")

    _CPI_CACHE[country] = (time.time(), rows)
    return rows


def cpi_index_for(cpi_rows: list[dict], date_str: str) -> float | None:
    """
    Return the CPI index value effective on/just before a given date.

    CPI is monthly (dated on the 1st). For a stock date like 2021-09-27 we want
    the most recent CPI row whose date is <= that date.
    """
    target = datetime.strptime(date_str, "%Y-%m-%d")
    chosen = None
    for r in cpi_rows:
        r_dt = datetime.strptime(r["date"], "%Y-%m-%d")
        if r_dt <= target:
            chosen = r["index"]
        else:
            break
    # If the stock date is before any CPI row, fall back to the first CPI value.
    if chosen is None and cpi_rows:
        chosen = cpi_rows[0]["index"]
    return chosen


def fetch_history(ticker: str) -> list[dict]:
    """
    Return a list of {date, close} dicts (oldest first) for a ticker.

    Uses yfinance with auto_adjust=True, so the close is dividend/split
    adjusted — effectively a total-return price series.
    """
    symbol = ticker.strip().upper()
    if not symbol:
        raise LookupError("Empty ticker.")

    cached = _CACHE.get(symbol)
    if cached and (time.time() - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    try:
        # period="max" pulls full history; we trim by date later.
        df = yf.Ticker(symbol).history(period="max", auto_adjust=True)
    except Exception as e:  # yfinance raises assorted network/parse errors
        raise DataFetchError(str(e)) from e

    if df is None or df.empty or "Close" not in df.columns:
        raise LookupError(f"No data for '{ticker}'. Check the ticker symbol.")

    rows: list[dict] = []
    for ts, close in df["Close"].items():
        if close is None:
            continue
        try:
            close_f = float(close)
        except (TypeError, ValueError):
            continue
        # Skip NaN/Infinity: yfinance sometimes has gaps, and those values are
        # NOT valid JSON. Strict parsers (Safari's) reject the whole response.
        if not math.isfinite(close_f):
            continue
        rows.append({"date": ts.strftime("%Y-%m-%d"), "close": close_f})

    if not rows:
        raise LookupError(f"No usable price data for '{ticker}'.")

    _CACHE[symbol] = (time.time(), rows)
    return rows


# Cache for the price-vs-total-return breakdown (separate shape from fetch_history).
_BREAKDOWN_CACHE: dict[str, tuple[float, list[dict]]] = {}


def fetch_breakdown(ticker: str) -> list[dict]:
    """
    Return rows of {date, price, total} (oldest first) for a ticker, where:
      - price : raw closing price (share price only, no dividends)
      - total : dividend/split-adjusted close (price + reinvested dividends)

    Using auto_adjust=False gives us both the raw 'Close' and 'Adj Close' in a
    single request, so we can show the dividend contribution as the gap between
    the two lines.
    """
    symbol = ticker.strip().upper()
    if not symbol:
        raise LookupError("Empty ticker.")

    cached = _BREAKDOWN_CACHE.get(symbol)
    if cached and (time.time() - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    try:
        df = yf.Ticker(symbol).history(period="max", auto_adjust=False)
    except Exception as e:
        raise DataFetchError(str(e)) from e

    if df is None or df.empty or "Close" not in df.columns:
        raise LookupError(f"No data for '{ticker}'. Check the ticker symbol.")

    # Older/newer yfinance may name the adjusted column "Adj Close".
    adj_col = "Adj Close" if "Adj Close" in df.columns else "Close"

    rows: list[dict] = []
    for ts, row in df.iterrows():
        try:
            price = float(row["Close"])
            total = float(row[adj_col])
        except (TypeError, ValueError, KeyError):
            continue
        if not (math.isfinite(price) and math.isfinite(total)):
            continue
        rows.append({"date": ts.strftime("%Y-%m-%d"), "price": price, "total": total})

    if not rows:
        raise LookupError(f"No usable price data for '{ticker}'.")

    _BREAKDOWN_CACHE[symbol] = (time.time(), rows)
    return rows


def _filter_by_range(rows: list[dict], start: str | None) -> list[dict]:
    if not start:
        return rows
    try:
        start_dt = datetime.strptime(start, "%Y-%m-%d")
    except ValueError:
        return rows
    return [r for r in rows if datetime.strptime(r["date"], "%Y-%m-%d") >= start_dt]


def _normalize_to_100(rows: list[dict]) -> list[dict]:
    """Convert an adjusted-close series into a 'growth of $100' curve."""
    if not rows:
        return []
    base = rows[0]["close"]
    if base == 0:
        return [{"date": r["date"], "value": 0.0} for r in rows]
    return [
        {"date": r["date"], "value": round((r["close"] / base) * 100.0, 4)}
        for r in rows
    ]


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/compare")
def compare():
    """
    Compare two tickers.

    Query params:
      a      : first ticker (required)
      b      : second ticker (required)
      start  : optional ISO date (YYYY-MM-DD) to trim the history
      mode   : "total_return" (default) or "price"

    Returns aligned series for both tickers.
    """
    a = request.args.get("a", "").strip()
    b = request.args.get("b", "").strip()
    start = request.args.get("start")
    mode = request.args.get("mode", "total_return")

    if not a or not b:
        return jsonify({"error": "Provide two tickers via ?a=AAPL&b=MSFT"}), 400

    result = {"mode": mode, "series": {}}
    for key, ticker in (("a", a), ("b", b)):
        try:
            rows = _filter_by_range(fetch_history(ticker), start)
        except LookupError as e:
            return jsonify({"error": str(e)}), 404
        except DataFetchError as e:
            return jsonify({"error": f"Data provider error: {e}"}), 502

        if mode == "price":
            series = [{"date": r["date"], "value": r["close"]} for r in rows]
        else:
            series = _normalize_to_100(rows)

        result["series"][key] = {
            "ticker": ticker.upper(),
            "points": series,
        }

    return jsonify(result)


@app.route("/api/real-return")
def real_return():
    """
    Nominal vs inflation-adjusted (real) return for a single ticker.

    Query params:
      ticker  : the stock/ETF symbol (required)
      country : "CA" (default) or "US" — which CPI to deflate by
      start   : optional ISO date (YYYY-MM-DD) to trim the history

    Both returned series are normalized to 100 at the start, so:
      - "nominal": total return including dividends (before inflation)
      - "real":   the same, but adjusted for the cost of living

    If the real line ends above 100 the investment beat inflation; below 100
    means its purchasing power actually shrank.
    """
    ticker = request.args.get("ticker", "").strip()
    country = request.args.get("country", "CA").strip().upper()
    start = request.args.get("start")

    if not ticker:
        return jsonify({"error": "Provide a ticker via ?ticker=VOO"}), 400

    try:
        stock_rows = _filter_by_range(fetch_history(ticker), start)
        cpi_rows = fetch_cpi(country)
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except DataFetchError as e:
        return jsonify({"error": f"Data provider error: {e}"}), 502

    if not stock_rows:
        return jsonify({"error": f"No price data for '{ticker}' in range."}), 404

    base_close = stock_rows[0]["close"]
    base_cpi = cpi_index_for(cpi_rows, stock_rows[0]["date"])
    if not base_close or not base_cpi:
        return jsonify({"error": "Not enough data to compute returns."}), 404

    nominal = []
    real = []
    inflation = []
    for r in stock_rows:
        # Nominal: growth of $100 including dividends.
        nom_val = (r["close"] / base_close) * 100.0

        # Inflation factor = how much prices rose since the start.
        cpi_now = cpi_index_for(cpi_rows, r["date"]) or base_cpi
        inflation_factor = cpi_now / base_cpi

        # Real: divide the nominal growth by inflation.
        real_val = nom_val / inflation_factor if inflation_factor else nom_val

        # Inflation line: the cost of living itself, as a growth-of-100 curve.
        infl_val = inflation_factor * 100.0

        if not all(math.isfinite(x) for x in (nom_val, real_val, infl_val)):
            continue
        nominal.append({"date": r["date"], "value": round(nom_val, 4)})
        real.append({"date": r["date"], "value": round(real_val, 4)})
        inflation.append({"date": r["date"], "value": round(infl_val, 4)})

    # CPI can lag the latest stock dates by a month or two; note the last CPI
    # date so the UI can be honest about coverage.
    cpi_last = cpi_rows[-1]["date"] if cpi_rows else None

    return jsonify(
        {
            "ticker": ticker.upper(),
            "country": country,
            "cpi_series": CPI_SERIES.get(country),
            "cpi_last_date": cpi_last,
            "series": {
                "nominal": {"label": "Nominal (before inflation)", "points": nominal},
                "real": {"label": "Real (after inflation)", "points": real},
                "inflation": {"label": "Inflation (cost of living)", "points": inflation},
            },
        }
    )


@app.route("/api/stock-breakdown")
def stock_breakdown():
    """
    Price-only vs price-plus-dividends (total return) for a single ticker.

    Query params:
      ticker : the stock/ETF symbol (required)
      start  : optional ISO date (YYYY-MM-DD) to trim the history

    Both series are normalized to 100 at the start, so the gap between them is
    exactly the extra growth that dividends provided.
    """
    ticker = request.args.get("ticker", "").strip()
    start = request.args.get("start")

    if not ticker:
        return jsonify({"error": "Provide a ticker via ?ticker=SRU-UN.TO"}), 400

    try:
        rows = _filter_by_range(fetch_breakdown(ticker), start)
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except DataFetchError as e:
        return jsonify({"error": f"Data provider error: {e}"}), 502

    if not rows:
        return jsonify({"error": f"No price data for '{ticker}' in range."}), 404

    base_price = rows[0]["price"]
    base_total = rows[0]["total"]
    if not base_price or not base_total:
        return jsonify({"error": "Not enough data to compute returns."}), 404

    price_series = []
    total_series = []
    for r in rows:
        p = (r["price"] / base_price) * 100.0
        t = (r["total"] / base_total) * 100.0
        if not (math.isfinite(p) and math.isfinite(t)):
            continue
        price_series.append({"date": r["date"], "value": round(p, 4)})
        total_series.append({"date": r["date"], "value": round(t, 4)})

    return jsonify(
        {
            "ticker": ticker.upper(),
            "series": {
                "price": {"label": "Price only", "points": price_series},
                "total": {"label": "Price + dividends", "points": total_series},
            },
        }
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
