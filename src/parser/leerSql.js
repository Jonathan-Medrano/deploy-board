import fs from 'node:fs';

// Los .sql de SSMS vienen en UTF-16LE. Leidos como UTF-8 el parseo devuelve "sin objetos"
// SIN tirar error, que es peor que fallar: todo lo que viene despues queda ciego y en verde.
// SSMS guarda en ANSI (Windows-1252) si nadie elige otra cosa: medido en [U-24768] - PRE - Filtro
// de categoria en SP_GetOrdersList, con la "é" de '% Déb%' como el byte 0xE9. Leido como UTF-8
// esa letra se volvia "�", el cuerpo esperado no coincidia con el de la base y el script salia
// FALTA habiendo corrido. Un archivo que no es UTF-8 valido se lee como Windows-1252.
function utf8OAnsi(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function decodificarSql(buf) {
  let txt;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) txt = buf.subarray(2).toString('utf16le');
  else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) txt = buf.subarray(2).swap16().toString('utf16le');
  else txt = utf8OAnsi(buf);
  return txt.replace(/^﻿/, '').replace(/\r\n/g, '\n');
}

export function leerSql(ruta) {
  return decodificarSql(fs.readFileSync(ruta));
}
