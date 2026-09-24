import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoEnMain, marcarEnMain } from '../src/enMain.js';

const script = (extra = {}) => ({ id: 's', archivo: '[U-1] - Algo - ALTER.sql', hash: 'h1', ...extra });

test('igual por hash aunque el nombre en main sea distinto', () => {
  const enMain = [{ archivo: '[U-1] - Renombrado - ALTER.sql', hash: 'h1' }];
  assert.equal(estadoEnMain(script(), enMain), 'igual');
});

test('distinta cuando el nombre normalizado coincide pero el hash no', () => {
  const enMain = [{ archivo: '[U-1] - Algo - ALTER.sql', hash: 'h2' }];
  assert.equal(estadoEnMain(script(), enMain), 'distinta');
});

test('null cuando ni el hash ni el nombre coinciden con nada de main', () => {
  const enMain = [{ archivo: '[U-2] - Otro - CREATE.sql', hash: 'h9' }];
  assert.equal(estadoEnMain(script(), enMain), null);
});

test('un hash null en main nunca matchea por hash, ni contra otro null', () => {
  const enMain = [{ archivo: '[U-9] - Ilegible - ALTER.sql', hash: null }];
  assert.equal(estadoEnMain(script({ hash: null, archivo: '[U-9] - Otro - ALTER.sql' }), enMain), null);
});

test('el nombre se normaliza: mayusculas, espacios dobles y el .sql no importan', () => {
  const enMain = [{ archivo: '[u-1]  -   ALGO - alter.SQL', hash: 'distinto' }];
  assert.equal(estadoEnMain(script({ hash: 'otro' }), enMain), 'distinta');
});

test('marcarEnMain arma el mapa scriptId -> estado y omite los null', () => {
  const scripts = [
    script({ id: 'a', hash: 'h1' }),
    script({ id: 'b', archivo: '[U-1] - Algo - ALTER.sql', hash: 'h2' }),
    script({ id: 'c', archivo: '[U-5] - Nada - DROP.sql', hash: 'h5' }),
  ];
  const enMain = [{ archivo: '[U-1] - Algo - ALTER.sql', hash: 'h1' }];
  const mapa = marcarEnMain(scripts, enMain);
  assert.deepEqual(mapa, { a: 'igual', b: 'distinta' });
  assert.equal('c' in mapa, false);
});

test('archivosDeMain vacio o ausente da null sin explotar', () => {
  assert.equal(estadoEnMain(script(), []), null);
  assert.equal(estadoEnMain(script(), undefined), null);
});

// ---------------- hash compartido entre scripts del sprint ----------------
// Si dos scripts del sprint tienen el MISMO sql (mismo hash), el hash solo ya no alcanza para
// decidir CUAL de los dos llego a main: los dos matchean por contenido contra el mismo archivo
// de main, y darle 'igual' a los dos es mentir sobre uno que en realidad no se subio.

test('con hash compartido, el hash solo (sin nombre) NO alcanza: queda null, no se contagia', () => {
  const enMain = [{ archivo: '[U-1] - A - ALTER.sql', hash: 'h-compartido' }];
  const scriptA = script({ id: 'a', archivo: '[U-1] - A - ALTER.sql', hash: 'h-compartido' });
  const scriptB = script({ id: 'b', archivo: '[U-2] - B - ALTER.sql', hash: 'h-compartido' });
  assert.equal(estadoEnMain(scriptA, enMain, { hashCompartido: true }), 'igual');
  assert.equal(estadoEnMain(scriptB, enMain, { hashCompartido: true }), null);
});

test('con hash compartido, hash Y nombre coincidiendo sigue siendo igual', () => {
  const enMain = [{ archivo: '[U-1] - A - ALTER.sql', hash: 'h-compartido' }];
  const scriptA = script({ id: 'a', archivo: '[U-1] - A - ALTER.sql', hash: 'h-compartido' });
  assert.equal(estadoEnMain(scriptA, enMain, { hashCompartido: true }), 'igual');
});

test('sin hashCompartido (default), el hash solo sigue alcanzando aunque el nombre difiera', () => {
  const enMain = [{ archivo: 'Nombre Distinto.sql', hash: 'h1' }];
  assert.equal(estadoEnMain(script({ hash: 'h1' }), enMain), 'igual');
  assert.equal(estadoEnMain(script({ hash: 'h1' }), enMain, { hashCompartido: false }), 'igual');
});

test('marcarEnMain: dos scripts con el mismo SQL, main solo trae el de uno -> ese es igual, el otro no se marca', () => {
  const scripts = [
    script({ id: 'a', archivo: '[U-1] - A - ALTER.sql', hash: 'h-compartido' }),
    script({ id: 'b', archivo: '[U-2] - B - ALTER.sql', hash: 'h-compartido' }),
  ];
  const enMain = [{ archivo: '[U-1] - A - ALTER.sql', hash: 'h-compartido' }];
  const mapa = marcarEnMain(scripts, enMain);
  assert.deepEqual(mapa, { a: 'igual' });
  assert.equal('b' in mapa, false);
});

test('marcarEnMain: un hash unico dentro del sprint sigue decidiendo solo, el nombre puede diferir', () => {
  const scripts = [script({ id: 'a', archivo: '[U-1] - A - ALTER.sql', hash: 'unico' })];
  const enMain = [{ archivo: 'Renombrado.sql', hash: 'unico' }];
  assert.deepEqual(marcarEnMain(scripts, enMain), { a: 'igual' });
});

// ---------------- __NEW en main ----------------
const spScript = (extra = {}) => script({
  archivo: '[B-25017] - Descuento por proveedor en GetPriceWithDiscountAndDiscount - ALTER.sql',
  objetos: [{ tipo: 'PROCEDURE', esquema: 'dbo', nombre: 'GetPriceWithDiscountAndDiscount' }], ...extra,
});

test('un __NEW en main con el mismo hash es igual', () => {
  assert.equal(estadoEnMain(spScript(), [{ archivo: 'GetPriceWithDiscountAndDiscount__NEW.sql', hash: 'h1' }]), 'igual');
});

test('un __NEW en main con otro hash pero el nombre del SP que el script define es distinta', () => {
  assert.equal(estadoEnMain(spScript(), [{ archivo: 'getpricewithdiscountanddiscount__new.SQL', hash: 'h2' }]), 'distinta');
});

test('un __NEW en main de otro SP no matchea por nombre', () => {
  assert.equal(estadoEnMain(spScript(), [{ archivo: 'OtroSp__NEW.sql', hash: 'h2' }]), null);
});

test('un __NEW en main solo matchea modulos: una tabla con ese nombre no cuenta', () => {
  const s = script({ objetos: [{ tipo: 'TABLE', nombre: 'Pedidos' }] });
  assert.equal(estadoEnMain(s, [{ archivo: 'Pedidos__NEW.sql', hash: 'h2' }]), null);
});

test('con hash compartido, el __NEW del SP que el script define alcanza como nombre', () => {
  const enMain = [{ archivo: 'GetPriceWithDiscountAndDiscount__NEW.sql', hash: 'h1' }];
  assert.equal(estadoEnMain(spScript(), enMain, { hashCompartido: true }), 'igual');
  assert.equal(estadoEnMain(script({ archivo: '[U-2] - B - ALTER.sql' }), enMain, { hashCompartido: true }), null);
});
