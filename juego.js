'use strict';
/* =====================================================================
   HORINSA · Fase 2: el día de trabajo
   Simulación (reloj, camiones, planta, pedidos, personal, caja).
   El dibujado va aparte (gancho al final) para poder pasar a 3D sin
   tocar la lógica.
   ===================================================================== */
const MIN_POR_SEG = 2;                 // minutos de juego por segundo real a ×1
// La jornada normal es 07:30-15:30; si hay obras a las 07:00, ese día se entra antes
let INICIO = 7*60+30, FIN = 15*60+30, CORTE = 19*60+30, ULT_LLAMADA = 14*60;
const HORA_TEMPRANO = 7*60;
const PRECIO = { cemento:130, aridoAlquilada:9, aridoPropia:3, gasoil:.45, cisterna:25, tolva:18000, acopios:25000, cantera:250000, hormigonera:95000 };
const CAP = { hormigonera:8, banera:25, cisterna:25, asfaltera:24 };
const VELOC = { hormigonera:50, banera:50, cisterna:50, asfaltera:52 };   // km/h
const TIPOS_H = { 'HM-20':{cem:.25,extra:0}, 'HA-25':{cem:.30,extra:6}, 'HA-30':{cem:.34,extra:12}, 'HA-35':{cem:.38,extra:22} };
const ARIDO_M3 = 1.9;      // t de áridos por m³
const DESCARGA_MIN_M3 = 2.5;
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const ROLES = { chofer:'Chófer', planta:'Operario/a de planta', oficina:'Oficina', mecanico:'Mecánico/a', peon:'Peón de limpieza y mantenimiento' };
/* ----------------- Orden, prevención y carrera profesional ----------------- */
const CATS = ['Ayudante','Oficial 2ª','Oficial 1ª','Encargado/a'];
const XP_ASCENSO = [20, 50];                 // días trabajados para pasar a Oficial 2ª y a Oficial 1ª
const XP_ENCARGADO = 80;
const EPI = { nombres:['Básico','Estándar','Completo','Premium'], mejora:[0,1500,3500], renovar:[40,60,85,120], riesgo:[1.6,1,.7,.5] };
const LIMPIEZA_EXT = 600, RECICLADORA = 28000;
const MAX_MECANICOS = 3, COSTE_MECANICO = 1500;

/* ---------------------------- Progresión ---------------------------- */
// XP: 1 por m³ servido + extra por obra a tiempo y por licitaciones
const NIVEL_XP = [0, 250, 700, 1400, 2500, 4000, 6000, 8500, 11500, 15000];
const DESBLOQ = { acopios:2, hormigonera:2, mecanico:2, tolva4:2, lab1:3, licitaciones:3, mejMaq:3, tolva5:4, cantera:4, silo2:4, linea2:5, lab2:5, ampliarCantera:6, lab3:7, asfalto:7, planta2:8, rivales:9, islas:10 };
const NOMBRE_DESBLOQ = { acopios:'Ampliar acopios', hormigonera:'Más hormigoneras', mecanico:'Contratar mecánicos', tolva4:'4ª tolva', lab1:'Laboratorio', licitaciones:'Licitaciones públicas', mejMaq:'Mejoras de maquinaria', tolva5:'5ª tolva', cantera:'Comprar la cantera', silo2:'Segundo silo', linea2:'Segunda línea de producción', lab2:'Laboratorio nivel 2 (HA-35)', ampliarCantera:'Ampliar la cantera', lab3:'Laboratorio nivel 3', asfalto:'Planta de asfalto', planta2:'Segunda planta en la isla', rivales:'Comprar a la competencia', islas:'Plantas en otras islas' };
const PRECIO_EXTRA = { linea2:120000, silo2:30000, ampliarCantera:90000, lab:[35000, 30000, 45000] };
const ORGANISMOS = [['Cabildo de Lanzarote',null],['Ayuntamiento de Arrecife','Arrecife'],['Ayuntamiento de Teguise','Teguise'],['Ayuntamiento de Tías','Tías'],['Ayuntamiento de Yaiza','Yaiza'],['Ayuntamiento de San Bartolomé','San Bartolomé'],['Ayuntamiento de Tinajo','Tinajo'],['Ayuntamiento de Haría','Haría'],['Gobierno de Canarias',null]];
const OBRAS_PUB = ['Paseo marítimo','Rotonda y accesos','Colegio nuevo','Centro de salud','Polideportivo','Viviendas públicas','Depuradora','Muro de escollera','Carril bici'];
const RIVALES = { L:{n:'L',col:'#1f5fbf',agresivo:.9,fuerza:.36,precio:900000}, HC:{n:'HC',col:'#1d8a4a',agresivo:.94,fuerza:.28,precio:650000}, T:{n:'T',col:'#7a3db8',agresivo:.97,fuerza:.22,precio:450000} };
const SUELDO_ROL = { chofer:95, planta:90, oficina:85, mecanico:100, peon:78 };

/* -------------------------- Grupo HORINSA -------------------------- */
// Delegaciones: se gestionan de forma resumida (resultado diario, inversión, incidencias)
const DELEG = {
  sur:{n:'HORINSA Sur · Playa Blanca',isla:'Lanzarote',req:'planta2',coste:380000,base:950,la:28.8765,lo:-13.8060,cuota:.05},
  fv:{n:'HORINSA Fuerteventura · Puerto del Rosario',isla:'Fuerteventura',req:'islas',coste:600000,base:1500},
  gc:{n:'HORINSA Gran Canaria · Arinaga',isla:'Gran Canaria',req:'islas',coste:1200000,base:2900},
  tf:{n:'HORINSA Tenerife · Granadilla',isla:'Tenerife',req:'islas',coste:1300000,base:3100}
};
function abrirDelegacion(k){
  const D=DELEG[k];if(!D||J.deleg[k])return;
  if(!puede(D.req)){toast(`🔒 Se desbloquea en el nivel ${DESBLOQ[D.req]}.`,'mal');return}
  if(J.caja<D.coste){toast('💸 No hay caja suficiente.','mal');return}
  J.caja-=D.coste;J.deleg[k]={inv:1,dias:0,acum:0,ultimo:0};
  toast(`🏗️ ¡Abrimos ${D.n}! Los primeros días son de arranque.`,'bien');ganarXP(100);guardar();pintarUI(true);
}
function invertirDelegacion(k){
  const d=J.deleg[k],D=DELEG[k];if(!d||d.inv>=5)return;const c=Math.round(D.coste*.25*d.inv);
  if(J.caja<c){toast('💸 No hay caja suficiente.','mal');return}
  J.caja-=c;d.inv++;toast(`📈 ${D.n} sube a nivel de inversión ${d.inv} (más camiones, tolvas y personal).`,'bien');guardar();pintarUI(true);
}
// resultado diario de cada delegación (se llama al cerrar el día)
function resultadosDelegaciones(eventos){
  let total=0;
  for(const k in J.deleg){
    const d=J.deleg[k],D=DELEG[k];d.dias++;
    let r=D.base*(.6+.25*d.inv)*(.7+rnd()*.6)*(.8+J.rep/250)-D.base*.35;
    if(d.dias<=5)r*=.4;
    const e=rnd();
    if(e<.05){r-=D.base*.8;eventos.push(`🔧 ${esc(D.n)}: avería grave en la planta (resultado del día ${fmtE(r)}).`)}
    else if(e<.09){r+=D.base*1.5;eventos.push(`🏗️ ${esc(D.n)}: ¡gran obra servida! (+${fmtE(D.base*1.5)}).`)}
    else if(e<.11){r=-D.base*.4;eventos.push(`✊ ${esc(D.n)}: huelga en la delegación.`)}
    d.ultimo=Math.round(r);d.acum+=d.ultimo;total+=d.ultimo;
  }
  J.caja+=total;return total;
}

/* ------------------------------ Asfalto ------------------------------ */
const ASF = { cap:24, ritmo:120, betun:550, descargaMinT:.6, enfria:75, planta:250000, camion:85000, capBetun:60,
  tipos:{ 'AC16 surf':{bet:.052,extra:0}, 'AC22 bin':{bet:.045,extra:-5} } };
const CLI_ASF = { nombres:['Cabildo · Carreteras','Ayto. de Arrecife · Vías y Obras','Ayto. de Tías · Asfaltado','Urbanización Las Coloradas','Polígono de Argana','Asfaltados del Rubicón (subcontrata)','Ayto. de Teguise · Caminos'],
  obras:['Asfaltado de calles','Capa de rodadura','Bacheo de carretera','Aparcamiento nuevo','Camino rural','Rotonda nueva'], t:[48,216], precio:84 };
const NOMBRES = ['Airam','Jonay','Acoraida','Dácil','Benito','Chano','Nayra','Tito','Yurena','Echedey','Guacimara','Fefo','Mayte','Domingo'];

// Cursos de formación: el trabajador falta esos días (pagados) y vuelve mejorado
const CURSOS = {
  // horas: curso corto a primera hora del día siguiente (luego se incorpora); dias: cursos caros de día(s) entero(s)
  eficiente:  { n:'Conducción eficiente', rol:'chofer', horas:3, coste:600, d:'+8 % de velocidad media y −10 % de gasoil en su camión.' },
  avanzada:   { n:'Hormigonera avanzada', rol:'chofer', dias:1, coste:900, d:'Descarga un 25 % más rápido y +5 % de velocidad.', req:'eficiente' },
  cap:        { n:'CAP y seguridad vial', rol:'chofer', horas:3, coste:500, d:'Su camión se desgasta un 25 % menos y se avería menos.' },
  operador:   { n:'Operador de planta avanzado', rol:'planta', dias:1, coste:900, d:'+15 % de producción en la línea.' },
  calidad:    { n:'Control de calidad y fórmulas', rol:'planta', dias:2, coste:1200, d:'−6 % de cemento por m³ con la misma resistencia.' },
  negociacion:{ n:'Negociación comercial', rol:'oficina', horas:3, coste:800, d:'+4 €/m³ en las ofertas y permite REGATEAR cada llamada.' },
  clientes:   { n:'Atención al cliente', rol:'oficina', horas:2, coste:500, d:'Los clientes esperan 70 min en vez de 40 y llaman más a menudo.' },
  compras:    { n:'Compras y proveedores', rol:'oficina', dias:1, coste:900, d:'El cemento sale un 8 % más barato.' },
  mec2:       { n:'Mecánica avanzada (nivel 2)', rol:'mecanico', dias:1, coste:1000, d:'Repara e instala un 25 % más rápido.' },
  mec3:       { n:'Hidráulica y electrónica (nivel 3)', rol:'mecanico', dias:2, coste:1500, d:'Repara e instala un 55 % más rápido.', req:'mec2' },
  bienestar:  { n:'Prevención y bienestar', rol:'*', horas:2, coste:400, d:'+15 de contento y las horas extra le queman un 25 % menos.' },
  prl:        { n:'Prevención de riesgos laborales (PRL)', rol:'*', horas:2.5, coste:300, d:'−40 % de riesgo de accidente. Las inspecciones lo exigen.' }
};
const durCurso = C => C.horas ? `${String(C.horas).replace('.',',')} h a primera hora` : `${C.dias} día${C.dias>1?'s':''} fuera del trabajo`;
// Mejoras de maquinaria: las instala un mecánico propio
const MEJORAS_MAQ = {
  automatizacion:{ n:'Automatizar la dosificación', d:'+15 % de producción en la línea.', coste:12000, horas:6 },
  rascadores:    { n:'Rascadores y limpieza de cintas', d:'La planta se desgasta un 40 % menos.', coste:4000, horas:3 },
  consumo:       { n:'Kit de bajo consumo en la flota', d:'−15 % de gasoil en todos los camiones.', coste:6000, horas:5 },
  neumaticos:    { n:'Neumáticos y frenos reforzados', d:'Los camiones se desgastan un 35 % menos.', coste:5000, horas:4 },
  cuba9:         { n:'Cubas de 9 m³', d:'Cada hormigonera lleva 9 m³ en vez de 8.', coste:14000, horas:8 },
  machacadora:   { n:'Machacadora nueva en la cantera', d:'La bañera carga en 7 min y la cantera se avería menos.', coste:20000, horas:8, req:'cantera' }
};

const fmtE = n => (n<0?'−':'') + Math.abs(Math.round(n)).toLocaleString('es-ES') + ' €';
const fmtH = m => { m = Math.max(0, Math.floor(m)); return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); };
const rnd = Math.random, pick = a => a[Math.floor(rnd()*a.length)], rint = (a,b) => a + Math.floor(rnd()*(b-a+1));
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $ = id => document.getElementById(id);

/* ------------------------- Red de carreteras ------------------------- */
let RED = null, ARB = null, SIT = null;

function densificar(k){            // mismos puntos que la curva que se dibuja
  if (k.osm) return k;              // las vías reales ya vienen con todos sus puntos
  if (k.length < 3) return k.slice();
  const out = [k[0]]; let S = k[0];
  for (let i = 1; i < k.length-1; i++){
    const C = k[i], E = [(k[i][0]+k[i+1][0])/2, (k[i][1]+k[i+1][1])/2];
    for (let j = 1; j <= 6; j++){ const t=j/6, a=(1-t)*(1-t), b=2*(1-t)*t, c=t*t; out.push([a*S[0]+b*C[0]+c*E[0], a*S[1]+b*C[1]+c*E[1]]); }
    S = E;
  }
  out.push(k[k.length-1]); return out;
}
function construirRed(){
  const N=[], ADJ=[], VIA=[], grid=new Map(), G=.04;
  const nodo=(x,y,r)=>{const gx=Math.floor(x/G),gy=Math.floor(y/G),tol=CARRETERAS[r].osm?.002:.03;
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const L=grid.get((gx+a)+','+(gy+b));if(L)for(const i of L)if(Math.hypot(N[i][0]-x,N[i][1]-y)<tol){VIA[i].add(r);return i}}
    const i=N.length;N.push([x,y]);ADJ.push([]);VIA.push(new Set([r]));const kk=gx+','+gy;if(!grid.has(kk))grid.set(kk,[]);grid.get(kk).push(i);return i};
  const arista=(a,b)=>{if(a===b||ADJ[a].some(e=>e[0]===b))return;const d=Math.hypot(N[a][0]-N[b][0],N[a][1]-N[b][1]);ADJ[a].push([b,d]);ADJ[b].push([a,d])};
  const ext=[];
  CARRETERAS.forEach((r,ri)=>{const pts=densificar(r.k);let prev=-1,first=-1;for(const p of pts){const i=nodo(p[0],p[1],ri);if(prev>=0)arista(prev,i);else first=i;prev=i}if(!r.osm)ext.push([first,ri],[prev,ri])});
  // cruces en T: el extremo de una carretera se une al punto más cercano de otra
  for(const[i]of ext){const mejor=new Map();
    for(let j=0;j<N.length;j++){if(j===i)continue;const d=Math.hypot(N[j][0]-N[i][0],N[j][1]-N[i][1]);if(d>=.6)continue;
      for(const r of VIA[j]){if(VIA[i].has(r))continue;const m=mejor.get(r);if(!m||d<m[1])mejor.set(r,[j,d])}}
    for(const[j]of mejor.values())arista(i,j)}
  // cruces en X: dos carreteras que se cortan quedan unidas en el cruce
  const segs=[];CARRETERAS.forEach((r,ri)=>{if(r.t==='pista'||r.osm)return;const pts=densificar(r.k);for(let k=1;k<pts.length;k++)segs.push([pts[k-1],pts[k],ri])});
  const corta=(a,b,c,d)=>{const r1=b[0]-a[0],r2=b[1]-a[1],s1=d[0]-c[0],s2=d[1]-c[1],den=r1*s2-r2*s1;if(Math.abs(den)<1e-12)return null;
    const t=((c[0]-a[0])*s2-(c[1]-a[1])*s1)/den,u=((c[0]-a[0])*r2-(c[1]-a[1])*r1)/den;return t>0&&t<1&&u>0&&u<1?[a[0]+t*r1,a[1]+t*r2]:null};
  for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){const A=segs[i],B=segs[j];if(A[2]===B[2])continue;
    if(Math.max(A[0][0],A[1][0])<Math.min(B[0][0],B[1][0])||Math.max(B[0][0],B[1][0])<Math.min(A[0][0],A[1][0])||Math.max(A[0][1],A[1][1])<Math.min(B[0][1],B[1][1])||Math.max(B[0][1],B[1][1])<Math.min(A[0][1],A[1][1]))continue;
    const X=corta(A[0],A[1],B[0],B[1]);if(!X)continue;
    const near=(s)=>{const a=nodo(s[0][0],s[0][1],s[2]),b=nodo(s[1][0],s[1][1],s[2]);return Math.hypot(N[a][0]-X[0],N[a][1]-X[1])<Math.hypot(N[b][0]-X[0],N[b][1]-X[1])?a:b};
    arista(near(A),near(B))}
  RED={N,ADJ};
}
function nodoCercano(x,y){let b=-1,bd=1e9;for(let i=0;i<RED.N.length;i++){const d=(RED.N[i][0]-x)**2+(RED.N[i][1]-y)**2;if(d<bd){bd=d;b=i}}return b}
function dijkstra(src){
  const n=RED.N.length,dist=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1);dist[src]=0;
  const h=[[0,src]];
  const push=e=>{h.push(e);let i=h.length-1;while(i>0){const p=(i-1)>>1;if(h[p][0]<=h[i][0])break;[h[p],h[i]]=[h[i],h[p]];i=p}};
  const pop=()=>{const t=h[0],l=h.pop();if(h.length){h[0]=l;let i=0;for(;;){const a=2*i+1,b=a+1;let m=i;if(a<h.length&&h[a][0]<h[m][0])m=a;if(b<h.length&&h[b][0]<h[m][0])m=b;if(m===i)break;[h[m],h[i]]=[h[i],h[m]];i=m}}return t};
  while(h.length){const[d,u]=pop();if(d>dist[u])continue;for(const[v,w]of RED.ADJ[u]){const nd=d+w;if(nd<dist[v]){dist[v]=nd;prev[v]=u;push([nd,v])}}}
  return{dist,prev};
}
function hacerRuta(pts){const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return{pts,cum,len:cum[cum.length-1],d:0}}
function invertir(r){return hacerRuta(r.pts.slice().reverse())}
// Dentro de la planta (metros del modelo ×1,6): torre de carga → patio → puerta de entrada
const PLANTA_LOCAL = { torre:[39,-22], patio:[62,20], puerta:[42,64] };
const enPlanta = ([lx,ly]) => [SIT.planta.x+lx*.0016, SIT.planta.y+ly*.0016];
function rutaDesdePlanta(x,y,n){const ns=[];for(let u=n;u>=0;u=ARB.prev[u])ns.push(u);ns.reverse();
  return hacerRuta([enPlanta(PLANTA_LOCAL.torre),enPlanta(PLANTA_LOCAL.patio),enPlanta(PLANTA_LOCAL.puerta),...ns.map(i=>RED.N[i]),[x,y]])}
function kmDesdePlanta(x,y,n){return ARB.dist[n]+Math.hypot(RED.N[n][0]-x,RED.N[n][1]-y)+SIT.planta.acc}
function posRuta(r){let lo=0,hi=r.cum.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(r.cum[m]<=r.d)lo=m;else hi=m}
  const a=r.pts[lo],b=r.pts[hi],L=(r.cum[hi]-r.cum[lo])||1e-9,t=Math.min(1,Math.max(0,(r.d-r.cum[lo])/L));return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,Math.atan2(b[1]-a[1],b[0]-a[0])]}

function prepararSitios(){
  const sit=(la,lo)=>{const[x,y]=P(la,lo);const n=nodoCercano(x,y);return{x,y,n,acc:Math.hypot(RED.N[n][0]-x,RED.N[n][1]-y)}};
  const ce=MARCAS.find(m=>m.t==='ce')||{la:28.97816,lo:-13.515};
  SIT={planta:sit(HORINSA.planta.la,HORINSA.planta.lo),cantera:sit(HORINSA.cantera.la,HORINSA.cantera.lo),puerto:sit(ce.la,ce.lo)};
  ARB=dijkstra(SIT.planta.n);
  SIT.rutaCantera=rutaDesdePlanta(SIT.cantera.x,SIT.cantera.y,SIT.cantera.n);
  SIT.rutaPuerto=rutaDesdePlanta(SIT.puerto.x,SIT.puerto.y,SIT.puerto.n);
}

/* ------------------------------ Partida ------------------------------ */
let J = null;         // estado guardable
let R = null;         // estado del día (no se guarda)
let ultUI = 0, tAnt = performance.now(), pestana = 'llamadas', avisos = {}, cursosAbiertos = null, mercadoAbierto = false, ultimoHTML = '', seguido = null;
const llamadasVistas = new Set();

function partidaNueva(){
  return { v:1, fecha:'2027-01-04', nDia:1, caja:60000, rep:50, tolvas:3, canteraPropia:false,
    capAcopio:400, acopio:220, capSilo:60, silo:35, autoCemento:true, seq:0, sigCamion:3,
    personal:[
      {id:'s1',nombre:'Juanma',rol:'chofer',salario:95,contento:80,baja:0,extraHoy:0,extraTotal:0},
      {id:'s2',nombre:'Yeray',rol:'chofer',salario:95,contento:75,baja:0,extraHoy:0,extraTotal:0},
      {id:'s3',nombre:'Óscar',rol:'chofer',salario:92,contento:78,baja:0,extraHoy:0,extraTotal:0},
      {id:'s4',nombre:'Pino',rol:'planta',salario:90,contento:82,baja:0,extraHoy:0,extraTotal:0},
      {id:'s5',nombre:'Carmen',rol:'oficina',salario:85,contento:85,baja:0,extraHoy:0,extraTotal:0}
    ],
    flota:[{id:'H-01',tipo:'hormigonera',chofer:'s1'},{id:'H-02',tipo:'hormigonera',chofer:'s2'},{id:'B-01',tipo:'banera',chofer:'s3'}],
    historial:[], peticiones:[] };
}
function migrar(j){            // completa partidas antiguas con los campos nuevos
  j.maq=j.maq||{};j.mejMaq=j.mejMaq||{};j.instalando=j.instalando||[];
  j.xp=j.xp||0;j.nivel=j.nivel||1;j.lab=j.lab||0;j.lineas=j.lineas||1;j.licitaciones=j.licitaciones||[];j.contratos=j.contratos||[];
  j.canteraAmpliada=!!j.canteraAmpliada;j.huelga=!!j.huelga;j.sigLicit=j.sigLicit||3;
  j.rivales=j.rivales||{L:{comprada:false},HC:{comprada:false},T:{comprada:false}};if(j.guerra===undefined)j.guerra=null;
  j.asfalto=!!j.asfalto;j.betun=j.betun||0;j.capBetun=j.capBetun||ASF.capBetun;j.deleg=j.deleg||{};j.aplazados=j.aplazados||[];j.cobros=j.cobros||[];
  if(j.suciedad===undefined)j.suciedad=15;if(j.epiNivel===undefined)j.epiNivel=1;if(j.epiEstado===undefined)j.epiEstado=80;
  j.diasSinAcc=j.diasSinAcc||0;j.recicladora=!!j.recicladora;if(j.encargado===undefined)j.encargado=null;j.diasSucia=j.diasSucia||0;
  for(const s of j.personal){if(s.cat===undefined){s.cat=1;s.xpT=30}s.estancado=s.estancado||0}
  for(const s of j.personal){s.cursos=s.cursos||[];if(s.curso===undefined)s.curso=null;s.tarea=null;s.diasTrab=s.diasTrab||0;if(s.vac===undefined)s.vac=null}
  // ITV: cada camión con su próxima fecha (escalonadas para que no coincidan todas)
  j.flota.forEach((f,i)=>{if(f.itv===undefined)f.itv=(j.nDia||1)+18+i*11+Math.floor(Math.random()*6);if(f.itvCita===undefined)f.itvCita=null});
  j.obj=j.obj||null;j.objSem=j.objSem||null;
  return j;
}
/* ----------------------- Clientes habituales ----------------------- */
// Cada cliente acumula confianza: servirle bien (y a tiempo) suma; fallarle resta. Con estrellas llama más,
// paga mejor y espera más al teléfono. Los contratos públicos no cuentan.
const estrellas = n => {const c=J&&J.clientes&&J.clientes[n];return c?Math.min(3,Math.floor(c.pts/4)):0};
const estTxt = n => {const e=estrellas(n);return e?' '+'⭐'.repeat(e):''};
function fidelidad(p,d){
  if(!p||p.clase==='publica')return;J.clientes=J.clientes||{};
  const c=J.clientes[p.cliente]||(J.clientes[p.cliente]={pts:0,clase:p.clase,n:0});const antes=estrellas(p.cliente);
  c.pts=Math.max(0,Math.min(12,c.pts+d));if(d>0)c.n++;const ahora=estrellas(p.cliente);
  if(ahora>antes)toast(`⭐ ${p.cliente} ya es cliente habitual (${'⭐'.repeat(ahora)}): llamará más a menudo, paga mejor y espera más al teléfono.`,'bien');
  else if(ahora<antes)toast(`💔 ${p.cliente} pierde confianza en vosotros (${ahora?'⭐'.repeat(ahora):'ya sin estrellas'}).`,'mal');
}
const estrellasTotal = () => J.clientes?Object.keys(J.clientes).reduce((a,n)=>a+estrellas(n),0):0;
// Al acabar una obra, a veces el encargado de la obra llama: «¡nos faltan unos metros!»
function faltaHormigon(p){
  if(p.falta||p.clase==='publica'||esAsf(p)||R.min>FIN+20)return;
  const prob={particular:.12,constructora:.22,hotel:.25}[p.clase]||.15;if(rnd()>prob)return;
  const x=rint(1,Math.max(2,Math.round(p.m3*.12))),hora=Math.ceil((R.min+minutosViaje(p)+25)/15)*15;
  R.pedidos.push({id:++J.seq,clase:p.clase,cliente:p.cliente,obra:'Falta hormigón · '+p.obra,pueblo:p.pueblo,x:p.x,y:p.y,n:p.n,m3:x,tipo:p.tipo,precio:p.precio+8,hora,km:p.km,
    estado:'llamada',creado:R.min,expira:R.min+15,entregado:0,enCamino:0,llegada:null,falta:true});pausaLlamada();
  toast(`📞 ${p.cliente}: «¡Nos faltan ${x} m³ para rematar!» Si se lo llevas rápido paga 8 €/m³ más y gana confianza.`,'info');
  if(pestana!=='llamadas')$('jTabLl')?.classList.add('aviso');
}
/* --------------------- Objetivos del día y de la semana --------------------- */
// Cada día salen 3 objetivos (XP al cumplirlos) y cada semana 2 más grandes (XP y reputación).
// tipo 'sube': se cumple al llegar a la meta; 'aguanta': se cumple al cerrar el día si no se ha roto antes.
const nHorm = () => Math.max(1,J.flota.filter(f=>f.tipo==='hormigonera').length);
const OBJ_DIA = {
  m3:      {sube:true, meta:()=>Math.round(nHorm()*capCuba()*(1.6+J.nivel*.15)/5)*5, txt:m=>`Sirve ${m} m³ de hormigón`, prog:()=>R.st.m3},
  obras:   {sube:true, meta:()=>Math.min(6,1+nHorm()), txt:m=>`Termina ${m} obras`, prog:()=>R.st.servidos},
  puntual: {meta:()=>2, txt:()=>'Ninguna llegada tarde (mínimo 2 obras)', prog:()=>R.st.servidos, roto:()=>R.st.tarde>0},
  llamadas:{meta:()=>0, txt:()=>'No pierdas ninguna llamada', prog:()=>0, roto:()=>R.st.perdidos>0},
  extra:   {meta:()=>0, txt:()=>'Nadie hace más de 1 h extra', prog:()=>0, roto:()=>J.personal.some(s=>s.extraHoy>60)},
  limpia:  {meta:()=>0, txt:()=>'Cierra con la planta limpia (suciedad < 30 %)', prog:()=>0, final:()=>J.suciedad<30},
  charla:  {sube:true, meta:()=>Math.min(3,Math.max(1,J.personal.length-3)), txt:m=>`Charla con ${m} persona${m>1?'s':''} del equipo`, prog:()=>J.personal.filter(s=>s.charla===J.nDia).length},
  bomba:   {sube:true, meta:()=>1, txt:()=>'Haz bien un bombeo con el mando', prog:()=>R.retoBien||0, solo:()=>J.retoVisto},
  mant:    {sube:true, meta:()=>2, txt:m=>`Lava y engrasa ${m} hormigoneras`, prog:()=>R.camiones.filter(c=>c.lavado===J.nDia).length, solo:()=>nHorm()>=2}
};
const OBJ_SEM = {
  m3:     {meta:()=>Math.round(nHorm()*capCuba()*(1.6+J.nivel*.15)*4/10)*10, txt:m=>`Sirve ${m} m³ esta semana`, dia:st=>st.m3},
  puntual:{meta:()=>4, txt:m=>`${m} días sin llegadas tarde`, dia:st=>st.tarde===0&&st.servidos>0?1:0},
  ben:    {meta:()=>Math.round(2500*(1+J.nivel*.6)/500)*500, txt:m=>`Gana ${fmtE(m)} esta semana`, dia:(st,ben)=>ben},
  enteras:{meta:()=>0, txt:()=>'Ninguna obra sin terminar en toda la semana', dia:()=>0, roto:st=>st.incompletos>0}
};
function lunesDe(f){const d=new Date(f+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10)}
function nuevosObjetivos(){
  const ids=Object.keys(OBJ_DIA).filter(k=>!OBJ_DIA[k].solo||OBJ_DIA[k].solo());
  const lista=[];while(lista.length<3&&ids.length){const k=ids.splice(Math.floor(rnd()*ids.length),1)[0];lista.push({id:k,meta:OBJ_DIA[k].meta(),ok:false,roto:false})}
  J.obj={dia:J.nDia,lista};
  const lun=lunesDe(J.fecha);
  if(!J.objSem||J.objSem.lunes!==lun){const ks=Object.keys(OBJ_SEM);const a=[];while(a.length<2){const k=ks.splice(Math.floor(rnd()*ks.length),1)[0];a.push({id:k,meta:OBJ_SEM[k].meta(),acum:0,ok:false,roto:false})}
    J.objSem={lunes:lun,lista:a}}
}
const XP_OBJ = 20, XP_SEM = 90;
function cumplirObj(o,sem){o.ok=true;ganarXP(sem?XP_SEM:XP_OBJ);if(sem)J.rep=Math.min(100,J.rep+2);
  toast(`🎯 ${sem?'Objetivo de la SEMANA':'Objetivo'} cumplido: ${sem?OBJ_SEM[o.id].txt(o.meta):OBJ_DIA[o.id].txt(o.meta)} (+${sem?XP_SEM+' XP y reputación':XP_OBJ+' XP'}).`,'bien')}
function objPaso(){
  if(!J.obj||J.obj.dia!==J.nDia)return;
  for(const o of J.obj.lista){if(o.ok||o.roto)continue;const D=OBJ_DIA[o.id];
    if(D.roto&&D.roto()){o.roto=true;continue}
    if(D.sube&&D.prog()>=o.meta)cumplirObj(o,false)}
  pintarObjB();
}
function objCierre(eventos,st,ben){
  if(J.obj&&J.obj.dia===J.nDia)for(const o of J.obj.lista){if(o.ok||o.roto)continue;const D=OBJ_DIA[o.id];
    if(D.roto&&D.roto()){o.roto=true;continue}
    const ok=D.sube?D.prog()>=o.meta:D.final?D.final():D.prog()>=o.meta;
    if(ok)cumplirObj(o,false);else o.roto=true}
  if(J.obj){const n=J.obj.lista.filter(o=>o.ok).length;eventos.unshift(`🎯 Objetivos de hoy: <b>${n}/${J.obj.lista.length}</b>${n===J.obj.lista.length?' · ¡todos! El equipo se anima (+2).':''}`);
    if(n===J.obj.lista.length)J.personal.forEach(s=>{s.contento=Math.min(100,s.contento+2)})}
  if(J.objSem){for(const o of J.objSem.lista){if(o.ok||o.roto)continue;const S=OBJ_SEM[o.id];
      if(S.roto&&S.roto(st)){o.roto=true;continue}o.acum+=S.dia(st,ben)||0;if(S.meta&&o.acum>=o.meta&&o.meta>0)cumplirObj(o,true)}
    const viernes=new Date(J.fecha+'T12:00:00').getDay()===5;
    if(viernes)for(const o of J.objSem.lista){if(o.ok||o.roto)continue;if(o.id==='enteras')cumplirObj(o,true);else o.roto=true}
    if(viernes)eventos.unshift(`📆 Objetivos de la semana: <b>${J.objSem.lista.filter(o=>o.ok).length}/${J.objSem.lista.length}</b>.`)}
}
function pintarObjB(){const b=$('jObjB');if(!b||!J.obj)return;const n=J.obj.lista.filter(o=>o.ok).length,t=`🎯 ${n}/${J.obj.lista.length}`;if(b.textContent!==t)b.textContent=t;b.classList.toggle('hecho',n===J.obj.lista.length)}
function fichaObjetivos(){
  const fila=(t,ok,roto,pr)=>`<div class="s" style="margin:6px 0">${ok?'✅':roto?'❌':'⬜'} ${esc(t)}${pr||''}</div>`;
  let h='<h5 style="margin:4px 0">Hoy</h5>';
  if(J.obj)for(const o of J.obj.lista){const D=OBJ_DIA[o.id];const pr=D.sube&&!o.ok?barra(Math.min(D.prog(),o.meta),o.meta,'#5aa9e6'):'';h+=fila(D.txt(o.meta),o.ok,o.roto,pr)}
  h+=`<div class="s" style="color:#9aa6b2">+${XP_OBJ} XP cada uno. Si cumples los tres, el equipo se anima.</div><h5 style="margin:10px 0 4px">Esta semana</h5>`;
  if(J.objSem)for(const o of J.objSem.lista){const S=OBJ_SEM[o.id];const pr=o.meta>0&&!o.ok&&!o.roto?barra(Math.max(0,Math.min(o.acum,o.meta)),o.meta,'#f2c230'):'';h+=fila(S.txt(o.meta),o.ok,o.roto,pr)}
  h+=`<div class="s" style="color:#9aa6b2">+${XP_SEM} XP y reputación cada uno. Se cierran el viernes.</div>`;
  return['Objetivos',fechaTxt(),h];
}
/* ------------------------------- ITV ------------------------------- */
// Camiones de más de 3,5 t: ITV periódica en la estación de Arrecife. En el juego, cada 60 días laborables.
const ITV_CADA = 60, ITV_COSTE = 165, ITV_MIN = 150;
const flotaDe = c => J.flota.find(f=>f.id===(c.id||c));
const diasITV = f => f.itv-J.nDia;
const itvCaducada = f => !!f&&diasITV(f)<0;
const enITV = c => {const f=flotaDe(c);return !!(f&&R&&R.itvHoy&&R.itvHoy[f.id]&&!R.itvHoy[f.id].fin)};
function itvTxt(f){if(!f)return'';if(R&&R.itvHoy&&R.itvHoy[f.id]&&!R.itvHoy[f.id].fin)return`<span style="color:#5aa9e6">📋 En la ITV hasta las ${fmtH(R.itvHoy[f.id].hasta)}</span>`;
  const d=diasITV(f);return d<0?`<span class="neg">🚫 ITV caducada: no puede circular</span>`:`<span class="${d<=5?'neg':''}">📋 ITV: ${d===0?'caduca hoy':`le quedan ${d} día${d>1?'s':''}`}${f.itvCita?' · cita mañana':''}</span>`}
function pedirITV(id){
  const f=flotaDe(id);if(!f)return;if(f.itvCita){toast(`📋 ${f.id} ya tiene cita en la ITV.`,'info');return}
  f.itvCita=J.nDia+1;toast(`📋 Cita en la ITV de Arrecife para ${f.id}: mañana a primera hora (unas 2 h 30 min, ${fmtE(ITV_COSTE)}).`,'bien');guardar();pintarUI(true);
}
function itvEmpezarDia(){
  R.itvHoy={};
  for(const f of J.flota){
    if(f.itv===undefined){f.itv=J.nDia+ITV_CADA;f.itvCita=null}
    if(f.itvCita&&f.itvCita<=J.nDia){f.itvCita=null;R.itvHoy[f.id]={hasta:INICIO+ITV_MIN,fin:false};const c=R.camiones.find(c=>c.id===f.id);if(c&&SIT.puerto){c.x=SIT.puerto.x+.25;c.y=SIT.puerto.y-.15}
      toast(`📋 ${f.id} está en la ITV de Arrecife hasta las ${fmtH(INICIO+ITV_MIN)}.`,'info')}
    else if(itvCaducada(f))toast(`🚫 ${f.id} tiene la ITV caducada: no puede circular. Pide cita en su ficha o en el Taller.`,'mal');
    else if(diasITV(f)<=5&&!f.itvCita)toast(`📋 La ITV de ${f.id} caduca en ${diasITV(f)} día${diasITV(f)===1?'':'s'}: pide cita.`,'info');
  }
}
function itvPaso(){
  if(!R.itvHoy)return;
  for(const id in R.itvHoy){const v=R.itvHoy[id];if(v.fin||R.min<v.hasta)continue;v.fin=true;
    const f=flotaDe(id),m=maq(id),c=R.camiones.find(c=>c.id===id);J.caja-=ITV_COSTE;R.st.taller+=ITV_COSTE;
    if(c)aparcar(c,R.camiones.indexOf(c));
    // con el camión bien cuidado pasa casi seguro; muy gastado, puede salir desfavorable
    const ok=m.averia?false:rnd()<Math.min(.98,.35+m.cond/100*.75);
    if(ok){f.itv=J.nDia+ITV_CADA;toast(`✅ ${id} ha pasado la ITV. Próxima dentro de ${ITV_CADA} días.`,'bien')}
    else{m.cond=Math.max(0,m.cond-3);toast(`❌ ITV desfavorable para ${id}: frenos y holguras gastados. Que el mecánico lo revise y pide otra cita.`,'mal')}
    pintarUI(true)}
}
function guardar(){try{localStorage.setItem('horinsa-partida',JSON.stringify(J))}catch(e){}}
function cargar(){try{const s=localStorage.getItem('horinsa-partida');if(!s)return null;const v=JSON.parse(s);return v&&v.v===1?migrar(v):null}catch(e){return null}}
const persona = id => J.personal.find(s=>s.id===id);
const enCurso = s => !!(s&&s.curso&&s.curso.empezado&&(!s.curso.horas||(R&&R.enDia&&R.min<INICIO+s.curso.horas*60)));
const deVacaciones = s => !!(s&&s.vac&&s.vac.empezado);
const disponible = s => s && s.baja<=0 && !enCurso(s) && !deVacaciones(s) && !(R&&R.huelga) && !(s.noche&&R&&R.enDia&&R.min<FIN) && !(R&&R.enDia&&s.descansoHasta>R.min);
const puede = k => J.nivel>=DESBLOQ[k];
function ganarXP(n){
  J.xp+=n;let sube=false;
  while(J.nivel<NIVEL_XP.length&&J.xp>=NIVEL_XP[J.nivel]){J.nivel++;sube=true;
    const nuevos=Object.keys(DESBLOQ).filter(k=>DESBLOQ[k]===J.nivel).map(k=>NOMBRE_DESBLOQ[k]);
    toast(`⭐ ¡HORINSA sube a nivel ${J.nivel}!${nuevos.length?' Desbloqueado: '+nuevos.join(', ')+'.':''}`,'bien')}
  if(sube){guardar();pintarUI(true)}
}
const hayRol = rol => J.personal.some(s=>s.rol===rol&&disponible(s));
const tiene = (s,c) => !!(s&&s.cursos&&s.cursos.includes(c));
const rolCon = (rol,c) => J.personal.some(s=>s.rol===rol&&disponible(s)&&tiene(s,c));
const hecha = id => !!J.mejMaq[id];
const precioArido = () => J.canteraPropia ? (J.canteraAmpliada?2:PRECIO.aridoPropia) : PRECIO.aridoAlquilada;
const precioCemento = () => PRECIO.cemento*(rolCon('oficina','compras')?.92:1);
const factorCem = () => (rolCon('planta','calidad')?.94:1)*[1,.95,.9,.86][J.lab||0];
const capCuba = () => hecha('cuba9')?9:8;
// Quién lleva la planta hoy: el operario; si falta, el encargado, y si no un mecánico o peón (más lento)
function operadorPlanta(){
  const op=J.personal.find(s=>s.rol==='planta'&&disponible(s));if(op)return{s:op,f:1};
  const enc=encargadoAct();if(enc)return{s:enc,f:.8};
  const otro=J.personal.find(s=>(s.rol==='mecanico'||s.rol==='peon')&&disponible(s)&&!(s.tarea&&s.tarea.tipo==='rep'));if(otro)return{s:otro,f:.6};
  return null;
}
const catMax = rol => J.personal.filter(s=>s.rol===rol&&disponible(s)).reduce((a,s)=>Math.max(a,s.cat||0),0);
const encargadoAct = () => {const s=J.encargado&&persona(J.encargado);return disponible(s)?s:null};
function ritmo(){let r=30+(J.tolvas-3)*12;if(R&&R.palaBoost>R.min)r*=1.1;if(rolCon('planta','operador'))r*=1.15;if(hecha('automatizacion'))r*=1.15;r*=1+.04*catMax('planta');if(encargadoAct())r*=1.05;return Math.round(r)}   // m³/h
const ensuciar = v => {if(v>0&&R&&R.clima==='viento')v*=1.3;J.suciedad=Math.max(0,Math.min(100,J.suciedad+v))};
const estadoLimpieza = () => J.suciedad<20?'Impecable':J.suciedad<45?'Aceptable':J.suciedad<70?'Sucia':'Muy sucia';
function maq(id){if(!J.maq[id])J.maq[id]={cond:100,averia:null};return J.maq[id]}
const averiada = id => !!(J.maq[id]&&J.maq[id].averia);
const nombreMaq = id => id==='planta'?'Planta de hormigón':id==='cantera'?'Cantera':id==='asfalto'?'Planta de asfalto':id;
const choferDe = c => (R&&R.sust&&R.sust[c.id])?persona(R.sust[c.id]):c.chofer?persona(c.chofer):null;
// Quién conduce hoy: el titular o, si falta, un chófer de reserva libre
// Los chóferes son polivalentes: si falta el titular, coge el camión cualquier chófer que no esté conduciendo otro
const conduceAhora = (s,exc) => R.camiones.some(o=>o!==exc&&o.estado!=='libre'&&((R.sust&&R.sust[o.id])||o.chofer)===s.id);
function conductor(c){
  R.sust=R.sust||{};
  if(c.chofer&&(enITV(c)||itvCaducada(flotaDe(c))))return null;     // en la ITV o con la ITV caducada no sale
  const s=persona(c.chofer);if(disponible(s)&&!conduceAhora(s,c)){delete R.sust[c.id];return s}
  if(R.sust[c.id]){const r=persona(R.sust[c.id]);if(disponible(r)&&!conduceAhora(r,c))return r;delete R.sust[c.id]}
  // primero los que no son titulares de ningún camión (reservas), luego cualquiera libre
  const titulares=new Set(J.flota.map(f=>f.chofer)),libres=J.personal.filter(x=>x.rol==='chofer'&&disponible(x)&&!conduceAhora(x,c)&&!J.flota.some(f=>f.chofer===x.id&&enITV(f))&&!Object.values(R.sust).includes(x.id));
  const r=libres.find(x=>!titulares.has(x.id))||libres[0];
  if(r){R.sust[c.id]=r.id;return r}return null;
}
function velCamion(c){const s=choferDe(c);let f=1;if(tiene(s,'eficiente'))f+=.08;if(tiene(s,'avanzada'))f+=.05;if(s)f+=.03*(s.cat||0);return f}
function gasoilCamion(c){const s=choferDe(c);let f=1;if(tiene(s,'eficiente'))f*=.9;if(hecha('consumo'))f*=.85;return f}
function desgasteCamion(c){const s=choferDe(c);let f=1;if(tiene(s,'cap'))f*=.75;if(hecha('neumaticos'))f*=.65;return f}
const nivelMec = s => tiene(s,'mec3')?3:tiene(s,'mec2')?2:1;
const efMec = s => [1,1.25,1.55][nivelMec(s)-1];
function fechaTxt(){const d=new Date(J.fecha+'T12:00:00');return DIAS[d.getDay()]+' '+d.getDate()+' de '+MESES[d.getMonth()]}

function aparcar(c,i){c.x=SIT.planta.x-.03+(i%4)*.02;c.y=SIT.planta.y+.035+Math.floor(i/4)*.02;c.ang=0}
function empezarDia(){
  const hayAplazados=J.aplazados&&J.aplazados.length>0,a7=hayAplazados?J.aplazados.filter(a=>(a.hora||HORA_TEMPRANO)<8*60):[],temprano=a7.length>0;
  // con obras a las 07:00 se entra antes: lo justo para cargar y llegar a la más lejana (nunca antes de las 06:00)
  const lejos=temprano?Math.max(...a7.map(a=>a.km/(VELOC.hormigonera*.85)*60)):0;
  // horario normal 07:30–15:30; con obras a las 07:00 se entra antes (entre las 06:00 y las 07:00)
  INICIO=temprano?Math.max(6*60,Math.min(7*60,Math.floor((HORA_TEMPRANO-lejos-25)/15)*15)):7*60+30;FIN=INICIO+480;CORTE=FIN+240;ULT_LLAMADA=FIN-90;
  R={min:INICIO,vel:0,enDia:true,pedidos:[],camiones:[],cola:[],cargando:null,
     st:{m3:0,ingresos:0,cemento:0,aridos:0,gasoil:0,taller:0,formacion:0,servidos:0,incompletos:0,rechazados:0,perdidos:0,tarde:0,averias:0},sigLlamada:INICIO+rint(5,25),cerrando:false};
  J.flota.forEach((f,i)=>{const c={...f,estado:'libre',ruta:null,t:0,carga:0,ped:null,km:0,giro:0};aparcar(c,i);R.camiones.push(c)});
  J.personal.forEach(s=>{s.extraHoy=0;s.tarea=null;s.descansoHasta=0;if(s.curso&&!s.curso.empezado){s.curso.empezado=true}if(s.vac&&!s.vac.empezado)s.vac.empezado=true});
  itvEmpezarDia();nuevosObjetivos();
  R.clima=sortearClima();
  const CL=CLIMAS[R.clima];
  if(R.clima!=='sol')toast(`${CL.ic} Hoy: ${CL.n}.${R.clima==='viento'?' Más polvo: la planta se ensucia antes.':R.clima==='calima'?' Poca visibilidad: se conduce más despacio y el polvo molesta al equipo.':R.clima==='lluvia'?' Carreteras lentas, menos obras y el asfalto no se puede extender.':''}`,'info');
  R.inspeccion=rnd()<(J.inspeccionPend?.3:.015);J.inspeccionPend=false;
  if(R.inspeccion)toast('🕵️ Hoy viene la Inspección de Trabajo: revisará EPIs, orden y limpieza, formación en PRL y horarios.','mal');
  if(J.huelga){R.huelga=true;J.huelga=false;toast('✊ HUELGA: la plantilla está harta y hoy no trabaja nadie. Cuida las horas extra, los sueldos y las vacaciones.','mal')}
  if(ARB){eventosCompetencia();resolverLicitaciones();if(puede('licitaciones')&&J.nDia>=J.sigLicit){nuevaLicitacion();J.sigLicit=J.nDia+rint(3,6)}pedidosDeContratos()}
  // obras aplazadas ayer: hoy a primera hora
  if(hayAplazados){for(const a of J.aplazados)R.pedidos.push({...a,id:++J.seq,hora:a.hora||HORA_TEMPRANO,estado:'aceptado',creado:INICIO,expira:0,entregado:0,enCamino:0,llegada:null,contra:null});
    toast(temprano?`🌅 Hoy se entra a las ${fmtH(INICIO)}: hay obras programadas desde las 07:00. La jornada acaba a las ${fmtH(FIN)}.`:`📅 Hoy hay ${J.aplazados.length} obra${J.aplazados.length>1?'s':''} programada${J.aplazados.length>1?'s':''} de ayer.`,'info');J.aplazados=[]}
  // con lluvia no se puede extender asfalto: los pedidos de asfalto de hoy pasan a mañana
  if(R.clima==='lluvia'){const asf=R.pedidos.filter(p=>esAsf(p)&&p.estado==='aceptado');for(const p of asf){p.estado='aplazado';J.aplazados.push({mat:p.mat,clase:p.clase,cliente:p.cliente,obra:p.obra,pueblo:p.pueblo,x:p.x,y:p.y,n:p.n,m3:p.m3,tipo:p.tipo,precio:p.precio,km:p.km,hora:huecoManana(p)||12*60})}
    if(asf.length)toast(`🌧️ Llueve: ${asf.length} obra${asf.length>1?'s':''} de asfalto se aplaza${asf.length>1?'n':''} a mañana a las 07:00.`,'mal')}
  for(const s of J.personal.filter(deVacaciones))toast(`🏖️ ${s.nombre} está de vacaciones (${s.vac.dias} día${s.vac.dias>1?'s':''}).`,'info');
  for(const id in J.maq){const a=J.maq[id].averia;if(a){a.asignada=null;if(!a.ext)a.viaje=0}}
  HORINSA.planta.tolvas=J.tolvas;HORINSA.planta.lineas=J.lineas;
  const bajas=J.personal.filter(s=>s.baja>0);
  for(const s of bajas)toast(`🤒 ${s.nombre} está de baja (${s.baja} día${s.baja>1?'s':''} más).`,'mal');
  for(const s of J.personal.filter(enCurso))toast(s.curso.horas?`🎓 ${s.nombre} está de curso hasta las ${fmtH(INICIO+s.curso.horas*60)}: ${CURSOS[s.curso.id].n}.`:`🎓 ${s.nombre} está hoy de curso: ${CURSOS[s.curso.id].n}.`,'info');
  for(const id in J.maq)if(J.maq[id].averia)toast(`🔧 ${nombreMaq(id)} sigue averiado/a desde ayer.`,'mal');
  if(!hayRol('oficina'))toast('☎️ Hoy no hay nadie en la oficina: coges tú el teléfono (entran menos llamadas y no puedes regatear).','mal');
  if(!hayRol('planta')){const op=operadorPlanta();toast(op?`🏭 Sin operario de planta: hoy la lleva ${op.s.nombre}, más despacio.`:'🏭 Sin nadie que sepa manejar la planta: hoy no se puede cargar hormigón.','mal')}
  pintarUI(true);
}

/* ---------------------------- Llamadas ---------------------------- */
const CLIENTES = {
  particular:{nombres:['Familia Cabrera','Sr. Betancort','Sra. Perdomo','Hnos. Curbelo','Sr. Umpiérrez','Sra. Hernández','Familia Morales','Sr. Tavío','Sra. Rodríguez','Familia Fajardo','Sr. Spínola','Sra. Ferrer'],
    obras:['Losa de vivienda','Solera de garaje','Piscina','Ampliación de casa','Muro de contención','Aljibe','Cimientos de casa'],m3:[4,14],precio:96,tipos:['HM-20','HM-20','HA-25']},
  constructora:{nombres:['Construcciones Teguise','Promociones Famara','Obras del Rubicón','Edificaciones Arrecife','Construcciones La Geria','Reformas Timanfaya'],
    obras:['Edificio de viviendas','Nave industrial','Cimentación de bloque','Forjado','Muros de sótano'],m3:[16,40],precio:90,tipos:['HA-25','HA-30']},
  hotel:{nombres:['Hotel Brisa Atlántica','Resort Malpaís','Aparthotel Los Hervideros','Hotel Charco Azul','Apartamentos Timple','Hotel Arenas del Rubicón'],
    obras:['Ampliación de habitaciones','Reforma de piscinas','Forjado del nuevo bloque','Solárium nuevo','Cimientos del spa'],m3:[24,56],precio:88,tipos:['HA-25','HA-30']}
};
function puntoEnPueblo(t){
  const[cx,cy]=P(t[1],t[2]),ang=t[7]*Math.PI/180;
  for(let k=0;k<40;k++){const a=rnd()*6.283,u=Math.sqrt(rnd())*.85,ex=Math.cos(a)*t[5]*u,ey=Math.sin(a)*t[6]*u;
    const x=cx+ex*Math.cos(ang)-ey*Math.sin(ang),y=cy+ex*Math.sin(ang)+ey*Math.cos(ang);
    if(LAND){const px=Math.round((x-X0)/RES),py=Math.round((y-Y0)/RES);if(!(LAND[py*TW+px]>=240))continue}
    return[x,y]}
  return null;
}
const esAsf = p => p.mat==='asfalto';
const ud = p => esAsf(p)?'t':'m³';
function nuevaLlamadaAsf(){
  const cand=PUEBLOS.filter(t=>t[3]!=='aldea'||rnd()<.3);const t=pick(cand);const p=puntoEnPueblo(t);if(!p)return;
  const n=nodoCercano(p[0],p[1]);if(!isFinite(ARB.dist[n])||Math.hypot(RED.N[n][0]-p[0],RED.N[n][1]-p[1])>1.5)return;
  const nA=Math.max(1,J.flota.filter(f=>f.tipo==='asfaltera').length);
  const tipo=pick(Object.keys(ASF.tipos)),t2=rint(2,2+3*nA)*24;
  const km=kmDesdePlanta(p[0],p[1],n),precio=CLI_ASF.precio+ASF.tipos[tipo].extra+rint(-4,4)+Math.round((J.rep-50)/12);
  const hora=Math.ceil(Math.max(R.min+km/50*60+40,Math.min(FIN-60,R.min+rint(60,240)))/15)*15;
  const ped={id:++J.seq,mat:'asfalto',clase:'asfalto',cliente:pick(CLI_ASF.nombres),obra:pick(CLI_ASF.obras),pueblo:t[0],x:p[0],y:p[1],n,m3:t2,tipo,precio,hora,km,
    estado:'llamada',creado:R.min,expira:R.min+(rolCon('oficina','clientes')?70:40),entregado:0,enCamino:0,llegada:null};
  R.pedidos.push(ped);pausaLlamada();pestanaAviso();pintarUI(true);
}
// Proveedor de áridos: si los acopios se vacían y la bañera no puede salir, la cantera los trae (más caro)
const PRECIO_ARIDO_PROV = 14;
function pedirAridos(auto){
  const coste=CAP.banera*PRECIO_ARIDO_PROV;if(!puedePagarSuministro(coste)){if(!auto)toast('💸 Sin crédito para pagar los áridos.','mal');return}
  J.caja-=coste;R.st.aridos+=coste;R.aridoPedido=(R.aridoPedido||0)+CAP.banera;R.nCis=(R.nCis||0)+1;
  const ruta=invertir(SIT.rutaCantera);
  const c={id:'ARI-'+R.nCis,tipo:'cisterna',mat:'arido',chofer:null,estado:'ida',ruta,t:0,carga:CAP.banera,km:0,x:SIT.cantera.x,y:SIT.cantera.y,ang:0,giro:0};
  c.rutaIda=hacerRuta(ruta.pts);R.camiones.push(c);
  toast(`🚛 La cantera nos trae ${CAP.banera} t de áridos con su camión (${fmtE(coste)}, más caro que con tu bañera).`,'info');pintarUI(true);
}
function pedirBetun(auto){
  const coste=20*ASF.betun*(rolCon('oficina','compras')?.92:1);
  if(!puedePagarSuministro(coste)){if(!auto)toast('💸 Sin crédito para el betún.','mal');return}
  J.caja-=coste;R.st.cemento+=coste;R.betunPedido=(R.betunPedido||0)+20;
  const ruta=invertir(SIT.rutaPuerto);R.nCis=(R.nCis||0)+1;
  const c={id:'BET-'+R.nCis,tipo:'cisterna',mat:'betun',chofer:null,estado:'ida',ruta,t:0,carga:20,km:0,x:SIT.puerto.x,y:SIT.puerto.y,ang:0,giro:0};
  c.rutaIda=hacerRuta(ruta.pts);R.camiones.push(c);toast(`🛢️ Cisterna de betún (20 t) sale del puerto · ${fmtE(coste)}`,'info');pintarUI(true);
}
function nuevaLlamada(){
  if(J.asfalto&&rnd()<.3&&climaHoy()!=='lluvia')return nuevaLlamadaAsf();
  const r=rnd(),clase=r<.55?'particular':r<.8?'constructora':'hotel',C=CLIENTES[clase];
  const ok=t=>clase==='hotel'?t[3]==='turis':clase==='constructora'?t[3]!=='aldea':true;
  const cand=PUEBLOS.filter(ok);let tot=cand.reduce((a,t)=>a+t[5]*t[6]+.15,0),q=rnd()*tot,t=cand[0];
  for(const c of cand){q-=c[5]*c[6]+.15;if(q<=0){t=c;break}}
  const p=puntoEnPueblo(t);if(!p)return;
  const n=nodoCercano(p[0],p[1]);if(!isFinite(ARB.dist[n])||Math.hypot(RED.N[n][0]-p[0],RED.N[n][1]-p[1])>1.5)return;
  const tipo=(clase!=='particular'&&J.lab>=2&&rnd()<.3)?'HA-35':pick(C.tipos),m3=rint(C.m3[0],C.m3[1]);
  const compradas=Object.keys(RIVALES).filter(k=>J.rivales[k].comprada).length;
  const precio=C.precio+5+TIPOS_H[tipo].extra+rint(-4,4)+Math.round((J.rep-50)/10)+(rolCon('oficina','negociacion')?4:0)+catMax('oficina')+compradas*3-(guerraActiva()?4:0);
  const km=kmDesdePlanta(p[0],p[1],n),minimo=R.min+km/40*60+50;     // ningún cliente serio pide para dentro de 20 minutos
  const hora=Math.ceil(Math.max(minimo,Math.min(FIN-30,R.min+rint(50,230)))/15)*15;
  // a veces vuelve a llamar un cliente habitual: paga algo más y espera más al teléfono
  const hab=Object.keys(J.clientes||{}).filter(k=>J.clientes[k].clase===clase&&estrellas(k)>0&&!R.pedidos.some(q=>q.cliente===k&&['llamada','aceptado'].includes(q.estado)));
  const cliente=hab.length&&rnd()<.45?pick(hab):pick(C.nombres),est=estrellas(cliente);
  const ped={id:++J.seq,clase,cliente,obra:pick(C.obras),pueblo:t[0],x:p[0],y:p[1],n,m3,tipo,precio:precio+est*2,hora,
    km,estado:'llamada',creado:R.min,expira:R.min+(rolCon('oficina','clientes')?70:40)+est*10,entregado:0,enCamino:0,llegada:null};
  R.pedidos.push(ped);pausaLlamada();
  // la llamada aparece en la bandeja fija de llamadas (no como aviso que se desvanece)
  if(pestana!=='llamadas')$('jTabLl')?.classList.add('aviso');
  pintarUI(true);
}
function estimar(p){
  if(esAsf(p)){const cap=ASF.cap,viajes=Math.ceil(p.m3/cap),T=ASF.tipos[p.tipo];
    const coste=p.m3*(T.bet*ASF.betun+.95*precioArido()+6)+viajes*2*p.km*PRECIO.gasoil,minViaje=p.km/VELOC.hormigonera*60;
    return{ingreso:p.m3*p.precio,beneficio:p.m3*p.precio-coste,viajes,minViaje,horas:viajes*(2*minViaje+cap/ASF.ritmo*60+cap*ASF.descargaMinT)/60}}
  const cap=capCuba(),viajes=Math.ceil(p.m3/cap);
  const coste=p.m3*(TIPOS_H[p.tipo].cem*factorCem()*precioCemento()+ARIDO_M3*precioArido())+viajes*2*p.km*PRECIO.gasoil;
  const minViaje=p.km/VELOC.hormigonera*60;
  return{ingreso:p.m3*p.precio,beneficio:p.m3*p.precio-coste,viajes,minViaje,horas:viajes*(2*minViaje+cap/ritmo()*60+cap*DESCARGA_MIN_M3)/60};
}
function regatear(id){
  const p=R.pedidos.find(q=>q.id===id);if(!p||p.estado!=='llamada'||p.regateado||!rolCon('oficina','negociacion'))return;
  p.regateado=true;const r=rnd();
  if(r<.6){const sube=rint(4,9);p.precio+=sube;toast(`🤝 Regateo con éxito: ${p.cliente} acepta ${p.precio} €/m³ (+${sube}).`,'bien')}
  else if(r<.85)toast(`🤨 ${p.cliente} no acepta subir el precio. La oferta sigue en pie.`,'info');
  else{p.estado='perdido';R.st.perdidos++;J.rep=Math.max(0,J.rep-1);toast(`😠 ${p.cliente} se ha molestado con el regateo y cuelga.`,'mal')}
  pintarUI(true);
}
function aceptar(id){const p=R.pedidos.find(q=>q.id===id);if(!p||p.estado!=='llamada')return;p.estado='aceptado';pintarUI(true)}
function rechazar(id){const p=R.pedidos.find(q=>q.id===id);if(!p||p.estado!=='llamada')return;p.estado='rechazado';R.st.rechazados++;if(p.falta||estrellas(p.cliente))fidelidad(p,-1);pintarUI(true)}
// Antes de rechazar se pregunta si se le ofrece al cliente servirlo mañana a las 07:00
function preguntarRechazo(id){const p=R.pedidos.find(q=>q.id===id);if(!p||p.estado!=='llamada')return;p.preguntar=true;p.expira=Math.max(p.expira,R.min+10);pintarUI(true)}
// primer hueco libre de mañana: a cada hora caben tantas obras como camiones de ese tipo
// horas de camión que necesita una obra: viajes × (ida + vuelta + carga + descarga)
function horasCamion(a){const asf=a.mat==='asfalto',cap=asf?ASF.cap:capCuba(),viajes=Math.ceil(a.m3/cap);
  return viajes*(2*a.km/40*60+(asf?cap/ASF.ritmo*60:cap/ritmo()*60)+cap/(asf?90:20)*60)/60}
function huecoManana(p){
  const asf=esAsf(p),n=Math.max(1,J.flota.filter(f=>f.tipo===(asf?'asfaltera':'hormigonera')).length);
  const carga=J.aplazados.filter(a=>(a.mat==='asfalto')===asf).reduce((s,a)=>s+horasCamion(a),0);
  const h=HORA_TEMPRANO+Math.floor(carga/n)*60;                  // empieza cuando los camiones acaban lo ya programado
  return h<=13*60?h:null;
}
function posponer(id){
  const p=R.pedidos.find(q=>q.id===id);if(!p||p.estado!=='llamada')return;
  const hueco=huecoManana(p);
  if(hueco===null){p.estado='rechazado';R.st.rechazados++;toast('📅 Mañana ya está completo: no hay hueco para esa obra.','mal');pintarUI(true);return}
  const prob={particular:.75,constructora:.6,hotel:.5,asfalto:.65}[p.clase]||.6;
  if(rnd()<prob){p.estado='aplazado';J.aplazados.push({mat:p.mat,clase:p.clase,cliente:p.cliente,obra:p.obra,pueblo:p.pueblo,x:p.x,y:p.y,n:p.n,m3:p.m3,tipo:p.tipo,precio:p.precio,km:p.km,hora:hueco});
    toast(`📅 ${p.cliente} acepta: mañana a las ${fmtH(hueco)} (${p.m3} ${ud(p)}).${hueco===HORA_TEMPRANO?' Ese día la plantilla entra antes.':''}`,'bien');guardar()}
  else{p.estado='rechazado';R.st.rechazados++;toast(`🙅 ${p.cliente} no puede esperar a mañana y busca otra planta.`,'mal')}
  pintarUI(true);
}
const restante = p => p.m3-p.entregado-p.enCamino;
/* ------------- Selección de varios camiones y órdenes en grupo ------------- */
window.SELCAM=new Set();window.MODO_SEL=false;
const propios = () => R?R.camiones.filter(c=>c.chofer):[];
window.selCamion=function(id){const c=R&&R.camiones.find(x=>x.id===id);if(!c||!c.chofer)return;SELCAM.has(id)?SELCAM.delete(id):SELCAM.add(id);pintarSel()};
function ordenGrupo(a,v){
  const cs=[...SELCAM].map(id=>R.camiones.find(c=>c.id===id)).filter(Boolean);let n=0;
  if(a==='retener'){for(const c of cs){c.retenido=true;n++}toast(`✋ ${n} camión${n>1?'es':''} se queda${n>1?'n':''} en planta hasta que los sueltes.`,'info')}
  else if(a==='soltar'){for(const c of cs){if(c.retenido){c.retenido=false;n++}}toast(`▶ ${n} camión${n>1?'es':''} vuelve${n>1?'n':''} a trabajar.`,'info')}
  else if(a==='lavar'){for(const c of cs)if(c.tipo==='hormigonera'&&c.estado==='libre'&&!averiada(c.id)&&c.lavado!==J.nDia){c.lavado=J.nDia;c.lavarHasta=R.min+20+n*5;const m=maq(c.id);m.cond=Math.min(100,m.cond+3);n++}
    toast(n?`🧽 Lavando y engrasando ${n} hormigonera${n>1?'s':''}.`:'Ninguna de las seleccionadas puede lavarse ahora (tienen que estar libres en planta y no lavadas hoy).',n?'info':'mal')}
  else if(a==='revisar'){const mecs=J.personal.filter(m=>m.rol==='mecanico'&&disponible(m)&&!m.tarea);
    for(const c of cs.filter(c=>c.estado==='libre'&&!averiada(c.id)).sort((x,y)=>maq(x.id).cond-maq(y.id).cond)){const m=mecs.shift();if(!m)break;m.tarea={tipo:'mant',id:c.id};n++}
    toast(n?`🔧 ${n} camión${n>1?'es':''} en revisión.`:'No hay mecánicos libres (o los camiones no están libres en planta).',n?'info':'mal')}
  else if(a==='itv'){for(const c of cs){const f=flotaDe(c);if(f&&!f.itvCita&&!enITV(c)){f.itvCita=J.nDia+1;n++}}toast(n?`📋 Cita en la ITV para ${n} camión${n>1?'es':''} mañana a primera hora.`:'Ya tienen cita.',n?'bien':'info')}
  else if(a==='obra'){const p=R.pedidos.find(q=>q.id===+v);if(!p||p.estado!=='aceptado')return;
    for(const c of cs){if(c.retenido)c.retenido=false;if(c.estado==='libre'&&!averiada(c.id)&&(c.tipo==='hormigonera'&&!esAsf(p)||c.tipo==='asfaltera'&&esAsf(p))){c.reserva=p.id;n++}}
    p.urgente=true;toast(n?`🏗️ ${n} camión${n>1?'es':''} sale${n>1?'n':''} ya hacia ${p.cliente} (${p.pueblo}).`:'Ningún camión seleccionado puede ir ahora a esa obra (tienen que estar libres y ser del tipo adecuado).',n?'bien':'mal')}
  else if(a==='todos'){for(const c of propios())SELCAM.add(c.id)}
  else if(a==='libres'){SELCAM.clear();for(const c of propios())if(c.estado==='libre'&&!averiada(c.id))SELCAM.add(c.id)}
  else if(a==='nada'){SELCAM.clear();MODO_SEL=false}
  else if(a==='modo'){MODO_SEL=!MODO_SEL;toast(MODO_SEL?'☑ Modo selección: toca los camiones en el mapa para añadirlos o quitarlos.':'Modo selección desactivado.','info')}
  guardar();pintarSel();pintarUI(true);
}
let selH='';
function pintarSel(){
  const el=$('jSel');if(!el)return;for(const id of [...SELCAM])if(!R||!R.camiones.some(c=>c.id===id))SELCAM.delete(id);
  if(!SELCAM.size&&!MODO_SEL){if(el.style.display!=='none'){el.style.display='none';selH=''}return}
  const cs=[...SELCAM].map(id=>R.camiones.find(c=>c.id===id));
  const obras=R.pedidos.filter(p=>p.estado==='aceptado'&&restante(p)>0);
  const h=`<div class="t">☑ ${SELCAM.size} camión${SELCAM.size===1?'':'es'} <small style="font-weight:400;color:#9aa6b2">${cs.map(c=>c.id+(c.retenido?' ✋':'')).join(' · ')||'toca camiones en el mapa (o Mayús + clic)'}</small></div>
  <div class="bt">${cs.length?`${cs.some(c=>!c.retenido)?'<button class="jb" data-sel="retener">✋ Retener en planta</button>':''}${cs.some(c=>c.retenido)?'<button class="jb ok" data-sel="soltar">▶ Soltar</button>':''}
  <button class="jb" data-sel="lavar">🧽 Lavar</button><button class="jb" data-sel="revisar">🔧 Revisar</button><button class="jb" data-sel="itv">📋 Cita ITV</button>
  ${obras.length?`<select data-selobra><option value="">🏗️ Enviar ya a la obra…</option>${obras.map(p=>`<option value="${p.id}">${esc(p.cliente)} · ${esc(p.pueblo)} · ${fmtH(p.hora)} · faltan ${restante(p)} ${ud(p)}</option>`).join('')}</select>`:''}`:''}
  <button class="jb" data-sel="libres">Libres</button><button class="jb" data-sel="todos">Todos</button><button class="jb" data-sel="modo">${MODO_SEL?'☑ Selección ON':'☐ Modo selección'}</button><button class="jb" data-sel="nada">✕</button></div>`;
  if(h!==selH&&!el.contains(document.activeElement)){selH=h;el.innerHTML=h}el.style.display='block';
}
/* ------------- Cancelar o pasar a otro día una obra que no va a llegar ------------- */
function sacarDeCola(p){
  for(const k of ['cola','colaA']){if(!R[k])continue;for(const c of R[k].filter(c=>c.ped===p)){p.enCamino-=c.carga;c.carga=0;c.ped=null;c.estado='libre'}R[k]=R[k].filter(c=>c.ped)}
}
function recortarObra(p){              // se queda con lo ya servido + lo que va de camino
  const part=p.entregado+p.enCamino;if(part<=0)return false;p.m3Orig=p.m3Orig||p.m3;p.m3=part;
  if(p.enCamino<=0){p.estado='servido';R.st.servidos++}return true;
}
function cancelarPedido(id){
  const p=R.pedidos.find(q=>q.id===id);if(!p||p.estado!=='aceptado')return;
  sacarDeCola(p);const pronto=p.hora-R.min>90||p.avisado,r=restante(p),parcial=recortarObra(p);
  if(!parcial){p.estado='cancelado';R.st.cancelados=(R.st.cancelados||0)+1}
  const baja=pronto?1.5:3;J.rep=Math.max(0,J.rep-baja);fidelidad(p,pronto?-1:-2);
  if(p.clase==='publica'){const pen=Math.round(r*p.precio*.2);J.caja-=pen;R.st.penal=(R.st.penal||0)+pen;toast(`⚖️ Contrato público: penalización de ${fmtE(pen)} por no servir ${r} ${ud(p)}.`,'mal')}
  toast(`🚫 ${parcial?`Se recorta la obra de ${p.cliente}: solo lo que ya va servido`:`Obra de ${p.cliente} cancelada`}. ${pronto?'Avisaste con tiempo y':'Lo ha sabido tarde y'} baja la reputación (−${baja}).`,'mal');
  pintarUI(true);
}
function aplazarPedido(id){
  const p=R.pedidos.find(q=>q.id===id);if(!p||p.estado!=='aceptado'||p.intentoAplazar)return;
  if(p.clase==='publica'){toast('🏛️ Los contratos públicos tienen fecha fija: no se pueden pasar a otro día.','mal');return}
  sacarDeCola(p);const r=restante(p);if(r<=0){toast('Todo lo que falta ya va de camino.','info');return}
  const hueco=huecoManana({...p,m3:r});
  if(hueco===null){toast('📅 Mañana ya está completo: no hay hueco. Solo queda servirla hoy o cancelarla.','mal');return}
  p.intentoAplazar=true;
  const prob=Math.min(.95,({particular:.8,constructora:.65,hotel:.55,asfalto:.7}[p.clase]||.65)+(p.avisado?.12:0)+(p.hora-R.min>120?.1:0)-(p.entregado>0?.15:0));
  if(rnd()<prob){
    J.aplazados.push({mat:p.mat,clase:p.clase,cliente:p.cliente,obra:p.obra,pueblo:p.pueblo,x:p.x,y:p.y,n:p.n,m3:r,tipo:p.tipo,precio:p.precio,km:p.km,hora:hueco});
    if(!recortarObra(p))p.estado='aplazado';J.rep=Math.max(0,J.rep-.5);
    toast(`📅 ${p.cliente} acepta: ${r} ${ud(p)} pasan a mañana a las ${fmtH(hueco)}.`,'bien');guardar();
  } else toast(`🙅 ${p.cliente} no puede esperar a mañana: necesita el ${p.mat==='asfalto'?'asfalto':'hormigón'} hoy. Sírvela o cancélala.`,'mal');
  pintarUI(true);
}
// tiempo de viaje realista (cargado, con el clima del día y la hora punta de Arrecife)
function minutosViaje(p){let m=p.km/(VELOC.hormigonera*.85*CLIMAS[climaHoy()].vel)*60*1.08;
  if(horaPunta(p.x,p.y)||horaPunta(SIT.planta.x,SIT.planta.y))m*=1.25;return m}

/* ----------------------------- Camiones ----------------------------- */
function moverPorRuta(c,dt){
  const propio=c.tipo!=='cisterna';
  const v=VELOC[c.tipo]*(c.carga>0&&propio?.85:1)*(propio?velCamion(c):1)*CLIMAS[climaHoy()].vel*(horaPunta(c.x,c.y)?.65:1),av=v*dt/60;
  c.ruta.d+=av;c.km+=av;
  if(propio){const g=av*PRECIO.gasoil*gasoilCamion(c);R.st.gasoil+=g;J.caja-=g;const m=maq(c.id);m.cond=Math.max(0,m.cond-av*.06*desgasteCamion(c))}
  if(c.tipo==='hormigonera'&&c.carga>0)c.giro+=dt*.8;
  const fin=c.ruta.d>=c.ruta.len;if(fin)c.ruta.d=c.ruta.len;
  const[x,y,a]=posRuta(c.ruta);c.x=x;c.y=y;c.ang=a;
  if(fin){c.ruta=null;llegar(c)}
}
function llegar(c){
  if(c.tipo==='hormigonera'||c.tipo==='asfaltera'){
    if(c.estado==='ida'&&c.tipo==='asfaltera'&&R.min-(c.cargadoEn||R.min)>ASF.enfria){c.frio=true;J.rep=Math.max(0,J.rep-1);toast(`🥶 El asfalto de ${c.id} ha llegado frío a ${c.ped.cliente}: se paga un 15 % menos. Las obras lejanas son un riesgo.`,'mal')}
    if(c.estado==='ida'){const p=c.ped;
      if(p.llegada===null){p.llegada=R.min;if(R.min>p.hora+30){R.st.tarde++;J.rep=Math.max(0,J.rep-(R.min>p.hora+90?2:1)*(p.avisado?.4:1));/* avisado: se enfada mucho menos */toast(`⏱️ Llegamos tarde a ${p.cliente} (${fmtH(R.min)} en vez de ${fmtH(p.hora)})`,'mal')}}
      // en la obra descarga un camión cada vez; si hay otro vertiendo, espera su turno
      if(p.ocupada&&p.ocupada!==c.id)c.estado='esperando';else empezarDescarga(c)}
    else if(c.estado==='vuelta'){c.estado='libre';aparcar(c,R.camiones.indexOf(c));
      if(c.tipo==='hormigonera')c.lavarHasta=R.min+10;                 // al volver, el chófer lava la cuba y la canaleta
      if(c.sobranteGrande){ensuciar(c.sobranteGrande*4*(J.recicladora?.35:1));R.st.sobrante=(R.st.sobrante||0)+c.sobranteGrande;c.sobranteGrande=0}
      // sobrante: el hormigón que vuelve en la cuba se vierte en la zona de escombros
      if(c.tipo==='hormigonera'&&rnd()<.45){const sob=Math.round(rnd()*5)/10+.1;ensuciar(sob*4*(J.recicladora?.35:1));R.st.sobrante=(R.st.sobrante||0)+sob;
        if(J.recicladora)J.acopio=Math.min(J.capAcopio,J.acopio+sob*1.5)}}
  } else if(c.tipo==='banera'){
    if(c.estado==='ida'){c.estado='cargando';c.t=(hecha('machacadora')?7:12)*(J.canteraAmpliada?.7:1);const coste=CAP.banera*precioArido();J.caja-=coste;R.st.aridos+=coste;
      if(J.canteraPropia){const m=maq('cantera');m.cond=Math.max(0,m.cond-.8*(hecha('machacadora')?.6:1))}}
    else if(c.estado==='vuelta'){c.estado='descargando';c.t=6}
  } else if(c.tipo==='cisterna'){
    if(c.estado==='ida'){c.estado='descargando';c.t=25}
    else{R.camiones.splice(R.camiones.indexOf(c),1)}
  }
}
/* ---------------------------- Clima y tráfico ---------------------------- */
const CLIMAS = { sol:{n:'Soleado',ic:'☀️',p:.6,vel:1}, viento:{n:'Viento fuerte',ic:'💨',p:.22,vel:1}, calima:{n:'Calima',ic:'🌫',p:.09,vel:.9},
  nublado:{n:'Nublado',ic:'⛅',p:.06,vel:1}, lluvia:{n:'Lluvia',ic:'🌧️',p:.03,vel:.82} };
function sortearClima(){let q=rnd();for(const k in CLIMAS){q-=CLIMAS[k].p;if(q<=0)return k}return 'sol'}
const climaHoy = () => (R&&R.clima)||'sol';
// hora punta en Arrecife y alrededores (Playa Honda, Tahíche): los camiones van más lentos
const CENTRO_ARRECIFE = P(28.963,-13.553);
function horaPunta(x,y){const m=R.min;return((m>=450&&m<=555)||(m>=810&&m<=900))&&Math.hypot(x-CENTRO_ARRECIFE[0],y-CENTRO_ARRECIFE[1])<4.5}

/* --------------------- Facturación y cobros (como en la vida real) --------------------- */
const PLAZO_COBRO = { particular:0, hotel:20, constructora:40, publica:60, asfalto:40 };   // días laborables
const MOROSO = { particular:.01, hotel:.02, constructora:.06, publica:0, asfalto:.03 };
function facturar(p,imp){
  R.st.ingresos+=imp;const pl=PLAZO_COBRO[p.clase]!==undefined?PLAZO_COBRO[p.clase]:30;
  if(pl===0){J.caja+=imp;R.st.cobrado=(R.st.cobrado||0)+imp;return}
  let f=J.cobros.find(x=>x.ped===p.id&&!x.recobro);
  if(!f){f={ped:p.id,cliente:p.cliente,clase:p.clase,dia:J.nDia+pl,imp:0,moroso:rnd()<(MOROSO[p.clase]||0)};J.cobros.push(f)}
  f.imp+=imp;
}
function procesarCobros(eventos){
  const hoy=J.cobros.filter(f=>f.dia<=J.nDia);J.cobros=J.cobros.filter(f=>f.dia>J.nDia);let cobrado=0;
  for(const f of hoy){
    if(f.moroso){J.cobros.push({...f,dia:J.nDia+30,imp:Math.round(f.imp*.5),moroso:false,recobro:true});J.rep=Math.max(0,J.rep-0);
      eventos.push(`🧾 <b>${esc(f.cliente)}</b> no paga su factura de ${fmtE(f.imp)}. Va a recobro: dentro de 30 días recuperarás la mitad.`)}
    else{J.caja+=f.imp;cobrado+=f.imp}
  }
  R.st.cobrado=(R.st.cobrado||0)+cobrado;
  if(J.caja<0){const int=Math.round(-J.caja*.0006);J.caja-=int;R.st.intereses=int;eventos.push(`🏦 Saldo negativo: el banco cobra ${fmtE(int)} de intereses.`)}
}
const pendienteCobro=()=>J.cobros.reduce((a,f)=>a+f.imp,0);
// Póliza de crédito: los suministros (cemento, áridos, betún) se pueden pagar en negativo hasta un límite
const limiteCredito=()=>40000+pendienteCobro()*.3;
const puedePagarSuministro=c=>J.caja-c>=-limiteCredito();
function adelantarCobros(){
  const ok=J.cobros.filter(f=>!f.moroso&&!f.recobro),tot=ok.reduce((a,f)=>a+f.imp,0);if(!tot){toast('No hay facturas que adelantar.','info');return}
  const neto=Math.round(tot*.97);J.caja+=neto;J.cobros=J.cobros.filter(f=>f.moroso||f.recobro);if(R&&R.st)R.st.factoring=(R.st.factoring||0)+(tot-neto);
  toast(`🏦 Factoring: el banco te adelanta ${fmtE(tot)} en facturas y se queda un 3 % (${fmtE(tot-neto)}). Cobras ${fmtE(neto)} ya.`,'bien');guardar();pintarUI(true);
}

/* --------------- Descarga en obra: ritmo de vertido y vida del hormigón --------------- */
const VIDA_HORMIGON = 100;                       // min desde la carga; después, la obra lo rechaza
function ritmoObra(p){ if(!p.ritmo)p.ritmo=esAsf(p)?rint(80,120):p.clase==='particular'?rint(12,18):p.clase==='hotel'?rint(25,35):rint(20,30);return p.ritmo }   // m³/h o t/h
function empezarDescarga(c){
  const p=c.ped;
  if(c.tipo==='hormigonera'&&R.min-(c.cargadoEn||R.min)>VIDA_HORMIGON){
    const edad=Math.round(R.min-c.cargadoEn);p.enCamino-=c.carga;c.sobranteGrande=c.carga;R.st.devueltos=(R.st.devueltos||0)+c.carga;J.rep=Math.max(0,J.rep-2);
    toast(`⛔ ${p.cliente} rechaza los ${c.carga} m³ de ${c.id}: llevaban ${edad} min en la cuba (máximo ${VIDA_HORMIGON}). Vuelve con todo el hormigón.`,'mal');
    c.carga=0;c.ped=null;c.estado='vuelta';c.ruta=invertir(rutaDesdePlanta(p.x,p.y,p.n));liberarObra(p);return;
  }
  p.ocupada=c.id;c.estado='descargando';
  let t=c.carga/ritmoObra(p)*60;if(c.tipo==='hormigonera'&&tiene(choferDe(c),'avanzada'))t*=.85;c.t=t;
  if(c.tipo==='hormigonera')ofrecerReto(c,p);
}
/* ----------------- Minijuego: bombeo en primera persona ----------------- */
// cada obra se bombea según lo que es: piscinas y aljibes (muros del vaso), cimientos (zapatas), muros, edificios (pilares o escalera) y losas
const modoReto=p=>/piscina|aljibe/i.test(p.obra)?'piscina':/cimient|cimentaci/i.test(p.obra)?'zapatas':/muro/i.test(p.obra)?'muro':/edificio|bloque|habitaciones|ampliaci/i.test(p.obra)?(rnd()<.4?'escalera':'pilares'):'suelo';
// viento en niveles avanzados (y algo antes si hoy hace viento)
const vientoReto=()=>J.nivel>=6||(climaHoy()==='viento'&&J.nivel>=4)?(climaHoy()==='viento'?1.3:1):0;
function ofrecerReto(c,p){
  if(window.__prueba||typeof window.abrirMinijuego!=='function'||R.reto||!choferDe(c))return;
  if((R.retosHoy||0)>=2||R.vel<=0)return;
  const prob=!J.retoVisto?1:.14;if(rnd()>prob)return;
  const dif=Math.min(3,1+(J.nivel>=4?1:0)+(J.nivel>=7||p.clase==='hotel'?1:0));
  // en obras pequeñas de particulares muchas veces no hay bomba: se descarga directamente con la canaleta
  const porCanaleta=typeof window.abrirCanaleta==='function'&&!esAsf(p)&&(p.clase==='particular'?rnd()<.55:rnd()<.15);
  R.reto=porCanaleta?{tipo:'canaleta',cid:c.id,pid:p.id,dif,expira:R.min+20}:{cid:c.id,pid:p.id,modo:modoReto(p),dif,expira:R.min+20};R.retosHoy=(R.retosHoy||0)+1;J.retoVisto=true;pintarUI(true);
}
function jugarReto(){
  const r=R.reto;if(!r)return;R.reto=null;
  if(r.tipo==='pala'){const op=operadorPlanta(),s=op&&op.s;window.abrirPala({dif:r.dif,palista:s?s.nombre:'El palista',alTerminar:res=>resultadoPala(res,s,r.dif)}).then(()=>{guardar();pintarUI(true)});return}
  const p=R.pedidos.find(q=>q.id===r.pid),c=R.camiones.find(x=>x.id===r.cid),s=c&&choferDe(c);if(!p||!s){pintarUI(true);return}
  if(r.tipo==='canaleta'){window.abrirCanaleta({dif:r.dif,cliente:p.cliente,chofer:s.nombre,alTerminar:res=>resultadoReto(res,p,s,r.dif,'canaleta')}).then(()=>{guardar();pintarUI(true)});return}
  window.abrirMinijuego({modo:r.modo,dif:r.dif,viento:vientoReto(),cliente:p.cliente,chofer:s.nombre,m3:c.carga,alTerminar:res=>resultadoReto(res,p,s,r.dif)}).then(()=>{guardar();pintarUI(true)});
}
// Pala cargadora: el operario sale un momento y coges tú la pala para llenar las tolvas (1 minuto)
function ofrecerPala(){
  if(window.__prueba||typeof window.abrirPala!=='function'||R.reto||R.vel<=0||!J.retoVisto||(R.palaHoy||0)>=1)return;
  const op=operadorPlanta();if(!op)return;if(rnd()>(J.palaVista?.1:1))return;
  const dif=J.nivel<=2?1:J.nivel<=5?2:3;R.reto={tipo:'pala',dif,palista:op.s.nombre,expira:R.min+20};R.palaHoy=1;J.palaVista=true;pintarUI(true);
}
function resultadoPala(res,s,dif){
  if(!res||res.nota==='nada')return 'El palista vuelve y sigue él con las tolvas.';
  let txt='';
  if(res.nota==='perfecto'){ganarXP(20*dif);R.palaBoost=R.min+240;if(s)s.contento=Math.min(100,s.contento+6);
    txt=`Tolvas llenas y sin mezclar: <b>la planta carga un 10 % más rápido</b> las próximas 4 horas. ${s?esc(s.nombre)+' +6 de ánimo · ':''}<b>${20*dif} XP</b>.`}
  else if(res.nota==='bien'){ganarXP(10*dif);R.palaBoost=R.min+120;if(s)s.contento=Math.min(100,s.contento+3);
    txt=`Buen trabajo: la planta carga algo más rápido las próximas 2 horas y ganas <b>${10*dif} XP</b>.`}
  else{const lim=res.mezclas>.5?rint(120,250):0;J.caja-=lim;R.st.taller+=lim;ensuciar(8);if(s)s.contento=Math.max(0,s.contento-4);
    txt=lim?`Hay que vaciar y limpiar la tolva con el material mezclado (<b>${fmtE(lim)}</b>) y el patio ha quedado sucio.`:'El patio ha quedado lleno de áridos tirados: toca barrer.'}
  toast(res.nota==='mal'?'😬 La pala ha salido regular.':`🚜 Pala: ${res.nota==='perfecto'?'¡perfecto!':'bien hecho'}`,res.nota==='mal'?'mal':'bien');
  return txt;
}
function resultadoReto(res,p,s,dif,que){
  let txt='';const can=que==='canaleta';
  if(!res||res.nota==='nada')return can?`El chófer descarga él solo, como siempre. Ni propina ni quejas.`:`El bombista termina el trabajo él solo, como siempre. Ni propina ni quejas.`;
  if(res.nota!=='mal')R.retoBien=(R.retoBien||0)+1;
  if(res.nota==='perfecto'){const prop=rint(120,260)*dif;J.caja+=prop;R.st.ingresos+=prop;ganarXP(25*dif);s.contento=Math.min(100,s.contento+10);J.rep=Math.min(100,J.rep+1.5);
    txt=`${esc(p.cliente)} está encantado y os da <b>${fmtE(prop)} de propina</b>. ${esc(s.nombre)} sale contentísimo/a (+10) y ganáis <b>${25*dif} XP</b> y reputación.`}
  else if(res.nota==='bien'){const prop=rint(40,100)*dif;J.caja+=prop;R.st.ingresos+=prop;ganarXP(12*dif);s.contento=Math.min(100,s.contento+4);
    txt=`El cliente queda conforme y deja <b>${fmtE(prop)}</b> para unas cervezas. ${esc(s.nombre)} +4 de contento y <b>${12*dif} XP</b>.`}
  else{const lim=rint(150,320);J.caja-=lim;R.st.taller+=lim;s.contento=Math.max(0,s.contento-6);J.rep=Math.max(0,J.rep-1.5);
    txt=`Hay que limpiar el hormigón derramado (<b>${fmtE(lim)}</b>) y ${esc(p.cliente)} se queja. ${esc(s.nombre)} se va de mal humor (−6) y baja la reputación.`}
  toast(res.nota==='mal'?(can?'😬 La descarga ha salido mal: limpieza y quejas.':'😬 El bombeo ha salido mal: limpieza y quejas.'):`${res.nota==='perfecto'?'🏆':'👍'} ${can?'Descarga':'Bombeo'} en ${p.cliente}: ${res.nota==='perfecto'?'¡perfecto!':'bien hecho'}.`,res.nota==='mal'?'mal':'bien');
  return txt;
}
function liberarObra(p){if(p.ocupada&&R.camiones.some(x=>x.id===p.ocupada&&x.estado==='descargando'&&x.ped===p))return;p.ocupada=null;
  const sig=R.camiones.find(x=>x.estado==='esperando'&&x.ped===p);if(sig)empezarDescarga(sig)}
function terminar(c){
  if((c.tipo==='hormigonera'||c.tipo==='asfaltera')&&c.estado==='descargando'){
    const p=c.ped;p.entregado+=c.carga;p.enCamino-=c.carga;const ing=c.carga*p.precio*(c.frio?.85:1);c.frio=false;facturar(p,ing);if(esAsf(p))R.st.t=(R.st.t||0)+c.carga;else R.st.m3+=c.carga;
    c.carga=0;c.ped=null;c.estado='vuelta';c.ruta=invertir(rutaDesdePlanta(p.x,p.y,p.n));liberarObra(p);
    if(p.entregado>=p.m3){p.estado='servido';R.st.servidos++;const puntual=p.llegada<=p.hora+30;fidelidad(p,(puntual?1:.4)+(p.falta?1:0));faltaHormigon(p);J.rep=Math.min(100,J.rep+(puntual?2:.5));ganarXP(Math.round(p.m3*(esAsf(p)?.4:1))+(puntual?15:4)+(p.clase==='publica'?10:0));
      toast(`🏁 Obra servida: ${p.cliente} · ${p.m3} ${ud(p)} · ${fmtE(p.m3*p.precio)}`,'bien')}
  } else if(c.tipo==='banera'&&c.estado==='cargando'){c.estado='vuelta';c.carga=CAP.banera;c.ruta=invertir(SIT.rutaCantera)}
  else if(c.tipo==='banera'&&c.estado==='descargando'){ensuciar(.6);J.acopio=Math.min(J.capAcopio,J.acopio+c.carga);c.carga=0;c.estado='libre';aparcar(c,R.camiones.indexOf(c))}
  else if(c.tipo==='cisterna'&&c.estado==='descargando'&&c.mat==='arido'){J.acopio=Math.min(J.capAcopio,J.acopio+c.carga);R.aridoPedido-=c.carga;ensuciar(.6);c.carga=0;c.estado='vuelta';c.ruta=invertir(c.rutaIda)}
  else if(c.tipo==='cisterna'&&c.estado==='descargando'&&c.mat==='betun'){J.betun=Math.min(J.capBetun,J.betun+c.carga);R.betunPedido-=c.carga;c.carga=0;c.estado='vuelta';c.ruta=invertir(c.rutaIda)}
  else if(c.tipo==='cisterna'&&c.estado==='descargando'){J.silo=Math.min(J.capSilo,J.silo+c.carga);R.cementoPedido-=c.carga;c.carga=0;c.estado='vuelta';c.ruta=invertir(c.rutaIda)}
  pintarUI(true);
}
function pedirCemento(auto){
  const coste=CAP.cisterna*precioCemento();
  if(!puedePagarSuministro(coste)){if(!auto)toast('💸 Se ha agotado la póliza de crédito: no se puede pagar el cemento. Adelanta cobros o reduce gastos.','mal');else aviso('credito','💸 Sin crédito para comprar cemento. Adelanta cobros (factoring) en la pestaña Obras.');return}
  J.caja-=coste;R.st.cemento+=coste;R.cementoPedido=(R.cementoPedido||0)+CAP.cisterna;
  const ruta=invertir(SIT.rutaPuerto);
  R.nCis=(R.nCis||0)+1;
  const c={id:'CEM-'+R.nCis,tipo:'cisterna',chofer:null,estado:'ida',ruta,rutaIda:ruta,t:0,carga:CAP.cisterna,km:0,x:SIT.puerto.x,y:SIT.puerto.y,ang:0,giro:0};
  c.rutaIda=hacerRuta(ruta.pts);R.camiones.push(c);
  toast(`🚛 Cisterna de cemento (25 t) sale del puerto · ${fmtE(coste)}`,'info');pintarUI(true);
}
function aviso(k,txt){if(avisos[k]&&R.min-avisos[k]<45)return;avisos[k]=R.min;toast(txt,'mal')}

/* ------------------------------ Paso ------------------------------ */
const FIN_TARDE = 22*60;
const mecNoche = () => J.personal.filter(s=>s.rol==='mecanico'&&s.noche&&disponible(s));
function paso(dt){
  R.min+=dt;
  // Tarde/noche: la planta ya ha cerrado y solo trabaja el mecánico de noche en el taller hasta las 22:00
  if(R.tarde){trabajoTaller(dt);for(const c of R.camiones)if(c.lavarHasta&&c.lavarHasta<R.min)c.lavarHasta=0;
    if(R.min>=FIN_TARDE)cerrarDia();return}
  itvPaso();objPaso();
  // Llamadas (solo si hay alguien en la oficina)
  if(R.min>=R.sigLlamada&&R.min<ULT_LLAMADA){
    // sin nadie en oficina coges tú el teléfono: entran menos llamadas y el cliente espera menos
    const ofi=hayRol('oficina');if(ofi||rnd()<.55){nuevaLlamada();if(!ofi){const p=R.pedidos[R.pedidos.length-1];if(p&&p.estado==='llamada'&&!p.sinOfi){p.sinOfi=true;p.expira=R.min+25}}}
    R.sigLlamada=R.min+rint(30,75)*(1.3-J.rep/170)*(rolCon('oficina','clientes')?.85:1)*Math.sqrt(.2/cuotas().H)*(R.clima==='lluvia'?1.7:1)*(1-Math.min(.25,estrellasTotal()*.025))}
  contraofertas();
  for(const p of R.pedidos)if(p.estado==='llamada'&&R.min>p.expira){p.estado='perdido';R.st.perdidos++;toast(`📵 ${p.cliente} colgó: buscará otra planta.`,'mal');pintarUI(true)}
  // Camiones (los averiados se quedan parados donde estén)
  for(const c of R.camiones.slice()){
    if(c.chofer&&averiada(c.id)){fraguado(c);continue}
    // si el que ocupaba la obra ya no está descargando (avería, se fue…), entra el siguiente
    if(c.estado==='esperando'&&c.ped){const occ=R.camiones.find(x=>x.id===c.ped.ocupada);
      if(!occ||occ.estado!=='descargando'||occ.ped!==c.ped||averiada(occ.id)){c.ped.ocupada=null;empezarDescarga(c)}continue}
    const paradoCantera=c.tipo==='banera'&&c.estado==='cargando'&&J.canteraPropia&&averiada('cantera');
    if(c.ruta)moverPorRuta(c,dt);else if(c.t>0&&!paradoCantera){c.t-=dt;if(c.estado==='descargando'&&c.tipo==='hormigonera')c.giro+=dt*.8;if(c.t<=0)terminar(c)}}
  // Despacho de hormigoneras
  if(R.min<CORTE)for(const c of R.camiones){
    if(c.tipo!=='hormigonera'||c.estado!=='libre'||c.retenido||averiada(c.id)||!conductor(c))continue;
    const cap=capCuba();
    // enviado a mano a una obra concreta (órdenes en grupo): sale ya
    let res=c.reserva&&R.pedidos.find(q=>q.id===c.reserva&&q.estado==='aceptado'&&restante(q)>0);if(c.reserva&&!res)c.reserva=null;
    // las salidas se escalonan al ritmo al que la obra puede recibir (para que no esperen ni se pase el hormigón)
    const cand=res?[res]:R.pedidos.filter(p=>!esAsf(p)&&p.estado==='aceptado'&&restante(p)>0&&(R.min>=p.hora-minutosViaje(p)-(cap/ritmo()*60)*(1+R.cola.length/J.lineas)-15)&&R.min>=(p.sigSalida||0)).sort((a,b)=>(b.urgente?1:0)-(a.urgente?1:0)||a.hora-b.hora);
    if(!cand.length)continue;const p=cand[0];c.reserva=null;const carga=Math.min(cap,restante(p));
    c.ped=p;c.carga=carga;p.enCamino+=carga;c.estado='cola';R.cola.push(c);ofrecerPala();p.sigSalida=R.min+carga/ritmoObra(p)*60*.85;
  }
  // Línea de carga de la planta (parada si está averiada)
  // (con la 2ª línea se cargan dos hormigoneras a la vez: R.cargando y R.cargando2)
  const plantaRota=averiada('planta');
  for(let l=0;l<J.lineas;l++){
    const k=l?'cargando2':'cargando';
    if(R[k]&&!plantaRota){R[k].t-=dt;if(R[k].t<=0){const c=R[k].c;R[k]=null;c.estado='ida';c.cargadoEn=R.min;c.ruta=rutaDesdePlanta(c.ped.x,c.ped.y,c.ped.n);pintarUI(true)}}
    if(!R[k]&&R.cola.length){
      if(plantaRota){aviso('rota','🔧 La planta está averiada: las hormigoneras esperan.');break}
      const op=operadorPlanta();
      if(!op){aviso('planta','🏭 No hay nadie que sepa manejar la planta: las hormigoneras esperan. Contrata un operario.');break}
      if(op.f<1&&!R.avisoCubre){R.avisoCubre=true;toast(`🏭 No hay operario de planta: ${op.s.nombre} (${ROLES[op.s.rol]}) la lleva hoy, más despacio.`,'mal')}
      const c=R.cola[0],p=c.ped,cem=c.carga*TIPOS_H[p.tipo].cem*factorCem(),ari=c.carga*ARIDO_M3;
      if(J.silo<cem){aviso('cem','⚠️ Falta cemento en el silo: la hormigonera espera.');break}
      if(J.acopio<ari){aviso('ari','⚠️ Faltan áridos en los acopios: la hormigonera espera.');break}
      J.silo-=cem;J.acopio-=ari;R.cola.shift();c.estado='cargando';c.linea=l;R[k]={c,t:c.carga/ritmo()*60/op.f};ensuciar(c.carga*.26*(J.recicladora?.75:1));
      const m=maq('planta');m.cond=Math.max(0,m.cond-c.carga*.05*(hecha('rascadores')?.6:1));
    }
  }
  // Planta de asfalto: despacho y carga de asfalteras
  if(J.asfalto){
    R.colaA=R.colaA||[];
    if(R.min<CORTE)for(const c of R.camiones){
      if(c.tipo!=='asfaltera'||c.estado!=='libre'||c.retenido||averiada(c.id)||!conductor(c))continue;
      let res=c.reserva&&R.pedidos.find(q=>q.id===c.reserva&&q.estado==='aceptado'&&restante(q)>0);if(c.reserva&&!res)c.reserva=null;
      const cand=res?[res]:R.pedidos.filter(p=>esAsf(p)&&p.estado==='aceptado'&&restante(p)>0&&(R.min>=p.hora-minutosViaje(p)-ASF.cap/ASF.ritmo*60*(1+R.colaA.length)-15)&&R.min>=(p.sigSalida||0)).sort((a,b)=>(b.urgente?1:0)-(a.urgente?1:0)||a.hora-b.hora);
      if(!cand.length)continue;const p=cand[0];c.reserva=null,carga=Math.min(ASF.cap,restante(p));c.ped=p;c.carga=carga;p.enCamino+=carga;c.estado='cola';R.colaA.push(c);p.sigSalida=R.min+carga/ritmoObra(p)*60*.85;
    }
    if(R.cargandoA&&!averiada('asfalto')){R.cargandoA.t-=dt;if(R.cargandoA.t<=0){const c=R.cargandoA.c;R.cargandoA=null;c.estado='ida';c.cargadoEn=R.min;c.ruta=rutaDesdePlanta(c.ped.x,c.ped.y,c.ped.n);pintarUI(true)}}
    if(!R.cargandoA&&R.colaA.length){
      const c=R.colaA[0],bet=c.carga*ASF.tipos[c.ped.tipo].bet,ari=c.carga*.95;
      if(averiada('asfalto'))aviso('rotaA','🔧 La planta de asfalto está averiada.');
      else if(!operadorPlanta())aviso('planta','🏭 No hay nadie que sepa manejar la planta.');
      else if(J.betun<bet)aviso('bet','⚠️ Falta betún: la asfaltera espera.');
      else if(J.acopio<ari)aviso('ari','⚠️ Faltan áridos en los acopios.');
      else{J.betun-=bet;J.acopio-=ari;R.colaA.shift();c.estado='cargando';R.cargandoA={c,t:c.carga/ASF.ritmo*60};
        const g=c.carga*6;J.caja-=g;R.st.gasoil+=g;                                       // gas del quemador
        const m=maq('asfalto');m.cond=Math.max(0,m.cond-c.carga*.03)}
    }
    if(R.cargandoA)probarAveria('asfalto',dt,1);
    if(R.min<FIN&&J.betun+(R.betunPedido||0)<J.capBetun*.35)pedirBetun(true);
  }
  // Averías al azar en lo que está trabajando (más probables cuanto más gastado)
  for(const c of R.camiones)if(c.chofer&&c.estado!=='libre')probarAveria(c.id,dt,tiene(choferDe(c),'cap')?.75:1);
  if(R.cargando||R.cargando2)probarAveria('planta',dt,1);
  if(J.canteraPropia&&R.camiones.some(c=>c.tipo==='banera'&&c.estado==='cargando'))probarAveria('cantera',dt,hecha('machacadora')?.6:1);
  trabajoTaller(dt);
  // Limpieza: el operario de planta limpia cuando la línea está parada; los peones, toda la jornada
  if(R.min<FIN){
    const quieta=!R.cargando&&!R.cargando2&&!R.cola.length&&!R.cargandoA;
    let l=0;for(const s of J.personal){if(!disponible(s))continue;if(s.rol==='peon')l+=.075;else if(s.rol==='planta'&&quieta)l+=.035}
    if(encargadoAct())l*=1.3;
    R.limpiando=l>0;ensuciar(-l*dt);
  } else R.limpiando=false;
  if(J.suciedad>55&&(R.cargando||R.cargando2))probarAveria('planta',dt,(J.suciedad-55)/80);
  // Bañera: reponer áridos en horario normal
  for(const c of R.camiones){
    if(c.tipo!=='banera'||c.estado!=='libre'||c.retenido||averiada(c.id)||R.min>FIN-35||!conductor(c))continue;
    const enCamino=R.camiones.filter(b=>b.tipo==='banera'&&b.estado!=='libre').length*CAP.banera;
    if(J.acopio+enCamino<J.capAcopio*.8&&J.acopio+enCamino+CAP.banera<=J.capAcopio){c.estado='ida';c.ruta=hacerRuta(SIT.rutaCantera.pts)}
  }
  // Cemento automático
  if(J.autoCemento&&(R.min<FIN||R.cola.length)&&R.min<CORTE&&J.silo+(R.cementoPedido||0)<J.capSilo*.35)pedirCemento(true);
  // Áridos de proveedor si la bañera no puede ir y se están acabando
  if(R.min<FIN&&J.acopio+(R.aridoPedido||0)<J.capAcopio*.15){const ban=R.camiones.filter(c=>c.tipo==='banera');
    const puede=ban.some(c=>!averiada(c.id)&&(c.estado!=='libre'||conductor(c)));if(!puede)pedirAridos(true)}
  // Horas extra
  if(R.min>FIN){
    const activos=new Set();
    for(const c of R.camiones)if(c.chofer&&c.estado!=='libre')activos.add((R.sust&&R.sust[c.id])||c.chofer);
    // la planta y la oficina solo se quedan si aún hay que cargar (no por esperar a que vuelvan los camiones)
    const porCargar=R.cargando||R.cargando2||R.cargandoA||R.cola.length||(R.colaA&&R.colaA.length)||R.pedidos.some(p=>p.estado==='aceptado'&&p.m3-p.entregado-p.enCamino>0);
    if(porCargar)J.personal.forEach(s=>{if(s.rol==='planta')activos.add(s.id)});
    if(porCargar&&R.pedidos.some(p=>p.estado==='aceptado'&&p.m3-p.entregado-p.enCamino>0))J.personal.forEach(s=>{if(s.rol==='oficina')activos.add(s.id)});
    for(const s of J.personal)if(s.rol==='mecanico'&&!s.noche&&s.tarea&&s.tarea.tipo!=='mant')activos.add(s.id);
    for(const id of activos){const s=persona(id);if(s&&disponible(s))s.extraHoy+=dt}
  }
  // ¿Fin de jornada?
  if(R.min>=FIN){
    const pend=R.pedidos.some(p=>p.estado==='aceptado'&&restante(p)>0);
    const ocupados=R.camiones.some(c=>c.tipo!=='cisterna'&&c.estado!=='libre');
    if(R.min>=CORTE&&pend&&!R.cerrando){R.cerrando=true;toast('🌙 Son las '+fmtH(CORTE)+': se para la producción. Lo que falte queda sin servir.','mal')}
    if((!ocupados&&(!pend||R.min>=CORTE))||R.min>=CORTE+60){
      // con mecánico de noche la planta cierra pero el taller sigue hasta las 22:00 (se ve en directo)
      if(!R.huelga&&R.min<FIN_TARDE-15&&mecNoche().length&&!window.__prueba){cerrarPlanta();R.tarde=true;R.tardeDesde=R.min;
        toast(`🌙 La planta cierra. ${mecNoche().map(s=>s.nombre).join(' y ')} sigue en el taller hasta las 22:00. Pulsa ⏭ para saltar.`,'info');pintarUI(true)}
      else cerrarDia();
    }
  }
}

/* --------------------------- Averías y taller --------------------------- */
// Al principio la empresa es pequeña y tranquila: menos averías y menos desgaste del personal
const suave=()=>J.nivel<=2?.45:J.nivel<=4?.7:1;
function probarAveria(id,dt,factor){
  const m=maq(id);if(m.averia)return;
  const p=.00007*(1+((100-m.cond)/40)**2)*factor*suave()*dt;
  if(rnd()<p)averiar(id);
}
function averiar(id){
  const m=maq(id);if(m.averia)return;
  const grave=rnd()<.06+(100-m.cond)/300;
  const DESC={planta:['Se ha atascado la cinta','Falla el motor de la amasadora','Avería eléctrica en el cuadro'],cantera:['Se rompe la machacadora','La pala tiene una fuga hidráulica'],
    hormigonera:['Pinchazo','Falla la bomba hidráulica de la cuba','Avería en el embrague'],banera:['Pinchazo','Falla el volquete','Avería en el embrague'],
    asfaltera:['Pinchazo','Falla el volquete','Se rompe la lona térmica'],asfalto:['Se apaga el quemador','Atasco en el tambor secador','Falla la bomba de betún']};
  const c=R.camiones.find(c=>c.id===id),tipo=c?c.tipo:id;
  // tiempos de reparación reales: un pinchazo o un atasco se arreglan en 15-45 min; lo grave, unas horas
  m.averia={grave,total:grave?rint(90,220):rint(15,45),prog:0,coste:grave?rint(500,1800):rint(80,220),desde:R.min,ext:false,asignada:null,viaje:0,desc:pick(DESC[tipo]||DESC.planta)};
  R.st.averias++;
  if(c&&c.estado==='cola'){R.cola=R.cola.filter(x=>x!==c);if(R.colaA)R.colaA=R.colaA.filter(x=>x!==c);c.ped.enCamino-=c.carga;c.carga=0;c.ped=null;c.estado='libre'}
  toast(`🔧 Avería ${grave?'GRAVE':'leve'} en ${nombreMaq(id)}: ${m.averia.desc}.`,'mal');
  // sin mecánico: si es leve y el chófer está, lo intenta él primero; si es grave (o no hay chófer), taller externo
  if(!J.personal.some(s=>s.rol==='mecanico'&&disponible(s))&&!(c&&!grave&&disponible(choferDe(c))))tallerExterno(id,true);
  pintarUI(true);
}
function lejosDePlanta(id){const c=R.camiones.find(c=>c.id===id);return c&&Math.hypot(c.x-SIT.planta.x,c.y-SIT.planta.y)>.3?c:null}
function tallerExterno(id,auto){
  const m=maq(id),a=m.averia;if(!a||a.ext)return;
  if(a.asignada){const s=persona(a.asignada);if(s)s.tarea=null;a.asignada=null}
  a.ext=true;a.viaje=40;a.coste=Math.round(a.coste*1.8)+(lejosDePlanta(id)?300:0);
  toast(`📞 ${auto?'No tienes mecánico: ':''}llamamos al taller externo para ${nombreMaq(id)} (${fmtE(a.coste)}).`,'info');pintarUI(true);
}
function reparado(id){
  const m=maq(id),a=m.averia;J.caja-=a.coste;R.st.taller+=a.coste;m.cond=Math.min(100,m.cond+30);m.averia=null;
  const c=R.camiones.find(c=>c.id===id);
  if(c&&c.fraguado){c.fraguado=false;c.estado='vuelta';c.ped=null;c.carga=0;c.ruta=rutaAPlanta(c.x,c.y)}
  toast(`✅ ${nombreMaq(id)} reparado/a (${fmtE(a.coste)} en piezas y mano de obra).`,'bien');pintarUI(true);
}
// Si una hormigonera cargada se queda parada mucho rato, el hormigón fragua en la cuba
function fraguado(c){
  const a=maq(c.id).averia;
  if(c.tipo==='hormigonera'&&c.carga>0&&c.ped&&!c.fraguado&&R.min-a.desde>100&&(c.estado==='ida'||c.estado==='descargando'||c.estado==='esperando')){
    c.fraguado=true;c.ped.enCamino-=c.carga;J.caja-=250;R.st.taller+=250;
    toast(`🪨 El hormigón ha fraguado en la cuba de ${c.id}: se pierden ${c.carga} m³ y hay que limpiarla (250 €).`,'mal');c.carga=0;
  }
}
function rutaAPlanta(x,y){const n=nodoCercano(x,y);const r=rutaDesdePlanta(x,y,n);return invertir(r)}
// Los chóferes también arreglan su camión (más despacio que un mecánico: se suman) y lo cuidan cuando están parados en planta
const chofArregla = id => {const c=R.camiones.find(x=>x.id===id);const s=c&&c.chofer?choferDe(c):null;return !!(s&&disponible(s)&&!(R.tarde))};
function chofTaller(dt){
  if(R.tarde)return;
  for(const c of R.camiones){if(!c.chofer)continue;const s=choferDe(c);if(!disponible(s)){c.chofArr=false;continue}
    const m=maq(c.id),a=m.averia;
    if(a){if(a.ext){c.chofArr=false;continue}
      const ef=(a.grave?.2:.4)*(1+.15*(s.cat||0))*(tiene(s,'cap')?1.1:1);a.prog+=dt*ef;c.chofArr=true;
      if(a.prog>=a.total){const mec=a.asignada&&persona(a.asignada);if(mec)mec.tarea=null;toast(`🔧 ${s.nombre} ha arreglado ${c.id}${mec?' junto con '+mec.nombre:''}.`,'bien');reparado(c.id)}}
    else{c.chofArr=false;if(c.estado==='libre'&&R.min<FIN&&!(c.lavarHasta>R.min)&&m.cond<92)m.cond=Math.min(100,m.cond+dt*.03)}}
}
function trabajoTaller(dt){
  chofTaller(dt);
  // si una avería lleva media hora sin ningún mecánico disponible, se llama al taller externo
  if(!J.personal.some(s=>s.rol==='mecanico'&&disponible(s)))for(const id in J.maq){const a=J.maq[id].averia;if(a&&!a.ext&&!a.asignada&&R.min-a.desde>(chofArregla(id)?150:30))tallerExterno(id,true)}
  // taller externo
  for(const id in J.maq){const a=J.maq[id].averia;if(!a||!a.ext)continue;if(a.viaje>0)a.viaje-=dt;else{a.prog+=dt/1.5;if(a.prog>=a.total)reparado(id)}}
  for(const s of J.personal){
    if(s.rol!=='mecanico'||!disponible(s)||(R.tarde&&!s.noche))continue;
    const ef=efMec(s);
    if(!s.tarea){
      // 1º averías sin asignar (las graves primero)
      const ids=Object.keys(J.maq).filter(id=>{const a=J.maq[id].averia;return a&&!a.ext&&!a.asignada}).sort((x,y)=>J.maq[y].averia.grave-J.maq[x].averia.grave);
      if(ids.length){const id=ids[0],a=J.maq[id].averia,c=lejosDePlanta(id);a.asignada=s.id;a.viaje=c?Math.hypot(c.x-SIT.planta.x,c.y-SIT.planta.y)*1.3/50*60:0;a.viaje0=a.viaje;s.tarea={tipo:'rep',id}}
      // 2º mejoras pendientes de instalar
      else{const ins=J.instalando.find(i=>!i.asignada);
        if(ins){ins.asignada=s.id;s.tarea={tipo:'mej',id:ins.id}}
        // 3º mantenimiento preventivo en horario normal
        else if(R.min<FIN||s.noche){
          const cand=['planta',...(J.asfalto?['asfalto']:[]),...R.camiones.filter(c=>c.chofer&&c.estado==='libre').map(c=>c.id)].filter(id=>!averiada(id)&&maq(id).cond<97&&!J.personal.some(o=>o.tarea&&o.tarea.tipo==='mant'&&o.tarea.id===id));
          if(cand.length){cand.sort((a,b)=>maq(a).cond-maq(b).cond);s.tarea={tipo:'mant',id:cand[0]}}
        }
      }
    }
    const t=s.tarea;if(!t)continue;
    if(t.tipo==='rep'){const a=maq(t.id).averia;if(!a||a.ext||a.asignada!==s.id){s.tarea=null;continue}
      if(a.viaje>0)a.viaje-=dt;else{a.prog+=dt*ef;if(a.prog>=a.total){s.tarea=null;reparado(t.id)}}}
    else if(t.tipo==='mej'){const ins=J.instalando.find(i=>i.id===t.id);if(!ins){s.tarea=null;continue}
      ins.prog+=dt*ef;if(ins.prog>=MEJORAS_MAQ[ins.id].horas*60){J.mejMaq[ins.id]=true;J.instalando=J.instalando.filter(i=>i!==ins);s.tarea=null;toast(`🛠️ ${s.nombre} ha terminado de instalar: ${MEJORAS_MAQ[ins.id].n}.`,'bien');guardar();pintarUI(true)}}
    else if(t.tipo==='mant'){const m=maq(t.id),c=R.camiones.find(c=>c.id===t.id);
      if((R.min>=FIN&&!s.noche)||m.cond>=100||averiada(t.id)||(c&&c.estado!=='libre')){s.tarea=null;continue}
      m.cond=Math.min(100,m.cond+dt*.12*ef)}
  }
}
// Turno de tarde/noche: 8 h de taller con la planta parada. Primero termina las averías pendientes,
// luego instala mejoras y después revisa camiones y planta (los peores primero).
function turnoNoche(eventos,minutos){
  const noct=J.personal.filter(s=>s.rol==='mecanico'&&s.noche&&s.baja<=0&&!deVacaciones(s)&&!(s.curso&&s.curso.empezado&&!s.curso.horas));
  for(const s of noct){
    let min=minutos===undefined?480:minutos;if(min<=5)continue;const ef=efMec(s),hecho=[],revis=[];
    for(const id of Object.keys(J.maq).sort((x,y)=>(J.maq[y].averia&&J.maq[y].averia.grave)-(J.maq[x].averia&&J.maq[x].averia.grave))){
      const a=J.maq[id].averia;if(!a||min<=0)continue;if(a.ext){continue}
      const falta=(a.total-a.prog)/ef;if(falta<=min){min-=falta;a.prog=a.total;a.asignada=null;const m=J.maq[id];J.caja-=a.coste;R.st.taller+=a.coste;m.cond=Math.min(100,m.cond+30);m.averia=null;
        const c=R.camiones.find(c=>c.id===id);if(c&&c.fraguado){c.fraguado=false;c.estado='libre';c.ped=null;c.carga=0}hecho.push(nombreMaq(id))}
      else{a.prog+=min*ef;min=0}}
    for(const ins of J.instalando.slice()){if(min<=0)break;const tot=MEJORAS_MAQ[ins.id].horas*60,falta=(tot-ins.prog)/ef;
      if(falta<=min){min-=falta;J.mejMaq[ins.id]=true;J.instalando=J.instalando.filter(i=>i!==ins);hecho.push('mejora: '+MEJORAS_MAQ[ins.id].n)}else{ins.prog+=min*ef;min=0}}
    const ids=['planta',...(J.asfalto?['asfalto']:[]),...(J.canteraPropia?['cantera']:[]),...J.flota.map(f=>f.id)];
    while(min>5){const id=ids.filter(i=>!maq(i).averia&&maq(i).cond<99).sort((a,b)=>maq(a).cond-maq(b).cond)[0];if(!id)break;
      const m=maq(id),t=Math.min(min,90,(100-m.cond)/(.12*ef));m.cond=Math.min(100,m.cond+t*.12*ef);min-=t;if(!revis.includes(id))revis.push(id)}
    s.contento=Math.min(100,s.contento+1);
    if(hecho.length||revis.length)eventos.push(`🌙 <b>${esc(s.nombre)}</b> (turno de noche)${hecho.length?` ha reparado ${hecho.map(esc).join(', ')}`:''}${hecho.length&&revis.length?' y':''}${revis.length?` ha revisado ${revis.map(i=>esc(nombreMaq(i))).join(', ')}`:''}.`);
  }
}
function tareaTxt(s){const t=s.tarea;if(!disponible(s))return enCurso(s)?'De curso':'De baja';if(!t)return 'Libre en el taller';
  if(t.tipo==='rep'){const a=maq(t.id).averia;return a&&a.viaje>0?`Va hacia ${nombreMaq(t.id)} (${Math.ceil(a.viaje)} min)`:`Reparando ${nombreMaq(t.id)}${a?` · ${Math.round(a.prog/a.total*100)} %`:''}`}
  if(t.tipo==='mej'){const i=J.instalando.find(i=>i.id===t.id);return `Instalando: ${MEJORAS_MAQ[t.id].n}${i?` · ${Math.round(i.prog/(MEJORAS_MAQ[t.id].horas*60)*100)} %`:''}`}
  return `Mantenimiento de ${nombreMaq(t.id)}`}
function contratarMecanico(){
  const n=J.personal.filter(s=>s.rol==='mecanico').length;if(n>=MAX_MECANICOS)return;
  if(!puede('mecanico')){toast(`🔒 Se desbloquea en el nivel ${DESBLOQ.mecanico}.`,'mal');return}
  if(J.caja<COSTE_MECANICO){toast('💸 No hay caja suficiente.','mal');return}
  J.caja-=COSTE_MECANICO;
  const libres=['Ruymán','Nauzet','Tanausú','Iballa','Elena','Pedro','Yurena'].filter(x=>!J.personal.some(s=>s.nombre===x));
  const s={id:'m'+(n+1)+rint(100,999),nombre:pick(libres),rol:'mecanico',salario:100,contento:85,baja:0,extraHoy:0,extraTotal:0,cursos:[],curso:null,tarea:null,diasTrab:0,vac:null,cat:0,xpT:0,estancado:0};
  // el 2º mecánico entra en turno de tarde/noche (se puede cambiar en la pestaña Taller)
  if(n>=1&&!J.personal.some(x=>x.rol==='mecanico'&&x.noche))s.noche=true;
  J.personal.push(s);toast(`🧰 ${s.nombre} se incorpora como mecánico/a nº ${n+1}${s.noche?' en turno de tarde/noche: dejará la flota revisada para el día siguiente':''}.`,'bien');guardar();pintarUI(true);
}
function comprarMejoraMaq(id){
  const M=MEJORAS_MAQ[id];if(!M||hecha(id)||J.instalando.some(i=>i.id===id))return;
  if(!puede('mejMaq')){toast(`🔒 Se desbloquea en el nivel ${DESBLOQ.mejMaq}.`,'mal');return}
  if(!J.personal.some(s=>s.rol==='mecanico')){toast('Necesitas al menos un mecánico propio para instalarlo.','mal');return}
  if(M.req==='cantera'&&!J.canteraPropia){toast('Primero tienes que comprar la cantera.','mal');return}
  if(J.caja<M.coste){toast('💸 No hay caja suficiente.','mal');return}
  J.caja-=M.coste;J.instalando.push({id,prog:0,asignada:null});toast(`📦 Comprado: ${M.n}. Un mecánico lo instalará (${M.horas} h de trabajo).`,'info');guardar();pintarUI(true);
}
/* -------------------- Licitaciones públicas y contratos -------------------- */
function costeM3(tipo,km){return TIPOS_H[tipo].cem*factorCem()*precioCemento()+ARIDO_M3*precioArido()+2*km*PRECIO.gasoil/capCuba()}
function nuevaLicitacion(){
  for(let k=0;k<10;k++){
    const[org,pue]=pick(ORGANISMOS);const t=pue?PUEBLOS.find(p=>p[0]===pue):pick(PUEBLOS.filter(p=>p[3]!=='aldea'&&!p[4].includes('Graciosa')));
    const pt=puntoEnPueblo(t);if(!pt)continue;const n=nodoCercano(pt[0],pt[1]);if(!isFinite(ARB.dist[n]))continue;
    const km=kmDesdePlanta(pt[0],pt[1],n),tipo=pick(['HA-25','HA-30']),dias=rint(3,8),m3Dia=rint(3,6)*8;
    const base=Math.round(costeM3(tipo,km)*1.38+rint(0,8));
    J.licitaciones.push({id:++J.seq,org,obra:pick(OBRAS_PUB),pueblo:t[0],x:pt[0],y:pt[1],n,km,tipo,dias,m3Dia,base,cierre:J.nDia+2,oferta:null});
    toast(`📜 Nueva licitación: ${org} · ${pick(['','',''])}${dias} días × ${m3Dia} m³. Ofertas hasta dentro de 2 días.`,'info');pestanaAviso();return;
  }
}
function pestanaAviso(){if(pestana!=='llamadas')$('jTabLl')?.classList.add('aviso')}
function ofertar(id,precio){const l=J.licitaciones.find(x=>x.id===id);if(!l)return;l.oferta=Math.round(precio);toast(`📨 Oferta presentada: ${l.oferta} €/m³ a ${l.org}.`,'info');guardar();pintarUI(true)}
function resolverLicitaciones(){
  const quedan=[];
  for(const l of J.licitaciones){
    if(l.cierre>J.nDia){quedan.push(l);continue}
    const rivales=rivalesActivos().map(k=>RIVALES[k]).map(r=>({n:r.n,p:Math.round(l.base*r.agresivo*(.93+rnd()*.12))}));
    const mejor=rivales.length?rivales.reduce((a,b)=>a.p<b.p?a:b):{n:'nadie',p:l.base*1.01};
    if(l.oferta){
      const nuestra=l.oferta*(1-(J.rep-50)/400);           // la reputación también puntúa
      if(nuestra<mejor.p){J.contratos.push({id:l.id,org:l.org,obra:l.obra,pueblo:l.pueblo,x:l.x,y:l.y,n:l.n,km:l.km,tipo:l.tipo,precio:l.oferta,m3Dia:l.m3Dia,diasRest:l.dias});
        toast(`🏆 ¡Licitación ganada! ${l.org}: ${l.obra} en ${l.pueblo}, ${l.dias} días × ${l.m3Dia} m³ a ${l.oferta} €/m³.`,'bien');ganarXP(40)}
      else toast(`📉 ${l.org} adjudica «${l.obra}» a ${mejor.n} por ${mejor.p} €/m³ (tu oferta: ${l.oferta}).`,'mal');
    } else toast(`📜 ${l.org} adjudica «${l.obra}» a ${mejor.n} (${mejor.p} €/m³). No te presentaste.`,'info');
  }
  J.licitaciones=quedan;
}
function pedidosDeContratos(){
  for(const ct of J.contratos){
    R.pedidos.push({id:++J.seq,clase:'publica',contrato:ct.id,cliente:ct.org,obra:ct.obra,pueblo:ct.pueblo,x:ct.x,y:ct.y,n:ct.n,m3:ct.m3Dia,tipo:ct.tipo,precio:ct.precio,
      hora:600,km:ct.km,estado:'aceptado',expira:0,entregado:0,enCamino:0,llegada:null});
    ct.diasRest--;
  }
  J.contratos=J.contratos.filter(c=>c.diasRest>0);
}
/* --------------------------- Competencia --------------------------- */
const rivalesActivos = () => Object.keys(RIVALES).filter(k=>!J.rivales[k].comprada);
function cuotas(){
  const w={H:.08+J.rep/450+J.nivel*.025+(J.lineas-1)*.05+(J.flota.filter(f=>f.tipo==='hormigonera').length-2)*.03+(J.deleg&&J.deleg.sur?DELEG.sur.cuota:0)};
  for(const k of Object.keys(RIVALES)){if(J.rivales[k].comprada)w.H+=RIVALES[k].fuerza*.8;else w[k]=RIVALES[k].fuerza}
  const tot=Object.values(w).reduce((a,b)=>a+b,0);for(const k in w)w[k]/=tot;return w;
}
const guerraActiva = () => J.guerra&&J.guerra.hasta>=J.nDia&&!J.rivales[J.guerra.r].comprada;
function eventosCompetencia(){
  if(!guerraActiva()&&J.nDia>5&&rnd()<.07&&rivalesActivos().length){const r=pick(rivalesActivos());J.guerra={r,hasta:J.nDia+rint(4,7)};
    toast(`⚔️ Guerra de precios: ${r} baja precios en toda la isla. Los clientes te pedirán ~5 €/m³ menos hasta el día ${J.guerra.hasta}.`,'mal')}
}
// Un rival intenta quitarte una obra mientras el cliente decide
function contraofertas(){
  for(const p of R.pedidos){
    if(p.estado!=='llamada'||p.contra||p.sinContra||R.min<p.creado+10)continue;
    p.sinContra=true;const act=rivalesActivos();if(!act.length||rnd()>.2)continue;
    const r=pick(act),precio=p.precio-rint(3,6);p.contra={r,precio};p.expira=Math.min(p.expira,R.min+15);
    toast(`📞 ${p.cliente}: «${r} me lo deja a ${precio} €/m³». ¿Igualas?`,'mal');pintarUI(true);
  }
}
function igualar(id){const p=R.pedidos.find(q=>q.id===id);if(!p||!p.contra)return;p.precio=p.contra.precio;p.contra=null;p.expira=R.min+20;toast(`🤝 Igualas el precio: ${p.precio} €/m³. ${p.cliente} se lo piensa…`,'info');pintarUI(true)}
function contratar(rol){
  const coste=500;if(J.caja<coste){toast('💸 No hay caja suficiente.','mal');return}
  J.caja-=coste;const libres=NOMBRES.filter(n=>!J.personal.some(s=>s.nombre===n));
  const s={id:'c'+(++J.seq),nombre:pick(libres.length?libres:NOMBRES),rol,salario:SUELDO_ROL[rol],contento:80,baja:0,extraHoy:0,extraTotal:0,cursos:[],curso:null,tarea:null,diasTrab:0,vac:null,cat:0,xpT:0,estancado:0};
  J.personal.push(s);
  if(rol==='chofer'){const f=J.flota.find(f=>!f.chofer||!persona(f.chofer));if(f){f.chofer=s.id;const c=R&&R.camiones.find(c=>c.id===f.id);if(c)c.chofer=s.id}}
  toast(`🤝 Contratado/a ${s.nombre} (${ROLES[rol]}).`,'bien');guardar();pintarUI(true);
}
function comprarRival(k){
  const Rv=RIVALES[k];if(!Rv||J.rivales[k].comprada)return;
  if(!puede('rivales')){toast(`🔒 Se desbloquea en el nivel ${DESBLOQ.rivales}.`,'mal');return}
  if(J.caja<Rv.precio){toast('💸 No hay caja suficiente.','mal');return}
  J.caja-=Rv.precio;J.rivales[k].comprada=true;J.rep=Math.min(100,J.rep+5);
  toast(`🏢 ¡HORINSA compra ${k}! Su planta y sus clientes pasan a ser tuyos.`,'bien');guardar();pintarUI(true);
}

/* ------------------ Orden, prevención y carrera profesional ------------------ */
const DESC_ACC = {
  chofer:['se ha torcido el tobillo al bajar de la cabina','se ha golpeado con la canaleta','se ha hecho un corte en la mano al limpiar la cuba'],
  planta:['ha resbalado en el foso de carga','se ha golpeado con la cinta transportadora','le ha saltado cemento a los ojos'],
  mecanico:['se ha pillado la mano con una rueda','se ha quemado con el tubo de escape','se ha hecho un esguince bajo un camión'],
  peon:['se ha cortado con un trozo de escombro','se ha doblado la espalda cargando sacos','ha resbalado con la lechada de hormigón'],
  oficina:['se ha caído por la escalera de la báscula']
};
const puedeAscender = s => (s.cat||0)<2&&(s.xpT||0)>=XP_ASCENSO[s.cat||0];
const puedeEncargado = s => !J.encargado&&(s.cat||0)===2&&(s.xpT||0)>=XP_ENCARGADO&&s.rol!=='peon';
function ascender(sid){const s=persona(sid);if(!s||!puedeAscender(s))return;s.cat=(s.cat||0)+1;const a=s.salario;s.salario=Math.round(s.salario*1.1);s.contento=Math.min(100,s.contento+20);s.estancado=0;
  toast(`📈 ${s.nombre} asciende a ${CATS[s.cat]} (${a} → ${s.salario} €/día). Trabaja mejor y está encantado/a.`,'bien');guardar();pintarUI(true)}
function nombrarEncargado(sid){const s=persona(sid);if(!s||!puedeEncargado(s))return;J.encargado=s.id;s.cat=3;s.salario=Math.round(s.salario*1.25);s.contento=Math.min(100,s.contento+25);s.estancado=0;
  toast(`⭐ ${s.nombre} es el nuevo encargado/a de planta: organiza la limpieza, renueva los EPIs, previene accidentes y anima al equipo.`,'bien');guardar();pintarUI(true)}
function renovarEPI(){const c=EPI.renovar[J.epiNivel]*J.personal.length;if(J.caja<c){toast('💸 No hay caja suficiente.','mal');return}
  J.caja-=c;if(R&&R.st)R.st.prl=(R.st.prl||0)+c;J.epiEstado=100;toast(`🦺 EPIs nuevos para toda la plantilla (${fmtE(c)}).`,'bien');guardar();pintarUI(true)}
function mejorarEPI(){if(J.epiNivel>=3)return;const c=EPI.mejora[J.epiNivel];if(J.caja<c){toast('💸 No hay caja suficiente.','mal');return}
  J.caja-=c;J.epiNivel++;J.epiEstado=100;toast(`🦺 EPIs nivel ${EPI.nombres[J.epiNivel]}: ${['','casco, chaleco y botas de seguridad','+ gafas, guantes anticorte y protección auditiva','+ arneses, mascarillas FFP3 y ropa técnica'][J.epiNivel]}.`,'bien');guardar();pintarUI(true)}
function limpiezaExterna(){if(J.caja<LIMPIEZA_EXT){toast('💸 No hay caja suficiente.','mal');return}J.caja-=LIMPIEZA_EXT;if(R&&R.st)R.st.prl=(R.st.prl||0)+LIMPIEZA_EXT;ensuciar(-45);
  toast('🧹 Una empresa de limpieza deja la planta como nueva (escombros fuera, foso y viales limpios).','bien');pintarUI(true)}
function comprarRecicladora(){if(J.recicladora)return;if(J.nivel<3){toast('🔒 Se desbloquea en el nivel 3.','mal');return}if(J.caja<RECICLADORA){toast('💸 No hay caja suficiente.','mal');return}
  J.caja-=RECICLADORA;J.recicladora=true;toast('♻️ Recicladora de hormigón instalada: los sobrantes se lavan y los áridos vuelven a los acopios.','bien');guardar();pintarUI(true)}
// Al cerrar el día: experiencia, ascensos pendientes, accidentes, inspección y estado de la planta
function prevencionYCarrera(eventos,huelga){
  if(huelga)return;
  J.epiEstado=Math.max(0,J.epiEstado-1.2);
  const enc=encargadoAct();
  if(enc&&J.epiEstado<40){const c=EPI.renovar[J.epiNivel]*J.personal.length;if(J.caja>c*3){J.caja-=c;R.st.prl=(R.st.prl||0)+c;J.epiEstado=100;eventos.push(`🦺 ${esc(enc.nombre)} (encargado/a) ha renovado los EPIs (${fmtE(c)}).`)}}
  let acc=false;
  for(const s of J.personal){
    if(!disponible(s))continue;
    s.xpT=(s.xpT||0)+1;
    if(puedeAscender(s)||puedeEncargado(s)){s.estancado=(s.estancado||0)+1;if(s.estancado>10)s.contento=Math.max(0,s.contento-1);
      if(s.estancado===1)eventos.push(`📈 <b>${esc(s.nombre)}</b> ya puede ${puedeAscender(s)?`ascender a ${CATS[(s.cat||0)+1]}`:'ser encargado/a de planta'} (pestaña Equipo).`);
      if(s.estancado===12)eventos.push(`😒 <b>${esc(s.nombre)}</b> lleva tiempo esperando un ascenso y se siente estancado/a.`)}
    const p=.006*(1+(100-J.epiEstado)/40)*EPI.riesgo[J.epiNivel]*(J.suciedad>50?1.6:1)*(s.extraHoy>120?1.5:1)*(tiene(s,'prl')?.6:1)*(enc?.75:1)*(s.rol==='oficina'?.3:1);
    if(rnd()<p){acc=true;const grave=rnd()<.18;s.baja=grave?rint(15,30):rint(2,5);s.contento=Math.max(0,s.contento-10);
      if(grave){J.caja-=6000;R.st.prl=(R.st.prl||0)+6000;J.rep=Math.max(0,J.rep-8)}
      eventos.push(`🚑 Accidente ${grave?'GRAVE':'leve'}: <b>${esc(s.nombre)}</b> ${pick(DESC_ACC[s.rol]||DESC_ACC.planta)}. Baja de ${s.baja} días${grave?' · sanción y seguro: 6.000 €':''}.`)}
  }
  if(enc)J.personal.forEach(s=>{s.contento=Math.min(100,s.contento+1)});
  if(R.clima==='calima')J.personal.forEach(s=>{s.contento=Math.max(0,s.contento-1.5)});
  J.diasSinAcc=acc?0:J.diasSinAcc+1;if(acc)J.inspeccionPend=true;
  if(R.inspeccion){
    const f=[];const sinPrl=J.personal.filter(s=>!tiene(s,'prl')).length/J.personal.length;
    if(J.epiEstado<50)f.push(['EPIs en mal estado',3000]);if(J.suciedad>65)f.push(['falta de orden y limpieza',2000]);
    if(sinPrl>.5)f.push(['formación en prevención insuficiente',4000]);if(J.personal.some(s=>s.extraHoy>240))f.push(['jornadas de más de 12 horas',2500]);
    if(f.length){const tot=f.reduce((a,x)=>a+x[1],0);J.caja-=tot;R.st.prl=(R.st.prl||0)+tot;J.rep=Math.max(0,J.rep-3);eventos.push(`🕵️ Inspección de Trabajo: multa de ${fmtE(tot)} por ${f.map(x=>x[0]).join(', ')}.`)}
    else{J.rep=Math.min(100,J.rep+2);eventos.push('🕵️ Inspección de Trabajo superada sin sanciones. 👏')}
  }
  if(J.suciedad>70){J.rep=Math.max(0,J.rep-1);J.diasSucia++}else J.diasSucia=0;
  if(J.diasSucia>=3)eventos.push(`🧹 La planta lleva ${J.diasSucia} días muy sucia (${Math.round(J.suciedad)} %). No dais abasto: contrata un peón de limpieza o una limpieza externa.`);
}

/* ---------------------- Vacaciones, sueldos y huelga ---------------------- */
const unicoEnRol = s => J.personal.filter(x=>x.rol===s.rol).length===1;
const avisoUnico = s => {if(unicoEnRol(s)&&s.rol!=='peon')toast(`⚠️ Ojo: ${s.nombre} es la única persona de ${ROLES[s.rol].toLowerCase()}. Esos días lo cubrirá otra persona (peor) o nadie.`,'mal')};
function mandarVacaciones(sid){const s=persona(sid);if(!s||s.vac||s.curso)return;avisoUnico(s);s.vac={dias:5,empezado:false};toast(`🏖️ ${s.nombre} se va de vacaciones 5 días a partir del próximo día laborable.`,'info');guardar();pintarUI(true)}
function subirSueldo(sid){const s=persona(sid);if(!s)return;const antes=s.salario;s.salario=Math.round(s.salario*1.05);s.contento=Math.min(100,s.contento+12);toast(`💶 Sueldo de ${s.nombre}: ${antes} → ${s.salario} €/día. Se nota contento/a.`,'bien');guardar();pintarUI(true)}

function apuntarCurso(sid,cid){
  const s=persona(sid),C=CURSOS[cid];if(!s||!C||s.curso||tiene(s,cid))return;
  if(J.caja<C.coste){toast('💸 No hay caja suficiente.','mal');return}
  J.caja-=C.coste;if(R)R.st.formacion+=C.coste;avisoUnico(s);
  s.curso={id:cid,dias:C.dias||1,horas:C.horas||0,empezado:false};
  toast(`🎓 ${s.nombre} se apunta a «${C.n}». Empieza el próximo día laborable (${durCurso(C)}).`,'info');guardar();pintarUI(true);
}

/* ------------------------- Cierre del día ------------------------- */
// La planta deja de producir: suministros que llegan, grúa para los camiones fuera y obras sin terminar
function cerrarPlanta(){
  if(R.plantaCerrada)return;R.plantaCerrada=true;R.finPlanta=R.min;const eventos=R.eventosTarde=[];
  for(const c of R.camiones)if(c.tipo==='cisterna'&&c.carga>0){if(c.mat==='betun')J.betun=Math.min(J.capBetun,J.betun+c.carga);else if(c.mat==='arido')J.acopio=Math.min(J.capAcopio,J.acopio+c.carga);else J.silo=Math.min(J.capSilo,J.silo+c.carga);c.carga=0}
  R.camiones=R.camiones.filter(c=>c.tipo!=='cisterna');
  R.betunPedido=0;R.aridoPedido=0;R.cementoPedido=0;R.cola=[];R.colaA=[];R.cargando=R.cargando2=R.cargandoA=null;
  // camiones que se quedaron fuera (averiados en carretera): la grúa los trae a planta
  R.camiones.forEach((c,i)=>{if(c.chofer&&c.estado!=='libre'){if(lejosDePlanta(c.id)){J.caja-=300;R.st.taller+=300;eventos.push(`🚚 La grúa ha traído ${c.id} a la planta (300 €).`)}c.estado='libre';c.carga=0;c.ped=null;c.ruta=null;c.t=0;aparcar(c,i)}});
  R.st.penal=R.st.penal||0;
  for(const p of R.pedidos)if(p.estado==='aceptado'){p.estado='incompleto';R.st.incompletos++;J.rep=Math.max(0,J.rep-6);fidelidad(p,-3);
    if(p.clase==='publica'){const pen=Math.round((p.m3-p.entregado)*p.precio*.2);J.caja-=pen;R.st.penal+=pen;eventos.push(`⚖️ Penalización de ${esc(p.cliente)} por no servir ${p.m3-p.entregado} m³: ${fmtE(pen)}.`)}}
}
function saltarTarde(){if(!R||!R.tarde)return;R.vel=0;cerrarDia()}
function cerrarDia(){
  cerrarPlanta();
  R.enDia=false;R.vel=0;
  const eventos=R.eventosTarde.slice(),fp=R.finPlanta;
  let sueldos=0,extras=0;
  const huelga=!!R.huelga;
  // lo que el mecánico de noche ha hecho en directo esta tarde, y lo que le queda de turno hasta las 22:00
  if(R.tarde){for(const s of mecNoche())eventos.push(`🌙 <b>${esc(s.nombre)}</b> ha estado en el taller de ${fmtH(R.tardeDesde)} a ${fmtH(Math.min(R.min,FIN_TARDE))}.`)}
  R.tarde=false;
  if(!huelga)turnoNoche(eventos,Math.max(0,FIN_TARDE-Math.max(R.min,FIN)));
  for(const s of J.personal){
    const he=s.extraHoy/60;s.tarea=null;
    if(huelga){s.contento=Math.min(100,s.contento+6);continue}                  // en huelga no se cobra
    if(s.baja>0){sueldos+=s.salario*.75;s.baja--;s.contento=Math.min(100,s.contento+4);continue}
    if(deVacaciones(s)){sueldos+=s.salario;s.vac.dias--;s.contento=Math.min(100,s.contento+4);
      if(s.vac.dias<=0){s.vac=null;s.diasTrab=0;s.contento=Math.min(100,s.contento+12);eventos.push(`🏖️ <b>${esc(s.nombre)}</b> vuelve de vacaciones descansado/a.`)}
      continue}
    // curso corto (unas horas por la mañana): se termina hoy y la persona ha trabajado el resto del día
    if(s.curso&&s.curso.horas&&s.curso.empezado){const id=s.curso.id;s.cursos.push(id);s.curso=null;s.contento=Math.min(100,s.contento+(id==='bienestar'?15:2));
      eventos.push(`🎓 <b>${esc(s.nombre)}</b> ha terminado el curso «${esc(CURSOS[id].n)}».`)}
    if(!enCurso(s)){s.diasTrab++;if(s.diasTrab>40)s.contento-=1.5}
    if(enCurso(s)){sueldos+=s.salario;s.curso.dias--;s.contento=Math.min(100,s.contento+2);
      if(s.curso.dias<=0){const id=s.curso.id;s.cursos.push(id);s.curso=null;if(id==='bienestar')s.contento=Math.min(100,s.contento+15);
        eventos.push(`🎓 <b>${esc(s.nombre)}</b> ha terminado el curso «${esc(CURSOS[id].n)}».`)}
      continue}
    sueldos+=s.salario;extras+=he*s.salario/8*1.5;s.extraTotal+=he;
    // la primera media hora de más es normal en el oficio y no quema; después sí (menos al principio)
    const heQ=Math.max(0,he-.5);
    if(heQ>0)s.contento-=heQ*4*(tiene(s,'bienestar')?.75:1)*suave();else s.contento+=6;
    s.contento=Math.max(0,Math.min(100,s.contento));
    if(s.contento<12&&rnd()<.4){s.baja=rint(2,4);eventos.push(`🤒 <b>${esc(s.nombre)}</b> está quemado/a y se coge la baja ${s.baja} días.`)}
    else if(s.contento<35&&rnd()<.35&&!J.peticiones.some(q=>q.id===s.id))J.peticiones.push({id:s.id,pct:10});
  }
  J.caja-=sueldos+extras;
  prevencionYCarrera(eventos,huelga);
  procesarCobros(eventos);
  const grupo=Object.keys(J.deleg).length?resultadosDelegaciones(eventos):null;
  if(huelga){J.rep=Math.max(0,J.rep-3);eventos.push('✊ Día de huelga: no se ha producido nada y la reputación baja.')}
  else{const medio=J.personal.reduce((a,s)=>a+s.contento,0)/J.personal.length;
    if(medio<28&&rnd()<.5){J.huelga=true;eventos.push(`✊ El comité de empresa convoca <b>HUELGA para mañana</b> (contento medio ${Math.round(medio)}/100).`)}
    else if(medio<40)eventos.push(`⚠️ El ambiente está caldeado (contento medio ${Math.round(medio)}/100). Riesgo de huelga.`)}
  // la competencia ficha a la gente quemada
  for(const s of J.personal.slice())if(!huelga&&s.contento<25&&s.baja<=0&&!deVacaciones(s)&&rivalesActivos().length&&rnd()<.22){
    const r=pick(rivalesActivos());J.personal=J.personal.filter(x=>x!==s);if(J.encargado===s.id)J.encargado=null;for(const f of J.flota)if(f.chofer===s.id)f.chofer=null;J.peticiones=J.peticiones.filter(q=>q.id!==s.id);
    eventos.push(`🚪 <b>${esc(s.nombre)}</b> (${ROLES[s.rol]}) se va a trabajar con ${r}. Contrata a alguien en la pestaña Equipo.`)}
  for(const s of J.personal)if(s.diasTrab>40&&!s.vac&&!eventos.some(e=>e.includes('vacaciones'))){eventos.push(`🏖️ Hay gente que lleva más de 40 días sin vacaciones: se va quemando (pestaña Equipo).`);break}
  const st=R.st,costes=st.cemento+st.aridos+st.gasoil+st.taller+st.formacion+st.penal+(st.prl||0)+(st.intereses||0)+(st.factoring||0)+sueldos+extras,ben=st.ingresos-costes;
  J.historial.push({fecha:J.fecha,m3:st.m3,ingresos:st.ingresos,costes,beneficio:ben});
  if(!huelga)objCierre(eventos,st,ben);
  const horasExtra=J.personal.reduce((a,s)=>a+s.extraHoy,0)/60;
  const fila=(a,b,cl='')=>`<tr class="${cl}"><td>${a}</td><td>${b}</td></tr>`;
  let html=`<h2>Fin de la jornada</h2><div class="sub">${esc(fechaTxt())} · la planta cerró a las ${fmtH(fp)}</div>
  <table class="tabla">${fila('Hormigón servido',st.m3+' m³')}${st.t?fila('Asfalto servido',st.t+' t'):''}${fila('Obras servidas',st.servidos)}${st.incompletos?fila('Obras sin terminar',st.incompletos,'neg'):''}${st.cancelados?fila('Obras canceladas',st.cancelados,'neg'):''}${st.tarde?fila('Llegadas tarde',st.tarde,'neg'):''}${st.perdidos?fila('Llamadas perdidas',st.perdidos):''}${fila('Rechazadas',st.rechazados)}</table>
  <table class="tabla">${fila('Ventas (facturado)',fmtE(st.ingresos),'pos')}${(st.intereses||st.factoring)?fila('Intereses y factoring',fmtE(-(st.intereses||0)-(st.factoring||0)),'neg'):''}${fila('Cemento',fmtE(-st.cemento))}${fila('Áridos',fmtE(-st.aridos))}${fila('Gasoil',fmtE(-st.gasoil))}${st.taller?fila(`Taller y averías (${st.averias})`,fmtE(-st.taller),'neg'):''}${st.formacion?fila('Formación',fmtE(-st.formacion)):''}${st.penal?fila('Penalizaciones',fmtE(-st.penal),'neg'):''}${st.prl?fila('Prevención, limpieza y sanciones',fmtE(-st.prl)):''}${fila('Sueldos',fmtE(-sueldos))}${extras?fila(`Horas extra (${horasExtra.toFixed(1)} h)`,fmtE(-extras),'neg'):''}
  <tr class="total ${ben>=0?'pos':'neg'}"><td>Resultado del día (planta principal)</td><td>${fmtE(ben)}</td></tr></table>
  ${grupo!==null?`<table class="tabla">${Object.keys(J.deleg).map(k=>fila(esc(DELEG[k].n),fmtE(J.deleg[k].ultimo),J.deleg[k].ultimo>=0?'pos':'neg')).join('')}<tr class="total ${ben+grupo>=0?'pos':'neg'}"><td>Resultado del Grupo HORINSA</td><td>${fmtE(ben+grupo)}</td></tr></table>`:''}
  <div class="sub">💶 Cobrado hoy: <b>${fmtE(st.cobrado||0)}</b> · pendiente de cobro: <b>${fmtE(pendienteCobro())}</b></div>
  <div class="sub">Caja: <b>${fmtE(J.caja)}</b> · Reputación: <b>${Math.round(J.rep)}</b> · Nivel <b>${J.nivel}</b> (${J.xp} XP${J.nivel<NIVEL_XP.length?` / ${NIVEL_XP[J.nivel]}`:''})</div>`;
  if(horasExtra<.05)html+=`<p class="ok">👍 Nadie ha hecho horas extra: el equipo está contento.</p>`;
  for(const e of eventos)html+=`<p class="mal">${e}</p>`;
  for(const q of J.peticiones){const s=persona(q.id);if(!s)continue;html+=`<div class="peticion">💬 <b>${esc(s.nombre)}</b> (${ROLES[s.rol]}) pide un aumento del ${q.pct} % (de ${s.salario} a ${Math.round(s.salario*1.1)} €/día).
    <div><button class="jb ok" data-acc="aum-si" data-id="${s.id}">Aceptar</button><button class="jb" data-acc="aum-no" data-id="${s.id}">Rechazar</button></div></div>`}
  if(J.caja<0)html+=`<p class="mal">🔴 La caja está en números rojos.</p>`;
  html+=`<button class="jb grande" data-acc="siguiente">Empezar el siguiente día laborable →</button>`;
  modal(html);
  pintarUI(true);
}
function siguienteDia(){
  if(J.peticiones.length){toast('Responde primero a las peticiones de aumento.','mal');return}
  const d=new Date(J.fecha+'T12:00:00');d.setDate(d.getDate()+1);
  let finde=false;while(d.getDay()===0||d.getDay()===6){d.setDate(d.getDate()+1);finde=true}
  if(finde)J.personal.forEach(s=>{s.contento=Math.min(100,s.contento+8)});
  J.fecha=d.toISOString().slice(0,10);J.nDia++;
  guardar();cerrarModal();empezarDia();
  toast(`☀️ Buenos días. ${fechaTxt()}${finde?' (tras el fin de semana el equipo descansó)':''}`,'info');
}

/* ------------------------------ Mejoras ------------------------------ */
function comprar(que){
  const pagar=(c,txt)=>{if(J.caja<c){toast('💸 No hay caja suficiente.','mal');return false}J.caja-=c;toast(txt,'bien');return true};
  const req={tolva:J.tolvas>=4?'tolva5':'tolva4',acopios:'acopios',cantera:'cantera',hormigonera:'hormigonera',linea2:'linea2',silo2:'silo2',ampliarCantera:'ampliarCantera',lab:['lab1','lab2','lab3'][J.lab]}[que];
  if(req&&!puede(req)){toast(`🔒 Se desbloquea en el nivel ${DESBLOQ[req]}.`,'mal');return}
  if((que==='asfalto'||que==='asfaltera')&&!puede('asfalto')){toast(`🔒 Se desbloquea en el nivel ${DESBLOQ.asfalto}.`,'mal');return}
  const nuevaAsfaltera=()=>{const libres=NOMBRES.filter(n=>!J.personal.some(s=>s.nombre===n));const id='c'+(++J.seq);
    J.personal.push({id,nombre:pick(libres.length?libres:NOMBRES),rol:'chofer',salario:95,contento:85,baja:0,extraHoy:0,extraTotal:0,cursos:[],curso:null,tarea:null,diasTrab:0,vac:null,cat:0,xpT:0,estancado:0});
    const n=J.flota.filter(f=>f.tipo==='asfaltera').length+1;const f={id:'A-'+String(n).padStart(2,'0'),tipo:'asfaltera',chofer:id,itv:J.nDia+ITV_CADA,itvCita:null};J.flota.push(f);
    if(R){const c={...f,estado:'libre',ruta:null,t:0,carga:0,ped:null,km:0,giro:0};R.camiones.push(c);aparcar(c,R.camiones.length-1)}};
  if(que==='asfalto'&&!J.asfalto){if(pagar(ASF.planta,'🛣️ ¡Planta de asfalto en marcha! Incluye una bañera de asfalto (A-01) y su chófer. Ya entran pedidos de asfalto.')){J.asfalto=true;J.betun=30;nuevaAsfaltera()}}
  if(que==='asfaltera'&&J.asfalto){if(pagar(ASF.camion,'🚛 Nueva bañera de asfalto y chófer.'))nuevaAsfaltera()}
  if(que==='linea2'&&J.lineas<2){if(pagar(PRECIO_EXTRA.linea2,'🏗️ ¡Segunda línea de producción montada! Ahora se cargan dos hormigoneras a la vez.')){J.lineas=2;HORINSA.planta.lineas=2}}
  if(que==='silo2'&&J.capSilo<100){if(pagar(PRECIO_EXTRA.silo2,'🏗️ Segundo silo de cemento (+40 t).'))J.capSilo+=40}
  if(que==='ampliarCantera'&&J.canteraPropia&&!J.canteraAmpliada){if(pagar(PRECIO_EXTRA.ampliarCantera,'⛏️ Cantera ampliada: más frente de extracción, áridos a 2 €/t y carga más rápida.'))J.canteraAmpliada=true}
  if(que==='lab'&&J.lab<3){if(pagar(PRECIO_EXTRA.lab[J.lab],`🧪 Laboratorio nivel ${J.lab+1}: fórmulas mejoradas (${['−5','−10','−14'][J.lab]} % de cemento por m³)${J.lab+1>=2?' y ya puedes servir HA-35':''}.`))J.lab++}
  if(que==='tolva'&&J.tolvas<5){if(pagar(PRECIO.tolva,`🏗️ Nueva tolva instalada: ${J.tolvas+1} tolvas, ${30+(J.tolvas-2)*12} m³/h.`)){J.tolvas++;HORINSA.planta.tolvas=J.tolvas}}
  if(que==='acopios'){if(pagar(PRECIO.acopios,'🏗️ Acopios ampliados (+200 t).'))J.capAcopio+=200}
  if(que==='cantera'&&!J.canteraPropia){if(pagar(PRECIO.cantera,'⛏️ ¡La cantera es tuya! Áridos a 3 €/t.'))J.canteraPropia=true}
  if(que==='hormigonera'){if(pagar(PRECIO.hormigonera,'🚚 Nueva hormigonera y nuevo chófer contratado.')){
    const nombres=['Airam','Jonay','Acoraida','Dácil','Benito','Chano','Nayra','Tito'];const id='s'+(J.personal.length+1+rint(10,99));
    J.personal.push({id,nombre:pick(nombres),rol:'chofer',salario:95,contento:85,baja:0,extraHoy:0,extraTotal:0,cursos:[],curso:null,tarea:null,diasTrab:0,vac:null,cat:0,xpT:0,estancado:0});
    const n=J.flota.filter(f=>f.tipo==='hormigonera').length+1;const f={id:'H-'+String(n).padStart(2,'0'),tipo:'hormigonera',chofer:id,itv:J.nDia+ITV_CADA,itvCita:null};J.flota.push(f);
    const c={...f,estado:'libre',ruta:null,t:0,carga:0,ped:null,km:0,giro:0};R.camiones.push(c);aparcar(c,R.camiones.length-1)}}
  guardar();pintarUI(true);
}

/* ------------------------------- Reloj ------------------------------- */
function tickJuego(){
  const ahora=performance.now(),dtR=Math.min(.1,(ahora-tAnt)/1000);tAnt=ahora;
  if(!R||!R.enDia||R.vel===0)return;
  let dm=dtR*MIN_POR_SEG*R.vel;
  while(dm>0&&R.enDia){const st=Math.min(dm,.5);paso(st);dm-=st}
  sucio=true;
  if(ahora-ultUI>350){pintarUI();ultUI=ahora}
}
// Cuando entra una llamada el juego se para solo hasta que la aceptas, la rechazas o la pasas a mañana
function pausaLlamada(){if(window.__prueba||!R)return;if(R.vel>0)R.velLl=R.vel;R.vel=0;R.pausaLl=true}
function reanudarSiNoHayLlamadas(){if(R&&R.pausaLl&&!R.pedidos.some(p=>p.estado==='llamada')){R.pausaLl=false;if(R.enDia&&!R.tarde)R.vel=R.velLl||1}}
function ponerVel(v){if(!R||!R.enDia)return;if(v>0&&R.pausaLl&&R.pedidos.some(p=>p.estado==='llamada')){toast('📞 Primero responde a la llamada: acéptala, recházala o pásala a mañana.','info');return}R.vel=v;pintarUI(true)}

/* ------------------------------- Interfaz ------------------------------- */
const toastsRecientes=new Map();
function toast(txt,tipo){
  // no repetir el mismo aviso en pocos segundos (a velocidad ×8 llegaban en ráfaga)
  const ahora=performance.now(),k=String(txt).replace(/\d+/g,'#');if(toastsRecientes.has(k)&&ahora-toastsRecientes.get(k)<8000)return;toastsRecientes.set(k,ahora);
  const el=document.createElement('div');el.className='toast '+(tipo||'');el.innerHTML=txt;$('toasts').appendChild(el);
  setTimeout(()=>{el.style.opacity=0;setTimeout(()=>el.remove(),600)},5500);while($('toasts').children.length>3)$('toasts').firstChild.remove()}
function modal(html){$('jModalCaja').innerHTML=html;$('jModal').style.display='grid'}
function cerrarModal(){$('jModal').style.display='none'}
const barra=(v,max,col)=>`<div class="bar"><i style="width:${Math.max(0,Math.min(100,v/max*100))}%;background:${col}"></i></div>`;
const caraContento=c=>c>=70?'😊':c>=45?'😐':c>=25?'😟':'😡';
function estadoCamion(c){
  const p=c.ped;
  const T={hormigonera:{libre:'En planta, libre',cola:`En cola para cargar · ${p?esc(p.cliente):''}`,cargando:'Cargando hormigón',ida:`Hacia ${p?esc(p.pueblo):''} · ${c.carga} m³`,descargando:`Descargando en obra · ${p?esc(p.cliente):''}`,esperando:`Esperando turno en la obra · ${p?esc(p.cliente):''}`,vuelta:'Volviendo a planta'},
    banera:{libre:'En planta, libre',ida:'Hacia la cantera',cargando:'Cargando áridos en cantera',vuelta:'Volviendo con 25 t de áridos',descargando:'Descargando áridos en acopios'},
    cisterna:{ida:c.mat==='betun'?'Cisterna de betún hacia la planta':c.mat==='arido'?'Camión de la cantera trae áridos':'Cisterna de cemento hacia la planta',descargando:c.mat==='betun'?'Descargando betún':c.mat==='arido'?'Descargando áridos en los acopios':'Descargando cemento al silo',vuelta:c.mat==='arido'?'Vuelve a la cantera':'Cisterna vuelve al puerto'},
    asfaltera:{libre:'En planta, libre',cola:`En cola de asfalto · ${p?esc(p.cliente):''}`,cargando:'Cargando asfalto caliente',ida:`Hacia ${p?esc(p.pueblo):''} · ${c.carga} t de asfalto`,descargando:`Descargando en la extendedora · ${p?esc(p.cliente):''}`,esperando:`Esperando a la extendedora · ${p?esc(p.cliente):''}`,vuelta:'Volviendo a planta'}};
  return(T[c.tipo]||{})[c.estado]||c.estado;
}
// estimación de una llamada: se calcula una vez (y cada 15 min de juego), así la tarjeta no cambia sin parar
function estimarFijo(p){if(!p._est||R.min-p._estT>15){p._est=estimar(p);p._estT=R.min}return p._est}
// Bandeja fija de llamadas: cada llamada se queda en pantalla hasta que la atiendes o cuelga.
// Cada fila tiene su clave y solo se cambia el texto que varía: nada parpadea ni se mueve.
const BANDEJA_MAX=3;
function pintarBandeja(){
  const caja=$('jLlam');if(!caja)return;
  const ll=R.enDia?R.pedidos.filter(p=>p.estado==='llamada'):[],vistas=ll.slice(0,BANDEJA_MAX),claves=new Set(vistas.map(p=>'b'+p.id));
  // reto de bombeo: arriba del todo, fijo hasta que lo juegas o pasa el momento
  if(R.reto&&(!R.enDia||R.min>R.reto.expira||(R.reto.tipo!=='pala'&&!R.camiones.some(c=>c.id===R.reto.cid&&c.estado==='descargando'))))R.reto=null;
  if(R.reto){claves.add('reto');let el=caja.querySelector('[data-k="reto"]');const p=R.pedidos.find(q=>q.id===R.reto.pid),c=R.camiones.find(x=>x.id===R.reto.cid),s=c&&choferDe(c);
    if(!el){el=document.createElement('div');el.className='ll';el.dataset.k='reto';el.style.borderLeftColor='#7dff8a';el.style.borderColor='rgba(125,255,138,.5)';
      if(R.reto.tipo==='pala')el.innerHTML=`<div class="tx">🚜 <b>${esc(R.reto.palista||'El palista')}</b> te deja la pala: hay que llenar las tolvas<small>${[90,80,75][R.reto.dif-1]} s · ${['fácil','normal','difícil'][R.reto.dif-1]} · la planta carga más rápido si sale bien</small></div><button class="ok" data-acc="jugarReto">Coger la pala</button><button data-acc="noReto" title="Que lo haga el palista">✕</button>`;
      else if(R.reto.tipo==='canaleta')el.innerHTML=`<div class="tx">🚚 <b>${esc(s?s.nombre:'El chófer')}</b> descarga por canaleta en ${esc(p?p.cliente:'la obra')}<small>Zanja de cimentación · ${['fácil','normal','difícil'][R.reto.dif-1]} · propina si sale bien</small></div><button class="ok" data-acc="jugarReto">Coger el camión</button><button data-acc="noReto" title="Que lo haga el chófer">✕</button>`;
      else el.innerHTML=`<div class="tx">🎮 <b>${esc(s?s.nombre:'El chófer')}</b> te pide ayuda con la bomba en ${esc(p?p.cliente:'la obra')}<small>${{suelo:'Losa',muro:'Muro',pilares:'Pilares',zapatas:'Zapatas',escalera:'Escalera',piscina:'Piscina'}[R.reto.modo]} · ${['fácil','normal','difícil'][R.reto.dif-1]} · propina si sale bien</small></div><button class="ok" data-acc="jugarReto">Coger el mando</button><button data-acc="noReto" title="Que lo haga el bombista">✕</button>`;
      caja.insertBefore(el,caja.firstChild)}}
  for(const el of [...caja.children])if(!claves.has(el.dataset.k)&&el.dataset.k!=='mas')el.remove();
  vistas.forEach((p,i)=>{let el=caja.querySelector(`[data-k="b${p.id}"]`);
    if(!el){el=document.createElement('div');el.className='ll';el.dataset.k='b'+p.id;
      el.innerHTML=`<div class="tx" data-acc="verLlamada" data-id="${p.id}" style="cursor:pointer">${p.falta?'⚠️':'📞'} <b>${esc(p.cliente)}</b>${estTxt(p.cliente)} · ${p.falta?'¡faltan ':''}${p.m3} ${ud(p)}${p.falta?'!':''} ${esAsf(p)?'asfalto':p.tipo}<small></small></div><button class="ok" data-acc="aceptar" data-id="${p.id}">Aceptar</button><button data-acc="pre-rechazar" data-id="${p.id}" title="Rechazar o proponer mañana">✕</button>`;
      const sig=caja.children[i+(R.reto?1:0)];caja.insertBefore(el,sig||null)}
    const queda=Math.max(0,Math.round(p.expira-R.min)),sm=el.querySelector('small'),e=estimarFijo(p);
    const t=`${p.pueblo} · para las ${fmtH(p.hora)} · ${e.beneficio>=0?'+':''}${fmtE(e.beneficio)} · cuelga en ${queda} min`;
    if(sm.textContent!==t)sm.textContent=t;const pr=queda<=10;if(sm.classList.contains('prisa')!==pr)sm.classList.toggle('prisa',pr)});
  let mas=caja.querySelector('.mas');const extra=ll.length-vistas.length;
  if(extra>0){if(!mas){mas=document.createElement('div');mas.className='mas';mas.dataset.k='mas';mas.dataset.acc='verLlamada';caja.appendChild(mas)}const t=`+${extra} llamada${extra>1?'s':''} más en Obras`;if(mas.textContent!==t)mas.textContent=t}
  else if(mas)mas.remove();
  const tt=$('toasts'),top=108+(caja.offsetHeight?caja.offsetHeight+8:0)+'px';if(tt&&tt.style.top!==top)tt.style.top=top;
  const fi=$('ficha');if(fi){const t2=innerWidth>640?top:'';if(fi.style.top!==t2)fi.style.top=t2}
}
function pintarUI(forzar){
  if(!J||!R)return;
  reanudarSiNoHayLlamadas();
  window.STOCK_PLANTA={silo:J.silo/J.capSilo,acopio:J.acopio/J.capAcopio,suciedad:J.suciedad/100,epi:J.epiEstado,dsa:J.diasSinAcc,
    peones:J.personal.filter(s=>s.rol==='peon'&&disponible(s)).length,limpiando:!!(R&&R.limpiando)};
  // HUD
  $('jFecha').textContent=fechaTxt();
  $('jHora').textContent=fmtH(R.min);
  $('jHora').className=R.min>FIN?'extra':'';
  $('jCaja').textContent=fmtE(J.caja);$('jCaja').className=J.caja<0?'neg':'';
  $('jRep').textContent='★ '+Math.round(J.rep);
  const xa=NIVEL_XP[J.nivel-1]||0,xs=NIVEL_XP[J.nivel]||J.xp;$('jNivel').innerHTML=`Nv ${J.nivel}<i style="width:${J.nivel>=NIVEL_XP.length?100:Math.round((J.xp-xa)/(xs-xa)*100)}%"></i>`;$('jNivel').title=`${J.xp} XP${J.nivel<NIVEL_XP.length?' · siguiente nivel con '+xs:''}`;
  document.querySelectorAll('#jVel button').forEach(b=>b.classList.toggle('on',+b.dataset.v===R.vel&&R.enDia));
  $('jEstado').textContent=CLIMAS[climaHoy()].ic+' '+(horaPunta(SIT?SIT.planta.x:0,SIT?SIT.planta.y:0)?'🚗 Hora punta · ':'')+(!R.enDia?'Jornada cerrada':R.tarde?'🌙 Planta cerrada · taller de noche':R.pausaLl?'📞 Pausa: responde a la llamada':R.vel===0?(R.min===INICIO?'Pulsa ▶ para empezar':'En pausa'):R.min>FIN?'⏰ Horas extra':'Jornada');
  $('jSaltar').style.display=R.tarde?'':'none';pintarObjB();pintarSel();$('jHora').className=R.tarde?'':$('jHora').className;
  $('jHora').title=CLIMAS[climaHoy()].n;$('jHora').dataset.clima=CLIMAS[climaHoy()].ic;
  const nLl=R.pedidos.filter(p=>p.estado==='llamada').length;$('jNLl').textContent=nLl?nLl:'';
  const nAv=Object.values(J.maq).filter(m=>m.averia).length;$('jNAv').textContent=nAv?nAv:'';
  pintarBandeja();
  if(!forzar&&document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#jCuerpo'))return;
  let h='';
  if(pestana==='llamadas'){
    const ll=R.pedidos.filter(p=>p.estado==='llamada');
    if(!ll.length)h+=`<div class="vacio">${R.enDia?(R.min<ULT_LLAMADA?'Esperando llamadas de obra…':'Ya no entran más llamadas hoy.'):'Jornada cerrada.'}</div>`;
    for(const p of ll){const e=estimarFijo(p);
      h+=`<div class="card llamada nueva" data-k="ll${p.id}"><div class="t">${p.falta?'⚠️':'📞'} ${esc(p.cliente)}${estTxt(p.cliente)}${estrellas(p.cliente)?' <small>cliente habitual</small>':''}</div><div class="s">${esc(p.obra)} · <b>${esc(p.pueblo)}</b></div>
      <div class="datos"><span><b>${p.m3} ${ud(p)}</b> ${esAsf(p)?'asfalto ':''}${p.tipo}</span><span>${p.precio} €/${ud(p)}</span><span>${PLAZO_COBRO[p.clase]?`paga a ${Math.round(PLAZO_COBRO[p.clase]*1.45)} días`:'paga al contado'}</span><span>para las <b>${fmtH(p.hora)}</b></span><span>${p.km.toFixed(1)} km</span></div>
      <div class="s">${e.viajes} viaje${e.viajes>1?'s':''} · ~${e.horas.toFixed(1)} h de camión · venta ${fmtE(e.ingreso)} · beneficio aprox. <b class="${e.beneficio>=0?'pos':'neg'}">${fmtE(e.beneficio)}</b></div>
      ${p.contra?`<div class="s neg">⚔️ ${p.contra.r} le ofrece ${p.contra.precio} €/m³. Si no igualas, se va con ellos.</div><div class="bt"><button class="jb ok" data-acc="igualar" data-id="${p.id}">Igualar a ${p.contra.precio} €/m³</button></div>`:''}
      <div class="s espera">Cuelga a las ${fmtH(p.expira)}</div>
      <div class="bt"><button class="jb ok" data-acc="aceptar" data-id="${p.id}">Aceptar</button>${rolCon('oficina','negociacion')?`<button class="jb" data-acc="regatear" data-id="${p.id}" ${p.regateado?'disabled':''}>${p.regateado?'Regateado':'🤝 Regatear'}</button>`:''}<button class="jb" data-acc="pre-rechazar" data-id="${p.id}">Rechazar</button></div>
      ${p.preguntar?(()=>{const hu=huecoManana(p);return hu===null?`<div class="peticion">Mañana ya está completo: no hay hueco libre.<div><button class="jb" data-acc="rechazar" data-id="${p.id}">Rechazar</button></div></div>`
        :`<div class="peticion">¿Le ofrecemos servirlo <b>mañana a las ${fmtH(hu)}</b>?${hu===HORA_TEMPRANO?' Ese día se entra antes para que los camiones salgan temprano.':''}
        <div><button class="jb ok" data-acc="posponer" data-id="${p.id}">📅 Ofrecer mañana ${fmtH(hu)}</button><button class="jb" data-acc="rechazar" data-id="${p.id}">Rechazar del todo</button></div></div>`})():''}</div>`}
    if(J.aplazados.length)h+=`<h5>Programadas para mañana</h5>${J.aplazados.slice().sort((a,b)=>(a.hora||420)-(b.hora||420)).map(a=>`<div class="card mini"><div class="t">📅 ${fmtH(a.hora||HORA_TEMPRANO)} · ${esc(a.cliente)} <small>${esc(a.pueblo)}</small></div><div class="s">${a.m3} ${a.mat==='asfalto'?'t':'m³'} ${a.tipo} · ${a.precio} €/${a.mat==='asfalto'?'t':'m³'}</div></div>`).join('')}`;
    // Mercado
    {const q=cuotas(),fila=(k,n,col)=>`<div class="s">${n} <b>${Math.round(q[k]*100)} %</b></div>${barra(q[k],1,col)}`;
     h+=`<div class="card mini"><div class="t" data-acc="mercado" style="cursor:pointer">📊 Mercado de Lanzarote · tu cuota ${Math.round(q.H*100)} % ${mercadoAbierto?'▴':'▾'}</div>
     ${guerraActiva()?`<div class="s neg">⚔️ Guerra de precios de ${J.guerra.r} hasta el día ${J.guerra.hasta}: los clientes pagan ~5 €/m³ menos.</div>`:''}
     ${mercadoAbierto?`${fila('H','HORINSA','#d2201f')}${rivalesActivos().map(k=>fila(k,k,RIVALES[k].col)).join('')}
     <div class="s" style="color:#9aa6b2">Más cuota = más llamadas. Sube con la reputación, el nivel, más camiones, una 2ª línea… o comprando a la competencia.</div>`:''}</div>`}
    // Cobros pendientes
    {const pend=pendienteCobro();if(pend>0){const prox=J.cobros.slice().sort((a,b)=>a.dia-b.dia).slice(0,3);
      h+=`<div class="card mini"><div class="t">💶 Pendiente de cobro: ${fmtE(pend)}</div>${prox.map(f=>`<div class="s">${esc(f.cliente)} · ${fmtE(f.imp)} · ${f.dia-J.nDia<=0?'mañana':`en ${f.dia-J.nDia} días`}${f.recobro?' (recobro)':''}</div>`).join('')}
      <div class="bt"><button class="jb" data-acc="factoring">🏦 Adelantar cobros (factoring, −3 %)</button></div></div>`}}
    // Licitaciones públicas
    if(!puede('licitaciones'))h+=`<div class="vacio">🔒 Licitaciones públicas: se desbloquean en el nivel ${DESBLOQ.licitaciones}.</div>`;
    else{
      if(J.licitaciones.length)h+=`<h5>Licitaciones abiertas</h5>`;
      for(const l of J.licitaciones){const cm=costeM3(l.tipo,l.km),val=l.oferta||Math.round(l.base*.95),tot=l.m3Dia*l.dias;
        h+=`<div class="card" style="border-color:rgba(90,169,230,.5)"><div class="t">📜 ${esc(l.org)}</div><div class="s">${esc(l.obra)} en <b>${esc(l.pueblo)}</b> · ${l.km.toFixed(1)} km</div>
        <div class="datos"><span><b>${l.dias} días × ${l.m3Dia} m³</b></span><span>${l.tipo}</span><span>${tot} m³ en total</span><span>precio de licitación ${l.base} €/m³</span></div>
        <div class="s">Tu coste aprox.: <b>${cm.toFixed(0)} €/m³</b>. Compiten L, HC y T: gana la oferta más baja (tu reputación ayuda). Se adjudica el ${l.cierre-J.nDia<=0?'próximo día':`día ${l.cierre}`} (hoy es el ${J.nDia}).</div>
        <div class="oferta"><input type="range" min="${Math.round(l.base*.7)}" max="${l.base}" value="${val}" data-licit="${l.id}" data-coste="${cm.toFixed(1)}" data-tot="${tot}">
        <div class="s" id="ofTxt${l.id}">Oferta: <b>${val} €/m³</b> · margen ${Math.round(val-cm)} €/m³ · beneficio aprox. ${fmtE((val-cm)*tot)}</div></div>
        <div class="bt"><button class="jb ok" data-acc="ofertar" data-id="${l.id}">${l.oferta?`Cambiar oferta (ahora ${l.oferta} €/m³)`:'Presentar oferta'}</button></div></div>`}
      if(J.contratos.length){h+=`<h5>Contratos públicos en marcha</h5>`;for(const c of J.contratos)h+=`<div class="card mini"><div class="t">🏛️ ${esc(c.org)}</div><div class="s">${esc(c.obra)} en ${esc(c.pueblo)} · ${c.m3Dia} m³/día a ${c.precio} €/m³ · quedan ${c.diasRest} día${c.diasRest>1?'s':''} más</div></div>`}
    }
    const habs=Object.keys(J.clientes||{}).filter(n=>estrellas(n)>0).sort((a,b)=>J.clientes[b].pts-J.clientes[a].pts);
    if(habs.length)h+=`<h5>Clientes habituales</h5><div class="card mini">${habs.slice(0,8).map(n=>`<div class="s">${'⭐'.repeat(estrellas(n))} <b>${esc(n)}</b> · ${J.clientes[n].n} obra${J.clientes[n].n>1?'s':''}</div>`).join('')}<div class="s" style="color:#9aa6b2;margin-top:4px">Llaman más, pagan hasta 6 €/m³ más y esperan más al teléfono. Si les fallas, pierden estrellas.</div></div>`;
    const hoy=R.pedidos.filter(p=>['aceptado','servido','incompleto','cancelado','aplazado'].includes(p.estado)&&!(p.estado==='aplazado'&&p.creado===INICIO));
    if(hoy.length){h+=`<h5>Obras de hoy</h5>`;for(const p of hoy){const pr=p.entregado/p.m3,riesgo=p.estado==='aceptado'&&p.llegada===null&&R.min>p.hora-20;
      h+=`<div class="card mini" data-acc="ver" data-x="${p.x}" data-y="${p.y}"><div class="t">${p.estado==='servido'?'✅':p.estado==='incompleto'||p.estado==='cancelado'?'❌':p.estado==='aplazado'?'📅':'🏗️'} ${esc(p.cliente)} <small>${esc(p.pueblo)}${p.estado==='cancelado'?' · cancelada':p.estado==='aplazado'?' · pasa a mañana':p.m3Orig?` · recortada (pedía ${p.m3Orig})`:''}</small></div>
      <div class="s">${p.entregado}/${p.m3} ${ud(p)} ${p.tipo} · hora ${fmtH(p.hora)}${p.enCamino?` · ${p.enCamino} ${ud(p)} en camino`:''}${riesgo?' · <span class="neg">⏱️ vamos tarde</span>':''}</div>${barra(pr,1,p.estado==='servido'?'#3fae5a':'#f39c34')}
      ${p.estado==='aceptado'&&restante(p)>0?`<div class="bt">${!p.intentoAplazar&&p.clase!=='publica'?`<button class="jb" data-acc="aplazarPed" data-id="${p.id}">📅 A mañana</button>`:''}<button class="jb" data-acc="cancelarPed" data-id="${p.id}">🚫 Cancelar</button></div>`:''}</div>`}}
  }
  if(pestana==='flota'){
    for(const c of R.camiones){const s=c.chofer?persona(c.chofer):null;
      h+=`<div class="card mini" data-acc="ver" data-x="${c.x}" data-y="${c.y}"><div class="t">${c.tipo==='hormigonera'?'🚚':c.tipo==='banera'?'🚛':c.tipo==='asfaltera'?'🛣️':'🛢️'} ${c.id} <small>${c.tipo==='banera'?'bañera de áridos':c.tipo==='asfaltera'?'bañera de asfalto':c.tipo}</small></div>
      <div class="s">${averiada(c.id)?`<span class="neg">🔧 Averiado: ${esc(maq(c.id).averia.desc)}</span>`:estadoCamion(c)}</div><div class="s">${s?`Chófer: ${esc(s.nombre)}${disponible(s)?'':enCurso(s)?' (de curso)':' (de baja)'}`:'Proveedor de cemento'} · ${c.km.toFixed(1)} km hoy</div>
      ${c.chofer?`<div class="s">Estado mecánico ${Math.round(maq(c.id).cond)} %</div>${barra(maq(c.id).cond,100,maq(c.id).cond>60?'#3fae5a':maq(c.id).cond>35?'#e2b33b':'#d9534f')}<div class="s">${itvTxt(flotaDe(c))}</div>`:''}
      <div class="bt"><button class="jb" data-acc="seguir" data-id="${c.id}">${window.SEGUIDO===c.id?'📍 Siguiendo · soltar':'📍 Seguir'}</button>${c.chofer?`<button class="jb ${SELCAM.has(c.id)?'ok':''}" data-acc="selCam" data-id="${c.id}">${SELCAM.has(c.id)?'☑ Seleccionado':'☐ Seleccionar'}</button>`:''}${c.retenido?'<span class="s"> ✋ retenido</span>':''}${c.chofer&&flotaDe(c)&&!flotaDe(c).itvCita&&diasITV(flotaDe(c))<=20&&!enITV(c)?`<button class="jb" data-acc="itv" data-id="${c.id}">📋 Cita ITV</button>`:''}</div></div>`}
  }
  if(pestana==='taller'){
    const mecs=J.personal.filter(s=>s.rol==='mecanico');
    h+=`<h5>Mecánicos (${mecs.length}/${MAX_MECANICOS})</h5>`;
    if(!mecs.length)h+=`<div class="vacio">No tienes mecánicos: cada avería va al <b>taller externo</b> (1,8 veces más caro, 1 h de espera y más lento) y no puedes instalar mejoras en las máquinas.</div>`;
    for(const s of mecs)h+=`<div class="card mini"><div class="t">${s.noche?'🌙':'☀️'} ${esc(s.nombre)} <small>Nivel ${nivelMec(s)} · ${s.salario} €/día · turno de ${s.noche?'tarde/noche':'día'}</small></div><div class="s">${s.noche?(R.enDia?'Entra cuando acaba la jornada: repara lo que quede y revisa camiones y planta para mañana.':'De turno de noche'):tareaTxt(s)}</div>
      ${mecs.length>1?`<div class="bt"><button class="jb" data-acc="turnoMec" data-id="${s.id}">${s.noche?'☀️ Pasar a turno de día':'🌙 Pasar a turno de noche'}</button></div>`:''}</div>`;
    if(mecs.length>1)h+=`<div class="s" style="color:#9aa6b2;margin:-2px 0 8px">☀️ El de día acompaña a los camiones y a la planta cuando se averían. 🌙 El de noche deja la flota revisada para el día siguiente.</div>`;
    if(mecs.length<MAX_MECANICOS)h+=puede('mecanico')?`<div class="bt"><button class="jb ok" data-acc="contratar-mec" ${J.caja<COSTE_MECANICO?'disabled':''}>Contratar mecánico nº ${mecs.length+1} (${fmtE(COSTE_MECANICO)} + 100 €/día)</button></div>`:`<div class="vacio">🔒 Contratar mecánicos: nivel ${DESBLOQ.mecanico}.</div>`;
    const av=Object.keys(J.maq).filter(id=>J.maq[id].averia);
    h+=`<h5>Averías</h5>`;
    if(!av.length)h+=`<div class="vacio">Todo funcionando. 👍</div>`;
    for(const id of av){const a=J.maq[id].averia,qui=a.asignada?persona(a.asignada):null;
      h+=`<div class="card mini" style="border-color:rgba(255,90,79,.5)"><div class="t">🔧 ${nombreMaq(id)} <small>${a.grave?'GRAVE':'leve'}</small></div><div class="s">${esc(a.desc)} · piezas ~${fmtE(a.coste)}</div>
      <div class="s">${a.ext?(a.viaje>0?`Taller externo en camino (${Math.ceil(a.viaje)} min)`:'Taller externo reparando'):qui?`${esc(qui.nombre)} ${a.viaje>0?`va hacia allí (${Math.ceil(a.viaje)} min)`:'está reparando'}`:'Esperando a un mecánico libre'}</div>${barra(a.prog,a.total,'#5aa9e6')}
      ${a.ext?'':`<div class="bt"><button class="jb" data-acc="externo" data-k="${id}">Llamar al taller externo</button></div>`}</div>`}
    h+=`<h5>Estado de las máquinas</h5><div class="card mini">`;
    const lista=['planta',...(J.asfalto?['asfalto']:[]),...(J.canteraPropia?['cantera']:[]),...J.flota.map(f=>f.id)];
    for(const id of lista){const c=maq(id).cond;h+=`<div class="s">${nombreMaq(id)}: <b>${Math.round(c)} %</b>${averiada(id)?' <span class="neg">· averiado</span>':''}${flotaDe(id)?` · ${itvTxt(flotaDe(id))}`:''}</div>${barra(c,100,c>60?'#3fae5a':c>35?'#e2b33b':'#d9534f')}`}
    h+=`<div class="s" style="margin-top:8px;color:#9aa6b2">Cuanto más gastada está una máquina, más se avería. Los mecánicos libres hacen mantenimiento en horario normal.</div></div>`;
    h+=`<h5>Mejoras de maquinaria</h5>`;
    for(const[id,M]of Object.entries(MEJORAS_MAQ)){
      if(!puede('mejMaq')){h+=`<div class="vacio">🔒 Mejoras de maquinaria: nivel ${DESBLOQ.mejMaq}.</div>`;break}
      const inst=J.instalando.find(i=>i.id===id),hech=hecha(id),bloq=!mecs.length||(M.req==='cantera'&&!J.canteraPropia);
      h+=`<div class="card mini"><div class="t">${esc(M.n)}</div><div class="s">${esc(M.d)} · ${M.horas} h de mecánico</div>
      ${inst?`<div class="s">Instalando… ${Math.round(inst.prog/(M.horas*60)*100)} %</div>${barra(inst.prog,M.horas*60,'#5aa9e6')}`:
        `<div class="bt"><button class="jb ${hech?'':'ok'}" data-acc="mejmaq" data-k="${id}" ${hech||bloq||J.caja<M.coste?'disabled':''}>${hech?'Instalada':bloq?(M.req==='cantera'&&!J.canteraPropia?'Necesitas la cantera':'Necesitas un mecánico'):fmtE(M.coste)}</button></div>`}</div>`}
  }
  if(pestana==='planta'){
    const r=ritmo();
    h+=`<div class="card"><div class="t">🏭 ${J.lineas} línea${J.lineas>1?'s':''} · ${J.tolvas} tolvas · ${r} m³/h${J.lineas>1?' cada una':''}</div>
      <div class="tolvas">${[0,1,2,3,4].map(i=>`<i class="${i<J.tolvas?'on':''}"></i>`).join('')}</div>
      ${[R.cargando,R.cargando2].slice(0,J.lineas).map((L,i)=>`<div class="s">Línea ${i+1}: ${L?`cargando ${L.c.id} · ${L.c.carga} m³ (${Math.ceil(L.t)} min)`:'parada'}</div>`).join('')}<div class="s">${R.cola.length?`${R.cola.length} hormigonera${R.cola.length>1?'s':''} en cola`:''}${J.lab?` · 🧪 Laboratorio nivel ${J.lab}`:''}</div>
      <div class="s">Cemento en silo: <b>${J.silo.toFixed(1)} / ${J.capSilo} t</b>${R.cementoPedido?` (+${R.cementoPedido} t en camino)`:''}</div>${barra(J.silo,J.capSilo,'#c9ced3')}
      <div class="s">Áridos en acopios: <b>${Math.round(J.acopio)} / ${J.capAcopio} t</b></div>${barra(J.acopio,J.capAcopio,'#c9a06a')}
      <div class="s">Cantera: ${J.canteraPropia?'<b>propia</b> (3 €/t)':'alquilada (9 €/t)'}</div>
      <div class="bt"><button class="jb" data-acc="cemento">Pedir cisterna (25 t · ${fmtE(CAP.cisterna*PRECIO.cemento)})</button></div>
      <label class="chk"><input type="checkbox" data-acc="autocem" ${J.autoCemento?'checked':''}> Pedir cemento automáticamente</label></div>
      <div class="card"><div class="t">🧹 Orden y limpieza · ${estadoLimpieza()}</div>
        ${barra(J.suciedad,100,J.suciedad<45?'#3fae5a':J.suciedad<70?'#e2b33b':'#d9534f')}
        <div class="s">Suciedad ${Math.round(J.suciedad)} % · ${R.limpiando?'🧽 se está limpiando ahora':'nadie limpiando ahora'}${R.st.sobrante?` · hoy han vuelto ${R.st.sobrante.toFixed(1)} m³ de sobrantes`:''}</div>
        <div class="s" style="color:#9aa6b2">Se ensucia al producir y con el hormigón sobrante que vuelve en las cubas. El operario limpia cuando la línea está parada; un peón limpia toda la jornada. Sucia = más averías, accidentes y mala imagen.</div>
        <div class="bt"><button class="jb" data-acc="limpieza">Limpieza externa · ${fmtE(LIMPIEZA_EXT)}</button>${J.recicladora?'':`<button class="jb ${J.nivel>=3?'ok':''}" data-acc="recicladora" ${J.nivel<3||J.caja<RECICLADORA?'disabled':''}>${J.nivel<3?'🔒 Recicladora (nv 3)':`♻️ Recicladora · ${fmtE(RECICLADORA)}`}</button>`}</div>
        ${J.recicladora?'<div class="s">♻️ Recicladora instalada: los sobrantes vuelven a los acopios como árido.</div>':''}</div>
      <div class="card"><div class="t">🦺 Prevención · ${J.diasSinAcc} día${J.diasSinAcc===1?'':'s'} sin accidentes</div>
        <div class="s">EPIs nivel <b>${EPI.nombres[J.epiNivel]}</b> · estado ${Math.round(J.epiEstado)} %</div>${barra(J.epiEstado,100,J.epiEstado>60?'#3fae5a':J.epiEstado>35?'#e2b33b':'#d9534f')}
        <div class="s">Con formación en PRL: ${J.personal.filter(s=>tiene(s,'prl')).length}/${J.personal.length} · ${encargadoAct()?`⭐ Encargado/a: ${esc(encargadoAct().nombre)}`:'Sin encargado/a de planta'}</div>
        <div class="bt"><button class="jb" data-acc="epi-renovar">Renovar EPIs · ${fmtE(EPI.renovar[J.epiNivel]*J.personal.length)}</button>${J.epiNivel<3?`<button class="jb ok" data-acc="epi-mejorar">Mejorar a ${EPI.nombres[J.epiNivel+1]} · ${fmtE(EPI.mejora[J.epiNivel])}</button>`:''}</div>
        <div class="s" style="color:#9aa6b2">EPIs gastados, planta sucia, horas extra y gente sin PRL disparan los accidentes. La Inspección de Trabajo multa si encuentra fallos.</div></div>
      <h5>Mejoras</h5>
      ${mejora('tolva',`Añadir tolva de áridos (${J.tolvas}/5)`,`Más tolvas = más rápido: +12 m³/h por tolva en cada línea.`,PRECIO.tolva,J.tolvas>=5,J.tolvas>=4?'tolva5':'tolva4')}
      ${mejora('acopios','Ampliar acopios (+200 t)','Más reserva de áridos: menos viajes urgentes a la cantera.',PRECIO.acopios,false,'acopios')}
      ${mejora('hormigonera','Nueva hormigonera + chófer','Una cuba más y su chófer (95 €/día).',PRECIO.hormigonera,false,'hormigonera')}
      ${mejora('lab',J.lab?`Laboratorio · subir a nivel ${J.lab+1}`:'Montar laboratorio de calidad',J.lab>=3?'Laboratorio al máximo.':['Mejores fórmulas: −5 % de cemento por m³.','−10 % de cemento y permite servir HA-35 (hoteles y constructoras pagan +22 €/m³).','−14 % de cemento por m³.'][J.lab],PRECIO_EXTRA.lab[Math.min(2,J.lab)],J.lab>=3,['lab1','lab2','lab3'][Math.min(2,J.lab)])}
      ${mejora('silo2','Segundo silo de cemento (+40 t)','Más autonomía: menos cisternas y menos esperas.',PRECIO_EXTRA.silo2,J.capSilo>=100,'silo2')}
      ${mejora('cantera','Comprar la cantera','Los áridos pasan de 9 €/t a 3 €/t.',PRECIO.cantera,J.canteraPropia,'cantera')}
      ${J.canteraPropia?mejora('ampliarCantera','Ampliar la superficie de la cantera','Más frente de extracción: áridos a 2 €/t y la bañera carga un 30 % más rápido.',PRECIO_EXTRA.ampliarCantera,J.canteraAmpliada,'ampliarCantera'):''}
      ${mejora('linea2','Segunda línea de producción','Otra línea completa (tolvas, cinta y torre): carga dos hormigoneras a la vez.',PRECIO_EXTRA.linea2,J.lineas>=2,'linea2')}
      <h5>Competencia</h5>${Object.keys(RIVALES).map(k=>{const c=J.rivales[k].comprada,bl=!puede('rivales');
        return `<div class="card mini"><div class="t" style="color:${RIVALES[k].col}">${bl&&!c?'🔒 ':''}Comprar ${k}</div><div class="s">${c?'Ya es de HORINSA.':`Su planta, sus clientes (+cuota) y +3 €/m³ en tus precios. Dejas de competir con ${k} en llamadas y licitaciones.`}</div>
        <div class="bt"><button class="jb ${c||bl?'':'ok'}" data-acc="comprar-rival" data-k="${k}" ${c||bl||J.caja<RIVALES[k].precio?'disabled':''}>${c?'Comprada':bl?`Nivel ${DESBLOQ.rivales}`:fmtE(RIVALES[k].precio)}</button></div></div>`}).join('')}
      <h5>Asfalto</h5>
      ${J.asfalto?`<div class="card"><div class="t">🛣️ Planta de asfalto · ${ASF.ritmo} t/h</div>
        <div class="s">${R.cargandoA?`Cargando ${R.cargandoA.c.id}: ${R.cargandoA.c.carga} t (${Math.ceil(R.cargandoA.t)} min)`:'Parada'}${R.colaA&&R.colaA.length?` · ${R.colaA.length} en cola`:''}</div>
        <div class="s">Betún: <b>${J.betun.toFixed(1)} / ${J.capBetun} t</b>${R.betunPedido?` (+${R.betunPedido} t en camino)`:''}</div>${barra(J.betun,J.capBetun,'#3a3a3a')}
        <div class="s" style="color:#9aa6b2">El asfalto se enfría: si tarda más de ${ASF.enfria} min desde la carga, se cobra un 15 % menos.</div>
        <div class="bt"><button class="jb" data-acc="betun">Pedir betún (20 t · ${fmtE(20*ASF.betun)})</button></div></div>
        ${mejora('asfaltera','Nueva bañera de asfalto + chófer','24 t por viaje, con lona térmica.',ASF.camion,false,'asfalto')}`
       :mejora('asfalto','Montar planta de asfalto','Tambor secador, quemador, filtro y silo de mezcla caliente junto a tu planta. Abre los pedidos de asfaltado (calles, carreteras, aparcamientos). Incluye una bañera de asfalto.',ASF.planta,false,'asfalto')}
      <h5>Grupo HORINSA · expansión</h5>${Object.entries(DELEG).map(([k,D])=>{const d=J.deleg[k],bl=!puede(D.req);
        if(d)return `<div class="card mini"><div class="t">🏭 ${esc(D.n)} <small>${D.isla}</small></div><div class="s">Inversión nivel ${d.inv}/5 · ayer ${fmtE(d.ultimo)} · acumulado ${fmtE(d.acum)}${d.dias<=5?' · en arranque':''}</div>
          <div class="bt"><button class="jb ${d.inv>=5?'':'ok'}" data-acc="invertir" data-k="${k}" ${d.inv>=5||J.caja<D.coste*.25*d.inv?'disabled':''}>${d.inv>=5?'Al máximo':`Invertir · ${fmtE(D.coste*.25*d.inv)}`}</button></div></div>`;
        return `<div class="card mini"><div class="t">${bl?'🔒 ':''}${esc(D.n)} <small>${D.isla}</small></div><div class="s">${k==='sur'?'Segunda planta en el sur de la isla: más cuota de mercado y beneficio diario.':'Delegación en otra isla: la gestiona un gerente y aporta su resultado diario al grupo.'}</div>
          <div class="bt"><button class="jb ${bl?'':'ok'}" data-acc="delegacion" data-k="${k}" ${bl||J.caja<D.coste?'disabled':''}>${bl?`Nivel ${DESBLOQ[D.req]}`:fmtE(D.coste)}</button></div></div>`}).join('')}
      <div class="bt" style="margin-top:14px"><button class="jb peligro" data-acc="reiniciar">Empezar partida nueva</button></div>`;
  }
  if(pestana==='personal'){
    for(const s of J.personal){
      const cat=s.cat||0,sig=cat<2?XP_ASCENSO[cat]:XP_ENCARGADO;
      h+=`<div class="card mini"><div class="t">${caraContento(s.contento)} ${esc(s.nombre)}${J.encargado===s.id?' ⭐':''} <small>${CATS[cat]} · ${ROLES[s.rol]} · ${s.salario} €/día</small></div>
      <div class="s">Experiencia: ${s.xpT||0} días${cat<3?` / ${sig} para ${cat<2?CATS[cat+1]:'encargado/a'}`:''}${s.estancado>10?' · <span class="neg">se siente estancado/a</span>':''}</div>
      ${puedeAscender(s)?`<div class="bt"><button class="jb ok" data-acc="ascender" data-id="${s.id}">📈 Ascender a ${CATS[cat+1]} (+10 % sueldo)</button></div>`:''}
      ${puedeEncargado(s)?`<div class="bt"><button class="jb ok" data-acc="encargado" data-id="${s.id}">⭐ Nombrar encargado/a de planta (+25 % sueldo)</button></div>`:''}
      ${barra(s.contento,100,s.contento>=60?'#3fae5a':s.contento>=35?'#e2b33b':'#d9534f')}
      <div class="s">Contento ${Math.round(s.contento)}/100${s.extraHoy>0?` · <span class="neg">${(s.extraHoy/60).toFixed(1)} h extra hoy</span>`:''}${s.baja>0?` · <span class="neg">de baja (${s.baja} d)</span>`:''} · ${s.extraTotal.toFixed(1)} h extra acumuladas</div>
      <div class="chips">${s.cursos.map(c=>`<span class="chip2">🎓 ${esc(CURSOS[c].n)}</span>`).join('')}</div>
      ${s.curso?`<div class="s espera">🎓 ${s.curso.empezado?'De curso':'Apuntado/a'}: ${esc(CURSOS[s.curso.id].n)} (${s.curso.horas?String(s.curso.horas).replace('.',',')+' h':s.curso.dias+' día'+(s.curso.dias>1?'s':'')})</div>`:
        `<div class="bt"><button class="jb ok" data-acc="fichaP" data-id="${s.id}">👁 Ficha</button><button class="jb" data-acc="vercursos" data-id="${s.id}">${cursosAbiertos===s.id?'Cerrar ▴':'Formación ▾'}</button>${s.vac?'':`<button class="jb" data-acc="vacaciones" data-id="${s.id}">🏖️ Vacaciones</button>`}<button class="jb" data-acc="sueldo" data-id="${s.id}">💶 +5 %</button></div>`}
      ${s.vac?`<div class="s espera">🏖️ ${s.vac.empezado?'De vacaciones':'Vacaciones aprobadas'} (${s.vac.dias} días)</div>`:`<div class="s ${s.diasTrab>40?'neg':''}">${s.diasTrab} días trabajados sin vacaciones${s.diasTrab>40?' · necesita descansar':''}</div>`}
      ${cursosAbiertos===s.id&&!s.curso?Object.entries(CURSOS).filter(([k,C])=>(C.rol===s.rol||C.rol==='*')&&!tiene(s,k)).map(([k,C])=>{const falta=C.req&&!tiene(s,C.req);
        return `<div class="curso"><div class="t">${esc(C.n)}</div><div class="s">${esc(C.d)}</div><div class="s">${durCurso(C)}${falta?` · requiere «${esc(CURSOS[C.req].n)}»`:''}</div>
        <div class="bt"><button class="jb ok" data-acc="curso" data-id="${s.id}" data-k="${k}" ${falta||J.caja<C.coste?'disabled':''}>Apuntar · ${fmtE(C.coste)}</button></div></div>`}).join('')||'<div class="vacio">Ya ha hecho todos los cursos disponibles.</div>':''}</div>`}
    const vacantes=J.flota.filter(f=>!f.chofer||!persona(f.chofer));
    h+=`<h5>Contratar</h5>${vacantes.length?`<div class="s neg" style="margin-bottom:6px">🚚 ${vacantes.map(f=>f.id).join(', ')} sin chófer.</div>`:''}
    <div class="bt"><button class="jb ok" data-acc="contratar" data-k="chofer">Chófer${vacantes.length?'':' de reserva'}</button><button class="jb" data-acc="contratar" data-k="planta">Operario/a planta</button><button class="jb" data-acc="contratar" data-k="oficina">Oficina</button></div>
    <div class="bt"><button class="jb ok" data-acc="contratar" data-k="peon">🧹 Peón de limpieza y mantenimiento (78 €/día)</button></div>
    <div class="s" style="color:#9aa6b2">500 € de alta. Un chófer de reserva sustituye solo a quien falte (bajas, cursos, vacaciones).</div>`;
    h+=`<div class="vacio">Las horas extra queman al equipo: si el contento baja mucho piden aumentos o se cogen la baja. Un día sin horas extra lo recupera poco a poco.<br>🎓 Los cursos sacan a la persona del trabajo esos días (cobra igual): planifícalos para no quedarte sin chófer, sin planta o sin oficina.</div>`;
  }
  // solo se toca el DOM si algo ha cambiado (evita parpadeos y que se pierda el hover)
  // se actualizan solo las tarjetas que han cambiado; el resto ni se toca (nada parpadea)
  if(h!==ultimoHTML){ultimoHTML=h;const cu=$('jCuerpo'),sc=cu.scrollTop,tpl=document.createElement('template');tpl.innerHTML=h;
    const nuevos=[...tpl.content.childNodes].filter(n=>n.nodeType===1||(n.nodeType===3&&n.textContent.trim())),viejos=[...cu.childNodes].filter(n=>n.nodeType===1||(n.nodeType===3&&n.textContent.trim()));
    if(cu.dataset.pestana!==pestana){cu.dataset.pestana=pestana;cu.replaceChildren(...nuevos)}
    else{nuevos.forEach((n,i)=>{const v=viejos[i];if(!v)cu.appendChild(n);else if(!(v.isEqualNode&&v.isEqualNode(n))){if(v.nodeType===1&&n.nodeType===1&&v.tagName===n.tagName&&v.className===n.className){if(v.innerHTML!==n.innerHTML)v.innerHTML=n.innerHTML;for(const at of [...n.attributes])if(v.getAttribute(at.name)!==at.value)v.setAttribute(at.name,at.value)}else cu.replaceChild(n,v)}});
      for(let i=nuevos.length;i<viejos.length;i++)viejos[i].remove()}
    cu.scrollTop=sc}
}
function mejora(k,t,d,precio,hecho,req){const bloq=req&&!puede(req);
  return`<div class="card mini"><div class="t">${bloq?'🔒 ':''}${t}</div><div class="s">${d}</div><div class="bt"><button class="jb ${hecho||bloq?'':'ok'}" data-acc="comprar" data-k="${k}" ${hecho||bloq||J.caja<precio?'disabled':''}>${hecho?'Hecho':bloq?`Nivel ${DESBLOQ[req]}`:fmtE(precio)}</button></div></div>`}

function onAccion(e){
  const el=e.target.closest('[data-acc]');if(!el)return;const a=el.dataset.acc;
  if(a==='aceptar')aceptar(+el.dataset.id);
  else if(a==='turnoMec'){const s=persona(el.dataset.id);if(s&&s.rol==='mecanico'){
      const mecs=J.personal.filter(x=>x.rol==='mecanico');
      if(!s.noche&&mecs.filter(x=>!x.noche).length<=1){toast('Tiene que quedar al menos un mecánico de día.','mal')}
      else{s.noche=!s.noche;if(s.noche&&s.tarea){if(s.tarea.tipo==='rep'){const av=maq(s.tarea.id).averia;if(av&&av.asignada===s.id)av.asignada=null}const ins=J.instalando.find(i=>i.asignada===s.id);if(ins)ins.asignada=null;s.tarea=null}
        toast(s.noche?`🌙 ${s.nombre} pasa al turno de tarde/noche.`:`☀️ ${s.nombre} pasa al turno de día.`,'info');guardar();pintarUI(true)}}}
  else if(a==='jugarReto')jugarReto();
  else if(a==='fichaP')ficha({tipo:'j-persona',d:el.dataset.id});
  else if(accionFicha(a,el)){}
  else if(a==='noReto'){R.reto=null;pintarUI(true)}
  else if(a==='verLlamada'){pestana='llamadas';document.querySelectorAll('#jTabs button[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t==='llamadas'));$('jTabLl')?.classList.remove('aviso');$('jPanel')?.classList.remove('plegado');pintarUI(true);const c=document.querySelector(`#jCuerpo [data-k="ll${el.dataset.id}"]`);if(c)c.scrollIntoView({block:'nearest'})}
  else if(a==='rechazar')rechazar(+el.dataset.id);
  else if(a==='pre-rechazar')preguntarRechazo(+el.dataset.id);
  else if(a==='posponer')posponer(+el.dataset.id);
  else if(a==='factoring')adelantarCobros();
  else if(a==='cemento')pedirCemento(false);
  else if(a==='autocem'){J.autoCemento=el.checked;guardar()}
  else if(a==='comprar')comprar(el.dataset.k);
  else if(a==='ver')enfocar(+el.dataset.x,+el.dataset.y);
  else if(a==='siguiente')siguienteDia();
  else if(a==='aum-si'||a==='aum-no'){const s=persona(el.dataset.id);J.peticiones=J.peticiones.filter(q=>q.id!==el.dataset.id);
    if(s){if(a==='aum-si'){s.salario=Math.round(s.salario*1.1);s.contento=Math.min(100,s.contento+25)}else s.contento=Math.max(0,s.contento-10)}
    el.closest('.peticion').innerHTML=a==='aum-si'?`✔️ ${esc(s.nombre)}: aumento concedido.`:`✖️ ${esc(s.nombre)}: aumento rechazado (se enfada un poco).`}
  else if(a==='reiniciar'){if(confirm('¿Seguro? Se pierde la partida actual.')){try{localStorage.removeItem('horinsa-partida')}catch(_){}J=migrar(partidaNueva());guardar();cerrarModal();empezarDia()}}
  else if(a==='regatear')regatear(+el.dataset.id);
  else if(a==='contratar-mec')contratarMecanico();
  else if(a==='mejmaq')comprarMejoraMaq(el.dataset.k);
  else if(a==='externo')tallerExterno(el.dataset.k,false);
  else if(a==='vercursos'){cursosAbiertos=cursosAbiertos===el.dataset.id?null:el.dataset.id;pintarUI(true)}
  else if(a==='curso')apuntarCurso(el.dataset.id,el.dataset.k);
  else if(a==='vacaciones')mandarVacaciones(el.dataset.id);
  else if(a==='igualar')igualar(+el.dataset.id);
  else if(a==='betun')pedirBetun(false);
  else if(a==='seguir'){const id=el.dataset.id;if(window.SEGUIDO===id){window.SEGUIDO=null;return}const c=R&&R.camiones.find(c=>c.id===id);if(!c)return;
    window.SEGUIDO=id;if(window.MODO3D&&window.enfocar3D)enfocar3D(c.x,c.y,1.4);else enfocar(c.x,c.y);toast(`📍 Siguiendo a ${id}. Arrastra el mapa para soltarlo.`,'info')}
  else if(a==='ascender')ascender(el.dataset.id);
  else if(a==='encargado')nombrarEncargado(el.dataset.id);
  else if(a==='epi-renovar')renovarEPI();
  else if(a==='epi-mejorar')mejorarEPI();
  else if(a==='limpieza')limpiezaExterna();
  else if(a==='recicladora')comprarRecicladora();
  else if(a==='delegacion'){if(confirm(`¿Abrir ${DELEG[el.dataset.k].n} por ${fmtE(DELEG[el.dataset.k].coste)}?`))abrirDelegacion(el.dataset.k)}
  else if(a==='invertir')invertirDelegacion(el.dataset.k);
  else if(a==='mercado'){mercadoAbierto=!mercadoAbierto;pintarUI(true)}
  else if(a==='contratar')contratar(el.dataset.k);
  else if(a==='comprar-rival'){if(confirm(`¿Comprar ${el.dataset.k} por ${fmtE(RIVALES[el.dataset.k].precio)}?`))comprarRival(el.dataset.k)}
  else if(a==='sueldo')subirSueldo(el.dataset.id);
  else if(a==='ofertar'){const inp=document.querySelector(`input[data-licit="${el.dataset.id}"]`);if(inp)ofertar(+el.dataset.id,+inp.value)}
  else if(a==='empezar'){cerrarModal();empezarDia();ponerVel(1)}
}

/* ------------------------------ Dibujado 2D ------------------------------ */
function juegoDibujar(s){
  if(!R||!SIT)return;
  // caminos de acceso a planta y cantera
  ctx.save();ctx.strokeStyle='rgba(90,80,70,.85)';ctx.lineWidth=Math.max(1.5,.008*s);ctx.setLineDash([4,3]);
  for(const k of['planta','cantera','puerto']){const q=SIT[k];ctx.beginPath();ctx.moveTo(SX(q.x),SY(q.y));ctx.lineTo(SX(RED.N[q.n][0]),SY(RED.N[q.n][1]));ctx.stroke()}
  ctx.restore();
  // obras
  for(const p of R.pedidos){if(!['llamada','aceptado','servido'].includes(p.estado))continue;
    const X=SX(p.x),Y=SY(p.y);if(X<-40||Y<-40||X>W+40||Y>H+40)continue;
    if(p.estado!=='llamada'&&s>25){ctx.strokeStyle='rgba(90,80,70,.7)';ctx.lineWidth=1.2;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(X,Y);ctx.lineTo(SX(RED.N[p.n][0]),SY(RED.N[p.n][1]));ctx.stroke();ctx.setLineDash([])}
    const col=p.estado==='llamada'?'#7b8794':p.estado==='servido'?'#3fae5a':'#f08a24';
    const pul=1;
    ctx.fillStyle=col;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(X,Y,10*pul,0,7);ctx.fill();ctx.stroke();
    if(p.estado==='aceptado'&&p.entregado>0){ctx.strokeStyle='#3fae5a';ctx.lineWidth=3;ctx.beginPath();ctx.arc(X,Y,13,-Math.PI/2,-Math.PI/2+p.entregado/p.m3*Math.PI*2);ctx.stroke()}
    ctx.fillStyle='#fff';ctx.font='11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.estado==='llamada'?'☎':p.estado==='servido'?'✓':'🏗',X,Y+.5);
    libre(X-12,Y-12,24,24);
    if(s>20)texto(`${p.cliente} · ${p.m3} ${ud(p)}`,X,Y+26,'700 10.5px system-ui,sans-serif',col==='#7b8794'?'#333':col,'rgba(255,255,255,.9)');
    HIT.push({x:X,y:Y,r:14,o:{tipo:'j-obra',d:p}});
  }
  // camiones
  for(const c of R.camiones){const X=SX(c.x),Y=SY(c.y);if(X<-30||Y<-30||X>W+30||Y>H+30)continue;
    const L=Math.max(15,.012*s),A=L*.42;ctx.save();ctx.translate(X,Y);ctx.rotate(c.ang||0);
    ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(-L/2+2,-A/2+2,L,A);
    if(c.tipo==='hormigonera'){ctx.fillStyle='#ececec';ctx.fillRect(-L/2,-A/2,L,A);ctx.fillStyle='#d2201f';ctx.fillRect(L/2-L*.27,-A/2,L*.27,A);
      ctx.fillStyle='#b9bec3';ctx.beginPath();ctx.ellipse(-L*.1,0,L*.3,A*.42,0,0,7);ctx.fill();
      ctx.strokeStyle='#d2201f';ctx.lineWidth=Math.max(1.5,A*.18);ctx.beginPath();const g=c.giro||0;ctx.moveTo(-L*.1+Math.cos(g)*L*.25,Math.sin(g)*A*.35);ctx.lineTo(-L*.1-Math.cos(g)*L*.25,-Math.sin(g)*A*.35);ctx.stroke()}
    else if(c.tipo==='asfaltera'){ctx.fillStyle='#2b2b2b';ctx.fillRect(-L/2,-A/2,L*.72,A);ctx.fillStyle='#d2201f';ctx.fillRect(L/2-L*.27,-A/2,L*.27,A)}
    else if(c.tipo==='banera'){ctx.fillStyle='#d9a404';ctx.fillRect(-L/2,-A/2,L*.72,A);ctx.fillStyle='#f2c230';ctx.fillRect(L/2-L*.27,-A/2,L*.27,A);if(c.carga>0){ctx.fillStyle='#9a7a55';ctx.beginPath();ctx.ellipse(-L*.14,0,L*.28,A*.35,0,0,7);ctx.fill()}}
    else{ctx.fillStyle='#555';ctx.fillRect(L/2-L*.25,-A/2,L*.25,A);ctx.fillStyle='#d6dade';ctx.beginPath();ctx.roundRect(-L/2,-A/2,L*.73,A,A/2);ctx.fill()}
    ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=1;ctx.strokeRect(-L/2,-A/2,L,A);ctx.restore();
    if(c.chofer&&averiada(c.id))texto('⚠ '+c.id,X,Y-L*.5-4,'800 11px system-ui,sans-serif','#d9534f','#fff');
    else if(s>60)texto(c.id,X,Y-L*.5-4,'700 10px system-ui,sans-serif','#222','rgba(255,255,255,.85)');
    HIT.push({x:X,y:Y,r:Math.max(10,L*.6),o:{tipo:'j-camion',d:c}});
  }
  window.STOCK_PLANTA={silo:J.silo/J.capSilo,acopio:J.acopio/J.capAcopio,suciedad:J.suciedad/100,epi:J.epiEstado,dsa:J.diasSinAcc,
    peones:J.personal.filter(s=>s.rol==='peon'&&disponible(s)).length,limpiando:!!(R&&R.limpiando)};
}
/* --------------- Fichas tipo Sims: estado y acciones de cada persona --------------- */
function camionDe(s){const f=J.flota.find(f=>f.chofer===s.id);const id=(R&&R.sust)?Object.keys(R.sust).find(k=>R.sust[k]===s.id):null;return R?R.camiones.find(c=>c.id===(id||(f&&f.id))):null}
function estadoPersona(s){
  if(!s)return null;
  if(s.baja>0)return{ic:'🤒',txt:`De baja (${s.baja} día${s.baja>1?'s':''})`,problema:true};
  if(deVacaciones(s))return{ic:'🏖️',txt:'De vacaciones'};
  if(enCurso(s))return{ic:'🎓',txt:`De curso: ${CURSOS[s.curso.id].n}`};
  if(R&&R.huelga)return{ic:'✊',txt:'De huelga',problema:true};
  if(s.noche&&R&&R.enDia)return{ic:'🌙',txt:'Turno de noche: entra al acabar la jornada'};
  if(R&&R.enDia&&s.descansoHasta>R.min)return{ic:'☕',txt:`Descansando hasta las ${fmtH(s.descansoHasta)}`};
  if(!R||!R.enDia)return{ic:'',txt:'Fuera de la jornada'};
  if(s.contento<25)return{ic:'😡',txt:'Está quemado/a: necesita descanso, vacaciones o un aumento',problema:true};
  const pend=R.pedidos.some(p=>p.estado==='aceptado'&&p.m3-p.entregado-p.enCamino>0);
  if(s.rol==='chofer'){const c=camionDe(s);if(!c)return{ic:'💤',txt:'Sin camión asignado: chófer de reserva',ocioso:true};
    if(averiada(c.id)){const a=maq(c.id).averia;return a.ext?{ic:'🔧',txt:`${c.id} está en el taller externo`,problema:true}:{ic:'🔧',txt:`Arreglando su camión ${c.id} (${Math.round(a.prog/a.total*100)} %)${a.asignada?' con el mecánico':''}`,problema:true}}
    if(c.estado==='libre'&&maq(c.id).cond<92&&!(c.lavarHasta>R.min))return{ic:'🔧',txt:`Revisando y engrasando ${c.id} (${Math.round(maq(c.id).cond)} %)`};
    if(enITV(c))return{ic:'📋',txt:`Ha llevado ${c.id} a la ITV`};
    if(itvCaducada(flotaDe(c)))return{ic:'⚠️',txt:`${c.id} tiene la ITV caducada: no puede salir`,problema:true};
    if(c.estado==='libre')return c.lavarHasta>R.min?{ic:'🧽',txt:`Lavando ${c.id}`}:{ic:'💤',txt:pend?`En planta con ${c.id}, esperando turno de carga`:`En planta con ${c.id}: no hay nada que llevar`,ocioso:!pend};
    return{ic:'',txt:estadoCamion(c)}}
  if(s.rol==='mecanico')return s.tarea?{ic:'🔧',txt:tareaTxt(s)}:{ic:'💤',txt:'Libre en el taller',ocioso:true};
  if(s.rol==='planta'){if(averiada('planta'))return{ic:'⚠️',txt:'La planta está averiada',problema:true};
    if(R.cargando||R.cargando2)return{ic:'',txt:'Cargando hormigón'};
    if(R.cola.length&&J.silo<1)return{ic:'⚠️',txt:'Falta cemento en el silo',problema:true};
    if(R.cola.length&&J.acopio<2)return{ic:'⚠️',txt:'Faltan áridos',problema:true};
    return R.limpiando?{ic:'🧹',txt:'Limpiando el foso y la cinta'}:{ic:'💤',txt:'Sin cargas ahora mismo',ocioso:true}}
  if(s.rol==='oficina'){const ll=R.pedidos.filter(p=>p.estado==='llamada').length;return ll?{ic:'📞',txt:`Atendiendo ${ll} llamada${ll>1?'s':''}`}:{ic:'',txt:'Facturas, albaranes y papeleo'}}
  if(s.rol==='peon')return{ic:'🧹',txt:J.suciedad>8?'Limpiando y recogiendo escombros':'Mantenimiento del patio'};
  return{ic:'',txt:ROLES[s.rol]};
}
const barraSims=(n,v,col)=>`<div class="s" style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="width:74px">${n}</span><span style="flex:1">${barra(v,100,col)}</span></div>`;
function fichaPersona(s){
  const e=estadoPersona(s),cam=s.rol==='chofer'?camionDe(s):null,dia=R&&R.enDia,libre=disponible(s);
  const energia=Math.max(0,100-(s.extraHoy||0)/3-Math.max(0,(s.diasTrab||0)-25)*1.5);
  const b=[];
  if(dia&&libre&&s.charla!==J.nDia)b.push(`<button class="jb" data-acc="charlar" data-id="${s.id}">💬 Charlar y animar</button>`);
  if(dia&&libre&&s.descDia!==J.nDia&&(!cam||cam.estado==='libre'))b.push(`<button class="jb" data-acc="descanso" data-id="${s.id}">☕ Descanso de 30 min</button>`);
  if(dia&&libre&&(s.rol==='peon'||(s.rol==='planta'&&!R.cargando&&!R.cargando2))&&!(R.min-(s.limpiaMin||-999)<60))b.push(`<button class="jb ok" data-acc="limpiaFondo" data-id="${s.id}">🧹 Limpieza a fondo (−10 suciedad)</button>`);
  if(dia&&libre&&s.rol==='mecanico'&&!s.tarea){const w=['planta',...R.camiones.filter(c=>c.chofer&&c.estado==='libre').map(c=>c.id)].filter(id=>!averiada(id)&&maq(id).cond<97).sort((a,b)=>maq(a).cond-maq(b).cond)[0];
    if(w)b.push(`<button class="jb ok" data-acc="revisar" data-id="${s.id}" data-k="${w}">🔧 Revisar ${esc(nombreMaq(w))} (${Math.round(maq(w).cond)} %)</button>`)}
  if(cam)b.push(`<button class="jb" data-acc="verCamion" data-id="${cam.id}">🚚 Ver su camión ${cam.id}</button>`);
  if(dia&&cam&&cam.tipo==='hormigonera'&&cam.estado==='libre'&&!averiada(cam.id)&&cam.lavado!==J.nDia)b.push(`<button class="jb" data-acc="lavar" data-id="${cam.id}">🧽 Lavar y engrasar ${cam.id}</button>`);
  if(s.rol==='mecanico'&&J.personal.filter(x=>x.rol==='mecanico').length>1)b.push(`<button class="jb" data-acc="turnoMec" data-id="${s.id}">${s.noche?'☀️ Pasar a turno de día':'🌙 Pasar a turno de noche'}</button>`);
  if(puedeAscender(s))b.push(`<button class="jb ok" data-acc="ascender" data-id="${s.id}">⭐ Ascender</button>`);
  if(puedeEncargado(s))b.push(`<button class="jb ok" data-acc="encargado" data-id="${s.id}">👷 Nombrar encargado/a</button>`);
  b.push(`<button class="jb" data-acc="sueldo" data-id="${s.id}">💶 Subir sueldo 5 %</button>`);
  if(!s.vac&&!s.curso)b.push(`<button class="jb" data-acc="vacaciones" data-id="${s.id}">🏖️ Vacaciones (5 días)</button>`);
  if(!s.curso)b.push(`<button class="jb" data-acc="cursosDe" data-id="${s.id}">🎓 Cursos</button>`);
  return[`${ROLES[s.rol]}${J.encargado===s.id?' · encargado/a':''}`,`${s.nombre} ${caraContento(s.contento)}`,
    `<p>${e.ic?e.ic+' ':''}<b class="${e.problema?'neg':''}">${esc(e.txt)}</b>${e.ocioso?' <span style="color:#f2c230">· sin hacer nada</span>':''}</p>
    ${barraSims('😊 Ánimo',s.contento,s.contento>=60?'#3fae5a':s.contento>=35?'#e2b33b':'#d9534f')}${barraSims('⚡ Energía',energia,energia>=60?'#3fae5a':energia>=35?'#e2b33b':'#d9534f')}
    <p style="color:#9aa6b2;font-size:12.5px">${s.salario} €/día · ${s.diasTrab||0} días sin vacaciones · ${(s.extraTotal||0).toFixed(1)} h extra acumuladas${s.cursos&&s.cursos.length?` · 🎓 ${s.cursos.map(c=>esc(CURSOS[c].n)).join(', ')}`:''}</p>
    <div class="bt" style="flex-wrap:wrap">${b.join('')}</div>`];
}
function fichaPlanta(){
  const op=operadorPlanta(),av=averiada('planta')&&maq('planta').averia;
  const b=[`<button class="jb" data-acc="cemento">🚛 Pedir cemento</button>`,`<button class="jb" data-acc="aridosProv">🪨 Pedir áridos a la cantera</button>`,`<button class="jb" data-acc="limpieza">🧽 Limpieza externa</button>`,`<button class="jb" data-acc="epi-renovar">🦺 Renovar EPIs</button>`];
  if(av&&!av.ext)b.unshift(`<button class="jb ok" data-acc="externo" data-k="planta">📞 Llamar al taller externo</button>`);
  return['Tu planta','HORINSA · Planta nº 1',
    `<p>${av?`<b class="neg">🔧 Averiada: ${esc(av.desc)} · ${Math.round(av.prog/av.total*100)} %</b>`:R&&(R.cargando||R.cargando2)?'🏭 Cargando hormigón':'🏭 En marcha'}</p>
    <p>${op?`Operario: <b>${esc(op.s.nombre)}</b>${op.f<1?' (la cubre otra persona, más despacio)':''}`:'<span class="neg">Nadie sabe manejar la planta ahora mismo</span>'} · cola: ${R?R.cola.length:0}</p>
    ${barraSims('Cemento',J.silo/J.capSilo*100,'#9aa6b2')}${barraSims('Áridos',J.acopio/J.capAcopio*100,'#c9a46a')}${barraSims('Limpieza',100-J.suciedad,J.suciedad<40?'#3fae5a':J.suciedad<70?'#e2b33b':'#d9534f')}${barraSims('Máquina',maq('planta').cond,maq('planta').cond>60?'#3fae5a':'#e2b33b')}
    <div class="bt" style="flex-wrap:wrap">${b.join('')}</div>`];
}
function accionFicha(a,el){
  const s=el.dataset.id?persona(el.dataset.id):null;
  if(a==='charlar'&&s){s.charla=J.nDia;const d=rint(4,8);s.contento=Math.min(100,s.contento+d);toast(`💬 Charlas un rato con ${s.nombre}: +${d} de ánimo.`,'bien')}
  else if(a==='descanso'&&s){s.descDia=J.nDia;s.descansoHasta=R.min+30;s.contento=Math.min(100,s.contento+10);toast(`☕ ${s.nombre} se toma un café de 30 min (+10 de ánimo).`,'info')}
  else if(a==='limpiaFondo'&&s){s.limpiaMin=R.min;ensuciar(-10);s.contento=Math.max(0,s.contento-1);toast(`🧹 ${s.nombre} hace una limpieza a fondo del patio y del foso.`,'bien')}
  else if(a==='revisar'&&s){const id=el.dataset.k;if(!s.tarea&&!averiada(id)){s.tarea={tipo:'mant',id};toast(`🔧 ${s.nombre} se pone a revisar ${nombreMaq(id)}.`,'info')}}
  else if(a==='lavar'){const c=R.camiones.find(x=>x.id===el.dataset.id);if(c&&c.estado==='libre'){c.lavado=J.nDia;c.lavarHasta=R.min+20;const m=maq(c.id);m.cond=Math.min(100,m.cond+3);toast(`🧽 Lavando y engrasando ${c.id} (+3 % de estado).`,'info')}}
  else if(a==='avisar'){const p=R.pedidos.find(q=>q.id===+el.dataset.id);if(p){p.avisado=true;toast(`📞 Llamas a ${p.cliente} para avisarle: si llegamos tarde se enfadará mucho menos.`,'info')}}
  else if(a==='aridosProv')pedirAridos(false);
  else if(a==='itv'){pedirITV(el.dataset.id);return true}
  else if(a==='selCam'){selCamion(el.dataset.id);pintarUI(true);return true}
  else if(a==='soltarCam'){const c=R.camiones.find(x=>x.id===el.dataset.id);if(c)c.retenido=false;pintarSel()}
  else if(a==='cancelarPed'){cancelarPedido(+el.dataset.id);return true}
  else if(a==='aplazarPed'){aplazarPedido(+el.dataset.id);return true}
  else if(a==='cursosDe'&&s){pestana='personal';cursosAbiertos=s.id;document.querySelectorAll('#jTabs button[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t==='personal'));$('jPanel').classList.remove('plegado');$('ficha').style.display='none'}
  else if(a==='verPersona'&&s){ficha({tipo:'j-persona',d:s.id});return true}
  else if(a==='verCamion'){const c=R.camiones.find(x=>x.id===el.dataset.id);if(c){window.SEGUIDO=c.id;if(window.MODO3D&&window.enfocar3D)enfocar3D(c.x,c.y,Math.min(1.2,1.4));else enfocar(c.x,c.y);ficha({tipo:'j-camion',d:c});return true}}
  else if(a==='verObra'){const p=R.pedidos.find(q=>q.id===+el.dataset.id);if(p){if(window.MODO3D&&window.enfocar3D)enfocar3D(p.x,p.y,.6);else enfocar(p.x,p.y)}}
  else return false;
  guardar();pintarUI(true);return true;
}
function juegoFicha(o){
  if(o.tipo==='j-persona'){const s=persona(o.d);return s?fichaPersona(s):['','Ya no trabaja aquí','']}
  if(o.tipo==='j-planta')return fichaPlanta();
  if(o.tipo==='j-obj')return fichaObjetivos();
  if(o.tipo==='j-camion'){const c=R.camiones.find(x=>x.id===o.d.id)||o.d,s=choferDe(c);
    const av=c.chofer&&averiada(c.id)&&maq(c.id).averia,mecLibre=J.personal.some(m=>m.rol==='mecanico'&&disponible(m)&&!m.tarea);
    const b=[`<button class="jb ok" data-acc="seguir" data-id="${c.id}">${window.SEGUIDO===c.id?'📍 Dejar de seguir':'📍 Seguir con la cámara'}</button>`];
    if(s)b.push(`<button class="jb" data-acc="verPersona" data-id="${s.id}">👤 Ver a ${esc(s.nombre)}</button>`);
    if(av&&!av.ext)b.push(`<button class="jb" data-acc="externo" data-k="${c.id}">📞 Taller externo</button>`);
    if(!av&&c.chofer&&c.estado==='libre'&&maq(c.id).cond<95&&mecLibre){const m=J.personal.find(m=>m.rol==='mecanico'&&disponible(m)&&!m.tarea);b.push(`<button class="jb" data-acc="revisar" data-id="${m.id}" data-k="${c.id}">🔧 Que lo revise ${esc(m.nombre)}</button>`)}
    if(c.tipo==='hormigonera'&&c.estado==='libre'&&!av&&c.lavado!==J.nDia&&R.enDia)b.push(`<button class="jb" data-acc="lavar" data-id="${c.id}">🧽 Lavar y engrasar</button>`);
    if(c.ped)b.push(`<button class="jb" data-acc="verObra" data-id="${c.ped.id}">🏗️ Ver la obra</button>`);
    if(c.chofer)b.push(`<button class="jb ${SELCAM.has(c.id)?'ok':''}" data-acc="selCam" data-id="${c.id}">${SELCAM.has(c.id)?'☑ En la selección':'☐ Añadir a la selección'}</button>`);
    if(c.retenido)b.push(`<button class="jb ok" data-acc="soltarCam" data-id="${c.id}">▶ Soltar (está retenido)</button>`);
    const fl=c.chofer?flotaDe(c):null;if(fl&&!fl.itvCita&&diasITV(fl)<=20&&!enITV(c))b.push(`<button class="jb ${diasITV(fl)<=5?'ok':''}" data-acc="itv" data-id="${c.id}">📋 Pedir cita ITV</button>`);
    return[c.tipo==='hormigonera'?'Hormigonera':c.tipo==='banera'?'Bañera de áridos':c.tipo==='asfaltera'?'Bañera de asfalto':c.mat==='betun'?'Cisterna de betún':c.mat==='arido'?'Camión de áridos (proveedor)':'Cisterna de cemento',c.id,
      `<p>${c.chofer&&averiada(c.id)?`<span class="neg">🔧 Averiado: ${esc(maq(c.id).averia.desc)}</span>`:estadoCamion(c)}</p><p>${s?`Chófer: <b>${esc(s.nombre)}</b> ${caraContento(s.contento)}${s.cursos.length?` · 🎓 ${s.cursos.length} curso${s.cursos.length>1?'s':''}`:''}`:'Camión del proveedor'}</p><p>Km hoy: ${c.km.toFixed(1)}${c.chofer?` · estado mecánico ${Math.round(maq(c.id).cond)} %`:''}</p>${fl?`<p>${itvTxt(fl)}</p>`:''}
      ${c.carga>0&&c.cargadoEn&&(c.tipo==='hormigonera'||c.tipo==='asfaltera')?`<p>${c.tipo==='hormigonera'?'Hormigón':'Asfalto'} cargado hace <b class="${R.min-c.cargadoEn>(c.tipo==='hormigonera'?VIDA_HORMIGON*.8:ASF.enfria*.8)?'neg':''}">${Math.round(R.min-c.cargadoEn)} min</b> (máx. ${c.tipo==='hormigonera'?VIDA_HORMIGON:ASF.enfria})</p>`:''}
      ${av?`<p class="neg">Reparación: ${Math.round(av.prog/av.total*100)} %${av.ext?' · taller externo':av.asignada?` · ${esc((persona(av.asignada)||{}).nombre||'')}`:' · sin mecánico'}</p>`:''}
      <div class="bt" style="flex-wrap:wrap">${b.join('')}</div>`]}
  const p=R.pedidos.find(q=>q.id===o.d.id)||o.d,e=estimarFijo(p);
  const cams=R.camiones.filter(c=>c.ped===p),riesgo=p.estado==='aceptado'&&p.llegada===null&&R.min>p.hora-20;
  const b=[`<button class="jb" data-acc="verObra" data-id="${p.id}">📍 Ver en el mapa</button>`];
  if(p.estado==='llamada')b.unshift(`<button class="jb ok" data-acc="aceptar" data-id="${p.id}">Aceptar</button><button class="jb" data-acc="pre-rechazar" data-id="${p.id}">Rechazar</button>`);
  if(p.estado==='aceptado'&&!p.avisado)b.unshift(`<button class="jb ${riesgo?'ok':''}" data-acc="avisar" data-id="${p.id}">📞 Llamar al cliente${riesgo?' (vamos justos)':''}</button>`);
  if(p.estado==='aceptado'&&restante(p)>0){if(!p.intentoAplazar&&p.clase!=='publica')b.push(`<button class="jb" data-acc="aplazarPed" data-id="${p.id}">📅 Pasarla a mañana</button>`);
    b.push(`<button class="jb" data-acc="cancelarPed" data-id="${p.id}">🚫 Cancelar${p.entregado+p.enCamino>0?' lo que falta':''}</button>`)}
  for(const c of cams)b.push(`<button class="jb" data-acc="verCamion" data-id="${c.id}">🚚 ${c.id}</button>`);
  const cf=J.clientes&&J.clientes[p.cliente];
  return[(p.estado==='llamada'?'Llamada de obra':'Obra')+(estrellas(p.cliente)?' · cliente habitual '+'⭐'.repeat(estrellas(p.cliente)):cf&&cf.n?` · ${cf.n} obra${cf.n>1?'s':''} con vosotros`:''),p.cliente,
    `<p>${esc(p.obra)} en <b>${esc(p.pueblo)}</b></p><p>${p.m3} ${ud(p)} de ${p.tipo} a ${p.precio} €/${ud(p)} · para las ${fmtH(p.hora)}</p><p>Servido: ${p.entregado}/${p.m3} ${ud(p)}${p.enCamino>0?` · ${p.enCamino} en camino`:''} · ${p.km.toFixed(1)} km de la planta</p><p>Beneficio aprox.: ${fmtE(e.beneficio)}</p>
    ${riesgo?'<p class="neg">⏱️ No ha llegado ningún camión y es casi la hora.</p>':''}${p.avisado?'<p style="color:#9aa6b2">📞 Cliente avisado.</p>':''}
    <div class="bt" style="flex-wrap:wrap">${b.join('')}</div>`]
}

/* ------------------------------- Arranque ------------------------------- */
function iniciarJuego(){
  construirRed();prepararSitios();
  GANCHOS_DIBUJO.push(juegoDibujar);
  document.querySelectorAll('#jTabs button[data-t]').forEach(b=>b.onclick=()=>{pestana=b.dataset.t;$('jPanel').classList.remove('plegado');document.querySelectorAll('#jTabs button[data-t]').forEach(x=>x.classList.toggle('on',x===b));b.classList.remove('aviso');pintarUI(true)});
  document.querySelectorAll('#jVel button[data-v]').forEach(b=>b.onclick=()=>ponerVel(+b.dataset.v));$('jSaltar').onclick=saltarTarde;
  $('jSel').onclick=e=>{const b=e.target.closest('[data-sel]');if(b)ordenGrupo(b.dataset.sel)};
  $('jSel').onchange=e=>{if(e.target.matches('[data-selobra]')&&e.target.value){const v=e.target.value;e.target.blur();ordenGrupo('obra',v)}};$('jObjB').onclick=()=>ficha({tipo:'j-obj',d:{}});
  $('jCuerpo').addEventListener('click',onAccion);$('jCuerpo').addEventListener('change',onAccion);$('jLlam').addEventListener('click',onAccion);
  $('jCuerpo').addEventListener('input',e=>{const t=e.target;if(!t.dataset.licit)return;const v=+t.value,cm=+t.dataset.coste,tot=+t.dataset.tot;
    $('ofTxt'+t.dataset.licit).innerHTML=`Oferta: <b>${v} €/m³</b> · margen ${Math.round(v-cm)} €/m³ · beneficio aprox. ${fmtE((v-cm)*tot)}`});
  // la ficha se queda abierta y se actualiza tras cada acción (como en los Sims)
  $('jModal').addEventListener('click',onAccion);$('ficha').addEventListener('click',e=>{const el=e.target.closest('[data-acc]');if(!el)return;
    if(!accionFicha(el.dataset.acc,el))onAccion(e);
    setTimeout(()=>{if($('ficha').style.display!=='none'&&window.__fichaO&&window.__fichaO.tipo.startsWith('j-'))ficha(window.__fichaO)},0)});
  setInterval(()=>{const F=$('ficha');if(F.style.display!=='none'&&window.__fichaO&&window.__fichaO.tipo.startsWith('j-')&&!F.matches(':hover'))ficha(window.__fichaO)},1500);
  $('jPlegar').onclick=()=>$('jPanel').classList.toggle('plegado');
  addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.code==='Space'){e.preventDefault();ponerVel(R&&R.vel?0:1)}});
  const guardada=cargar();
  J=guardada||migrar(partidaNueva());
  HORINSA.planta.tolvas=J.tolvas;
  empezarDia();
  modal(guardada?`<div class="logoG">H</div><h2>Bienvenido de nuevo</h2><div class="sub">Día ${J.nDia} · ${esc(fechaTxt())} · caja ${fmtE(J.caja)}</div><button class="jb grande" data-acc="empezar">Empezar la jornada</button><button class="jb" style="margin-top:8px;width:100%" data-acc="reiniciar">Empezar partida nueva</button>`
   :`<div class="logoG">H</div><h2>HORINSA · Planta nº 1</h2>
   <p>Empiezas con una planta pequeña cerca de Playa Honda: <b>1 línea con 3 tolvas</b> (30 m³/h), <b>2 hormigoneras</b>, <b>1 bañera</b> para traer áridos de la cantera y <b>5 personas</b>.</p>
   <p>La jornada es de <b>07:30 a 15:30</b> (los días con obras a las 07:00 se entra antes). Si tienes mecánico de noche, el taller sigue hasta las 22:00. Durante la mañana llaman obras: tú decides si las aceptas. Si no da tiempo, el equipo hace horas extra… y se quema.</p>
   <p>Caja inicial: <b>60.000 €</b>. Espacio = pausa.</p>
   <button class="jb grande" data-acc="empezar">Empezar el primer día</button>`);
}
