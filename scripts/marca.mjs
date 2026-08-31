#!/usr/bin/env node
/**
 * Dibuja la identidad Hytrex (adaptada a mi perfil personal) en SVG puro y
 * escribe los dos banners estáticos del README: assets/banner.svg (el anillo +
 * el nombre) y assets/header.svg (la franja "cliente → API → servicio → datos").
 *
 * Adaptado de scripts/generate-cards.mjs y scripts/generate-brand.mjs del
 * repo de referencia (github.com/Sekkon0906/Sekkon0906) — mismo algoritmo del
 * anillo (arcos concéntricos con jitter, deshechos con guiones y puntas
 * redondeadas para que lean como trazo, no como geometría limpia) y misma
 * paleta de marca Hytrex, con mi nombre/tagline en vez de los suyos.
 *
 * A diferencia de scripts/tarjetas.mjs, este script NO lo corre el workflow:
 * se ejecuta a mano una sola vez (o cuando quiera regenerar el anillo con
 * otra semilla) y el resultado se commitea. `node scripts/marca.mjs`
 *
 * Un PRNG con semilla fija mantiene el resultado byte-idéntico entre
 * corridas, para que volver a correrlo sin cambiar la semilla no ensucie el
 * diff.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const OUT = "assets";

const ROJO = "#e10600";
const ROJOS = ["#e10600", "#c60500", "#ff1a0d", "#a80400"];
const BLANCOS = ["#ffffff", "#f0f0f0", "#dcdcdc"];
const GRISES = ["#8c8c8c", "#6a6a6a", "#4a4a4a", "#333333", "#242424"];

/** mulberry32 — PRNG chico, con semilla, suficiente para el jitter visual. */
function rng(semilla) {
  return function () {
    semilla |= 0;
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (v) => Number(v.toFixed(2));

const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

const polar = (cx, cy, r, grados) => {
  const a = (grados * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

// Arco de a0 a a1 (grados, 0 = las 3, creciendo en sentido horario porque el
// eje Y de SVG apunta hacia abajo). El tramo se limita por debajo de una
// vuelta completa: un arco de 360° tiene los mismos extremos y no dibuja nada.
function arco(cx, cy, r, a0, a1) {
  const tramo = Math.min(Math.abs(a1 - a0), 358);
  const fin = a0 + Math.sign(a1 - a0) * tramo;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, fin);
  return `M ${n(x0)} ${n(y0)} A ${n(r)} ${n(r)} 0 ${tramo > 180 ? 1 : 0} ${fin > a0 ? 1 : 0} ${n(x1)} ${n(y1)}`;
}

/**
 * El anillo. Mismo reparto angular que la identidad Hytrex: el acento blanco
 * barre la zona superior izquierda, la banda roja lleva el abajo y el lado
 * izquierdo, y los filamentos grises sueltos ocupan arriba y la derecha.
 */
function anillo({ cx = 100, cy = 100, R = 66, semilla = 20260831, animar = true } = {}) {
  const azar = rng(semilla);
  const elegir = (xs) => xs[Math.floor(azar() * xs.length)];
  const entre = (a, b) => a + azar() * (b - a);

  const trazos = [];
  const agregar = (d, color, ancho, opacidad, guiones, punta = "round") =>
    trazos.push(
      `<path d="${d}" stroke="${color}" stroke-width="${n(ancho)}" stroke-opacity="${n(opacidad)}" ` +
        `fill="none" stroke-linecap="${punta}"${guiones ? ` stroke-dasharray="${guiones}"` : ""}/>`
    );

  // Halo exterior: los filamentos deshilachados alrededor de la banda sólida.
  const halo = [];
  for (let i = 0; i < 30; i++) {
    const r = R * entre(1.02, 1.32);
    const a0 = entre(-40, 320);
    const d = arco(cx, cy, r, a0, a0 + entre(45, 210));
    const luz = azar();
    const color = luz > 0.78 ? elegir(BLANCOS) : luz > 0.66 ? elegir(ROJOS) : elegir(GRISES);
    const guiones = azar() > 0.3 ? `${n(entre(10, 60))} ${n(entre(4, 18))}` : null;
    halo.push(
      `<path d="${d}" stroke="${color}" stroke-width="${n(entre(0.6, 2.3))}" ` +
        `stroke-opacity="${n(entre(0.25, 0.95))}" fill="none" stroke-linecap="round"` +
        `${guiones ? ` stroke-dasharray="${guiones}"` : ""}/>`
    );
  }

  // Filamentos intermedios, justo afuera de la banda.
  for (let i = 0; i < 11; i++) {
    const r = R * entre(0.86, 1.03);
    const a0 = entre(-30, 320);
    const d = arco(cx, cy, r, a0, a0 + entre(40, 170));
    const color = azar() > 0.55 ? elegir(GRISES) : azar() > 0.5 ? elegir(BLANCOS) : elegir(ROJOS);
    agregar(d, color, entre(0.7, 2.4), entre(0.25, 0.8), azar() > 0.3 ? `${n(entre(12, 55))} ${n(entre(5, 16))}` : null);
  }

  // Banda roja: abajo a la derecha, por el fondo, subiendo por la izquierda.
  for (let i = 0; i < 7; i++) {
    const r = R * entre(0.88, 1.01);
    const a0 = entre(-8, 18);
    const a1 = entre(150, 196);
    const guiones = azar() > 0.55 ? `${n(entre(90, 220))} ${n(entre(3, 9))}` : null;
    agregar(arco(cx, cy, r, a0, a1), elegir(ROJOS), entre(5, 11), entre(0.7, 1), guiones, "butt");
  }
  // Un par de hilos rojos finos que se pasan de los extremos de la banda.
  for (let i = 0; i < 4; i++) {
    const r = R * entre(0.86, 1.08);
    const a0 = entre(140, 200);
    agregar(arco(cx, cy, r, a0, a0 + entre(15, 70)), elegir(ROJOS), entre(1.2, 4), entre(0.4, 0.9));
  }

  // Vetas finas sobre las bandas: de aquí sale la textura.
  for (let i = 0; i < 14; i++) {
    const r = R * entre(0.89, 1.0);
    const a0 = entre(-10, 200);
    const color = azar() > 0.4 ? elegir(ROJOS) : "#000000";
    agregar(arco(cx, cy, r, a0, a0 + entre(20, 90)), color, entre(0.5, 1.8), entre(0.25, 0.7), `${n(entre(8, 40))} ${n(entre(4, 14))}`);
  }

  // Acento blanco: arriba a la izquierda, entrando por el tope.
  for (let i = 0; i < 5; i++) {
    const r = R * entre(0.94, 1.05);
    const a0 = entre(198, 216);
    const a1 = entre(288, 320);
    const guiones = azar() > 0.55 ? `${n(entre(60, 160))} ${n(entre(3, 8))}` : null;
    agregar(arco(cx, cy, r, a0, a1), elegir(BLANCOS), entre(5, 11), entre(0.6, 1), guiones, "butt");
  }

  // Filamentos oscuros arriba a la derecha, donde la identidad calla.
  for (let i = 0; i < 10; i++) {
    const r = R * entre(0.95, 1.24);
    const a0 = entre(255, 350);
    agregar(arco(cx, cy, r, a0, a0 + entre(30, 110)), elegir(GRISES), entre(0.8, 3.4), entre(0.35, 0.9), azar() > 0.3 ? `${n(entre(10, 48))} ${n(entre(5, 15))}` : null);
  }

  // Fragmentos internos, insinuando el centro abierto.
  for (let i = 0; i < 7; i++) {
    const r = R * entre(0.76, 0.87);
    const a0 = entre(-20, 330);
    const color = azar() > 0.6 ? elegir(ROJOS) : elegir(GRISES);
    agregar(arco(cx, cy, r, a0, a0 + entre(25, 95)), color, entre(0.7, 2.4), entre(0.3, 0.8));
  }

  const giro = animar
    ? `<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="140s" repeatCount="indefinite"/>`
    : "";

  return `  <g>
    <g>${giro}
      ${halo.join("\n      ")}
    </g>
    ${trazos.join("\n    ")}
  </g>`;
}

const bannerSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 230" width="900" height="230" role="img" aria-label="Hytrex — Clarity. Purpose. Impact. Co-founder, Juan Bonilla">
<title>Hytrex · Clarity. Purpose. Impact.</title>

<defs>
  <radialGradient id="bloom" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0%"   stop-color="${ROJO}" stop-opacity="0.13"/>
    <stop offset="55%"  stop-color="${ROJO}" stop-opacity="0.035"/>
    <stop offset="100%" stop-color="${ROJO}" stop-opacity="0"/>
  </radialGradient>

  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="50%"  stop-color="#ffffff" stop-opacity="0.06"/>
    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>

  <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="${ROJO}" stop-opacity="0"/>
    <stop offset="50%"  stop-color="${ROJO}" stop-opacity="1"/>
    <stop offset="100%" stop-color="${ROJO}" stop-opacity="0"/>
  </linearGradient>

  <clipPath id="plate"><rect x="0" y="0" width="900" height="230" rx="14"/></clipPath>
</defs>

<style>
  .sans { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .mark-type { font-size: 60px; font-weight: 600; letter-spacing: 16px; fill: #ffffff; }
  .tagline   { font-size: 16px; font-weight: 500; letter-spacing: 7px; fill: #d8d8d8; }
  .kicker    { font-size: 12.5px; font-weight: 500; letter-spacing: 4.2px; fill: #8a8a8a; }
  .dot       { fill: ${ROJO}; }
</style>

<g clip-path="url(#plate)">
  <rect width="900" height="230" fill="#000000"/>
  <!-- El resplandor va detrás de la marca para que el anillo lea como la fuente de luz -->
  <ellipse cx="196" cy="115" rx="215" ry="160" fill="url(#bloom)"/>

  <rect x="-420" y="0" width="420" height="230" fill="url(#sheen)">
    <animate attributeName="x" values="-420;900" dur="11s" repeatCount="indefinite"/>
  </rect>

${anillo({ cx: 196, cy: 115, R: 72 })}

  <text class="sans mark-type" x="576" y="106" text-anchor="middle">HYTRE<tspan fill="${ROJO}">X</tspan></text>

  <rect x="404" y="130" width="336" height="2.5" fill="url(#rule)"/>

  <text class="sans tagline" x="572" y="164" text-anchor="middle">CLARITY<tspan class="dot">.</tspan> PURPOSE<tspan class="dot">.</tspan> IMPACT<tspan class="dot">.</tspan></text>

  <text class="sans kicker" x="570" y="193" text-anchor="middle">CO-FOUNDER &amp; CEO &#183; JUAN BONILLA</text>
</g>

<rect x="0.5" y="0.5" width="899" height="229" rx="14" fill="none" stroke="#242424"/>
</svg>
`;

const headerSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 176" width="900" height="176" role="img" aria-label="Arquitectura limpia, backends escalables, juegos afilados — una petición viajando de cliente a API a servicio a datos">
  <title>Arquitectura limpia · Backends escalables · Juegos afilados</title>

  <defs>
    <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%"  stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>

    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%"  stop-color="${ROJO}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>

    <clipPath id="panel"><rect x="1" y="1" width="898" height="174" rx="12"/></clipPath>
  </defs>

  <style>
    .mono { font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
    .tagline { font-size: 18px; letter-spacing: 1.4px; fill: #c8c8c8; }
    .node-label { font-size: 15px; letter-spacing: 1.4px; fill: #9a9a9a; }
  </style>

  <rect x="1" y="1" width="898" height="174" rx="12" fill="#0b0b0b" stroke="#232323" stroke-width="1"/>

  <g clip-path="url(#panel)">
    <rect x="-500" y="0" width="500" height="176" fill="url(#sweep)">
      <animate attributeName="x" values="-500;900" dur="9s" repeatCount="indefinite"/>
    </rect>
  </g>

  <text class="mono tagline" x="450" y="52" text-anchor="middle">ARQUITECTURA LIMPIA &#183; BACKENDS ESCALABLES &#183; JUEGOS AFILADOS</text>

  <rect x="250" y="85" width="400" height="2" fill="url(#rule)"/>

  <!-- Pulso viajero: cliente → api → servicio → datos, un ciclo cada 4.5s -->
  <g>
    <line x1="110" y1="128" x2="790" y2="128" stroke="#262626" stroke-width="2" stroke-linecap="round"/>

    <line x1="110" y1="128" x2="790" y2="128"
          stroke="${ROJO}" stroke-width="2.5" stroke-linecap="round"
          stroke-dasharray="64 680" stroke-opacity="1">
      <animate attributeName="stroke-dashoffset" from="64" to="-680" dur="4.5s" repeatCount="indefinite"/>
    </line>

    <g>
      <circle cx="110" cy="128" r="6.5" fill="#0b0b0b" stroke="#3a3a3a" stroke-width="2">
        <animate attributeName="fill"   values="#0b0b0b;#0b0b0b;${ROJO};#0b0b0b;#0b0b0b" keyTimes="0;0.02;0.06;0.15;1" dur="4.5s" repeatCount="indefinite"/>
        <animate attributeName="stroke" values="#4a4a4a;#4a4a4a;${ROJO};#4a4a4a;#4a4a4a" keyTimes="0;0.02;0.06;0.15;1" dur="4.5s" repeatCount="indefinite"/>
        <animate attributeName="r"      values="6.5;6.5;9;6.5;6.5" keyTimes="0;0.02;0.06;0.15;1" dur="4.5s" repeatCount="indefinite"/>
      </circle>
      <text class="mono node-label" x="110" y="159" text-anchor="middle">CLIENTE
        <animate attributeName="fill" values="#6e6e6e;#6e6e6e;#ffffff;#6e6e6e;#6e6e6e" keyTimes="0;0.02;0.06;0.18;1" dur="4.5s" repeatCount="indefinite"/>
      </text>
    </g>

    <g>
      <circle cx="336" cy="128" r="6.5" fill="#0b0b0b" stroke="#3a3a3a" stroke-width="2">
        <animate attributeName="fill"   values="#0b0b0b;#0b0b0b;${ROJO};#0b0b0b;#0b0b0b" keyTimes="0;0.29;0.33;0.42;1" dur="4.5s" repeatCount="indefinite"/>
        <animate attributeName="stroke" values="#4a4a4a;#4a4a4a;${ROJO};#4a4a4a;#4a4a4a" keyTimes="0;0.29;0.33;0.42;1" dur="4.5s" repeatCount="indefinite"/>
        <animate attributeName="r"      values="6.5;6.5;9;6.5;6.5" keyTimes="0;0.29;0.33;0.42;1" dur="4.5s" repeatCount="indefinite"/>
      </circle>
      <text class="mono node-label" x="336" y="159" text-anchor="middle">API
        <animate attributeName="fill" values="#6e6e6e;#6e6e6e;#ffffff;#6e6e6e;#6e6e6e" keyTimes="0;0.29;0.33;0.45;1" dur="4.5s" repeatCount="indefinite"/>
      </text>
    </g>

    <g>
      <circle cx="562" cy="128" r="6.5" fill="#0b0b0b" stroke="#3a3a3a" stroke-width="2">
        <animate attributeName="fill"   values="#0b0b0b;#0b0b0b;${ROJO};#0b0b0b;#0b0b0b" keyTimes="0;0.58;0.62;0.71;1" dur="4.5s" repeatCount="indefinite"/>
        <animate attributeName="stroke" values="#4a4a4a;#4a4a4a;${ROJO};#4a4a4a;#4a4a4a" keyTimes="0;0.58;0.62;0.71;1" dur="4.5s" repeatCount="indefinite"/>
        <animate attributeName="r"      values="6.5;6.5;9;6.5;6.5" keyTimes="0;0.58;0.62;0.71;1" dur="4.5s" repeatCount="indefinite"/>
      </circle>
      <text class="mono node-label" x="562" y="159" text-anchor="middle">SERVICIO
        <animate attributeName="fill" values="#6e6e6e;#6e6e6e;#ffffff;#6e6e6e;#6e6e6e" keyTimes="0;0.58;0.62;0.74;1" dur="4.5s" repeatCount="indefinite"/>
      </text>
    </g>

    <g>
      <circle cx="790" cy="128" r="6.5" fill="#0b0b0b" stroke="#3a3a3a" stroke-width="2">
        <animate attributeName="fill"   values="#0b0b0b;#0b0b0b;${ROJO};#0b0b0b;#0b0b0b" keyTimes="0;0.87;0.91;0.99;1" dur="4.5s" repeatCount="indefinite"/>
        <animate attributeName="stroke" values="#4a4a4a;#4a4a4a;${ROJO};#4a4a4a;#4a4a4a" keyTimes="0;0.87;0.91;0.99;1" dur="4.5s" repeatCount="indefinite"/>
        <animate attributeName="r"      values="6.5;6.5;9;6.5;6.5" keyTimes="0;0.87;0.91;0.99;1" dur="4.5s" repeatCount="indefinite"/>
      </circle>
      <text class="mono node-label" x="790" y="159" text-anchor="middle">DATOS
        <animate attributeName="fill" values="#6e6e6e;#6e6e6e;#ffffff;#6e6e6e;#6e6e6e" keyTimes="0;0.87;0.91;0.99;1" dur="4.5s" repeatCount="indefinite"/>
      </text>
    </g>
  </g>
</svg>
`;

await mkdir(OUT, { recursive: true });
for (const [nombre, svg] of [
  ["banner.svg", bannerSvg()],
  ["header.svg", headerSvg()],
]) {
  await writeFile(join(OUT, nombre), svg, "utf8");
  console.log(`Escrito ${OUT}/${nombre} (${svg.length} bytes)`);
}
