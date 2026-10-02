import test from 'node:test';
import assert from 'node:assert/strict';
import { reporteConDecisiones } from '../src/consola.js';
import { construirReporte, formatearReporte } from '../src/reporte.js';
import { firmaDe } from '../src/decisiones.js';

const sc = (id, archivo, fuentes, hash) => ({
  id, archivo, wiId: 10, esPre: false, accion: 'ALTER', descripcion: id, vinculadoPor: 'nombre',
  objetos: [{ tipo: 'PROCEDURE', nombre: 'sp_' + id }], fuentes, hash, ordenPorFuente: {},
});

function reporte() {
  return construirReporte({
    scripts: [sc('uno', '[U-10] - 01 - uno - ALTER.sql', ['adjunto', 'repo'], 'h1'), sc('dos', '[U-10] - 02 - dos - ALTER.sql', ['adjunto'], 'h2')],
    wis: [{ id: 10, tipo: 'User Story', titulo: 'Diez', estado: 'Tested', asignadoA: 'Ana Perez' }],
    tasks: [],
    estados: { uno: { dev: { estado: 'OK' }, stage: { estado: 'FALTA' } }, dos: { dev: { estado: 'OK' }, stage: { estado: 'OK' } } },
  });
}

test('sin decisiones la consola cuenta lo mismo que la medicion cruda', () => {
  const crudo = reporte();
  const r = reporteConDecisiones(crudo, null);
  assert.equal(r.bloqueantes, crudo.bloqueantes);
  assert.equal(r.listoParaSubir, crudo.listoParaSubir);
});

test('lo aceptado en el tablero deja de bloquear en la consola: los dos cuentan lo mismo', () => {
  const crudo = reporte();
  const aceptados = {};
  for (const d of crudo.desvios.filter((x) => x.severidad === 'bloqueante')) aceptados[firmaDe(d)] = { codigo: d.codigo, por: 'Ana', fecha: 'f', motivo: 'se corre a mano' };
  const r = reporteConDecisiones(crudo, { aceptados });
  assert.ok(crudo.bloqueantes > 0);
  assert.equal(r.bloqueantes, 0);
  assert.equal(r.listoParaSubir, true);
});

test('un script ignorado en el tablero no deja pendientes en la consola', () => {
  const r = reporteConDecisiones(reporte(), { ignorados: { uno: { hash: 'h1', motivo: 'no va' } } });
  assert.equal(r.pendientesPorResponsable.flatMap((g) => g.pendientes).some((p) => p.scriptId === 'uno'), false);
});

test('el semaforo de la tabla no se pone en rojo por un desvio aceptado', () => {
  const crudo = reporte();
  const aceptados = {};
  for (const d of crudo.desvios) aceptados[firmaDe(d)] = { codigo: d.codigo, motivo: 'x' };
  const texto = formatearReporte(reporteConDecisiones(crudo, { aceptados }));
  assert.equal(texto.includes('⛔'), false);
});

test('la consola dice que decisiones aplico, con autor y motivo, y cuales vencieron', () => {
  const crudo = reporte();
  const d = crudo.desvios[0];
  const r = reporteConDecisiones(crudo, {
    aceptados: { [firmaDe(d)]: { codigo: d.codigo, por: 'Ana', fecha: '2026-09-25', motivo: 'se corre a mano' } },
    marcas: { dos: { hash: 'otro', por: 'Beto', fecha: '2026-09-20' } },
  }, 'Sprint_A');
  const texto = formatearReporte(r);
  assert.match(texto, /DECISIONES DEL TABLERO/);
  assert.match(texto, /Sprint_A/);
  assert.match(texto, /se corre a mano/);
  assert.match(texto, /otra version/i);
});

test('si el archivo de decisiones esta danado la consola lo dice en vez de callarlo', () => {
  const texto = formatearReporte(reporteConDecisiones(reporte(), null, 'S', { danadas: true }));
  assert.match(texto, /danado/i);
});

test('el reporte crudo, sin pasar por decisiones, no imprime la seccion', () => {
  assert.equal(formatearReporte(reporte()).includes('DECISIONES DEL TABLERO'), false);
});
