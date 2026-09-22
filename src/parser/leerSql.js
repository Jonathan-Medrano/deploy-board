import fs from 'node:fs';

// Los .sql de SSMS vienen en UTF-16LE. Leidos como UTF-8 el parseo devuelve "sin objetos"
// SIN tirar error, que es peor que fallar: todo lo que viene despues queda ciego y en verde.
export function decodificarSql(buf) {
  let txt;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) txt = buf.subarray(2).toString('utf16le');
  else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) txt = buf.subarray(2).swap16().toString('utf16le');
  else txt = buf.toString('utf8');
  return txt.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

export function leerSql(ruta) {
  return decodificarSql(fs.readFileSync(ruta));
}
