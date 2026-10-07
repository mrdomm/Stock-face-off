// "Dividend Impact" page logic.
// Shows a single stock as two lines: price only vs. price + dividends.
// The gap between them is the extra return that dividends provided.

const API_BASE = "http://127.0.0.1:5000";

// Same starter list as the other pages, with SmartCentres added up front
// since it's this page's default (and a great dividend example).
const COMPANIES = [
  ["SRU-UN.TO", "SmartCentres REIT"],
  ["AAPL", "Apple"],
  ["MSFT", "Microsoft"],
  ["GOOGL", "Alphabet (Google)"],
  ["AMZN", "Amazon"],
  ["NVDA", "Nvidia"],
  ["META", "Meta (Facebook)"],
  ["TSLA", "Tesla"],
  ["JNJ", "Johnson & Johnson"],
  ["JPM", "JPMorgan Chase"],
  ["V", "Visa"],
  ["KO", "Coca-Cola"],
  ["PEP", "PepsiCo"],
  ["PG", "Procter & Gamble"],
  ["XOM", "ExxonMobil"],
  ["T", "AT&T"],
  ["VZ", "Verizon"],
  ["DIS", "Disney"],
  ["MCD", "McDonald's"],
  ["HD", "Home Depot"],
  ["WMT", "Walmart"],
  ["O", "Realty Income"],
  ["SPY", "S&P 500 ETF"],
  ["VOO", "Vanguard S&P 500 ETF"],
  ["SCHD", "Schwab US Dividend ETF"],
];

const els = {
  ticker: document.getElementById("ticker"),
  range: document.getElementById("range"),
  btn: document.getElementById("goBtn"),
  status: document.getElementById("status"),
  summary: document.getElementById("summary"),
  note: document.getElementById("note"),
  datalist: document.getElementById("companies"),
};

let chart = null;

function populateDatalist() {
  els.datalist.innerHTML = COMPANIES.map(
    ([sym, name]) => `<option value="${sym}">${name}</option>`
  ).join("");
}

function normalizeTicker(raw) {
  const value = (raw || "").trim().toUpperCase();
  const byName = COMPANIES.find(([, name]) => name.toUpperCase() === value);
  if (byName) return byName[0];
  return value;
}

// Format a date as YYYY-MM-DD from numeric parts (Safari-safe).
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startDateForRange(code) {
  if (!code || code === "max") return "";
  const match = /^(\d+)y$/.exec(code);
  if (!match) return "";
  const years = Number(match[1]);
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setFullYear(d.getFullYear() - years);
  return formatDate(d);
}

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", isError);
}

function pct(v) {
  const p = v - 100;
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}

async function run() {
  const ticker = normalizeTicker(els.ticker.value);
  if (!ticker) {
    setStatus("Enter a stock or ETF.", true);
    return;
  }

  const start = startDateForRange(els.range.value);

  // Build the query as a plain string (Safari rejects URL objects in fetch).
  const params = [`ticker=${encodeURIComponent(ticker)}`];
  if (start) params.push(`start=${encodeURIComponent(start)}`);
  const url = `${API_BASE}/api/stock-breakdown?${params.join("&")}`;

  els.btn.disabled = true;
  els.summary.innerHTML = "";
  setStatus(`Loading ${ticker}… (first load can take a moment)`);

  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Request failed");
    render(data);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    els.btn.disabled = false;
  }
}

function render(data) {
  const price = data.series.price.points;
  const total = data.series.total.points;

  const labels = price.map((p) => p.date);
  const priceData = price.map((p) => p.value);
  const totalMap = new Map(total.map((p) => [p.date, p.value]));
  const totalData = labels.map((d) => (totalMap.has(d) ? totalMap.get(d) : null));

  setStatus(`${data.ticker} — price only vs price + dividends`);

  // Summary: final price-only return, total return, and the dividend boost.
  const lastPrice = priceData[priceData.length - 1];
  const lastTotal = totalData[totalData.length - 1];
  const divBoost = lastTotal - lastPrice; // in percentage points
  els.summary.innerHTML = `
    <span class="stat">Price only: <b>${pct(lastPrice)}</b></span>
    <span class="stat">With dividends: <b>${pct(lastTotal)}</b></span>
    <span class="verdict good">Dividends added +${divBoost.toFixed(1)} pts</span>`;

  const datasets = [
    {
      label: "Price only",
      data: priceData,
      borderColor: "#9aa3c0",
      backgroundColor: "rgba(154,163,192,0.08)",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      spanGaps: true,
    },
    {
      label: "Price + dividends",
      data: totalData,
      borderColor: "#4f9dff",
      backgroundColor: "rgba(79,157,255,0.12)",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      spanGaps: true,
      fill: "-1", // shade the gap between the two lines = the dividend boost
    },
  ];

  if (chart) chart.destroy();
  const ctx = document.getElementById("chart");
  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#e8ebf5" } },
        tooltip: {
          callbacks: {
            label: (c) => {
              const v = c.parsed.y;
              if (v === null) return `${c.dataset.label}: n/a`;
              return `${c.dataset.label}: ${pct(v)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#9aa3c0", maxTicksLimit: 10 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: {
            color: "#9aa3c0",
            callback: (v) => {
              const p = v - 100;
              const sign = p > 0 ? "+" : "";
              return `${sign}${p}%`;
            },
          },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },
    },
  });

  els.note.textContent =
    "Both lines start at 0%. The grey line is the share price alone; the blue " +
    "line adds reinvested dividends. The shaded gap between them is what " +
    "dividends contributed — for high-dividend stocks like REITs this can be most of the return.";
}

populateDatalist();
els.btn.addEventListener("click", run);
els.ticker.addEventListener("keydown", (e) => {
  if (e.key === "Enter") run();
});

// Default to SmartCentres REIT — a dividend-heavy stock that shows the effect well.
els.ticker.value = "SRU-UN.TO";
run();
