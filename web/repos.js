(function(){
  'use strict';

  /* ---------------- pestañas ---------------- */
  var CLAVE_TAB = 'deployboard.tab';
  function leerTab(){ try { return localStorage.getItem(CLAVE_TAB) || 'scripts'; } catch(e){ return 'scripts'; } }
  function guardarTab(v){ try { localStorage.setItem(CLAVE_TAB, v); } catch(e){} }

  function mostrarTab(t){
    var tabs = document.querySelectorAll('.tab');
    Array.prototype.forEach.call(tabs, function(b){ b.setAttribute('aria-selected', String(b.dataset.tab === t)); });
    document.getElementById('tabScripts').hidden = t !== 'scripts';
    document.getElementById('tabRepos').hidden = t !== 'repos';
    guardarTab(t);
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(b){
    b.addEventListener('click', function(){ mostrarTab(b.dataset.tab); });
  });
  mostrarTab(leerTab() === 'repos' ? 'repos' : 'scripts');

  /* ---------------- pestaña Repos ---------------- */
  var NOMBRE_PAR = { 'dev-stage':'dev → stage', 'stage-main':'stage → main', 'stage-dev':'stage → dev' };
  var TITULO_PAR = { 'dev-stage':'DevToStage', 'stage-main':'StageToMain', 'stage-dev':'StageToDev' };
  var MEDIDO = null;           /* { par, medido, repos } de la ultima medicion */
  var CONFIRMANDO = null;      /* repo con la confirmacion abierta */
  var CREANDO = null;          /* repo con el pedido de creacion en vuelo */
  var EN_LOTE = null;          /* { repo: true } de "Crear todos" que todavia no terminaron */

  var selPar = document.getElementById('selPar');
  var btnMedir = document.getElementById('medirRepos');

  function pedir(url, cuerpo){
    return fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cuerpo) })
      .then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(b){
          if (!r.ok) { var e = new Error(b.error || ('Error ' + r.status)); e.body = b; throw e; }
          return b;
        });
      });
  }

  function avisarRepos(t){ var a = document.getElementById('reposAviso'); a.textContent = t || ''; a.hidden = !t; }

  /* La tabla es de UN par. Si el select cambio despues de medir, crear con esa tabla seria crear
     el pase equivocado: los botones se apagan hasta medir de nuevo. */
  function tablaVigente(){ return MEDIDO && MEDIDO.par === selPar.value; }

  function celdaAccion(f){
    if (f.error) return '';
    if (f.prActivo) return '<a href="' + esc(f.prActivo.link) + '" target="_blank" rel="noopener">Abrir PR #' + esc(String(f.prActivo.id)) + '</a>';
    if (!f.pendientes) return '';
    if (CREANDO === f.repo || (EN_LOTE && EN_LOTE[f.repo])) return '<span class="sub">Creando…</span>';
    var off = tablaVigente() && !EN_LOTE ? '' : ' disabled';
    if (CONFIRMANDO === f.repo) {
      return '<span class="sub">¿Crear ' + esc(TITULO_PAR[MEDIDO.par]) + ' (' + esc(f.ramas.origen) + ' → ' + esc(f.ramas.destino) + ')?</span> ' +
        '<button type="button" class="btn-actualizar" data-crear="' + esc(f.repo) + '"' + off + '>Crear</button> ' +
        '<button type="button" class="btn-secundario" data-cancelar="1">Cancelar</button>';
    }
    return '<button type="button" class="btn-secundario" data-confirmar="' + esc(f.repo) + '"' + off + '>Crear PR</button>';
  }

  function filaHtml(f){
    var ramas = f.ramas ? '<span class="mono">' + esc(f.ramas.origen) + ' → ' + esc(f.ramas.destino) + '</span>' : '';
    var ultimo = f.ultimo
      ? esc(f.ultimo.mensaje) + '<div class="sub">' + esc(f.ultimo.autor || '?') + ' · ' + esc(f.ultimo.fecha || '') + '</div>'
      : '';
    var pr = f.prActivo ? '#' + esc(String(f.prActivo.id)) + (f.prActivo.titulo ? ' · ' + esc(f.prActivo.titulo) : '') : '';
    var pend = f.error ? '<span class="err">' + esc(f.error) + '</span>' : String(f.pendientes);
    return '<tr><td>' + esc(f.repo) + '</td><td>' + ramas + '</td><td class="' + (f.error ? '' : 'num') + '">' + pend +
      '</td><td>' + ultimo + '</td><td>' + pr + '</td><td class="acc">' + celdaAccion(f) + '</td></tr>';
  }

  function pintarRepos(){
    if (!MEDIDO) return;
    var conAlgo = MEDIDO.repos.filter(function(f){ return f.error || f.pendientes > 0 || f.prActivo; });
    var sinCambios = MEDIDO.repos.filter(function(f){ return !f.error && !f.pendientes && !f.prActivo; });
    document.getElementById('reposMedido').textContent =
      NOMBRE_PAR[MEDIDO.par] + ' · medido ' + new Date(MEDIDO.medido).toLocaleTimeString() + ' · ' + MEDIDO.repos.length + ' repos';
    document.getElementById('reposTablaWrap').hidden = !conAlgo.length;
    document.getElementById('reposFilas').innerHTML = conAlgo.map(filaHtml).join('');
    document.getElementById('reposSinCambios').hidden = !sinCambios.length;
    document.getElementById('reposSinCambiosCuenta').textContent = String(sinCambios.length);
    document.getElementById('reposSinCambiosLista').innerHTML = sinCambios.map(function(f){
      return '<li><span>' + esc(f.repo) + '</span><span class="mono sub">' + esc(f.ramas.origen) + ' → ' + esc(f.ramas.destino) + '</span></li>';
    }).join('');
    if (!tablaVigente()) avisarRepos('La tabla es de ' + NOMBRE_PAR[MEDIDO.par] + ': medí ' + NOMBRE_PAR[selPar.value] + ' para crear esos PRs.');
    else if (!conAlgo.length) avisarRepos('Ningún repo tiene cambios para ' + NOMBRE_PAR[MEDIDO.par] + '.');
    else avisarRepos('');
    pintarCrearTodos();
  }

  btnMedir.addEventListener('click', function(){
    var par = selPar.value;
    btnMedir.disabled = true; btnMedir.textContent = 'Midiendo...';
    avisarRepos('Leyendo los repos del proyecto en Azure DevOps…');
    CONFIRMANDO = null;
    pedir('/api/repos/medir', { par: par }).then(function(b){
      MEDIDO = b; pintarRepos();
    }).catch(function(e){
      avisarRepos('No se pudo medir: ' + e.message);
    }).then(function(){
      btnMedir.disabled = false; btnMedir.textContent = 'Medir';
    });
  });

  selPar.addEventListener('change', function(){ CONFIRMANDO = null; pintarRepos(); });

  document.getElementById('reposFilas').addEventListener('click', function(ev){
    var b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.confirmar) { CONFIRMANDO = b.dataset.confirmar; pintarRepos(); return; }
    if (b.dataset.cancelar) { CONFIRMANDO = null; pintarRepos(); return; }
    if (b.dataset.crear) crear(b.dataset.crear);
  });

  function crear(repo){
    if (!tablaVigente()) return;
    var par = MEDIDO.par;
    /* La pestaña se abre YA, en el click: abrirla despues del pedido la frena el bloqueador de
       ventanas emergentes. Se redirige cuando llega el link; si falla, se cierra. */
    var ventana = window.open('about:blank', '_blank');
    CONFIRMANDO = null; CREANDO = repo; pintarRepos();
    var mensaje = '';
    pedir('/api/repos/crear-pr', { repo: repo, par: par }).then(function(r){
      if (ventana) ventana.location.href = r.link;
      var f = MEDIDO.repos.filter(function(x){ return x.repo === repo; })[0];
      if (f) f.prActivo = { id: r.id, titulo: r.titulo, link: r.link };
      mensaje = 'Creado ' + r.titulo + ' en ' + repo + (ventana ? '.' : ': ' + r.link);
    }).catch(function(e){
      var link = e.body && e.body.link;
      if (ventana) { if (link) ventana.location.href = link; else ventana.close(); }
      if (link) {
        var f = MEDIDO.repos.filter(function(x){ return x.repo === repo; })[0];
        if (f) f.prActivo = { id: Number(String(link).split('/').pop()), titulo: null, link: link };
      }
      mensaje = 'No se creó el PR en ' + repo + ': ' + e.message;
    }).then(function(){
      CREANDO = null; pintarRepos(); avisarRepos(mensaje);
    });
  }

  /* ---------------- crear todos ---------------- */
  var btnTodos = document.getElementById('crearTodos');
  var cajaConfirmar = document.getElementById('confirmarTodos');

  function pintarCrearTodos(){
    var lista = reposParaCrear(MEDIDO, selPar.value);
    btnTodos.hidden = !lista.length && !EN_LOTE;
    btnTodos.disabled = !!EN_LOTE || CREANDO != null;
    btnTodos.textContent = EN_LOTE ? 'Creando…' : 'Crear todos (' + lista.length + ')';
  }

  btnTodos.addEventListener('click', function(){
    var lista = reposParaCrear(MEDIDO, selPar.value);
    if (!lista.length) return;
    cajaConfirmar.innerHTML = '¿Crear ' + esc(TITULO_PAR[MEDIDO.par]) + ' en ' + lista.length + ' repos? ' +
      '<span class="mono">' + lista.map(esc).join(' · ') + '</span>' +
      '<div class="acciones"><button type="button" class="btn-actualizar" id="crearTodosSi">Crear ' + lista.length + ' PRs</button>' +
      '<button type="button" class="btn-secundario" id="crearTodosNo">Cancelar</button></div>';
    cajaConfirmar.hidden = false;
  });

  cajaConfirmar.addEventListener('click', function(ev){
    var b = ev.target.closest('button');
    if (!b) return;
    cajaConfirmar.hidden = true;
    if (b.id === 'crearTodosSi') crearTodos();
  });

  function pintarLinks(items){
    var ul = document.getElementById('reposLinks');
    ul.hidden = !items.length;
    ul.innerHTML = items.map(function(r){
      return '<li><span>' + esc(r.repo) + '</span><a href="' + esc(r.link) + '" target="_blank" rel="noopener">Abrir PR</a></li>';
    }).join('');
  }

  function crearTodos(){
    if (!tablaVigente()) return;
    var par = MEDIDO.par;
    var lista = reposParaCrear(MEDIDO, par);
    if (!lista.length) return;
    /* Las pestañas se abren TODAS en este click: despues de un await el navegador las bloquea.
       Chrome suele dejar una sola por click; las que vuelvan null se ofrecen como links. */
    var ventanas = {};
    lista.forEach(function(repo){ ventanas[repo] = window.open('about:blank', '_blank'); });
    EN_LOTE = {}; lista.forEach(function(repo){ EN_LOTE[repo] = true; });
    btnMedir.disabled = true;
    pintarLinks([]);
    avisarRepos('Creando ' + lista.length + ' PRs de a uno…');
    pintarRepos();

    crearEnSerie(lista, function(repo){
      return pedir('/api/repos/crear-pr', { repo: repo, par: par });
    }, function(res){
      delete EN_LOTE[res.repo];
      var f = MEDIDO.repos.filter(function(x){ return x.repo === res.repo; })[0];
      if (f && res.link) f.prActivo = { id: Number(String(res.link).split('/').pop()), titulo: TITULO_PAR[par], link: res.link };
      var v = ventanas[res.repo];
      if (v) { if (res.link) v.location.href = res.link; else v.close(); }
      pintarRepos();
    }).then(function(res){
      EN_LOTE = null;
      btnMedir.disabled = false;
      var ok = res.filter(function(r){ return r.ok; });
      var mal = res.filter(function(r){ return !r.ok; });
      var bloqueadas = res.filter(function(r){ return r.link && !ventanas[r.repo]; });
      var texto = 'Creados ' + ok.length + ' de ' + res.length + '.';
      if (mal.length) texto += ' No se crearon: ' + mal.map(function(r){ return r.repo + ' (' + r.error + ')'; }).join('; ') + '.';
      if (bloqueadas.length) texto += ' El navegador bloqueó ' + bloqueadas.length + ' pestañas: abrilas desde la lista, o permití ventanas emergentes para este panel.';
      pintarRepos();
      avisarRepos(texto);
      pintarLinks(bloqueadas);
    });
  }
})();
