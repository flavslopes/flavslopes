// Gera um card SVG para cada repositório, nas cores do banner.
//
// Uso: GITHUB_TOKEN=... node scripts/generate-cards.mjs <usuario> <pasta> <repo> [repo...]

import { mkdirSync, writeFileSync } from "node:fs";

const [owner, outDir, ...repos] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;

async function fetchRepo(name) {
  const query = `query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      name
      description
      stargazerCount
      pushedAt
      primaryLanguage { name }
      languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
        totalSize
        edges { size node { name } }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { owner, name } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data.repository;
}

// ---------- visual ----------

const C = {
  bg: "#0b0a1a",
  header: "#13112b",
  border: "#4f46e5",
  title: "#ffffff",
  text: "#c4b5fd",
  muted: "#7c6fb0",
  accent: "#7c5cff",
  slices: ["#7c5cff", "#c4b5fd", "#f472b6", "#3b2a7a"],
};

const W = 400;
const H = 200;
const FONT = "ui-monospace, SFMono-Regular, Consolas, monospace";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function wrap(text, maxChars, maxLines) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = clip(lines[maxLines - 1] + " …", maxChars);
  }
  return lines;
}

function timeAgo(date) {
  const days = Math.floor((Date.now() - new Date(date)) / 86400000);
  if (days < 1) return "atualizado hoje";
  if (days < 30) return `atualizado há ${days} dia${days > 1 ? "s" : ""}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `atualizado há ${months} ${months > 1 ? "meses" : "mês"}`;
  const years = Math.floor(months / 12);
  return `atualizado há ${years} ano${years > 1 ? "s" : ""}`;
}

function donut(languages, cx, cy) {
  const R = 26;
  const circ = 2 * Math.PI * R;
  const total = languages.totalSize || 1;
  const top = languages.edges.slice(0, 3);
  const rest = total - top.reduce((sum, e) => sum + e.size, 0);
  const parts = [...top.map((e) => e.size), rest].filter((s) => s > 0);

  let offset = 0;
  const arcs = parts.map((size, i) => {
    const len = (size / total) * circ;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C.slices[i]}" stroke-width="8" stroke-dasharray="${len.toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
    return arc;
  });

  const pct = top.length ? Math.round((top[0].size / total) * 100) : 0;
  return `${arcs.join("")}
  <text x="${cx}" y="${cy + 4}" fill="${C.title}" font-family="${FONT}" font-size="12" font-weight="bold" text-anchor="middle">${pct}%</text>`;
}

function render(repo) {
  const desc = wrap(repo.description ?? "", 34, 3);
  const lang = repo.primaryLanguage?.name ?? "—";
  const pillW = lang.length * 7.5 + 22;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#a78bfa"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="${C.bg}" stroke="url(#glow)" stroke-width="1.5"/>
  <path d="M1 13 a12 12 0 0 1 12 -12 h${W - 26} a12 12 0 0 1 12 12 v19 h-${W - 2} Z" fill="${C.header}"/>
  <line x1="1" y1="32" x2="${W - 1}" y2="32" stroke="#2a2350"/>
  <rect x="16" y="14" width="5" height="5" rx="1" fill="${C.accent}"/>
  <text x="28" y="21" fill="${C.muted}" font-family="${FONT}" font-size="11">${esc(clip(`${owner}/${repo.name}`, 44))}</text>
  <circle cx="${W - 18}" cy="17" r="4" fill="#2a2350"/>

  <text x="16" y="62" fill="${C.title}" font-family="${FONT}" font-size="17" font-weight="bold">${esc(clip(repo.name, 26))}<tspan fill="${C.accent}"> _</tspan></text>
  ${desc.map((l, i) => `<text x="16" y="${88 + i * 17}" fill="${C.text}" font-family="${FONT}" font-size="12">${esc(l)}</text>`).join("\n  ")}

  <rect x="16" y="146" width="${pillW}" height="20" rx="10" fill="#1c1836" stroke="${C.accent}"/>
  <text x="${16 + pillW / 2}" y="160" fill="${C.text}" font-family="${FONT}" font-size="11" text-anchor="middle">${esc(lang)}</text>

  <text x="16" y="186" fill="${C.accent}" font-family="${FONT}" font-size="12">★<tspan fill="${C.muted}"> ${repo.stargazerCount}  ·  ${timeAgo(repo.pushedAt)}</tspan></text>

  ${donut(repo.languages, W - 52, 108)}
</svg>
`;
}

mkdirSync(outDir, { recursive: true });
for (const name of repos) {
  const repo = await fetchRepo(name);
  writeFileSync(`${outDir}/card-${name}.svg`, render(repo));
  console.log(`Card gerado: ${outDir}/card-${name}.svg`);
}
