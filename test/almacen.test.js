import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearAlmacen, rutasDeEstado, ArchivoDanado, VersionVieja } from '../src/almacen.js';

function carpetaTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-board-'));
}

test('sin configurar, el estado vive al lado del proyecto', () => {
  const r = rutasDeEstado({}, '/raiz');
  assert.equal(r.dir, path.join('/raiz', 'estado'));
});

test('DEPLOY_BOARD_ESTADO manda: es la unica forma de que el equipo comparta marcas', () => {
  const r = rutasDeEstado({ DEPLOY_BOARD_ESTADO: '/compartido' }, '/raiz');
  assert.equal(r.dir, '/compartido');
});

test('una marca guardada vuelve a leerse despues de reabrir el almacen', () => {
  const dir = carpetaTemporal();
  try {
    crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).guardarDecisiones({ sprints: { S: { marcas: { a: { hash: 'h' } } } } }, 0);
    assert.equal(crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).leerDecisiones().sprints.S.marcas.a.hash, 'h');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('la carpeta se crea sola: nadie tiene que acordarse de hacer mkdir', () => {
  const dir = path.join(carpetaTemporal(), 'todavia', 'no', 'existe');
  try {
    crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).guardarVista({ meta: { total: 1, sprint: 'S1' } });
    assert.equal(fs.existsSync(path.join(dir, 'vista-S1.json')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sin medicion previa leerVista devuelve null, no un objeto vacio', () => {
  const dir = carpetaTemporal();
  try {
    assert.equal(crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).leerVista(), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function conCarpeta(fn) {
  const dir = carpetaTemporal();
  try { return fn(dir, crearAlmacen({ DEPLOY_BOARD_ESTADO: dir })); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('un JSON de marcas ilegible NO se lee como vacio: el siguiente guardado borraria las de todo el equipo', () => {
  conCarpeta((dir, alm) => {
    fs.writeFileSync(path.join(dir, 'decisiones.json'), '{"sprints": {"a"');
    assert.throws(() => alm.leerDecisiones(), ArchivoDanado);
  });
});

test('con el archivo de marcas danado no se guarda nada y el archivo queda como estaba', () => {
  conCarpeta((dir, alm) => {
    fs.writeFileSync(path.join(dir, 'decisiones.json'), '{"sprints": {"a"');
    assert.throws(() => alm.guardarDecisiones({ sprints: {} }, 0), ArchivoDanado);
    assert.equal(fs.readFileSync(path.join(dir, 'decisiones.json'), 'utf8'), '{"sprints": {"a"');
  });
});

test('sin archivo de marcas la version es 0 y cada guardado la sube en uno', () => {
  conCarpeta((dir, alm) => {
    assert.equal(alm.leerDecisiones().version, 0);
    alm.guardarDecisiones({ sprints: { S: { marcas: { a: { hash: 'h' } } } } }, 0);
    assert.equal(alm.leerDecisiones().version, 1);
    alm.guardarDecisiones({ sprints: {} }, 1);
    assert.equal(alm.leerDecisiones().version, 2);
  });
});

test('un decisiones.json sin version se lee como version 0, sin perder lo que tiene', () => {
  conCarpeta((dir, alm) => {
    fs.writeFileSync(path.join(dir, 'decisiones.json'), JSON.stringify({ sprints: { S: { marcas: { a: { hash: 'h' } } } } }));
    const m = alm.leerDecisiones();
    assert.equal(m.version, 0);
    assert.equal(m.sprints.S.marcas.a.hash, 'h');
  });
});

test('dos personas guardan sobre la misma version: la segunda recibe VersionVieja y lo de la primera sobrevive', () => {
  conCarpeta((dir, alm) => {
    const otro = crearAlmacen({ DEPLOY_BOARD_ESTADO: dir });
    const leidaPorAna = alm.leerDecisiones().version;
    const leidaPorBeto = otro.leerDecisiones().version;
    alm.guardarDecisiones({ sprints: { S: { marcas: { a: { hash: 'h' } } } } }, leidaPorAna);
    assert.throws(() => otro.guardarDecisiones({ sprints: { S: { marcas: { b: { hash: 'h' } } } } }, leidaPorBeto), VersionVieja);
    const final = alm.leerDecisiones();
    assert.equal(final.sprints.S.marcas.a.hash, 'h');
    assert.equal(final.sprints.S.marcas.b, undefined);
  });
});

test('VersionVieja trae lo que hay ahora, para reintentar el cambio sobre lo nuevo sin otra lectura', () => {
  conCarpeta((dir, alm) => {
    alm.guardarDecisiones({ sprints: { S: { marcas: { a: { hash: 'h' } } } } }, 0);
    try {
      alm.guardarDecisiones({ sprints: {} }, 0);
      assert.fail('tenia que rechazar');
    } catch (e) {
      assert.ok(e instanceof VersionVieja);
      assert.equal(e.actual.version, 1);
      assert.equal(e.actual.sprints.S.marcas.a.hash, 'h');
    }
  });
});

test('una escritura que se corta a la mitad deja el archivo anterior entero y no deja temporales', () => {
  const dir = carpetaTemporal();
  try {
    crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).guardarDecisiones({ sprints: { S: { marcas: { a: { hash: 'h' } } } } }, 0);
    const cortada = crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }, undefined, {
      escribir: (r, t) => { fs.writeFileSync(r, t.slice(0, 7)); throw new Error('disco lleno'); },
    });
    assert.throws(() => cortada.guardarDecisiones({ sprints: {} }, 1), /disco lleno/);
    assert.equal(crearAlmacen({ DEPLOY_BOARD_ESTADO: dir }).leerDecisiones().sprints.S.marcas.a.hash, 'h');
    assert.deepEqual(fs.readdirSync(dir), ['decisiones.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cada sprint guarda su propia vista: medir uno no pisa la del otro', () => {
  conCarpeta((dir, alm) => {
    alm.guardarVista({ meta: { sprint: 'Sprint_A', medido: '2026-09-24T10:00:00Z', total: 1 } });
    alm.guardarVista({ meta: { sprint: 'Sprint_B', medido: '2026-09-24T11:00:00Z', total: 2 } });
    assert.equal(alm.leerVista('Sprint_A').meta.total, 1);
    assert.equal(alm.leerVista('Sprint_B').meta.total, 2);
  });
});

test('sin sprint pedido vuelve la medicion mas reciente, sea del sprint que sea', () => {
  conCarpeta((dir, alm) => {
    alm.guardarVista({ meta: { sprint: 'Sprint_B', medido: '2026-09-24T11:00:00Z', total: 2 } });
    alm.guardarVista({ meta: { sprint: 'Sprint_A', medido: '2026-09-24T10:00:00Z', total: 1 } });
    assert.equal(alm.leerVista().meta.total, 2);
  });
});

test('una medicion sin carpeta de sprint se guarda por iteracion, y sin ninguna de las dos igual se guarda', () => {
  conCarpeta((dir, alm) => {
    alm.guardarVista({ meta: { iteracion: 'Fidel\Sprint 5', medido: '2026-09-24T10:00:00Z', total: 5 } });
    alm.guardarVista({ meta: { medido: '2026-09-24T09:00:00Z', total: 6 } });
    assert.equal(alm.leerVista(null, 'Fidel\Sprint 5').meta.total, 5);
    assert.ok(fs.readdirSync(dir).every((f) => !/[\:]/.test(f)));
  });
});

test('un sprint sin medir devuelve null aunque haya mediciones de otros', () => {
  conCarpeta((dir, alm) => {
    alm.guardarVista({ meta: { sprint: 'Sprint_A', medido: '2026-09-24T10:00:00Z' } });
    assert.equal(alm.leerVista('Sprint_Z'), null);
  });
});

test('el vista.json de antes de separar por sprint se sigue mostrando si no hay otra medicion', () => {
  conCarpeta((dir, alm) => {
    fs.writeFileSync(path.join(dir, 'vista.json'), JSON.stringify({ meta: { total: 9 } }));
    assert.equal(alm.leerVista().meta.total, 9);
  });
});

test('una vista ilegible se lee como sin medir: se regenera midiendo, no es una decision de nadie', () => {
  conCarpeta((dir, alm) => {
    fs.writeFileSync(path.join(dir, 'vista-S.json'), '{"meta"');
    assert.equal(alm.leerVista('S'), null);
  });
});

test('el marcas.json de antes de las decisiones NO se migra ni se toca: solo se avisa que existe', () => {
  conCarpeta((dir, alm) => {
    assert.equal(alm.hayMarcasViejas(), false);
    fs.writeFileSync(path.join(dir, 'marcas.json'), '{"marcas":{"x":{}}}');
    assert.equal(alm.hayMarcasViejas(), true);
    alm.guardarDecisiones({ sprints: {} }, 0);
    assert.equal(fs.readFileSync(path.join(dir, 'marcas.json'), 'utf8'), '{"marcas":{"x":{}}}');
    assert.deepEqual(alm.leerDecisiones().sprints, {});
  });
});
