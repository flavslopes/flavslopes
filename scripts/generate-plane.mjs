// Gera um SVG animado: um avião roxo que voa sob o gráfico de contribuições
// do GitHub e "atira" em cada quadradinho com contribuição.
//
// Uso: GITHUB_TOKEN=... node scripts/generate-plane.mjs <usuario> <saida.svg>

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [login = "flavslopes", output = "dist/plane.svg"] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;

// ---------- dados ----------

async function fetchCalendar() {
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { contributionCount contributionLevel weekday } }
        }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data.user.contributionsCollection.contributionCalendar;
}

const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

// ---------- visual ----------

const C = {
  bg: "#0b0a1a",
  border: "#2a2350",
  text: "#c4b5fd",
  muted: "#7c6fb0",
  levels: ["#1c1836", "#3b2a7a", "#5b3fc4", "#7c5cff", "#b39dff"],
  bullet: "#e9d5ff",
  flame: "#f472b6",
};

const CELL = 11;
const GAP = 4;
const PITCH = CELL + GAP;
const PAD = 24;
const GRID_TOP = 44;

const STEP = 0.22; // segundos por coluna
const BULLET_SPEED = 420; // px/s
const FIRE_STAGGER = 0.03;
const HOLD = 1.1; // quanto tempo o quadradinho fica marcado antes de sumir
const FADE = 0.7;

const r = (n) => Math.round(n * 100) / 100;

// Gera <animate> a partir de pares [segundo, valor]; o ciclo dura `T` segundos.
function animate(attr, frames, T, extra = "") {
  const f = [...frames];
  if (f[0][0] > 0) f.unshift([0, f[0][1]]);
  if (f.at(-1)[0] < T) f.push([T, f.at(-1)[1]]);
  const keyTimes = f.map(([t]) => (Math.min(t, T) / T).toFixed(4)).join(";");
  const values = f.map(([, v]) => v).join(";");
  return `<animate attributeName="${attr}" dur="${r(T)}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values}" ${extra}/>`;
}

function render({ totalContributions, weeks }) {
  const cols = weeks.length;
  const width = PAD * 2 + cols * PITCH - GAP;
  const gridBottom = GRID_TOP + 7 * PITCH - GAP;
  const planeY = gridBottom + 42;
  const height = planeY + 34;

  const colX = (c) => PAD + c * PITCH + CELL / 2;
  const rowY = (d) => GRID_TOP + d * PITCH + CELL / 2;

  // linha do tempo do avião
  const speed = PITCH / STEP;
  const startX = -30;
  const endX = width + 30;
  const lead = (colX(0) - startX) / speed;
  const colTime = (c) => lead + c * STEP;
  const sweepEnd = colTime(cols - 1) + (endX - colX(cols - 1)) / speed;
  const restoreStart = sweepEnd + HOLD + FADE + 0.4;
  const restoreEnd = restoreStart + 1;
  const T = restoreEnd + 1.2;

  const cells = [];
  const shots = [];

  weeks.forEach((week, c) => {
    const active = week.contributionDays
      .filter((d) => LEVELS[d.contributionLevel] > 0)
      .sort((a, b) => b.weekday - a.weekday); // atira de baixo pra cima

    week.contributionDays.forEach((day) => {
      const level = LEVELS[day.contributionLevel];
      const x = PAD + c * PITCH;
      const y = GRID_TOP + day.weekday * PITCH;
      const base = C.levels[level];

      if (level === 0) {
        cells.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${base}"/>`);
        return;
      }

      const i = active.indexOf(day);
      const fire = colTime(c) + i * FIRE_STAGGER;
      const fromY = planeY - 16;
      const toY = rowY(day.weekday);
      const hit = fire + (fromY - toY) / BULLET_SPEED;

      cells.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${base}">` +
          animate(
            "fill",
            [
              [hit, base],
              [hit + 0.06, C.levels[4]],
              [hit + HOLD, C.levels[4]],
              [hit + HOLD + FADE, C.levels[0]],
              [restoreStart, C.levels[0]],
              [restoreEnd, base],
            ],
            T,
          ) +
          `</rect>`,
      );

      const cx = colX(c);
      shots.push(
        `<circle cx="${cx}" r="2.2" fill="${C.bullet}" opacity="0">` +
          animate("cy", [[fire, r(fromY)], [hit, r(toY)], [hit, r(fromY)]], T) +
          animate("opacity", [[fire, 0], [fire, 1], [hit, 1], [hit, 0]], T) +
          `</circle>`,
        // pulso rápido no impacto
        `<circle cx="${cx}" cy="${toY}" r="0" fill="none" stroke="${C.levels[4]}" stroke-width="1" opacity="0">` +
          animate("r", [[hit, 5], [hit + 0.35, 9], [hit + 0.35, 0]], T) +
          animate("opacity", [[hit, 0], [hit, 0.8], [hit + 0.35, 0]], T) +
          `</circle>`,
      );
    });
  });

  // estrelinhas de fundo (posições determinísticas)
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = Array.from({ length: 40 }, () => {
    const x = r(rand() * width);
    const y = r(rand() * height);
    const d = r(1.5 + rand() * 3);
    return `<circle cx="${x}" cy="${y}" r="${r(0.4 + rand() * 0.8)}" fill="#ffffff">` +
      `<animate attributeName="opacity" values="0.15;0.8;0.15" dur="${d}s" begin="${r(rand() * d)}s" repeatCount="indefinite"/></circle>`;
  }).join("");

  const planeMove = (() => {
    const keyTimes = `0;${(sweepEnd / T).toFixed(4)};1`;
    const values = `${startX} ${planeY};${endX} ${planeY};${endX} ${planeY}`;
    return `<animateTransform attributeName="transform" type="translate" dur="${r(T)}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values}"/>`;
  })();

  const plane = `
  <g>
    ${planeMove}
    <g>
      <animateTransform attributeName="transform" type="rotate" values="-4;4;-4" dur="1.6s" repeatCount="indefinite"/>
      <path d="M0 11 L-2.5 14 Q0 22 2.5 14 Z" fill="${C.flame}">
        <animate attributeName="opacity" values="1;0.5;1" dur="0.15s" repeatCount="indefinite"/>
      </path>
      <path d="M-3 -2 L-15 5 L-15 8 L-3 5 Z M3 -2 L15 5 L15 8 L3 5 Z" fill="#6d28d9"/>
      <path d="M-2 8 L-7 12 L-7 14 L-1 12 Z M2 8 L7 12 L7 14 L1 12 Z" fill="#6d28d9"/>
      <path d="M0 -15 C3 -11 3 -5 3 0 L3 9 L0 12 L-3 9 L-3 0 C-3 -5 -3 -11 0 -15 Z" fill="url(#body)"/>
      <ellipse cx="0" cy="-7" rx="1.5" ry="3" fill="#ede9fe"/>
    </g>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c4b5fd"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${C.bg}" stroke="${C.border}"/>
  ${stars}
  <text x="${PAD}" y="28" fill="${C.text}" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="13">${totalContributions} contribuições no último ano</text>
  <text x="${width - PAD}" y="28" fill="${C.muted}" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="12">@${login}</text>
  ${cells.join("\n  ")}
  ${shots.join("\n  ")}
  ${plane}
</svg>
`;
}

const calendar = await fetchCalendar();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, render(calendar));
console.log(`SVG gerado em ${output} (${calendar.totalContributions} contribuições)`);
