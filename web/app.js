(function(){
  function leerPref(k, def){ try { var v = localStorage.getItem(k); return v==null?def:v==='1'; } catch(e){ return def; } }
  function guardarPref(k, v){ try { localStorage.setItem(k, v?'1':'0'); } catch(e){} }

  /* Igual que leerPref/guardarPref pero para un valor de texto (no booleano): lo usa el
     filtro de PRE, que tiene tres estados ('', 'pre', 'nopre') en vez de dos. */
  function leerPrefStr(k, def){ try { var v = localStorage.getItem(k); return v==null?def:v; } catch(e){ return def; } }
  function guardarPrefStr(k, v){ try { localStorage.setItem(k, v); } catch(e){} }

  function leerLista(k){ try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch(e){ return []; } }
  function guardarLista(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

  var estado = {
    ola:'stage', persona:null, marcas:{}, ignorados:{},
    /* Estados que el que mira decidio ESCONDER. Es una lente personal: cambia lo que se ve, no
       lo que es cierto del sprint, asi que NO toca el numero grande. Un filtro que mueve el
       contador te deja esconder los Paused y creer que hay menos bloqueantes. */
    estadosOcultos: leerLista('deployboard.estadosOcultos'),
    tiposOcultos: leerLista('deployboard.tiposOcultos'),
    /* Lente de PRE: '' (sin filtrar), 'pre' (solo PRE) o 'nopre' (solo lo que no es PRE). */
    filtroPre: leerPrefStr('deployboard.filtroPre', ''),
    agrupar: leerPref('deployboard.agrupar', true),
    abiertos: {
      subidos:   leerPref('deployboard.abre.subidos', false),
      fuera:     leerPref('deployboard.abre.fuera', false),
      ignorados: leerPref('deployboard.abre.ignorados', false),
      cerrados:  leerPref('deployboard.abre.cerrados', false),
      pausados:  leerPref('deployboard.abre.pausados', false),
      s2dCorridos: leerPref('deployboard.abre.s2dCorridos', false),
    },
  };

  var D = null, CONFIG = null, ORG = null, COLSPAN = 9, SPRINTS = null;
  var SEV = { bloqueante:'b', alto:'a', medio:'m' };

  /* ---------------- semantica de cada ola ---------------- */
  /* "Ya en main" ahora se sabe de DOS formas: la marca manual (una persona lo tildo) o que
     el archivo llego solo a la rama main del repo (f.main === 'igual', lo mide el servidor
     comparando hash de contenido). Las dos cuentan igual para todo lo que sigue: el veredicto,
     los contadores y los grupos de la tabla. 'distinta' (main tiene OTRA version) NO cuenta:
     ese archivo especifico todavia no llego. */
  function yaSubido(f){ return !!estado.marcas[f.id] || f.main === 'igual'; }
  function ignorado(f){ return !!estado.ignorados[f.id]; }
  function enStage(f){ return f.est[D.meta.destino] === 'OK'; }
  /* Un work item cerrado (se asume en main) o pausado (no se ejecuta) no es parte de la subida:
     no bloquea, no queda pendiente, no "va" ni "queda afuera". Tiene su propio grupo al final. */
  function fueraDeLaSubida(f){ return !!f.subida; }
  function bloquea(f){
    /* Ignorar SI saca del conteo: es una decision explicita del equipo, guardada con nombre y
       fecha. Esconder por estado NO, porque es una lente personal. */
    if (fueraDeLaSubida(f) || ignorado(f) || yaSubido(f)) return false;
    if (estado.ola === 'stage') return false;        // sube lo que hay: nada lo bloquea
    return !enStage(f);                                // dev->stage->main: si no llego a stage, no llega a main
  }
  function quedaAfuera(f){ return estado.ola === 'stage' && !fueraDeLaSubida(f) && !enStage(f) && !yaSubido(f) && !ignorado(f); }
  function oculto(f){
    return estado.estadosOcultos.indexOf(f.wiEstado || '(sin estado)') >= 0
        || estado.tiposOcultos.indexOf(f.tipo || 'otro') >= 0;
  }

  /* Los tres tipos se comportan distinto al desplegar y por eso se separan: un procedure se
     pisa entero y es idempotente, un cambio de estructura no se puede correr dos veces, y una
     fila de datos depende de si ya existe. Verlos mezclados esconde esa diferencia. */
  var TIPOS = {
    sp:         { txt:'SP / función',   corto:'SP',   ayuda:'Define un procedure o una función: se reemplaza entero y se puede volver a correr.' },
    estructura: { txt:'Estructura',     corto:'DDL',  ayuda:'Crea o modifica tablas, columnas o índices: correrlo dos veces suele fallar.' },
    datos:      { txt:'Datos',          corto:'DATO', ayuda:'Inserta o actualiza filas: depende de si el registro ya está.' },
    otro:       { txt:'Sin clasificar', corto:'—',    ayuda:'No se pudo derivar qué define este script.' },
  };
  var ORDEN_TIPOS = ['sp', 'estructura', 'datos', 'otro'];

  function visibles(){
    return D.filas.filter(function(f){
      if (estado.persona && f.resp !== estado.persona) return false;
      if (oculto(f)) return false;
      if (estado.filtroPre === 'pre' && !f.pre) return false;
      if (estado.filtroPre === 'nopre' && f.pre) return false;
      return true;
    });
  }

  function sevDeFila(f){
    if (yaSubido(f)) return 'g';
    if (bloquea(f)) return 'b';
    var tiene = D.desvios.some(function(d){
      return (d.scriptId === f.id) || (d.scriptId == null && d.wiId != null && d.wiId === f.wi);
    });
    if (tiene) return 'a';
    return D.meta.ambientes.every(function(a){ return f.est[a] === 'OK'; }) ? 'g' : 'a';
  }
  function claseAmb(x){ return x === 'OK' ? 'ok' : (x === 'FALTA' ? 'falta' : 'dud'); }

  /* ---------------- encabezado ---------------- */
  function tile(n, t, cls){ return '<div class="cont ' + (cls||'') + '"><b>' + n + '</b><span>' + t + '</span></div>'; }

  function fechaDDMMYYYY(iso){
    var d = new Date(iso);
    var p = function(n){ return String(n).padStart(2,'0'); };
    return p(d.getDate()) + '-' + p(d.getMonth()+1) + '-' + d.getFullYear();
  }

  function pintarEyebrow(){
    var el = document.getElementById('eyebrow');
    if (!el) return;
    var partes = [];
    if (D.meta.sprint) partes.push('Sprint ' + D.meta.sprint);
    if (D.meta.medido) partes.push('medido el ' + fechaDDMMYYYY(D.meta.medido));
    el.textContent = partes.join(' · ');
  }

  function pintarMedido(){
    var elMedido = document.getElementById('medido');
    if (!elMedido) return;
    if (!D.meta.medido) { elMedido.textContent = ''; return; }
    var d = new Date(D.meta.medido);
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    var cuando = mins < 60 ? ('hace ' + mins + ' min')
      : (mins < 1440 ? ('hace ' + Math.round(mins / 60) + ' h') : ('hace ' + Math.round(mins / 1440) + ' d'));
    elMedido.textContent = 'Medido ' + cuando + ' · ' + d.toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

  function pintarResumen(){
    var todas = visibles();
    var filtrando = todas.length !== D.filas.length;
    var subidos = todas.filter(function(f){ return !fueraDeLaSubida(f) && yaSubido(f); }).length;
    var stage = todas.filter(enStage).length;
    var devMedido = D.meta.ambientes.indexOf('dev') >= 0;
    var faltaDev = devMedido ? todas.filter(function(f){ return !fueraDeLaSubida(f) && f.est.dev !== 'OK'; }).length : 0;
    var afuera = todas.filter(quedaAfuera).length;
    var bloq = todas.filter(bloquea).length;

    var v = document.getElementById('veredicto');
    var num, tit, sub, ok;
    if (estado.ola === 'stage') {
      var vanAhora = todas.filter(function(f){ return !fueraDeLaSubida(f) && enStage(f) && !yaSubido(f); }).length;
      num = vanAhora; ok = vanAhora === 0;
      tit = vanAhora === 0 ? 'Todo lo de stage ya está marcado' : vanAhora + (vanAhora === 1 ? ' script va en esta subida' : ' scripts van en esta subida');
      sub = afuera ? afuera + (afuera === 1 ? ' queda afuera: todavía no llegó a stage' : ' quedan afuera: todavía no llegaron a stage')
                   : 'todo el sprint está en stage';
    } else {
      num = bloq; ok = bloq === 0;
      tit = bloq === 0 ? 'Listo para subir' : 'No subas todavía';
      sub = bloq === 0 ? 'todo el sprint llegó a stage o ya está en main'
                       : (bloq === 1 ? '1 script falta por ejecutar en stage' : bloq + ' scripts faltan por ejecutar en stage');
    }
    v.classList.toggle('ok', ok);
    document.getElementById('vnum').textContent = num;
    document.getElementById('vtit').textContent = tit;
    document.getElementById('vsub').textContent = sub;

    var ad = document.getElementById('ademas');
    var lineas = [];
    /* El numero de arriba cuenta lo filtrado, asi que hay que decir explicitamente cuanto
       queda afuera: si no, una lista corta se lee como si fuera todo el sprint. */
    var tapadas = D.filas.length - todas.length;
    if (tapadas) {
      lineas.push('El filtro está tapando <b>' + tapadas + '</b> ' + (tapadas === 1 ? 'fila' : 'filas') +
        ' de las <b>' + D.filas.length + '</b> del sprint. <b>Todos los números de esta pantalla cuentan sólo lo que ves.</b>');
    }
    /* Sin ramaMain no hubo lectura de main (sin carpeta de sprint, o una medicion vieja de
       antes de este feature): ningun script puede tener el badge, y eso hay que decirlo en vez
       de dejar la columna vacia sin explicacion. Texto fijo, sin datos interpolados. */
    if (!D.meta.ramaMain) {
      lineas.push('La rama main no se evaluó en esta medición (sin carpeta de sprint, o medición anterior a esta versión): ningún script tiene el badge de MAIN.');
    }
    ad.hidden = lineas.length === 0;
    ad.innerHTML = lineas.join('<br><br>');

    var ign = todas.filter(function(f){ return !fueraDeLaSubida(f) && ignorado(f); }).length;
    /* Igual criterio que faltaDev/ign: cuenta sobre lo visible y sin lo que ya quedo afuera
       de la subida (cerrado/pausado), asi el numero grande sigue significando lo mismo en
       toda la fila de tiles. */
    var pre = todas.filter(function(f){ return !fueraDeLaSubida(f) && f.pre; }).length;
    /* Arriba solo lo que cambia lo que hacés al subir: cuántos PRE van antes del código y
       cuántos ya están en main. El resto es contexto y va en una línea chica. */
    var ningunLado = todas.filter(function(f){ return !fueraDeLaSubida(f) && D.meta.ambientes.every(function(a){ return f.est[a] !== 'OK'; }); }).length;
    var mas = [
      '<b>' + todas.length + '</b> ' + (filtrando ? 'en la lista filtrada' : 'scripts del sprint'),
      '<b>' + stage + '</b> ya en stage',
    ];
    if (devMedido) mas.push('<b>' + faltaDev + '</b> no corrieron en dev');
    mas.push('<b>' + ningunLado + '</b> no corrieron en ningún lado');
    if (ign) mas.push('<b>' + ign + '</b> sin tener en cuenta');
    document.getElementById('contadores').innerHTML =
      (pre ? tile(pre, 'PRE van antes del código', 'hay') : '') +
      (subidos ? tile(subidos, 'ya en main') : '') +
      (filtrando ? tile(todas.length, 'en la lista filtrada', 'filtrado') : '') +
      '<div class="cont-mas">' + mas.join(' · ') + '</div>';
  }

  /* ---------------- filtros por tipo y por estado ---------------- */
  function pintarEstados(){
    /* Tipo y PRE cuentan lo mismo que la tabla y que el contador de arriba: lo que entra en la
       subida. Contar tambien cerrados y pausados daba "15 PRE y 15 sin PRE" con 15 filas a la vista. */
    var enLaSubida = D.filas.filter(function(f){ return !fueraDeLaSubida(f); });
    var cuenta = {};
    enLaSubida.forEach(function(f){ var t = f.tipo || 'otro'; cuenta[t] = (cuenta[t] || 0) + 1; });

    var chipsTipo = ORDEN_TIPOS.filter(function(t){ return cuenta[t]; }).map(function(t){
      var on = estado.tiposOcultos.indexOf(t) < 0;
      return '<button type="button" class="chip tipo t-' + t + '" data-t="' + t + '" aria-pressed="' + on + '"' +
        ' title="' + esc(TIPOS[t].ayuda) + '">' + esc(TIPOS[t].txt) + ' <span class="n">' + cuenta[t] + '</span></button>';
    }).join('');

    /* Lente de PRE, al lado de los chips de tipo. Solo aparece si hay al menos un PRE en el
       sprint: sin eso, "Sin PRE" seria identico a "Todos" y el chip no serviria de nada. */
    var totalPre = enLaSubida.filter(function(f){ return f.pre; }).length;
    var totalNoPre = enLaSubida.length - totalPre;
    var chipsPre = totalPre ?
      '<button type="button" class="chip pre-chip" data-pre="pre" aria-pressed="' + (estado.filtroPre === 'pre') + '"' +
        ' title="Ver sólo los scripts PRE, los que corren antes del código">PRE <span class="n">· ' + totalPre + '</span></button>' +
      '<button type="button" class="chip pre-chip" data-pre="nopre" aria-pressed="' + (estado.filtroPre === 'nopre') + '"' +
        ' title="Ver sólo los scripts que NO son PRE">Sin PRE <span class="n">· ' + totalNoPre + '</span></button>'
      : '';

    var ests = [];
    D.filas.forEach(function(f){
      var e = f.wiEstado || '(sin estado)';
      var hit = ests.find(function(x){ return x.e === e; });
      if (hit) hit.n++; else ests.push({ e: e, n: 1 });
    });
    ests.sort(function(a, b){ return b.n - a.n; });
    var chipsEstado = ests.map(function(x){
      var on = estado.estadosOcultos.indexOf(x.e) < 0;
      return '<button type="button" class="chip est" data-e="' + esc(x.e) + '" aria-pressed="' + on + '">' +
        esc(x.e) + ' <span class="n">' + x.n + '</span></button>';
    }).join('');

    var limpiable = estado.estadosOcultos.length || estado.tiposOcultos.length || estado.filtroPre;
    document.getElementById('estados').innerHTML =
      '<div class="franja"><span class="lbl">Qué toca</span>' + chipsTipo + chipsPre +
        '<button type="button" class="chip agrupar" id="agrupar" aria-pressed="' + estado.agrupar + '"' +
        ' title="Separar la tabla por tipo, manteniendo el orden de ejecución dentro de cada uno">' +
        (estado.agrupar ? 'separado por tipo' : 'una sola lista') + '</button></div>' +
      '<div class="franja"><span class="lbl">Estado del work item</span>' + chipsEstado +
        (limpiable ? '<button type="button" class="chip limpiar" id="verTodos">ver todos</button>' : '') + '</div>';
  }

  function pintarCabecera(){
    var el = document.getElementById('cabecera');
    if (!el) return;
    if (estado.ola === 'stagedev') {
      el.innerHTML = '<th>#</th><th>Work item</th><th>Script</th><th>Tipo</th><th>DEV</th><th>STAGE</th><th>Responsable</th>';
      return;
    }
    el.innerHTML = '<th>#</th><th>Work item</th><th>Script</th><th>Tipo</th>' +
      D.meta.ambientes.map(function(a){ return '<th>' + esc(a.toUpperCase()) + '</th>'; }).join('') +
      '<th>main</th><th>Responsable</th>';
  }

  /* ---------------- tabla ---------------- */
  var tbody = document.getElementById('filas');

  /* La nota de una fila apartada dice por que esta ahi y si hay algo que mirar. Un cerrado se
     da por subido a main, pero solo se CONFIRMA si el archivo llego a main o alguien lo marco;
     sin copia en el repo no hay contra que confirmarlo. Un pausado que ya corrio es D13. */
  function notaDeSubida(f){
    if (f.subida === 'cerrado') {
      if (f.main === 'igual' || estado.marcas[f.id]) return { txt:'Confirmado en main', cls:'ok' };
      if (!f.enRepo) return { txt:'Cerrado; no se puede confirmar en main: nunca se commiteó', cls:'' };
      return { txt:'Cerrado pero no se encontró en main', cls:'aviso' };
    }
    if (f.subida === 'pausado') {
      var corrio = D.meta.ambientes.filter(function(a){ return f.est[a] === 'OK'; });
      if (corrio.length) return { txt:'Pausado pero corrió en ' + corrio.join(', '), cls:'aviso' };
    }
    return null;
  }

  function filaHTML(f, numero, nota){
    var m = estado.marcas[f.id];
    var fueraSprint = f.wiFuera
      ? '<em class="fuera-sprint" title="El work item no está en este sprint: se trajo aparte porque el script lo nombra.">fuera del sprint</em>'
      : '';

    var wiCell;
    if (!f.wi) {
      wiCell = '<span class="sinvinc">sin vincular<em>el nombre no trae [U-xxxxx]</em></span>';
    } else if (!ORG) {
      // Sin organizacion configurada no hay link: un href a medias manda al que lo aprieta a
      // una pagina que no existe.
      wiCell = '<span class="sinvinc"><b>' + f.wi + '</b>' + (f.wiEstado ? '<em>' + esc(f.wiEstado) + '</em>' : '') + fueraSprint + '</span>';
    } else {
      var inferido = f.via === 'contenedor';
      wiCell =
        '<a class="wilink" href="' + ORG + f.wi + '" target="_blank" rel="noopener" title="Abrir el work item ' + f.wi + ' en Azure DevOps' + (f.padre ? ' · padre ' + f.padre : '') + '">' +
          '<b>' + f.wi + '</b>' +
          (inferido && f.wiTit ? '<em>' + esc(f.wiTit) + '</em>' : '') +
          (inferido
            ? '<em class="inferido" title="El nombre no trae [U-xxxxx]: el vinculo sale del work item que lo CONTIENE, no del nombre.">por contenedor</em>'
            : (f.wiEstado ? '<em>' + esc(f.wiEstado) + '</em>' : '')) +
          fueraSprint +
        '</a>';
    }

    var quien = m ? (((CONFIG && m.por === CONFIG.quien) ? 'vos' : (m.por || 'alguien')) + (m.fecha ? ' · ' + m.fecha : '')) : '';

    /* Badge automatico, separado del check manual: uno lo detecta el servidor comparando
       contenido contra la rama main, el otro lo tilda una persona. Que se vean distintos evita
       que alguien lea el badge como "ya lo marque yo" cuando en realidad nadie lo toco. */
    var badgeMain = '';
    if (f.main === 'igual') {
      badgeMain = '<span class="badge-main igual" title="El archivo ya esta en la rama main del repo, con el mismo contenido: segun la regla del equipo, ya corrio en produccion.">Ya en rama MAIN</span>';
    } else if (f.main === 'distinta') {
      badgeMain = '<span class="badge-main distinta" title="Hay un archivo con este nombre en main, pero con OTRO contenido: la version que vas a subir todavia no llego.">En MAIN, pero otra versión</span>';
    }

    var mainCell = badgeMain +
      '<label class="marca' + (m ? ' puesta' : '') + '">' +
        '<input type="checkbox" data-id="' + esc(f.id) + '"' + (m ? ' checked' : '') + '>' +
        '<span>Corrió en main' + (m ? '<span class="quien">' + esc(quien) + '</span>' : '') + '</span>' +
      '</label>';

    var ign = ignorado(f);
    var ignCell =
      '<button type="button" class="ign" data-id="' + esc(f.id) + '"' +
        ' title="' + (ign ? 'Volver a tenerlo en cuenta' : 'No tener en cuenta este script para la subida') + '"' +
        ' aria-label="' + (ign ? 'Volver a tener en cuenta' : 'No tener en cuenta') + '">' +
        (ign ? '↺' : '✕') + '</button>';

    var clases = [sevDeFila(f)];
    if (f.pre) clases.push('fila-pre');
    if (ign) clases.push('ignorado');
    else if (yaSubido(f)) clases.push('subido');
    else if (quedaAfuera(f)) clases.push('fuera');

    var ambCells = D.meta.ambientes.map(function(a){
      var v = f.est[a];
      return '<td class="amb ' + claseAmb(v) + '">' + esc(v) + '</td>';
    }).join('');

    return '<tr class="' + clases.join(' ') + '">' +
      '<td class="num">' + numero + '</td>' +
      '<td class="wi">' + wiCell + '</td>' +
      /* El nombre de archivo y los objetos que toca son para cuando hay que buscarlo, no para
         leer la lista: van en el tooltip, no en la fila. */
      '<td class="scriptname" title="' + esc(f.arch + ((f.obj && f.obj.length) ? '\n' + f.obj.join(' · ') : '')) + '">' + esc(f.desc) +
        (nota ? '<span class="nota-subida' + (nota.cls ? ' ' + nota.cls : '') + '">' + esc(nota.txt) + '</span>' : '') + '</td>' +
      '<td class="tipo-cell"><span class="badge t-' + (f.tipo || 'otro') + '" title="' + esc(TIPOS[f.tipo || 'otro'].ayuda) + '">' +
        esc(TIPOS[f.tipo || 'otro'].corto) + '</span><span class="acc">' + esc(f.acc || '') + '</span></td>' +
      ambCells +
      '<td class="main-cell">' + mainCell + '</td>' +
      '<td class="resp' + (f.resp ? '' : ' nadie') + '">' + esc(f.resp || 'sin identificar') + '</td>' +
      '<td class="ign-cell">' + ignCell + '</td>' +
    '</tr>';
  }

  /* Arriba va SOLO lo que entra en la subida que estas preparando. Lo demas no se borra —hay
     que poder desmarcar algo marcado por error, y ver que quedo afuera— pero baja al final,
     agrupado y plegado, porque para el que esta por subir es ruido. Los grupos dependen de la
     ola: en `stage` lo que todavia no llego a stage no entra en ESA subida; en `dev` el alcance
     es el sprint completo y solo se aparta lo ya subido. */
  function particion(vs){
    var cerrados = vs.filter(function(f){ return f.subida === 'cerrado'; });
    var pausados = vs.filter(function(f){ return f.subida === 'pausado'; });
    var enLaSubida = vs.filter(function(f){ return !fueraDeLaSubida(f); });
    var ign = enLaSubida.filter(ignorado);
    var subidos = enLaSubida.filter(function(f){ return yaSubido(f) && !ignorado(f); });
    var fuera = estado.ola === 'stage' ? enLaSubida.filter(quedaAfuera) : [];
    var activos = enLaSubida.filter(function(f){
      return !ignorado(f) && !yaSubido(f) && !(estado.ola === 'stage' && quedaAfuera(f));
    });
    var grupos = [];
    if (fuera.length) grupos.push({
      id:'fuera', n:fuera.length, filas:fuera, marca:'—',
      txt:'No entran en esta subida · todavía no llegaron a stage',
    });
    if (subidos.length) grupos.push({
      id:'subidos', n:subidos.length, filas:subidos, marca:'✓',
      txt:'Ya en main (rama o marcado)',
    });
    if (ign.length) grupos.push({
      id:'ignorados', n:ign.length, filas:ign, marca:'✕',
      txt:'Sin tener en cuenta · decisión del equipo, no cuentan como bloqueantes',
    });
    if (cerrados.length) grupos.push({
      id:'cerrados', n:cerrados.length, filas:cerrados, marca:'■', nota:true,
      txt:'Cerrados: se asumen en main',
    });
    if (pausados.length) grupos.push({
      id:'pausados', n:pausados.length, filas:pausados, marca:'‖', nota:true,
      txt:'En pausa: no se ejecutan',
    });
    return { activos: activos, grupos: grupos };
  }

  /* Arma el bloque de filas activas (agrupado por tipo si corresponde), arrancando la
     numeracion en numInicio. La usan tanto la tabla sin PRE como el bloque "Despues del
     deploy" cuando si hay PRE, para no duplicar la logica de agrupamiento. */
  function renderActivos(lista, numInicio){
    var num = numInicio;
    var html;
    if (estado.agrupar) {
      /* Separado por tipo, PERO la numeracion sigue siendo global y en orden de ejecucion:
         el orden es la instruccion, y renumerar dentro de cada bloque haria pensar que se
         puede correr un bloque entero antes que otro. */
      html = ORDEN_TIPOS.map(function(t){
        var dentro = lista.filter(function(f){ return (f.tipo || 'otro') === t; });
        if (!dentro.length) return '';
        return '<tr class="sub"><td colspan="' + COLSPAN + '"><span class="t-' + t + '">' + esc(TIPOS[t].txt) + '</span>' +
               '<span class="ayuda">' + esc(TIPOS[t].ayuda) + '</span></td></tr>' +
               dentro.map(function(f){ num++; return filaHTML(f, String(num)); }).join('');
      }).join('');
    } else {
      html = lista.map(function(f){ num++; return filaHTML(f, String(num)); }).join('');
    }
    return { html: html, num: num };
  }

  /* Un grupo plegado (Cerrados, Pausados, "No entran en esta subida", etc) puede tener PRE
     mezclados con el resto: al abrirlo se separan con los mismos dos sub-encabezados de
     arriba, mas chicos/indentados para no competir con el separador del grupo. Un grupo sin
     ningun PRE se pinta exactamente como antes, sin encabezados de mas. */
  function renderGrupoFilas(g){
    var pre = g.filas.filter(function(f){ return f.pre; });
    var resto = g.filas.filter(function(f){ return !f.pre; });
    var fila = function(f){ return filaHTML(f, g.marca, g.nota ? notaDeSubida(f) : null); };
    if (!pre.length) return g.filas.map(fila).join('');
    return '<tr class="pre-header sub antes"><td colspan="' + COLSPAN + '">⚠ ANTES del deploy (PRE) · ' + pre.length + '</td></tr>' +
      pre.map(fila).join('') +
      '<tr class="pre-header sub despues"><td colspan="' + COLSPAN + '">Después del deploy · ' + resto.length + '</td></tr>' +
      resto.map(fila).join('');
  }

  function pintarTabla(){
    var vs = visibles();
    var p = particion(vs);

    /* La numeracion cuenta SOLO lo activo: esa columna es el orden en que hay que ejecutar
       ahora, no la posicion historica. Si hay PRE en el bloque activo, van aparte y PRIMERO
       (fuera del agrupado por tipo: importa mas el orden de ejecucion entre ellos que su
       tipo), y recien despues sigue el bloque de siempre. Sin PRE, es exactamente lo de antes. */
    var pre = p.activos.filter(function(f){ return f.pre; });
    var resto = p.activos.filter(function(f){ return !f.pre; });

    var html;
    if (pre.length) {
      /* El bloque PRE nunca se separa por tipo, agrupar o no: lo que importa ahi es el orden
         de ejecucion entre ellos, no si es un SP o un DDL. Solo "Despues" respeta agrupar. */
      var num = 0;
      var htmlPre = pre.map(function(f){ num++; return filaHTML(f, String(num)); }).join('');
      var rResto = renderActivos(resto, num);
      html =
        '<tr class="pre-header antes"><td colspan="' + COLSPAN + '">⚠ ANTES del deploy (PRE) · ' + pre.length + '</td></tr>' +
        htmlPre +
        '<tr class="pre-header despues"><td colspan="' + COLSPAN + '">Después del deploy · ' + resto.length + '</td></tr>' +
        rResto.html;
    } else {
      html = renderActivos(p.activos, 0).html;
    }

    p.grupos.forEach(function(g){
      var abierto = !!estado.abiertos[g.id];
      html += '<tr class="sep"><td colspan="' + COLSPAN + '">' +
        '<button type="button" class="toggle" data-g="' + g.id + '" aria-expanded="' + (abierto ? 'true' : 'false') + '">' +
          '<span class="chev">' + (abierto ? '▾' : '▸') + '</span>' +
          g.txt + ' · ' + g.n +
          '<span class="hint">' + (abierto ? 'ocultar' : 'mostrar') + '</span>' +
        '</button></td></tr>';
      if (abierto) html += renderGrupoFilas(g);
    });

    tbody.innerHTML = html;
    var vacio = p.activos.length === 0 && p.grupos.length === 0;
    document.getElementById('sinFilas').hidden = !vacio;
  }

  /* ---------------- pendientes por persona ---------------- */
  function motivoHTML(ms){
    if (ms.length === 1) return '<div class="motivo">' + esc(ms[0]) + '</div>';
    var partes = ms.map(function(m){ return m.split(' — '); });
    var pref = partes[0][0];
    var comun = partes.every(function(p){ return p.length > 1 && p[0] === pref; });
    if (!comun) return '<div class="motivo">' + ms.map(esc).join('<br>') + '</div>';
    return '<div class="motivo"><span class="mfile">' + esc(pref) + '</span><ul>' +
      partes.map(function(p){ return '<li>' + esc(p.slice(1).join(' — ')) + '</li>'; }).join('') + '</ul></div>';
  }
  function pintarPersonas(){
    var gs = D.personas.filter(function(g){ return !estado.persona || g.responsable === estado.persona; });
    var total = gs.reduce(function(n, g){ return n + g.pendientes.length; }, 0);
    document.getElementById('personasCuenta').textContent = gs.length ? total + (total === 1 ? ' pendiente' : ' pendientes') + ' · ' + gs.length + (gs.length === 1 ? ' persona' : ' personas') : '';
    /* Plegadas: la grilla muestra quién y cuánto de un vistazo. Si se filtró a una sola
       persona, se abre sola, porque es lo único que hay para ver. */
    var abrir = !!estado.persona;
    document.getElementById('personas').innerHTML = gs.map(function(g){
      var anon = /sin responsable/.test(g.responsable);
      var bloq = g.pendientes.filter(function(p){ return p.severidad === 'bloqueante'; }).length;
      return '<details class="persona"' + (abrir ? ' open' : '') + '><summary>' +
        '<h3' + (anon ? ' class="nadie"' : '') + '>' + esc(anon ? 'Sin responsable identificado' : g.responsable) + '</h3>' +
        '<span class="cuenta">' + (bloq ? '<span class="bloq">' + bloq + (bloq === 1 ? ' bloquea' : ' bloquean') + '</span> · ' : '') +
        g.pendientes.length + (g.pendientes.length === 1 ? ' pendiente' : ' pendientes') + '</span>' +
        '</summary><ul class="pend">' +
        g.pendientes.map(function(p){
          return '<li><span class="sev ' + (SEV[p.severidad] || 'm') + '"></span><div><b>' + esc(p.accion) + '</b>' + motivoHTML(p.motivos) + '</div></li>';
        }).join('') + '</ul></details>';
    }).join('');
  }

  /* ---------------- revisar a mano ---------------- */
  function pintarRevisar(){
    var n = (D.revisar || []).length;
    document.getElementById('revisarCuenta').textContent = n ? String(n) : '';
    document.getElementById('revisar').innerHTML = (D.revisar || []).map(function(r){
      var li = function(lado, arr){
        return (arr || []).map(function(a){ return '<li><span class="lado">' + lado + '</span><span class="f">' + esc(a) + '</span></li>'; }).join('');
      };
      var num = (r.numeradosDistinto || []).map(function(n){
        return '<li><span class="lado">orden</span><span class="f">' + esc(n.archivo) +
          ' — tarjeta ' + esc(n.tarjeta) + ' contra repo ' + esc(n.repo) + '. Manda el del repo.</span></li>';
      }).join('');
      var wiHeader = ORG
        ? '<a class="wilink-inline" href="' + ORG + r.wiId + '" target="_blank" rel="noopener">US ' + r.wiId + '</a>'
        : 'US ' + r.wiId;
      return '<details class="rev"><summary>' +
        '<h3>' + wiHeader + (r.titulo ? ' · ' + esc(r.titulo) : '') + '</h3>' +
        '<span class="tag' + (r.afectaEstePase ? ' ahora' : '') + '">' +
        (r.afectaEstePase ? 'afecta a este pase' : 'afecta al próximo pase') + '</span>' +
        '<span class="conteo">tarjeta <b>' + r.enLaTarjeta + '</b> · repo <b>' + r.enElRepo + '</b></span></summary>' +
        '<div class="rev-body"><ul>' + li('solo tarjeta', r.soloEnLaTarjeta) + li('solo repo', r.soloEnElRepo) + num + '</ul>' +
        '<div class="conteo">Quien lo tiene que revisar: <b>' + esc(r.responsable || 'sin identificar') + '</b></div>' +
        '</div></details>';
    }).join('');
  }

  function pintarTodo(){
    document.getElementById('contenido').classList.toggle('modo-s2d', estado.ola === 'stagedev');
    pintarCabecera();
    if (estado.ola === 'stagedev') { pintarResumenS2D(); pintarTablaS2D(); return; }
    pintarResumen(); pintarTabla(); pintarPersonas();
  }

  /* ---------------- stage -> dev ---------------- */
  /* Lo que la rama de stage tiene y dev no, sea del sprint que sea. Lo que ya corrio en la base
     de dev llega con el merge y no hay que ejecutarlo: va aparte y plegado. */
  var COLS_S2D = 7;
  function faltaEnDev(f){ return f.est.dev !== 'OK'; }

  function pintarResumenS2D(){
    var s2d = D.stageToDev;
    var v = document.getElementById('veredicto');
    document.getElementById('ademas').hidden = true;
    if (!s2d) {
      v.classList.remove('ok');
      document.getElementById('vnum').textContent = '?';
      document.getElementById('vtit').textContent = 'No se evaluó';
      document.getElementById('vsub').textContent = 'Esta medición no comparó las ramas: apretá "Volver a medir".';
      return;
    }
    var faltan = s2d.filas.filter(faltaEnDev).length;
    v.classList.toggle('ok', faltan === 0);
    document.getElementById('vnum').textContent = faltan;
    document.getElementById('vtit').textContent = faltan ? 'Faltan en dev' : 'dev está al día con stage';
    document.getElementById('vsub').textContent = faltan
      ? (faltan === 1 ? '1 script de ' : faltan + ' scripts de ') + s2d.ramaStage + ' falta' + (faltan === 1 ? '' : 'n') + ' por ejecutar en dev'
      : 'nada de lo que está en ' + s2d.ramaStage + ' falta en la base de dev';
  }

  function filaS2D(f, numero){
    var wiCell = !f.wi ? '<span class="sinvinc">sin vincular</span>'
      : (ORG ? '<a class="wilink" href="' + ORG + f.wi + '" target="_blank" rel="noopener"><b>' + f.wi + '</b>' + (f.wiEstado ? '<em>' + esc(f.wiEstado) + '</em>' : '') + '</a>'
             : '<span class="sinvinc"><b>' + f.wi + '</b></span>');
    var t = f.tipo || 'otro';
    return '<tr class="' + (faltaEnDev(f) ? 'b' : 'subido') + (f.pre ? ' fila-pre' : '') + '">' +
      '<td class="num">' + numero + '</td>' +
      '<td class="wi">' + wiCell + '</td>' +
      '<td class="scriptname" title="' + esc(f.arch + ((f.obj && f.obj.length) ? '\n' + f.obj.join(' · ') : '')) + '">' + esc(f.desc) + '</td>' +
      '<td class="tipo-cell"><span class="badge t-' + t + '" title="' + esc(TIPOS[t].ayuda) + '">' + esc(TIPOS[t].corto) + '</span><span class="acc">' + esc(f.acc || '') + '</span></td>' +
      '<td class="amb ' + claseAmb(f.est.dev) + '">' + esc(f.est.dev) + '</td>' +
      '<td class="amb ' + claseAmb(f.est.stage) + '">' + esc(f.est.stage) + '</td>' +
      '<td class="resp">' + esc(f.resp) + '</td>' +
    '</tr>';
  }

  function pintarTablaS2D(){
    var s2d = D.stageToDev;
    var filas = s2d ? s2d.filas : [];
    var faltan = filas.filter(faltaEnDev);
    var corridos = filas.filter(function(f){ return !faltaEnDev(f); });
    var pre = faltan.filter(function(f){ return f.pre; });
    var resto = faltan.filter(function(f){ return !f.pre; });
    var num = 0, html = '';
    if (pre.length) {
      html += '<tr class="pre-header antes"><td colspan="' + COLS_S2D + '">⚠ ANTES del deploy (PRE) · ' + pre.length + '</td></tr>' +
        pre.map(function(f){ num++; return filaS2D(f, String(num)); }).join('');
      if (resto.length) html += '<tr class="pre-header despues"><td colspan="' + COLS_S2D + '">Después del deploy · ' + resto.length + '</td></tr>';
    }
    html += resto.map(function(f){ num++; return filaS2D(f, String(num)); }).join('');
    if (corridos.length) {
      var abierto = !!estado.abiertos.s2dCorridos;
      html += '<tr class="sep"><td colspan="' + COLS_S2D + '">' +
        '<button type="button" class="toggle" data-g="s2dCorridos" aria-expanded="' + abierto + '">' +
        '<span class="chev">' + (abierto ? '▾' : '▸') + '</span>Ya corrieron en dev · llegan con el merge · ' + corridos.length +
        '<span class="hint">' + (abierto ? 'ocultar' : 'mostrar') + '</span></button></td></tr>';
      if (abierto) html += corridos.map(function(f){ return filaS2D(f, '✓'); }).join('');
    }
    tbody.innerHTML = html;
    var vacio = document.getElementById('sinFilas');
    vacio.textContent = s2d ? 'Nada de lo que está en ' + s2d.ramaStage + ' falta en dev.' : 'No se comparó stage contra dev en esta medición.';
    vacio.hidden = filas.length > 0;
  }

  function pintarFiltros(){
    var nombres = [];
    D.filas.forEach(function(f){ if (f.resp && nombres.indexOf(f.resp) < 0) nombres.push(f.resp); });
    nombres.sort();
    var filtros = document.getElementById('filtros');
    filtros.innerHTML = ['<button type="button" class="chip" data-p="" aria-pressed="' + (!estado.persona) + '">Todos</button>']
      .concat(nombres.map(function(n){ return '<button type="button" class="chip" data-p="' + esc(n) + '" aria-pressed="' + (estado.persona === n) + '">' + esc(n) + '</button>'; })).join('');
  }

  function refrescarConD(){
    ORG = D.meta.wiBase || null;
    COLSPAN = 7 + D.meta.ambientes.length;
    pintarEyebrow();
    pintarMedido();
    pintarCabecera();
    pintarEstados();
    pintarFiltros();
    pintarRevisar();
    pintarTodo();
  }

  function avisar(txt){
    var a = document.getElementById('aviso');
    a.textContent = txt; a.hidden = !txt;
  }

  function mostrarVacio(){
    document.getElementById('contenido').hidden = true;
    document.getElementById('vacio').hidden = false;
  }
  function mostrarContenido(){
    document.getElementById('vacio').hidden = true;
    document.getElementById('contenido').hidden = false;
  }

  function pintarPie(){
    var el = document.getElementById('estadoDir');
    if (el && CONFIG) el.textContent = CONFIG.estado;
  }

  function peticion(url, opciones){
    return fetch(url, opciones).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(body){
        if (!r.ok) throw new Error((body && body.error) || ('Error ' + r.status));
        return body;
      });
    });
  }

  /* ---------------- controles ---------------- */
  var olas = document.getElementById('olas');
  olas.addEventListener('click', function(e){
    var b = e.target.closest('.ola'); if (!b) return;
    estado.ola = b.dataset.ola;
    Array.prototype.forEach.call(olas.children, function(c){ c.setAttribute('aria-pressed', String(c === b)); });
    pintarTodo();
  });

  /* Orden de ejecución viene abierta y las otras dos plegadas; después cada una recuerda
     cómo la dejaste. */
  Array.prototype.forEach.call(document.querySelectorAll('details.seccion'), function(d){
    var k = 'deployboard.sec.' + d.dataset.sec;
    d.open = leerPref(k, d.dataset.sec === 'orden');
    d.addEventListener('toggle', function(){ guardarPref(k, d.open); });
  });

  var filtros = document.getElementById('filtros');
  filtros.addEventListener('click', function(e){
    var b = e.target.closest('.chip'); if (!b) return;
    estado.persona = b.dataset.p || null;
    Array.prototype.forEach.call(filtros.children, function(c){ c.setAttribute('aria-pressed', String(c === b)); });
    pintarTabla(); pintarPersonas();
  });

  document.getElementById('estados').addEventListener('click', function(e){
    if (e.target.closest('#agrupar')) {
      estado.agrupar = !estado.agrupar;
      guardarPref('deployboard.agrupar', estado.agrupar);
    } else if (e.target.closest('#verTodos')) {
      estado.estadosOcultos = []; estado.tiposOcultos = []; estado.filtroPre = '';
      guardarLista('deployboard.estadosOcultos', []); guardarLista('deployboard.tiposOcultos', []);
      guardarPrefStr('deployboard.filtroPre', '');
    } else {
      var cp = e.target.closest('.chip.pre-chip');
      if (cp) {
        var vp = cp.dataset.pre;
        estado.filtroPre = (estado.filtroPre === vp) ? '' : vp;
        guardarPrefStr('deployboard.filtroPre', estado.filtroPre);
      } else {
        var ct = e.target.closest('.chip.tipo');
        if (ct) {
          var t = ct.dataset.t, j = estado.tiposOcultos.indexOf(t);
          if (j >= 0) estado.tiposOcultos.splice(j, 1); else estado.tiposOcultos.push(t);
          guardarLista('deployboard.tiposOcultos', estado.tiposOcultos);
        } else {
          var c = e.target.closest('.chip.est'); if (!c) return;
          var v = c.dataset.e, i = estado.estadosOcultos.indexOf(v);
          if (i >= 0) estado.estadosOcultos.splice(i, 1); else estado.estadosOcultos.push(v);
          guardarLista('deployboard.estadosOcultos', estado.estadosOcultos);
        }
      }
    }
    pintarEstados(); pintarTodo();
  });

  tbody.addEventListener('click', function(e){
    var t = e.target.closest('.toggle[data-g]');
    if (t) {
      var g = t.dataset.g;
      estado.abiertos[g] = !estado.abiertos[g];
      guardarPref('deployboard.abre.' + g, estado.abiertos[g]);
      if (estado.ola === 'stagedev') pintarTablaS2D(); else pintarTabla();
      return;
    }

    var b = e.target.closest('.ign[data-id]');
    if (!b) return;
    var id = b.dataset.id, poner = !estado.ignorados[id];
    var prevMarcas = estado.marcas, prevIgnorados = estado.ignorados;

    estado.ignorados = Object.assign({}, estado.ignorados);
    if (poner) estado.ignorados[id] = { fecha:hoy(), por: (CONFIG && CONFIG.quien) || null, motivo:'' };
    else delete estado.ignorados[id];
    avisar('');
    pintarTodo();

    peticion('/api/marcas', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ tipo:'ignorado', id:id, poner:poner }),
    }).then(function(nuevo){
      estado.marcas = nuevo.marcas || {};
      estado.ignorados = nuevo.ignorados || {};
      pintarTodo();
    }).catch(function(err){
      estado.marcas = prevMarcas; estado.ignorados = prevIgnorados;
      avisar('No se pudo guardar la exclusión: ' + err.message + '.');
      pintarTodo();
    });
  });

  tbody.addEventListener('change', function(e){
    var cb = e.target.closest('input[type="checkbox"][data-id]');
    if (!cb) return;
    var id = cb.dataset.id, marcar = cb.checked;
    var prevMarcas = estado.marcas, prevIgnorados = estado.ignorados;

    /* Pintado optimista: esperar la confirmacion del servidor deja la pantalla quieta despues
       del click y eso se lee como que la marca no funciono. Si el guardado falla se revierte
       y se dice por que, en vez de dejar una marca que no existe. */
    estado.marcas = Object.assign({}, estado.marcas);
    if (marcar) estado.marcas[id] = { subidoAMain:true, fecha:hoy(), por: (CONFIG && CONFIG.quien) || null };
    else delete estado.marcas[id];
    avisar('');
    pintarTodo();

    peticion('/api/marcas', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ tipo:'marca', id:id, poner:marcar }),
    }).then(function(nuevo){
      estado.marcas = nuevo.marcas || {};
      estado.ignorados = nuevo.ignorados || {};
      pintarTodo();
    }).catch(function(err){
      estado.marcas = prevMarcas; estado.ignorados = prevIgnorados;
      avisar('No se pudo guardar la marca: ' + err.message + '.');
      pintarTodo();
    });
  });

  /* ---------------- selector de sprint ---------------- */
  function iteracionSeleccionada(){
    var sel = document.getElementById('selSprint');
    if (!sel || !SPRINTS) return null;
    return SPRINTS.iteraciones.find(function(i){ return i.ruta === sel.value; }) || null;
  }

  /* La carpeta derivada solo se acepta si existe de verdad en el repo. Si no, se cae a
     "ninguna": ofrecer una carpeta que no esta creada todavia hace que /api/medir la pida
     igual y reviente, o peor, que compare contra algo que no es lo que el usuario cree. */
  function pintarSelectorCarpeta(){
    var selC = document.getElementById('selCarpeta');
    if (!selC || !SPRINTS) return;
    selC.innerHTML = '<option value="">(ninguna — no comparar contra el repo)</option>' +
      SPRINTS.carpetas.map(function(c){ return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    var it = iteracionSeleccionada();
    var sugerida = it && it.carpeta;
    selC.value = (sugerida && SPRINTS.carpetas.indexOf(sugerida) >= 0) ? sugerida : '';
    pintarAvisoCarpeta();
  }

  /* Sin carpeta seleccionada no hay comparacion contra el repo, sea porque la derivada no
     existe (nota automatica) o porque el usuario eligio "ninguna" a mano (nota generica).
     Las dos son el mismo hecho: la lista que se va a ver no trae desvios de script faltante
     o sobrante, y decirlo es obligatorio, no cosmetico. */
  function pintarAvisoCarpeta(){
    var el = document.getElementById('avisoCarpeta');
    var selC = document.getElementById('selCarpeta');
    if (!el || !selC || !SPRINTS) return;
    if (SPRINTS.nota) { el.textContent = SPRINTS.nota; el.hidden = false; return; }
    if (!selC.value) {
      var it = iteracionSeleccionada();
      var sugerida = it && it.carpeta;
      el.textContent = (sugerida && SPRINTS.carpetas.indexOf(sugerida) < 0)
        ? 'La carpeta ' + sugerida + ' no está en el repo: sin ella no se pueden detectar los desvíos de script faltante o sobrante.'
        : 'Sin carpeta elegida no se compara contra el repo: no se van a detectar desvíos de script faltante o sobrante.';
      el.hidden = false;
      return;
    }
    el.hidden = true; el.textContent = '';
  }

  /* Cambiar el select no cambia lo que ya esta en pantalla — eso solo pasa cuando se vuelve a
     medir. Sin este aviso alguien cambia el sprint, ve la tabla vieja quieta y cree que ya
     esta mirando el nuevo. */
  function pintarAvisoDesfasado(){
    var el = document.getElementById('avisoDesfasado');
    var selS = document.getElementById('selSprint');
    var contenido = document.getElementById('contenido');
    if (!el || !selS) return;
    if (!D || !SPRINTS) { el.hidden = true; contenido.classList.remove('desfasado'); return; }
    var it = iteracionSeleccionada();
    var selC = document.getElementById('selCarpeta');
    var mismoSprint = !D.meta.iteracion || D.meta.iteracion === selS.value;
    var mismaCarpeta = (D.meta.sprint || '') === (selC.value || '');
    if (mismoSprint && mismaCarpeta) { el.hidden = true; contenido.classList.remove('desfasado'); return; }
    var mostrado = D.meta.sprint || D.meta.iteracion || 'un sprint sin identificar';
    var elegido = (it && it.nombre) || selS.value || 'la selección actual';
    document.getElementById('avisoDesfasadoTexto').innerHTML = mismoSprint
      ? 'Cambiaste la carpeta del repo: lo de abajo sigue siendo la medición anterior. <b>Todavía no se midió.</b>'
      : 'Lo de abajo es de <b>' + esc(mostrado) + '</b>. Elegiste <b>' + esc(elegido) + '</b>: todavía no se midió.';
    document.getElementById('medirElegido').textContent = mismoSprint ? 'Medir de nuevo' : 'Medir ' + elegido;
    el.hidden = false;
    contenido.classList.add('desfasado');
  }

  function pintarSelectorSprint(){
    var selS = document.getElementById('selSprint');
    if (!selS || !SPRINTS) return;
    var porAnio = {}, orden = [];
    SPRINTS.iteraciones.forEach(function(it){
      var anio = (it.nombre || '').slice(0, 4);
      if (!porAnio[anio]) { porAnio[anio] = []; orden.push(anio); }
      porAnio[anio].push(it);
    });
    selS.innerHTML = orden.map(function(anio){
      return '<optgroup label="' + esc(anio) + '">' + porAnio[anio].map(function(it){
        return '<option value="' + esc(it.ruta) + '">' + esc(it.nombre) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    var elegida = SPRINTS.actual ? SPRINTS.actual.ruta : (SPRINTS.iteraciones[0] && SPRINTS.iteraciones[0].ruta);
    if (elegida) selS.value = elegida;
    pintarSelectorCarpeta();
    pintarAvisoDesfasado();
  }

  function cargarSprints(){
    return peticion('/api/sprints').then(function(datos){
      SPRINTS = datos;
      pintarSelectorSprint();
    }).catch(function(err){
      avisar('No se pudo cargar la lista de sprints: ' + err.message + '.');
    });
  }

  var selSprint = document.getElementById('selSprint');
  if (selSprint) selSprint.addEventListener('change', function(){
    pintarSelectorCarpeta();
    pintarAvisoDesfasado();
  });
  var selCarpeta = document.getElementById('selCarpeta');
  if (selCarpeta) selCarpeta.addEventListener('change', function(){
    pintarAvisoCarpeta();
    pintarAvisoDesfasado();
  });

  /* ---------------- medir de verdad ---------------- */
  function ejecutarMedicion(boton){
    var original = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Midiendo...';
    avisar('Midiendo: consultando Azure DevOps y las bases de dev y stage. Puede tardar decenas de segundos.');

    /* La carpeta viaja SIEMPRE que el selector cargo, aunque este vacia: vacia significa
       "sin repo", y omitirla hacia que el servidor usara la del .env. Si el selector no cargo
       (Azure no contesto), no se manda y vale lo configurado. */
    var cuerpo = {};
    var elS = document.getElementById('selSprint'), elC = document.getElementById('selCarpeta');
    if (elS && elS.value) cuerpo.iteracion = elS.value;
    if (elC && SPRINTS) cuerpo.sprint = elC.value || null;

    peticion('/api/medir', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cuerpo),
    }).then(function(body){
      D = body.vista;
      estado.marcas = (body.marcas && body.marcas.marcas) || {};
      estado.ignorados = (body.marcas && body.marcas.ignorados) || {};
      mostrarContenido();
      refrescarConD();
      pintarAvisoDesfasado();
      avisar((body.avisos && body.avisos.length) ? body.avisos.join(' ') : '');
    }).catch(function(err){
      avisar('No se pudo medir: ' + err.message + '.');
    }).then(function(){
      boton.disabled = false;
      boton.textContent = original;
    });
  }

  document.getElementById('medirAhora').addEventListener('click', function(){ ejecutarMedicion(this); });
  document.getElementById('medirElegido').addEventListener('click', function(){ ejecutarMedicion(this); });
  var btnRecargar = document.getElementById('recargar');
  if (btnRecargar) btnRecargar.addEventListener('click', function(){ ejecutarMedicion(this); });

  /* ---------------- modo claro / oscuro ---------------- */
  /* Sin eleccion guardada sigue al sistema operativo, y cambia en vivo si el sistema cambia.
     El boton dice a donde LLEVA, no donde estas: "Modo oscuro" se lee como una accion. */
  var consultaOscuro = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function prefiereOscuro(){ return !!(consultaOscuro && consultaOscuro.matches); }
  function pintarBotonTema(){
    var tema = temaEfectivo(leerPrefStr('deployboard.tema', null), prefiereOscuro());
    var b = document.getElementById('tema');
    b.textContent = tema === 'dark' ? '☀ Modo claro' : '☾ Modo oscuro';
  }
  document.getElementById('tema').addEventListener('click', function(){
    var nuevo = temaAlternado(temaEfectivo(leerPrefStr('deployboard.tema', null), prefiereOscuro()));
    guardarPrefStr('deployboard.tema', nuevo);
    document.documentElement.setAttribute('data-theme', nuevo);
    pintarBotonTema();
  });
  if (consultaOscuro && consultaOscuro.addEventListener) consultaOscuro.addEventListener('change', pintarBotonTema);
  pintarBotonTema();

  /* ---------------- actualizar el sistema (git) ---------------- */
  function pintarActualizacion(info){
    var caja = document.getElementById('actualizacion');
    var texto = document.getElementById('actualizacionTexto');
    var boton = document.getElementById('actualizarSistema');
    if (info.nota) {
      texto.textContent = info.nota;
      boton.hidden = true;
      caja.hidden = false;
      return;
    }
    if (!info.hayCambios) { caja.hidden = true; return; }
    var msg = 'Hay una versión nueva del sistema (' + info.detras + (info.detras === 1 ? ' cambio' : ' cambios') + ')';
    if (info.adelante > 0) msg += ' · esta copia tiene cambios locales: el update va a fallar hasta que los resuelvas.';
    texto.textContent = msg;
    boton.hidden = false;
    boton.disabled = false;
    boton.textContent = 'Actualizar sistema';
    caja.hidden = false;
  }

  function cargarActualizaciones(){
    peticion('/api/actualizaciones').then(pintarActualizacion).catch(function(){});
  }

  function esperarReinicio(){
    var texto = document.getElementById('actualizacionTexto');
    var inicio = Date.now();
    var intervalo = setInterval(function(){
      if (Date.now() - inicio > 60000) {
        clearInterval(intervalo);
        texto.textContent = 'El sistema no volvió solo: cerrá y abrí de nuevo desde el Escritorio.';
        return;
      }
      fetch('/api/ping').then(function(r){
        if (r.ok) { clearInterval(intervalo); location.reload(); }
      }).catch(function(){ /* todavia apagado: se sigue esperando */ });
    }, 1000);
  }

  document.getElementById('actualizarSistema').addEventListener('click', function(){
    var b = this;
    var texto = document.getElementById('actualizacionTexto');
    b.disabled = true;
    peticion('/api/actualizar', { method:'POST' }).then(function(res){
      if (res.reiniciar) {
        texto.textContent = 'Actualizando y reiniciando…';
        b.hidden = true;
        esperarReinicio();
      } else {
        texto.textContent = res.mensaje || 'Ya estaba al día.';
        b.hidden = true;
      }
    }).catch(function(err){
      avisar('No se pudo actualizar: ' + err.message + '.');
      b.disabled = false;
    });
  });

  /* ---------------- carga inicial ---------------- */
  function cargar(){
    Promise.all([ peticion('/api/vista'), peticion('/api/config') ]).then(function(res){
      var vistaResp = res[0]; CONFIG = res[1];
      pintarPie();
      if (vistaResp.nuncaSeMidio) { mostrarVacio(); return; }
      D = vistaResp.vista;
      estado.marcas = (vistaResp.marcas && vistaResp.marcas.marcas) || {};
      estado.ignorados = (vistaResp.marcas && vistaResp.marcas.ignorados) || {};
      mostrarContenido();
      refrescarConD();
      pintarAvisoDesfasado();
    }).catch(function(err){
      avisar('No se pudo cargar la pantalla: ' + err.message + '.');
    });
  }

  cargar();
  cargarActualizaciones();
  cargarSprints();
})();
