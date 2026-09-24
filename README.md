# Stock Face-Off 📈

A small, for-fun web app to **compare two stocks head to head** — and, importantly,
to compare their **total return** (price appreciation *plus* reinvested dividends),
not just the raw share price.

![screenshot placeholder — run it and take one!](docs/screenshot.png)

## Why total return?

If you only look at share price, you miss a big part of the story. A stock that
pays a fat dividend (say, Coca-Cola or Realty Income) can deliver strong returns
even when its price barely moves. This app defaults to a **"growth of $100"** view:
each stock starts at $100 and the line shows what that investment would be worth
over time, with dividends reinvested. Because both lines start at 100, you can
compare returns directly regardless of share price.

You can flip to **Price only** mode if you just want to see raw closing prices.

## How it works

- **Backend** (`backend/app.py`): a tiny [Flask](https://flask.palletsprojects.com/)
  API that pulls daily historical data via [`yfinance`](https://github.com/ranaroussi/yfinance),
  a free open-source library that reads Yahoo Finance's public data — **no API key,
  no cost**. With `auto_adjust=True` its close is dividend/split adjusted, which is
  what lets us show total return.
- **Frontend** (`frontend/`): a single HTML page with a little JavaScript that
  draws the comparison with [Chart.js](https://www.chartjs.org/). Type a ticker
  (or pick a company name) for each side and hit **Compare**.

```
Stocks/
├── backend/
│   ├── app.py            # Flask API (/api/compare)
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── run.sh                # one command to run everything
└── README.md
```

## Running it locally

### Option A — the easy way

```bash
./run.sh
```

Then open <http://127.0.0.1:8000> in your browser.

### Option B — manual

Terminal 1 (backend):

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Terminal 2 (frontend):

```bash
cd frontend
python3 -m http.server 8000
```

Open <http://127.0.0.1:8000>.

> The frontend is served separately (rather than opened as a `file://`) so the
> browser is happy talking to the backend.

## API

`GET /api/compare`

| Param   | Description                                        | Example        |
| ------- | -------------------------------------------------- | -------------- |
| `a`     | first ticker (required)                            | `AAPL`         |
| `b`     | second ticker (required)                           | `MSFT`         |
| `mode`  | `total_return` (default) or `price`                | `total_return` |
| `start` | optional start date (`YYYY-MM-DD`) to trim history | `2020-01-01`   |

Example:

```
http://127.0.0.1:5000/api/compare?a=KO&b=PEP&mode=total_return&start=2015-01-01
```

## Ideas for later

- Add more than two stocks at once
- Show the dividend yield and total return % as summary stats
- Company-name search that hits a real symbol lookup API
- Deploy it live (e.g. GitHub Pages for the frontend + a hosted backend)

## Disclaimer

This is a personal/educational project. It is **not** investment advice, and the
data (via yfinance / Yahoo Finance) may be delayed or imperfect. `yfinance` reads
an unofficial public data source, so it can occasionally rate-limit or change.
Don't make money decisions based on it.
