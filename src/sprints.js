// La barra invertida se define una vez y se usa por nombre: escrita como literal en cada
// lugar, un editor o un heredoc que la duplique o la coma rompe el modulo entero.
const BARRA = String.fromCharCode(92);

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const sinAcentos = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// El nodo de Azure llega como "\Fidel\Iteration\2026\2026 Septiembre 2" y el work item guarda
// "Fidel\2026\2026 Septiembre 2". Comparar las dos formas sin normalizar no matchea nunca.
export function rutaDeIteracion(rutaDelNodo) {
  const partes = String(rutaDelNodo || '').split(BARRA).filter(Boolean);
  if (partes.length < 2) return partes.join(BARRA);
  const [proyecto, segundo, ...resto] = partes;
  return [proyecto, ...(segundo === 'Iteration' ? resto : [segundo, ...resto])].join(BARRA);
}

// "2026 Septiembre 2" -> "Sprint_2026_09_02". Es una SUGERENCIA, no una verdad: la carpeta la
// crea una persona a mano y puede no seguir el patron. Por eso se puede elegir otra, y por eso
// cuando no se reconoce el formato devuelve null en vez de inventar un nombre que no existe.
export function carpetaSugerida(rutaIteracion) {
  const hoja = String(rutaIteracion || '').split(BARRA).filter(Boolean).pop() || '';
  const m = sinAcentos(hoja).match(/^(\d{4})\s+([a-z]+)\s+(\d{1,2})$/);
  if (!m) return null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  return `Sprint_${m[1]}_${String(mes).padStart(2, '0')}_${m[3].padStart(2, '0')}`;
}

// La mas nueva primero: el que abre el tablero viene a mirar el sprint en curso, no el de 2020.
export function ordenarIteraciones(iteraciones) {
  return [...iteraciones].sort((a, b) => {
    if (!a.inicio && !b.inicio) return 0;
    if (!a.inicio) return 1;
    if (!b.inicio) return -1;
    return b.inicio.localeCompare(a.inicio);
  });
}
