/**
 * The orders page of tripmyway-fulfil (GET /orders): paid TripMyWay orders,
 * their print files and, in manual mode, step-by-step help for placing each
 * order on ArtBeat by hand. Plain server-rendered HTML; a few lines of script
 * for the copy buttons and remembering the instructions panel.
 */
import { PRINT_EDGES, type PrintEdge } from "@/config/artbeat";
import type { Address } from "@/lib/fulfil/shopify";
import type { OrderRecord, PrintFile, State } from "./records";

export type Tab = "todo" | "done" | "attention" | "all";

export interface PageInput {
  records: OrderRecord[];
  tab: Tab;
  mode: "manual" | "api";
  /** ArtBeat environment in API mode ("dev" | "live"). */
  artbeatEnv: string;
  defaultEdge: PrintEdge;
  /** e.g. https://admin.shopify.com/store/tripmyway-bf2kmucg (no trailing slash). */
  shopifyAdminUrl?: string | undefined;
  timeZone: string;
  /** A short message after an action ("#1001 marked as ordered."). */
  flash?: string | undefined;
}

export const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const TODO: State[] = ["ready to order", "queued", "making files"];
const DONE: State[] = ["ordered by hand", "accepted", "skipped"];
const ATTENTION: State[] = ["needs attention", "rejected"];

export function tabOf(state: State): Exclude<Tab, "all"> {
  if (DONE.includes(state)) return "done";
  if (ATTENTION.includes(state)) return "attention";
  return "todo";
}

const STATE_LABEL: Record<State, string> = {
  queued: "Waiting to make files",
  "making files": "Making print files…",
  "ready to order": "Ready to order on ArtBeat",
  "ordered by hand": "Ordered on ArtBeat",
  accepted: "Sent to ArtBeat",
  rejected: "ArtBeat refused it",
  "needs attention": "Needs attention",
  skipped: "Skipped (test order)",
};

function when(iso: string, timeZone: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function addressText(a: Address, email?: string): string {
  const name = [a.firstName, a.lastName].filter(Boolean).join(" ");
  const cityLine = [a.city, [a.provinceCode, a.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [name, a.company, a.address1, a.address2, cityLine, a.countryCode, a.phone, email]
    .filter((x) => x && String(x).trim())
    .join("\n");
}

export function printSpecs(f: PrintFile): string {
  return [
    f.tripName &&
      `${f.tripName}${f.parts && f.parts > 1 ? ` (print ${f.part} of ${f.parts})` : ""}`,
    f.sizeLabel && `Size: ${f.sizeLabel}`,
    f.finishLabel && `Finish: ${f.finishLabel}`,
    f.frameLabel && `Frame: ${f.frameLabel}`,
    `Quantity: ${f.quantity ?? 1}`,
    `File: ${f.name}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const inches = (n?: number) => (n == null ? "" : `${Number(n.toFixed(2))}″`);

function fileRow(f: PrintFile) {
  const edge = PRINT_EDGES.find((e) => e.id === f.edge);
  const covers =
    f.fileWidthIn && f.fileHeightIn ? `${inches(f.fileWidthIn)} × ${inches(f.fileHeightIn)}` : "";
  const px =
    f.width && f.height
      ? `${f.width.toLocaleString("en-US")} × ${f.height.toLocaleString("en-US")} px`
      : "";
  return `<li class="print">
  <div class="print-head">
    <span class="print-n">${f.parts && f.parts > 1 ? `Print ${f.part} of ${f.parts}` : "Print"}</span>
    ${f.tripName ? `<span class="trip">${esc(f.tripName)}</span>` : ""}
  </div>
  <div class="chips">
    ${f.sizeLabel ? `<span class="chip"><b>${esc(f.sizeLabel)}</b></span>` : ""}
    ${f.finishLabel ? `<span class="chip">${esc(f.finishLabel)}</span>` : ""}
    ${f.frameLabel ? `<span class="chip">${esc(f.frameLabel)}</span>` : ""}
    <span class="chip qty">Qty ${esc(f.quantity ?? 1)}</span>
  </div>
  <div class="file-meta">JPEG${px ? ` · ${px}` : ""}${covers ? ` · ${covers}` : ""} · 300 ppi${edge ? ` · ${esc(edge.label.toLowerCase())}` : ""}</div>
  <div class="btns">
    <a class="btn primary" href="${esc(f.url)}?download=1" download="${esc(f.name)}">Download file</a>
    <button type="button" class="btn" data-copy="${esc(printSpecs(f))}">Copy details</button>
  </div>
</li>`;
}

function orderCard(r: OrderRecord, p: PageInput) {
  const o = r.order;
  const state = r.state;
  const tab = tabOf(state);
  const busy = state === "queued" || state === "making files";
  const previews = o.lines.filter((l) => l.preview);
  const adminLink = p.shopifyAdminUrl
    ? `<a class="link" href="${esc(p.shopifyAdminUrl)}/orders/${esc(o.id)}" target="_blank" rel="noopener">Open in Shopify ↗</a>`
    : "";
  const ship = o.shipTo
    ? `<div class="ship">
    <h4>Ship to</h4>
    <pre>${esc(addressText(o.shipTo, o.email))}</pre>
    <button type="button" class="btn small" data-copy="${esc(addressText(o.shipTo))}">Copy address</button>
  </div>`
    : `<div class="ship warn"><h4>Ship to</h4><p>No shipping address on this order. Check it in Shopify before ordering.</p></div>`;
  const problems = r.problems.length
    ? `<div class="note ${tab === "attention" ? "bad" : "info"}"><ul>${r.problems.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`
    : "";
  const idField = `<input type="hidden" name="id" value="${esc(o.id)}">`;

  let actions = "";
  if (state === "ready to order") {
    actions = `<form method="post" action="/orders/ordered" class="mark">
      ${idField}
      <label>ArtBeat order number <span class="opt">(optional)</span>
        <input name="artbeat" maxlength="60" placeholder="e.g. AB-10234" autocomplete="off"></label>
      <button class="btn primary">Mark as ordered</button>
    </form>`;
  } else if (state === "ordered by hand") {
    actions = `<div class="done-line">✓ Ordered on ArtBeat ${esc(when(r.manual?.at ?? r.updatedAt, p.timeZone))}${
      r.manual?.artbeatOrder ? ` · ArtBeat order <b>${esc(r.manual.artbeatOrder)}</b>` : ""
    }</div>
    <form method="post" action="/orders/undo">${idField}<button class="btn small">Undo</button></form>`;
  } else if (busy) {
    actions = `<p class="muted">Making the print files. This usually takes a minute or two per print; this page refreshes by itself.</p>`;
  } else if (tab === "attention") {
    actions = `<form method="post" action="/orders/retry">${idField}<button class="btn primary">Try again</button></form>`;
  } else if (state === "accepted" && r.artbeat) {
    actions = `<div class="done-line">✓ ArtBeat ${esc(r.artbeat.env)} order ${esc(r.artbeat.id)}${r.artbeat.hubOrderCreated ? "" : " (not in production yet)"}</div>`;
  }

  const edgeNow = r.edge ?? p.defaultEdge;
  const remake =
    busy || state === "accepted"
      ? ""
      : `<details class="opts"><summary>Print file options</summary>
    <form method="post" action="/orders/remake">
      ${idField}
      ${PRINT_EDGES.map(
        (
          e,
        ) => `<label class="radio"><input type="radio" name="edge" value="${e.id}"${e.id === edgeNow ? " checked" : ""}>
        <span><b>${esc(e.label)}</b><br><small>${esc(e.hint)}</small></span></label>`,
      ).join("")}
      <button class="btn small">Make files again</button>
    </form>
  </details>`;

  return `<article class="order s-${tab}" id="o${esc(o.id)}">
  <header>
    <div>
      <h3>${esc(o.name)}${o.test ? ' <span class="badge">Test order</span>' : ""}</h3>
      <small class="muted">Paid ${esc(when(o.createdAt || r.receivedAt, p.timeZone))}</small>
    </div>
    <div class="head-r"><span class="pill p-${tab}">${esc(STATE_LABEL[state])}</span>${adminLink}</div>
  </header>
  <div class="body${previews.length ? "" : " no-preview"}">
    ${previews.length ? `<div class="previews">${previews.map((l) => `<img src="${esc(l.preview)}" alt="Map for ${esc(l.title)}" loading="lazy">`).join("")}<small class="muted">What the customer approved</small></div>` : ""}
    <div class="main">
      ${r.files.length ? `<ol class="prints">${r.files.map(fileRow).join("")}</ol>` : busy ? "" : '<p class="muted">No print files yet.</p>'}
      ${problems}
      ${ship}
    </div>
  </div>
  <footer>${actions}${remake}
    <details class="log"><summary>History</summary><small>${r.log.slice(-8).map(esc).join("<br>")}</small></details>
  </footer>
</article>`;
}

function instructions(p: PageInput, open: boolean) {
  const edge = PRINT_EDGES.find((e) => e.id === p.defaultEdge)!;
  return `<details class="how" id="how"${open ? " open" : ""}>
  <summary>How to place an order on ArtBeat</summary>
  <ol class="steps">
    <li><b>Check the order.</b> The picture is what the customer approved. Each <i>print</i> listed is one item on ArtBeat, so a set of two is two items, each with its own file.</li>
    <li><b>Download each print file</b> with <i>Download file</i>. They are JPEGs at 300 ppi, made <i>${esc(edge.label.toLowerCase())}</i>. ${esc(edge.hint)}</li>
    <li><b>Start a new order on ArtBeat</b> and add one item per print: upload its file, then pick the size, finish and frame shown beside it and set the quantity. <i>Copy details</i> puts all of these on your clipboard.</li>
    <li><b>Enter the shipping address</b> with <i>Copy address</i>, and add the Shopify order number (e.g. ${esc(p.records[0]?.order.name ?? "#1001")}) to ArtBeat's reference or notes so the two can be matched later.</li>
    <li><b>Submit and pay on ArtBeat</b>, then come back here and press <i>Mark as ordered</i> (add ArtBeat's order number if you have it). The order moves to <i>Ordered</i>.</li>
    <li><b>Tracking:</b> when it ships, check the Shopify order shows as fulfilled with tracking. If ArtBeat doesn't add it, open the order in Shopify, press <i>Fulfill item</i> and paste the tracking number so the customer gets their shipping email.</li>
  </ol>
  <p class="muted">Files are kept for 14 days. After that, <i>Print file options → Make files again</i> remakes them (customer photos are kept 180 days). The same menu switches a file between front only and with bleed / canvas edge.</p>
</details>`;
}

const STYLE = `
:root{--paper:#fbfbf8;--ink:#1b2a41;--muted:#5b6678;--line:#e1e5e8;--sea:#d7e8ea;--land:#efe8d6;--pin:#f2b134;--good:#17643a;--bad:#b42318}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0}h3{margin:0;font-size:19px}h4{margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.top{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px}
.mode{font-size:13px;padding:4px 10px;border-radius:99px;background:var(--land)}
.flash{background:#e7f4ec;border:1px solid #b9dfc7;color:var(--good);padding:10px 14px;border-radius:10px;margin:0 0 16px}
.how{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:18px}
.how summary{font-weight:700;cursor:pointer}.steps{padding-left:20px;margin:12px 0 8px}.steps li{margin:6px 0}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 16px}
.tabs a{padding:7px 14px;border-radius:99px;border:1.5px solid var(--line);color:var(--ink);text-decoration:none;font-weight:600;font-size:14px;background:#fff}
.tabs a.on{background:var(--ink);border-color:var(--ink);color:#fff}
.count{display:inline-block;min-width:20px;text-align:center;margin-left:4px;padding:0 6px;border-radius:99px;background:var(--pin);color:var(--ink);font-size:12px}
.order{background:#fff;border:1px solid var(--line);border-left:5px solid var(--pin);border-radius:14px;margin-bottom:16px;overflow:hidden}
.order.s-done{border-left-color:var(--good)}.order.s-attention{border-left-color:var(--bad)}
.order header{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;padding:14px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.head-r{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.pill{font-size:13px;font-weight:700;padding:4px 10px;border-radius:99px}
.p-todo{background:#fdf1d6}.p-done{background:#e7f4ec;color:var(--good)}.p-attention{background:#fde8e6;color:var(--bad)}
.badge{font-size:12px;font-weight:600;background:var(--sea);padding:2px 8px;border-radius:99px;vertical-align:middle}
.body{display:grid;grid-template-columns:minmax(0,240px) minmax(0,1fr);gap:18px;padding:16px 18px}.body.no-preview{grid-template-columns:1fr}
.previews img{width:100%;border-radius:8px;border:1px solid var(--line);background:var(--paper);display:block;margin-bottom:6px}
.prints{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.print{border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.print-head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.print-n{font-weight:700}.trip{color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.chip{font-size:13px;padding:3px 9px;border-radius:6px;background:var(--sea)}.chip.qty{background:var(--land)}
.file-meta{font-size:12.5px;color:var(--muted);margin-bottom:8px}
.btns{display:flex;gap:8px;flex-wrap:wrap}
.btn{display:inline-block;font:inherit;font-size:14px;font-weight:600;padding:7px 14px;border-radius:99px;border:2px solid var(--ink);background:#fff;color:var(--ink);text-decoration:none;cursor:pointer}
.btn.primary{background:var(--ink);color:#fff}.btn.small{font-size:13px;padding:4px 12px}.btn.copied{border-color:var(--good);color:var(--good)}
.ship pre{font:inherit;margin:0 0 8px;white-space:pre-wrap}.ship.warn p{color:var(--bad);margin:0}
.note{border-radius:10px;padding:8px 14px;margin:0 0 12px}.note ul{margin:0;padding-left:18px}.note.bad{background:#fde8e6;color:var(--bad)}.note.info{background:#fdf1d6}
footer{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center;padding:12px 18px 14px;border-top:1px solid var(--line);background:#fcfcfa}
.mark{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
.mark label{font-size:13px;font-weight:600;display:grid;gap:4px}.opt{font-weight:400;color:var(--muted)}
input[type=text],input:not([type]),input[name=artbeat],input[name=code]{font:inherit;padding:7px 10px;border:1.5px solid var(--line);border-radius:8px;min-width:200px}
.done-line{color:var(--good);font-weight:600}
.opts summary,.log summary{cursor:pointer;font-size:13px;color:var(--muted)}
.opts form{display:grid;gap:8px;margin-top:8px}.radio{display:flex;gap:8px;align-items:flex-start;font-size:14px}
.log small{display:block;margin-top:6px;color:var(--muted)}
.muted{color:var(--muted)}.link{font-size:14px;color:var(--ink)}
.empty{text-align:center;padding:48px 16px;color:var(--muted);background:#fff;border:1px dashed var(--line);border-radius:14px}
@media (max-width:700px){.body{grid-template-columns:1fr}.previews{max-width:320px}}
`;

const SCRIPT = `
document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;
try{await navigator.clipboard.writeText(b.dataset.copy);const t=b.textContent;b.textContent='Copied ✓';b.classList.add('copied');setTimeout(()=>{b.textContent=t;b.classList.remove('copied')},1600)}catch{prompt('Copy this:',b.dataset.copy)}});
const how=document.getElementById('how');if(how){try{const k='tmw-how-closed';if(localStorage.getItem(k)==='1'&&!how.dataset.force)how.open=false;how.addEventListener('toggle',()=>{try{localStorage.setItem(k,how.open?'0':'1')}catch{}})}catch{}}
`;

export function renderOrdersPage(input: PageInput): string {
  const newest = (r: OrderRecord) => Date.parse(r.order.createdAt || r.receivedAt) || 0;
  const p = { ...input, records: [...input.records].sort((a, b) => newest(b) - newest(a)) };
  const counts = { todo: 0, done: 0, attention: 0, all: p.records.length };
  for (const r of p.records) counts[tabOf(r.state)]++;
  const shown = p.tab === "all" ? p.records : p.records.filter((r) => tabOf(r.state) === p.tab);
  const busy = p.records.some((r) => r.state === "queued" || r.state === "making files");
  const tabs: [Tab, string][] = [
    ["todo", p.mode === "manual" ? "To order" : "In progress"],
    ["done", p.mode === "manual" ? "Ordered" : "Sent"],
    ["attention", "Needs attention"],
    ["all", "All"],
  ];
  const mode =
    p.mode === "manual"
      ? "Manual ordering: files are made here, orders are placed on ArtBeat by hand"
      : `Automatic: orders go to ArtBeat (${esc(p.artbeatEnv)})`;
  const emptyText: Record<Tab, string> = {
    todo: "Nothing to order right now. New paid orders appear here within a minute or two.",
    done: "No orders marked as ordered yet.",
    attention: "Nothing needs attention.",
    all: "No orders yet. Paid TripMyWay orders appear here within a minute or two.",
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
${busy ? '<meta http-equiv="refresh" content="20">' : ""}
<title>TripMyWay orders</title><style>${STYLE}</style></head><body><div class="wrap">
<div class="top"><h1>TripMyWay orders</h1><span class="mode">${mode}</span></div>
${p.flash ? `<p class="flash">${esc(p.flash)}</p>` : ""}
${p.mode === "manual" ? instructions(p, counts.todo > 0) : ""}
<nav class="tabs">${tabs
    .map(
      ([t, label]) =>
        `<a href="/orders?show=${t}" class="${t === p.tab ? "on" : ""}">${label}${counts[t] && t !== "all" ? `<span class="count">${counts[t]}</span>` : ""}</a>`,
    )
    .join("")}</nav>
${shown.length ? shown.map((r) => orderCard(r, p)).join("") : `<div class="empty">${emptyText[p.tab]}</div>`}
</div><script>${SCRIPT}</script></body></html>`;
}

export function renderLoginPage(error?: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>TripMyWay orders</title><style>${STYLE}.login{max-width:380px;margin:12vh auto;background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px}.login form{display:grid;gap:12px;margin-top:12px}</style></head>
<body><div class="login"><h1>TripMyWay orders</h1><p class="muted">Enter the access code to see orders and print files.</p>
${error ? `<p class="note bad">${esc(error)}</p>` : ""}
<form method="post" action="/orders/login"><input name="code" type="password" autocomplete="current-password" required autofocus>
<button class="btn primary">Open orders</button></form>
<p class="muted"><small>This browser stays signed in for 30 days.</small></p></div></body></html>`;
}
