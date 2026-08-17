// Construye el SVG de actividad por proyecto.
//
// Una sola serie (commits), así que el color no codifica nada: un único tono
// para todas las barras, con el valor etiquetado en la punta. Sin leyenda —
// con una serie el título ya dice qué se está midiendo.
//
// La paleta es la del resto del README: fondo #0d0d0d y neón #00ff96, igual que
// las tarjetas de stats, que van en oscuro sea cual sea el tema de quien mira.
// Por eso este gráfico también es siempre oscuro: si cambiara con el tema sería
// lo único claro rodeado de bloques negros.
//
// El relleno NO es el neón puro: #00ff96 tiene luminosidad OKLCH 0.879 y como
// bloque grande sobre negro glarea (queda fuera de la banda 0.48–0.67 para
// superficies oscuras). #00a566 pasa la banda y el mínimo de 3:1, y deja el
// neón para el título, que es como lo usas en las demás tarjetas.
export const PALETA = {
  superficie: "#0d0d0d",
  serie: "#00a566",
  titulo: "#00ff96",
  tinta: "#aaaaaa",
  base: "#333333",
};

const ANCHO = 780;
const MARGEN = 18;
const COL_ETIQUETA = 210;
const HUECO_VALOR = 54;
const FILA = 30;
const BARRA = 20; // ≤ 24px, y deja 10px de aire entre barras
const RADIO = 4;
const Y_TITULO = 26;
const Y_SUBTITULO = 46;
const Y_PRIMERA_FILA = 64;

function escapar(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function recortar(texto, maximo = 28) {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
}

// Barra con la punta derecha redondeada y el arranque a escuadra sobre la línea base.
function barra(x, y, ancho, alto, radio) {
  const r = Math.min(radio, ancho / 2, alto / 2);
  if (r <= 0.5) return `M${x} ${y}h${ancho}v${alto}h${-ancho}z`;
  return [
    `M${x} ${y}`,
    `H${x + ancho - r}`,
    `A${r} ${r} 0 0 1 ${x + ancho} ${y + r}`,
    `V${y + alto - r}`,
    `A${r} ${r} 0 0 1 ${x + ancho - r} ${y + alto}`,
    `H${x}`,
    "Z",
  ].join(" ");
}

/**
 * @param {{etiqueta: string, valor: number}[]} datos  ya ordenados de mayor a menor
 * @param {{titulo: string, subtitulo: string, pie: string}} textos
 */
export function construirGrafico(datos, textos) {
  const p = PALETA;
  const filas = datos.length || 1;
  const alto = Y_PRIMERA_FILA + filas * FILA + 30;
  const xEje = MARGEN + COL_ETIQUETA;
  const anchoUtil = ANCHO - xEje - MARGEN - HUECO_VALOR;
  const maximo = Math.max(1, ...datos.map((d) => d.valor));

  const fuente =
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  const cuerpo = datos.map((d, i) => {
    const yFila = Y_PRIMERA_FILA + i * FILA;
    const yBarra = yFila + (FILA - BARRA) / 2;
    const centro = yFila + FILA / 2;
    const ancho = Math.max(2, Math.round((d.valor / maximo) * anchoUtil));
    return [
      `<text x="${xEje - 12}" y="${centro}" text-anchor="end" dominant-baseline="central"`,
      ` font-size="12.5" fill="${p.tinta}">${escapar(recortar(d.etiqueta))}</text>`,
      `<path d="${barra(xEje, yBarra, ancho, BARRA, RADIO)}" fill="${p.serie}"/>`,
      `<text x="${xEje + ancho + 9}" y="${centro}" dominant-baseline="central" font-size="12.5"`,
      ` font-variant-numeric="tabular-nums" fill="${p.tinta}">${d.valor}</text>`,
    ].join("");
  });

  const lineaBase = `<line x1="${xEje}" y1="${Y_PRIMERA_FILA + 2}" x2="${xEje}" y2="${
    Y_PRIMERA_FILA + filas * FILA - 2
  }" stroke="${p.base}" stroke-width="1"/>`;

  const descripcion = datos.map((d) => `${d.etiqueta}: ${d.valor}`).join("; ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${alto}" viewBox="0 0 ${ANCHO} ${alto}" role="img" aria-labelledby="titulo desc" font-family="${fuente}">
<title id="titulo">${escapar(textos.titulo)}</title>
<desc id="desc">${escapar(descripcion || "Sin actividad en el periodo.")}</desc>
<rect width="${ANCHO}" height="${alto}" fill="${p.superficie}"/>
<text x="${MARGEN}" y="${Y_TITULO}" font-size="15" font-weight="700" fill="${p.titulo}">${escapar(textos.titulo)}</text>
<text x="${MARGEN}" y="${Y_SUBTITULO}" font-size="12" fill="${p.tinta}">${escapar(textos.subtitulo)}</text>
${lineaBase}
${cuerpo.join("\n")}
<text x="${MARGEN}" y="${alto - 12}" font-size="11" fill="${p.tinta}">${escapar(textos.pie)}</text>
</svg>
`;
}
