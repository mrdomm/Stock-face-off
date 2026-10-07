// "Beat Inflation?" page logic.
// Shows a single stock's nominal return vs its inflation-adjusted (real)
// return, using Canadian (default) or US CPI from the backend.

const API_BASE = "http://127.0.0.1:5000";

// Same starter list as the compare page so name/ticker autocomplete works.
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
  ticker: document.getElementById("ticker"),
  country: document.getElementById("country"),
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

  const country = els.country.value;
  const start = startDateForRange(els.range.value);

  // Build the query as a plain string (Safari rejects URL objects in fetch).
  const params = [
    `ticker=${encodeURIComponent(ticker)}`,
    `country=${encodeURIComponent(country)}`,
  ];
  if (start) params.push(`start=${encodeURIComponent(start)}`);
  const url = `${API_BASE}/api/real-return?${params.join("&")}`;

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
  const nominal = data.series.nominal.points;
  const real = data.series.real.points;

  const inflationPts = (data.series.inflation && data.series.inflation.points) || [];

  const labels = nominal.map((p) => p.date);
  const nomData = nominal.map((p) => p.value);
  const realMap = new Map(real.map((p) => [p.date, p.value]));
  const realData = labels.map((d) => (realMap.has(d) ? realMap.get(d) : null));
  const inflMap = new Map(inflationPts.map((p) => [p.date, p.value]));
  const inflData = labels.map((d) => (inflMap.has(d) ? inflMap.get(d) : null));

  const countryName = data.country === "US" ? "U.S." : "Canadian";
  setStatus(`${data.ticker} — nominal vs real return (${countryName} inflation)`);

  // Summary line: final nominal, real, and total inflation, plus the verdict.
  const lastNom = nomData[nomData.length - 1];
  const lastReal = realData[realData.length - 1];
  const lastInfl = inflData.length ? inflData[inflData.length - 1] : null;
  const beat = lastReal > 100;
  els.summary.innerHTML = `
    <span class="stat">Nominal: <b>${pct(lastNom)}</b></span>
    <span class="stat">Real (after inflation): <b>${pct(lastReal)}</b></span>
    ${lastInfl !== null ? `<span class="stat">Inflation: <b>${pct(lastInfl)}</b></span>` : ""}
    <span class="verdict ${beat ? "good" : "bad"}">
      ${beat ? "Beat inflation ✓" : "Did not beat inflation ✗"}
    </span>`;

  const datasets = [
    {
      label: "Nominal (before inflation)",
      data: nomData,
      borderColor: "#4f9dff",
      backgroundColor: "rgba(79,157,255,0.1)",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      spanGaps: true,
    },
    {
      label: "Real (after inflation)",
      data: realData,
      borderColor: "#5cffb0",
      backgroundColor: "rgba(92,255,176,0.1)",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      spanGaps: true,
    },
    {
      label: "Inflation (cost of living)",
      data: inflData,
      borderColor: "#c0b05c",
      backgroundColor: "rgba(192,176,92,0.08)",
      borderWidth: 1.5,
      borderDash: [6, 4],
      pointRadius: 0,
      tension: 0.1,
      spanGaps: true,
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

  // Be honest about CPI lag: if the CPI's last month is well before the
  // stock's last date, the most recent "real" values understate inflation.
  let note =
    "Both lines start at 0%. The green line subtracts the rise in the cost of living, " +
    "so if it ends above 0% the stock grew your real purchasing power.";
  if (data.cpi_last_date && labels.length) {
    const cpiLast = data.cpi_last_date;
    const stockLast = labels[labels.length - 1];
    if (cpiLast < stockLast) {
      note +=
        ` Note: ${countryName} inflation data currently runs through ${cpiLast}, ` +
        `so the most recent stretch (to ${stockLast}) carries the last known ` +
        `inflation figure forward and may slightly understate inflation.`;
    }
  }
  els.note.textContent = note;
}

populateDatalist();
els.btn.addEventListener("click", run);
els.ticker.addEventListener("keydown", (e) => {
  if (e.key === "Enter") run();
});

// Something to look at on first load.
els.ticker.value = "VOO";
run();
