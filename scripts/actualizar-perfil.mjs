// Refresca el README del perfil con datos vivos de la API de GitHub.
//
// La prosa de cada proyecto es escrita a mano y vive en proyectos.json; este
// script solo le pega los metadatos que cambian (lenguaje, estrellas, último
// push, commits de los últimos 90 días) y regenera el SVG de actividad.
//
// Escribe únicamente dentro de los bloques marcados del README. Todo lo que
// esté fuera de un par <!-- x:inicio --> / <!-- x:fin --> se queda intacto.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { construirGrafico } from "./grafico.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIAS = 90;
const TOKEN = process.env.GITHUB_TOKEN;

const config = JSON.parse(await readFile(join(RAIZ, "proyectos.json"), "utf8"));
const USUARIO = process.env.USUARIO || config.usuario;
const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();

const avisos = [];

async function api(ruta, { intentos = 3 } = {}) {
  const url = ruta.startsWith("http") ? ruta : `https://api.github.com${ruta}`;
  const cabeceras = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${USUARIO}-perfil`,
  };
  if (TOKEN) cabeceras.Authorization = `Bearer ${TOKEN}`;

  for (let intento = 1; intento <= intentos; intento++) {
    const respuesta = await fetch(url, { headers: cabeceras });
    if (respuesta.ok) return respuesta.json();
    if (respuesta.status === 404) return null;
    // 5xx y 403 por límite de tasa: vale la pena reintentar con espera.
    if (intento < intentos && (respuesta.status >= 500 || respuesta.status === 403)) {
      await new Promise((r) => setTimeout(r, intento * 2000));
      continue;
    }
    throw new Error(`${respuesta.status} ${respuesta.statusText} en ${url}`);
  }
}

async function contarCommits(repo) {
  let total = 0;
  for (let pagina = 1; pagina <= 5; pagina++) {
    const ruta =
      `/repos/${repo}/commits?author=${encodeURIComponent(USUARIO)}` +
      `&since=${desde}&per_page=100&page=${pagina}`;
    const lote = await api(ruta);
    if (!Array.isArray(lote) || lote.length === 0) break;
    total += lote.length;
    if (lote.length < 100) break;
  }
  return total;
}

function hace(iso) {
  if (!iso) return null;
  const dias = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (dias < 1) return "hoy";
  if (dias < 30) return rtf.format(-dias, "day");
  const meses = Math.round(dias / 30);
  if (meses < 12) return rtf.format(-meses, "month");
  return rtf.format(-Math.max(1, Math.round(dias / 365)), "year");
}

function celda(texto) {
  return String(texto).replace(/\|/g, "&#124;");
}

function reemplazarBloque(texto, marca, contenido) {
  const inicio = `<!-- ${marca}:inicio -->`;
  const fin = `<!-- ${marca}:fin -->`;
  const i = texto.indexOf(inicio);
  const f = texto.indexOf(fin);
  if (i === -1 || f === -1 || f < i) {
    throw new Error(`Faltan las marcas ${inicio} / ${fin} en el README.`);
  }
  return (
    texto.slice(0, i + inicio.length) + "\n" + contenido.trim() + "\n" + texto.slice(f)
  );
}

// ── Metadatos vivos por proyecto ─────────────────────────────────────────────

// Object.assign muta el objeto original y devuelve esa misma referencia, así que
// lo que se enriquece aquí abajo es lo que luego lee el bloque de proyectos.
// Con una copia ({ ...p }) los metadatos se perderían al renderizar.
const proyectos = config.grupos.flatMap((g) =>
  g.proyectos.map((p) => Object.assign(p, { grupo: g.id }))
);

for (const p of proyectos) {
  if (!p.repo) continue;
  try {
    const meta = await api(`/repos/${p.repo}`);
    if (!meta) {
      avisos.push(`${p.repo}: no visible con este token (¿privado o movido?).`);
      continue;
    }
    p.url = meta.html_url;
    p.lenguaje = meta.language;
    p.estrellas = meta.stargazers_count;
    p.ultimoPush = meta.pushed_at;
    p.commits = await contarCommits(p.repo);
  } catch (error) {
    avisos.push(`${p.repo}: ${error.message}`);
  }
}

// ── Bloque de proyectos: una tabla por grupo ─────────────────────────────────

function celdaProyecto(p) {
  const titulo = p.url ? `**[${p.nombre}](${p.url})**` : `**${p.nombre}**`;
  const extra = (p.enlaces || [])
    .map((e) => `[${e.texto}](https://github.com/${e.repo})`)
    .join(" · ");
  const bajo = extra || (!p.repo && p.estado ? p.estado : "");
  return bajo ? `${titulo}<br><sub>${celda(bajo)}</sub>` : titulo;
}

function celdaActividad(p) {
  if (typeof p.commits !== "number") return "—";
  const notas = [];
  const cuando = hace(p.ultimoPush);
  if (cuando) notas.push(cuando);
  if (p.estrellas > 0) notas.push(`★ ${p.estrellas}`);
  return notas.length
    ? `${p.commits}<br><sub>${notas.join(" · ")}</sub>`
    : String(p.commits);
}

const bloqueProyectos = config.grupos
  .map((grupo) => {
    const filas = grupo.proyectos.map(
      (p) =>
        `| ${[
          celdaProyecto(p),
          celda(p.breve),
          p.stack.map((s) => `\`${s}\``).join(" "),
          celdaActividad(p),
        ].join(" | ")} |`
    );
    return [
      `### ${grupo.titulo}`,
      "",
      "| Proyecto | Descripción | Stack | 90 días |",
      "|:--|:--|:--:|:--:|",
      ...filas,
    ].join("\n");
  })
  .join("\n\n");

// ── Bloque de actividad reciente ─────────────────────────────────────────────

let bloqueActividad = "_Sin actividad pública reciente._";
try {
  const eventos = (await api(`/users/${USUARIO}/events/public?per_page=100`)) || [];
  const vistos = new Set();
  const filas = [];

  for (const evento of eventos) {
    if (evento.type !== "PushEvent") continue;
    const cuando = hace(evento.created_at);
    // payload.commits viene del más viejo al más nuevo; al revés para que la
    // lista entera quede en orden descendente.
    for (const commit of [...(evento.payload?.commits || [])].reverse()) {
      if (vistos.has(commit.sha) || filas.length >= 6) continue;
      vistos.add(commit.sha);
      const corto = commit.sha.slice(0, 7);
      const mensaje = commit.message.split("\n")[0];
      const enlace = `https://github.com/${evento.repo.name}/commit/${commit.sha}`;
      const repo = evento.repo.name.split("/")[1];
      filas.push(
        `| ${cuando} | **${celda(repo)}** | ${celda(mensaje)} ` +
          `([\`${corto}\`](${enlace})) |`
      );
    }
    if (filas.length >= 6) break;
  }

  if (filas.length) {
    bloqueActividad = [
      "| Cuándo | Repo | Commit |",
      "|:--:|:--:|:--|",
      ...filas,
    ].join("\n");
  }
} catch (error) {
  avisos.push(`eventos públicos: ${error.message}`);
}

// ── Gráfico ──────────────────────────────────────────────────────────────────

const datos = proyectos
  .filter((p) => typeof p.commits === "number" && p.commits > 0)
  .map((p) => ({ etiqueta: p.nombre, valor: p.commits }))
  .sort((a, b) => b.valor - a.valor || a.etiqueta.localeCompare(b.etiqueta));

const fecha = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());

await mkdir(join(RAIZ, "assets"), { recursive: true });
await writeFile(
  join(RAIZ, "assets", "actividad.svg"),
  construirGrafico(datos, {
    titulo: "Commits por proyecto",
    subtitulo: `Últimos ${DIAS} días · solo repos públicos visibles para la API`,
    pie: `Generado automáticamente el ${fecha}`,
  })
);

// ── Resumen y escritura ──────────────────────────────────────────────────────

const totalCommits = datos.reduce((suma, d) => suma + d.valor, 0);
const conRepo = proyectos.filter((p) => p.repo).length;
// En la sintaxis de shields.io el guion separa etiqueta de mensaje, así que un
// guion literal iría doblado; ninguno de estos textos lleva, pero sí acentos:
// encodeURIComponent los deja en UTF-8 escapado y el badge sale bien.
function badge(etiqueta, mensaje, color) {
  const partes = [etiqueta, mensaje, color].map((t) => encodeURIComponent(t));
  return (
    `<img src="https://img.shields.io/badge/${partes.join("-")}` +
    `?style=for-the-badge&labelColor=0b0b0b" />`
  );
}

const bloqueResumen = [
  badge(`${totalCommits} commits`, `últimos ${DIAS} días`, "e10600"),
  "&nbsp;",
  badge(`${proyectos.length} proyectos`, `${conRepo} en GitHub`, "ff2a1f"),
].join("\n");

let readme = await readFile(join(RAIZ, "README.md"), "utf8");
readme = reemplazarBloque(readme, "resumen", bloqueResumen);
readme = reemplazarBloque(readme, "proyectos", bloqueProyectos);
readme = reemplazarBloque(readme, "actividad", bloqueActividad);
await writeFile(join(RAIZ, "README.md"), readme);

console.log(
  `Listo: ${proyectos.length} proyectos, ${totalCommits} commits en ${DIAS} días.`
);
if (avisos.length) {
  console.log("\nAvisos:");
  for (const aviso of avisos) console.log(`  · ${aviso}`);
}
