// Renders the last 31 days of contributions as a retro "activity.log" window.
// Usage: GITHUB_TOKEN=... node activity-graph.mjs <user> <out.svg>
// No dependencies. On any API failure it renders a "no signal" state instead of failing.
import { writeFileSync } from 'node:fs';

const [user = 'DevxD98', out = 'dist/activity-graph.svg'] = process.argv.slice(2);
const DAYS = 31;

const C = {
  bg: '#080909', bar: '#0d0e0e', rule: '#1f1d1b', dim: '#3a3733', grey: '#625c54',
  mute: '#8a8277', beige: '#e8d5b5', white: '#f0e6d6', gold: '#c79a5b',
  orange: '#b86f4b', red: '#8f5146', redDim: '#5e3630',
};
const FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, &quot;Liberation Mono&quot;, monospace';

async function fetchDays() {
  const to = new Date();
  const from = new Date(to.getTime() - (DAYS - 1) * 864e5);
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'activity-graph' },
    body: JSON.stringify({ query, variables: { login: user, from: from.toISOString(), to: to.toISOString() } }),
  });
  const json = await res.json();
  const weeks = json?.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!weeks) throw new Error(JSON.stringify(json).slice(0, 300));
  return weeks.flatMap(w => w.contributionDays).slice(-DAYS);
}

function render(days, error) {
  const W = 1200, H = 384, PADX = 72, TOP = 104, BASE = 300;
  const cell = 9, gap = 3, rows = Math.floor((BASE - TOP) / (cell + gap));
  const colW = (W - PADX * 2) / DAYS;
  const max = Math.max(1, ...days.map(d => d.contributionCount));
  const total = days.reduce((s, d) => s + d.contributionCount, 0);
  const shade = r => (r < 0.25 ? C.redDim : r < 0.5 ? C.red : r < 0.75 ? C.orange : r < 0.92 ? C.gold : C.beige);
  const o = [];
  o.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Commit activity over the last ${DAYS} days: ${total} contributions">`);
  o.push(`<rect width="${W}" height="${H}" rx="12" fill="${C.bg}"/>`);
  o.push(`<path d="M12 0H${W - 12}A12 12 0 0 1 ${W} 12V44H0V12A12 12 0 0 1 12 0Z" fill="${C.bar}"/><path d="M0 44.5H${W}" stroke="${C.rule}"/>`);
  o.push(`<circle cx="26" cy="22" r="5" fill="${C.dim}"/><circle cx="44" cy="22" r="5" fill="${C.dim}"/><circle cx="62" cy="22" r="5" fill="${C.red}"/>`);
  o.push(`<g font-family="${FONT}" letter-spacing="1">`);
  o.push(`<text x="${W / 2}" y="26.5" font-size="13" text-anchor="middle" fill="${C.grey}">activity.log</text>`);
  o.push(`<text x="${W - 24}" y="26.5" font-size="13" text-anchor="end" fill="${C.dim}">tail -f · ${DAYS}d</text>`);
  o.push(`<text x="${PADX}" y="80" font-size="15" fill="${C.gold}">commit transmission</text>`);
  const summary = error ? 'no signal — retrying next sync' : `${total} contributions · peak ${max}/day`;
  o.push(`<text x="${W - PADX}" y="80" font-size="13" text-anchor="end" fill="${C.mute}">${summary}</text>`);
  o.push(`</g>`);

  // glyph columns: every slot is a faint dot; active slots are lit cells, brightest at the top
  o.push(`<g>`);
  days.forEach((d, i) => {
    const x = PADX + i * colW + (colW - cell) / 2;
    const lit = d.contributionCount ? Math.max(1, Math.round((Math.sqrt(d.contributionCount) / Math.sqrt(max)) * rows)) : 0;
    for (let r = 0; r < rows; r++) {
      const y = BASE - (r + 1) * (cell + gap) + gap;
      if (r < lit) {
        const top = r === lit - 1;
        o.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${cell}" height="${cell}" rx="1.5" fill="${top ? C.white : shade(r / rows)}"${top ? '' : ' fill-opacity="0.9"'}/>`);
      } else {
        o.push(`<rect x="${(x + cell / 2 - 1).toFixed(1)}" y="${y + cell / 2 - 1}" width="2" height="2" fill="${C.dim}" fill-opacity="0.55"/>`);
      }
    }
  });
  o.push(`</g>`);

  // baseline + date ticks
  o.push(`<path d="M${PADX - 8} ${BASE + 8.5}H${W - PADX + 8}" stroke="${C.dim}"/>`);
  o.push(`<g font-family="${FONT}" font-size="11" fill="${C.grey}" letter-spacing="1">`);
  days.forEach((d, i) => {
    if (i % 5 && i !== days.length - 1) return;
    const x = PADX + i * colW + colW / 2;
    const [, m, dd] = d.date.split('-');
    o.push(`<text x="${x.toFixed(1)}" y="${BASE + 30}" text-anchor="middle">${m}/${dd}</text>`);
  });
  o.push(`<text x="${PADX - 8}" y="${H - 18}" fill="${C.dim}">$ git log --since=${DAYS}.days | wc -l</text>`);
  o.push(`<text x="${W - PADX + 8}" y="${H - 18}" text-anchor="end" fill="${C.dim}">${error ? 'last sync failed' : 'synced ' + new Date().toISOString().slice(0, 10)}</text>`);
  o.push(`</g></svg>`);
  return o.join('\n');
}

let days, error = null;
try {
  days = await fetchDays();
} catch (e) {
  error = e;
  console.error('activity graph: falling back to empty state:', e.message);
  const today = Date.now();
  days = Array.from({ length: DAYS }, (_, i) => ({ date: new Date(today - (DAYS - 1 - i) * 864e5).toISOString().slice(0, 10), contributionCount: 0 }));
}
writeFileSync(out, render(days, error));
console.log(`wrote ${out}${error ? ' (empty state)' : ''}`);
