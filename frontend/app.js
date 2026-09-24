// Stock Face-Off frontend logic.
// Talks to the Flask backend at API_BASE and draws a comparison chart.

const API_BASE = "http://127.0.0.1:5000";

// A small starter list so typing a company name suggests a ticker.
// The <datalist> lets people type either the ticker or the name.
const COMPANIES = [
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
  tickerA: document.getElementById("tickerA"),
  tickerB: document.getElementById("tickerB"),
  mode: document.getElementById("mode"),
  range: document.getElementById("range"),
  btn: document.getElementById("compareBtn"),
  status: document.getElementById("status"),
  modeNote: document.getElementById("modeNote"),
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
  // If someone typed a company name, try to map it back to a ticker.
  const byName = COMPANIES.find(([, name]) => name.toUpperCase() === value);
  if (byName) return byName[0];
  return value;
}

function startDateForRange(years) {
  if (!years || years === "0") return "";
  const d = new Date();
  d.setFullYear(d.getFullYear() - Number(years));
  return d.toISOString().slice(0, 10);
}

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", isError);
}

async function compare() {
  const a = normalizeTicker(els.tickerA.value);
  const b = normalizeTicker(els.tickerB.value);

  if (!a || !b) {
    setStatus("Enter two stocks to compare.", true);
    return;
  }

  const mode = els.mode.value;
  const start = startDateForRange(els.range.value);

  const url = new URL(`${API_BASE}/api/compare`);
  url.searchParams.set("a", a);
  url.searchParams.set("b", b);
  url.searchParams.set("mode", mode);
  if (start) url.searchParams.set("start", start);

  els.btn.disabled = true;
  setStatus(`Loading ${a} vs ${b}…`);

  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Request failed");
    render(data);
    setStatus(`${data.series.a.ticker} vs ${data.series.b.ticker}`);
    els.modeNote.textContent =
      mode === "total_return"
        ? "Total return: each line shows the growth of a $100 investment, including reinvested dividends. Both start at 100 so you can compare returns directly."
        : "Price only: raw closing price in dollars (ignores dividends).";
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    els.btn.disabled = false;
  }
}

function render(data) {
  const { a, b } = data.series;
  // Build a unified, sorted set of labels (dates present in either series).
  const labels = a.points.map((p) => p.date);

  const mapB = new Map(b.points.map((p) => [p.date, p.value]));
  const dataA = a.points.map((p) => p.value);
  const dataB = labels.map((d) => (mapB.has(d) ? mapB.get(d) : null));

  const datasets = [
    {
      label: a.ticker,
      data: dataA,
      borderColor: "#4f9dff",
      backgroundColor: "rgba(79,157,255,0.1)",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      spanGaps: true,
    },
    {
      label: b.ticker,
      data: dataB,
      borderColor: "#ff8a5c",
      backgroundColor: "rgba(255,138,92,0.1)",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      spanGaps: true,
    },
  ];

  const isReturn = data.mode === "total_return";

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
              return isReturn
                ? `${c.dataset.label}: $${v.toFixed(2)} (of $100)`
                : `${c.dataset.label}: $${v.toFixed(2)}`;
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
            callback: (v) => (isReturn ? `$${v}` : `$${v}`),
          },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },
    },
  });
}

populateDatalist();
els.btn.addEventListener("click", compare);
[els.tickerA, els.tickerB].forEach((input) =>
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") compare();
  })
);

// Give people something to look at on first load.
els.tickerA.value = "AAPL";
els.tickerB.value = "MSFT";
compare();
