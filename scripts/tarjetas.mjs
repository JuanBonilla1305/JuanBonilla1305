#!/usr/bin/env node
/**
 * Arma las tarjetas SVG de "GitHub Analytics / Estadísticas" del README.
 *
 * Adaptado de scripts/generate-cards.mjs del repo de referencia
 * (github.com/Sekkon0906/Sekkon0906) — misma consulta GraphQL, mismos
 * algoritmos (niveles del calendario por cuantiles propios, cálculo de
 * rachas, llama animada) y misma paleta negro/rojo, apuntando a
 * JuanBonilla1305 en vez de a Sekkon0906.
 *
 * Todo lo que muestra el README sale de aquí y se commitea en assets/, así
 * el README no depende de instancias públicas compartidas de
 * github-readme-stats y similares, que limitan por tasa y a veces caen.
 *
 * Uso:
 *   GITHUB_TOKEN=... node scripts/tarjetas.mjs
 *   node scripts/tarjetas.mjs --mock    # datos sintéticos, para ajustar el layout
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const LOGIN = process.env.USUARIO || process.env.PROFILE_LOGIN || "JuanBonilla1305";
const OUT = "assets";
const MOCK = process.argv.includes("--mock");

/* ── Paleta ─────────────────────────────────────────────────────────────
   Negro, blanco y rojo, tomados de la marca Hytrex. El rojo es un acento:
   marca el valor más importante de una tarjeta, nunca bloques enteros. */
const C = {
  bg: "#0b0b0b",
  border: "#232323",
  text: "#ffffff",
  muted: "#8a8a8a",
  dim: "#4a4a4a",
  red: "#e10600",
  // Escala de contribuciones: oscuro -> gris -> blanco -> rojo, para que cada
  // nivel se distinga con claridad sobre el panel negro.
  ramp: ["#161616", "#4d4d4d", "#b3b3b3", "#ffffff", "#e10600"],
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

const round = (v) => Number(v.toFixed(2));

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));

const panel = (w, h) =>
  `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${C.bg}" stroke="${C.border}"/>`;

const doc = (w, h, titulo, cuerpo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(titulo)}">
<title>${esc(titulo)}</title>
<style>
  .f { font-family: ${FONT}; }
  .m { font-family: ${MONO}; }
  .label { font-size: 13px; letter-spacing: 0.8px; }
  .value { font-size: 34px; font-weight: 700; }
  .head  { font-size: 14px; letter-spacing: 1.6px; fill: ${C.muted}; }
</style>
${panel(w, h)}
${cuerpo}
</svg>
`;

/* ── Datos ──────────────────────────────────────────────────────────── */

const CONSULTA = `
query($login: String!) {
  user(login: $login) {
    login
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount weekday } }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      nodes {
        name
        stargazerCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
        }
      }
    }
  }
}`;

async function obtenerDatos() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN es requerido (o usa --mock)");

  const respuesta = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "juanbonilla1305-perfil",
    },
    body: JSON.stringify({ query: CONSULTA, variables: { login: LOGIN } }),
  });

  if (!respuesta.ok) throw new Error(`La API de GitHub devolvió ${respuesta.status}: ${await respuesta.text()}`);
  const json = await respuesta.json();
  if (json.errors) throw new Error("Errores de GraphQL: " + JSON.stringify(json.errors));
  if (!json.data?.user) throw new Error(`No existe el usuario: ${LOGIN}`);
  return json.data.user;
}

/** Datos sintéticos deterministas, para ajustar el layout sin token. */
function datosSimulados() {
  const semanas = [];
  const inicio = new Date(Date.UTC(2025, 7, 31));
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let s = 0; s < 53; s++) {
    const dias = [];
    for (let d = 0; d < 7; d++) {
      const fecha = new Date(inicio.getTime() + (s * 7 + d) * 86400000);
      const r = azar();
      dias.push({
        date: fecha.toISOString().slice(0, 10),
        weekday: d,
        contributionCount: r > 0.82 ? Math.ceil(azar() * 14) : r > 0.55 ? Math.ceil(azar() * 4) : 0,
      });
    }
    semanas.push({ contributionDays: dias });
  }
  const repo = (nombre, estrellas, lenguaje, tamano) => ({
    name: nombre,
    stargazerCount: estrellas,
    languages: { edges: [{ size: tamano, node: { name: lenguaje } }] },
  });
  return {
    login: LOGIN,
    followers: { totalCount: 1 },
    contributionsCollection: {
      totalCommitContributions: 412,
      totalPullRequestContributions: 23,
      totalIssueContributions: 9,
      totalPullRequestReviewContributions: 4,
      contributionCalendar: {
        totalContributions: semanas.flatMap((s) => s.contributionDays).reduce((a, d) => a + d.contributionCount, 0),
        weeks: semanas,
      },
    },
    repositories: {
      totalCount: 16,
      nodes: [
        repo("SurtImotos", 0, "TypeScript", 900000),
        repo("Lilianno_Joyeria", 0, "JavaScript", 500000),
        repo("web-operacion-pijao", 0, "C#", 400000),
        repo("Animales-Arquitectura", 0, "JavaScript", 150000),
        repo("raffle-system", 2, "JavaScript", 90000),
      ],
    },
  };
}

/* ── Tarjetas ───────────────────────────────────────────────────────── */

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Calendario de contribuciones.
 *
 * Los niveles se cortan en cuantiles de los días *no vacíos*, no en conteos
 * fijos. Con cortes fijos, un perfil cuyo día más activo tiene 5 commits
 * colapsa entero en el primer color y la grilla se ve plana — que es
 * exactamente como fallaba el widget de terceros anterior.
 */
function tarjetaContribuciones(user) {
  const semanas = user.contributionsCollection.contributionCalendar.weeks;
  const total = user.contributionsCollection.contributionCalendar.totalContributions;

  const noVacios = semanas
    .flatMap((s) => s.contributionDays)
    .map((d) => d.contributionCount)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const q = (p) => (noVacios.length ? noVacios[Math.min(noVacios.length - 1, Math.floor(noVacios.length * p))] : 1);
  const [q1, q2, q3] = [q(0.25), q(0.55), q(0.85)];
  const nivel = (n) => (n === 0 ? 0 : n <= q1 ? 1 : n <= q2 ? 2 : n <= q3 ? 3 : 4);

  const CELDA = 11, HUECO = 3, PASO = CELDA + HUECO;
  const X0 = 52, Y0 = 82;
  const W = X0 + semanas.length * PASO + 18;
  const H = Y0 + 7 * PASO + 52;

  // Etiquetas de mes, en la primera semana que abre un mes nuevo.
  let ultimoMes = -1;
  const meses = semanas
    .map((sem, i) => {
      const d = new Date(sem.contributionDays[0].date + "T00:00:00Z");
      const m = d.getUTCMonth();
      if (m === ultimoMes || d.getUTCDate() > 7) return "";
      ultimoMes = m;
      return `<text class="f" x="${X0 + i * PASO}" y="${Y0 - 12}" font-size="12" fill="${C.dim}">${MESES[m]}</text>`;
    })
    .join("");

  const etiquetasDia = [[1, "Lun"], [3, "Mié"], [5, "Vie"]]
    .map(([d, t]) => `<text class="f" x="${X0 - 10}" y="${Y0 + d * PASO + 10}" font-size="12" fill="${C.dim}" text-anchor="end">${t}</text>`)
    .join("");

  // Un fade-in por semana en vez de por celda: 53 animaciones en vez de 371.
  const grilla = semanas
    .map((sem, i) => {
      const celdas = sem.contributionDays
        .map((d) => {
          const y = Y0 + d.weekday * PASO;
          return `<rect x="${X0 + i * PASO}" y="${y}" width="${CELDA}" height="${CELDA}" rx="2.5" fill="${C.ramp[nivel(d.contributionCount)]}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
        })
        .join("");
      return `<g opacity="0">${celdas}<animate attributeName="opacity" from="0" to="1" begin="${(i * 0.018).toFixed(3)}s" dur="0.45s" fill="freeze"/></g>`;
    })
    .join("");

  const legendaX = W - 18 - 5 * PASO - 130;
  const leyenda = `
  <text class="f" x="${legendaX}" y="${H - 17}" font-size="12" fill="${C.dim}" text-anchor="end">Menos</text>
  ${C.ramp.map((c, i) => `<rect x="${legendaX + 8 + i * PASO}" y="${H - 27}" width="${CELDA}" height="${CELDA}" rx="2.5" fill="${c}"/>`).join("")}
  <text class="f" x="${legendaX + 16 + 5 * PASO}" y="${H - 17}" font-size="12" fill="${C.dim}">Más</text>`;

  const cuerpo = `
  <text class="f head" x="24" y="34">CONTRIBUCIONES · ÚLTIMO AÑO<tspan fill="${C.dim}">  /  CONTRIBUTIONS · LAST YEAR</tspan></text>
  <text class="m" x="${W - 24}" y="36" font-size="26" font-weight="700" fill="${C.red}" text-anchor="end">${fmt(total)}</text>
  <line x1="24" y1="50" x2="${W - 24}" y2="50" stroke="${C.border}"/>
  ${meses}${etiquetasDia}${grilla}${leyenda}`;

  return { nombre: "calendario.svg", svg: doc(W, H, `${total} contribuciones en el último año`, cuerpo) };
}

/**
 * Rachas de commits.
 *
 * Se calculan sobre el mismo calendario que usa la grilla, que solo cubre el
 * año corrido — por eso son rachas dentro de esa ventana, y la tarjeta lo
 * dice en vez de insinuar una cifra histórica.
 *
 * Un cero en el último día no corta la racha actual: ese día sigue en curso,
 * así que se salta antes de contar hacia atrás. Cualquier otro cero sí la
 * corta.
 */
function calcularRachas(user) {
  const dias = user.contributionsCollection.contributionCalendar.weeks
    .flatMap((s) => s.contributionDays)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  let maxima = 0, finMaxima = null, corrida = 0, inicioCorrida = null, inicioMaxima = null;
  for (const d of dias) {
    if (d.contributionCount > 0) {
      if (corrida === 0) inicioCorrida = d.date;
      corrida++;
      if (corrida > maxima) { maxima = corrida; inicioMaxima = inicioCorrida; finMaxima = d.date; }
    } else {
      corrida = 0;
    }
  }

  let i = dias.length - 1;
  if (i >= 0 && dias[i].contributionCount === 0) i--; // hoy puede no haber terminado
  let actual = 0, finActual = i >= 0 ? dias[i].date : null, inicioActual = null;
  for (; i >= 0 && dias[i].contributionCount > 0; i--) {
    actual++;
    inicioActual = dias[i].date;
  }
  if (actual === 0) finActual = null;

  const activos = dias.filter((d) => d.contributionCount > 0).length;
  const mejor = dias.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), dias[0]);

  return { actual, inicioActual, finActual, maxima, inicioMaxima, finMaxima, activos, mejor, total: dias.length };
}

const fechaCorta = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  return `${MESES[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const rango = (a, b) => (a && b ? (a === b ? fechaCorta(a) : `${fechaCorta(a)} – ${fechaCorta(b)}`) : "—");

/**
 * Una llama, dibujada de la base hacia arriba para poder escalarla sobre su
 * propio origen. SMIL escala sobre el origen local, así que el parpadeo va
 * envuelto en grupos anidados que caminan hasta la base de la llama, escalan,
 * y vuelven — escalar sobre el centro haría que la llama se resbalara de su
 * base.
 */
function llama(cx, baseY, w = 96, h = 118, encendida = true) {
  const sx = w / 100, sy = h / 120;
  const externo = "M50,120 C20,110 8,86 16,60 C22,42 38,32 42,14 C44,6 43,2 40,0 " + "C70,10 84,36 84,60 C84,90 70,111 50,120 Z";
  const interno = "M50,120 C36,113 29,97 35,81 C39,69 50,60 52,47 C55,58 63,67 66,79 " + "C70,97 62,113 50,120 Z";

  return `<g transform="translate(${round(cx - w / 2)} ${round(baseY - h)}) scale(${round(sx)} ${round(sy)})">
    <g transform="translate(50 120)">
      <g>
        <animateTransform attributeName="transform" type="scale"
          values="1 1; 1.04 0.96; 0.97 1.05; 1.02 0.99; 1 1"
          keyTimes="0;0.25;0.5;0.75;1" dur="2.6s" repeatCount="indefinite"/>
        <g transform="translate(-50 -120)">
          <path d="${externo}" fill="${encendida ? "url(#flame)" : "url(#flameOut)"}"/>
          <path d="${interno}" fill="${encendida ? "#6d0200" : "#1c1c1c"}" opacity="0.85"/>
        </g>
      </g>
    </g>
  </g>`;
}

function tarjetaRacha(user) {
  const st = calcularRachas(user);

  const W = 820, H = 238;
  const encendida = st.actual > 0;
  const HERO = 268;
  const tiles = [
    ["Racha más larga", `${st.maxima}`, rango(st.inicioMaxima, st.finMaxima)],
    ["Días activos", `${st.activos}`, `de ${st.total}`],
    ["Mejor día", `${st.mejor?.contributionCount ?? 0}`, fechaCorta(st.mejor?.date) || "—"],
  ];
  const colW = (W - 24 - HERO) / tiles.length;

  const defs = `<defs>
  <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0%"   stop-color="#8c0200"/>
    <stop offset="45%"  stop-color="${C.red}"/>
    <stop offset="100%" stop-color="#ff5a3c"/>
  </linearGradient>
  <linearGradient id="flameOut" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0%"   stop-color="#2a2a2a"/>
    <stop offset="100%" stop-color="#565656"/>
  </linearGradient>
  <radialGradient id="ember" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0%"   stop-color="${encendida ? C.red : "#666666"}" stop-opacity="${encendida ? 0.3 : 0.08}"/>
    <stop offset="100%" stop-color="${encendida ? C.red : "#666666"}" stop-opacity="0"/>
  </radialGradient>
</defs>`;

  const heroCx = 24 + HERO / 2;
  const hero = `
  <ellipse cx="${heroCx}" cy="128" rx="120" ry="84" fill="url(#ember)"/>
  ${llama(heroCx, 186, 96, 118, encendida)}
  <text class="f" x="${heroCx}" y="148" text-anchor="middle" font-size="46" font-weight="700" fill="#ffffff">${st.actual}</text>
  <text class="f label" x="${heroCx}" y="172" text-anchor="middle" fill="${encendida ? "#ffd9d4" : C.muted}">${st.actual === 1 ? "DÍA" : "DÍAS"}</text>
  <text class="f label" x="${heroCx}" y="204" text-anchor="middle" fill="${C.muted}">RACHA ACTUAL</text>
  <text class="f" x="${heroCx}" y="222" text-anchor="middle" font-size="11" fill="${C.dim}">${esc(rango(st.inicioActual, st.finActual))}</text>
  <line x1="${24 + HERO}" y1="62" x2="${24 + HERO}" y2="${H - 24}" stroke="${C.border}"/>`;

  const derecha = tiles
    .map(([etiqueta, valor, sub], i) => {
      const cx = 24 + HERO + colW * i + colW / 2;
      return `<g opacity="0">
      <text class="f value" x="${round(cx)}" y="126" text-anchor="middle" fill="${C.text}">${esc(valor)}</text>
      <text class="f label" x="${round(cx)}" y="154" text-anchor="middle" fill="${C.muted}">${esc(etiqueta.toUpperCase())}</text>
      <text class="f" x="${round(cx)}" y="196" text-anchor="middle" font-size="11" fill="${C.dim}">${esc(sub)}</text>
      <animate attributeName="opacity" from="0" to="1" begin="${(0.1 * i).toFixed(2)}s" dur="0.5s" fill="freeze"/>
    </g>${i < tiles.length - 1 ? `<line x1="${round(24 + HERO + colW * (i + 1))}" y1="86" x2="${round(24 + HERO + colW * (i + 1))}" y2="196" stroke="${C.border}"/>` : ""}`;
    })
    .join("");

  const cuerpo = `${defs}
  <text class="f head" x="24" y="32">RACHAS · ÚLTIMO AÑO<tspan fill="${C.dim}">  /  STREAKS · LAST YEAR</tspan></text>
  <line x1="24" y1="46" x2="${W - 24}" y2="46" stroke="${C.border}"/>
  ${hero}${derecha}`;

  return { nombre: "racha.svg", svg: doc(W, H, "Rachas de commits", cuerpo) };
}

/** Números generales. */
function tarjetaResumen(user) {
  const c = user.contributionsCollection;
  const estrellas = user.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0);
  const tiles = [
    ["Contribuciones", c.contributionCalendar.totalContributions, true],
    ["Commits", c.totalCommitContributions, false],
    ["Pull requests", c.totalPullRequestContributions, false],
    ["Repositorios", user.repositories.totalCount, false],
    ["Estrellas", estrellas, false],
    ["Seguidores", user.followers.totalCount, false],
  ];

  const W = 820, H = 170;
  const colW = (W - 48) / tiles.length;

  const cuerpo = `
  <text class="f head" x="24" y="32">RESUMEN<tspan fill="${C.dim}">  /  OVERVIEW</tspan></text>
  <line x1="24" y1="46" x2="${W - 24}" y2="46" stroke="${C.border}"/>
  ${tiles
    .map(([etiqueta, valor, acento], i) => {
      const cx = 24 + colW * i + colW / 2;
      return `<g opacity="0">
      <text class="f value" x="${cx}" y="98" text-anchor="middle" fill="${acento ? C.red : C.text}">${fmt(valor)}</text>
      <text class="f label" x="${cx}" y="124" text-anchor="middle" fill="${C.muted}">${esc(etiqueta.toUpperCase())}</text>
      <animate attributeName="opacity" from="0" to="1" begin="${(0.08 * i).toFixed(2)}s" dur="0.5s" fill="freeze"/>
    </g>${i < tiles.length - 1 ? `<line x1="${24 + colW * (i + 1)}" y1="66" x2="${24 + colW * (i + 1)}" y2="150" stroke="${C.border}"/>` : ""}`;
    })
    .join("")}`;

  return { nombre: "resumen.svg", svg: doc(W, H, "Resumen de GitHub", cuerpo) };
}

/** Distribución por lenguaje en los repos propios, sin forks. */
function tarjetaLenguajes(user) {
  const totales = new Map();
  for (const repo of user.repositories.nodes) {
    for (const e of repo.languages?.edges ?? []) {
      totales.set(e.node.name, (totales.get(e.node.name) || 0) + e.size);
    }
  }
  const todos = [...totales.entries()].sort((a, b) => b[1] - a[1]);
  const top = todos.slice(0, 6);
  const suma = todos.reduce((a, [, v]) => a + v, 0) || 1;

  // Rojo para el lenguaje dominante, luego una escala de grises descendente.
  const tonos = [C.red, "#ffffff", "#b3b3b3", "#8a8a8a", "#5f5f5f", "#3d3d3d"];

  const W = 820, H = 168;
  const barX = 24, barW = W - 48, barY = 66, barH = 16;

  let x = barX;
  const segmentos = top
    .map(([nombre, tamano], i) => {
      const w = Math.max(2, (tamano / suma) * barW);
      const seg = `<rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="${tonos[i]}"><title>${esc(nombre)} ${((tamano / suma) * 100).toFixed(1)}%</title></rect>`;
      x += w;
      return seg;
    })
    .join("");
  const resto = x < barX + barW ? `<rect x="${x}" y="${barY}" width="${barX + barW - x}" height="${barH}" fill="#1e1e1e"/>` : "";

  const leyenda = top
    .map(([nombre, tamano], i) => {
      const col = i % 3, fila = Math.floor(i / 3);
      const lx = barX + col * (barW / 3), ly = 112 + fila * 26;
      return `<g>
      <rect x="${lx}" y="${ly - 11}" width="11" height="11" rx="2" fill="${tonos[i]}"/>
      <text class="f" x="${lx + 18}" y="${ly}" font-size="14" fill="${C.text}">${esc(nombre)}</text>
      <text class="f" x="${lx + 18 + nombre.length * 8.5 + 8}" y="${ly}" font-size="13" fill="${C.dim}">${((tamano / suma) * 100).toFixed(1)}%</text>
    </g>`;
    })
    .join("");

  const cuerpo = `
  <text class="f head" x="24" y="32">DISTRIBUCIÓN POR LENGUAJE<tspan fill="${C.dim}">  /  LANGUAGE DISTRIBUTION</tspan></text>
  <line x1="24" y1="46" x2="${W - 24}" y2="46" stroke="${C.border}"/>
  <g opacity="0">${segmentos}${resto}<animate attributeName="opacity" from="0" to="1" dur="0.6s" fill="freeze"/></g>
  ${leyenda}`;

  return { nombre: "lenguajes.svg", svg: doc(W, H, "Distribución por lenguaje", cuerpo) };
}

/* ── Main ───────────────────────────────────────────────────────────── */

async function main() {
  const user = MOCK ? datosSimulados() : await obtenerDatos();

  const tarjetas = [tarjetaContribuciones(user), tarjetaResumen(user), tarjetaRacha(user), tarjetaLenguajes(user)];

  await mkdir(OUT, { recursive: true });
  for (const { nombre, svg } of tarjetas) {
    await writeFile(join(OUT, nombre), svg, "utf8");
    console.log(`Escrito ${OUT}/${nombre} (${svg.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
