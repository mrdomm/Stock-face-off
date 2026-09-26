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

import math
import time
from datetime import datetime

import yfinance as yf
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Small in-memory cache so we don't hammer Yahoo while you click around.
# key -> (timestamp, payload)
_CACHE: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL_SECONDS = 60 * 15  # 15 minutes


class DataFetchError(Exception):
    """Raised when the data provider request fails (network/provider issue)."""


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


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
