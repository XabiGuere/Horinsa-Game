// =====================================================================
//  HORINSA · Minijuego de bombeo
//  Vista en primera persona del bombista con el mando de la bomba de pluma.
//  Hay que llevar la punta de la manguera sobre el encofrado y bombear sin
//  derramar: pilares, muro o losa según la obra. La manguera se balancea.
//  window.abrirMinijuego({ modo, dif, cliente, chofer, m3, alTerminar }) → Promise
// =====================================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { cabina, rueda } from './camiones3d.js';

const CSS = `
#mjCapa{position:fixed;inset:0;z-index:200;background:#000;touch-action:none;user-select:none;-webkit-user-select:none;font-family:system-ui,sans-serif;color:#fff}
#mjCapa canvas{display:block;width:100%;height:100%}
#mjHud{position:absolute;left:0;right:0;top:0;padding:10px 12px;display:flex;flex-direction:column;gap:6px;pointer-events:none;background:linear-gradient(#000a,#0000)}
#mjHud .fila{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#mjHud .tit{font-weight:800;font-size:15px;text-shadow:0 1px 3px #000}
#mjHud .chip{background:#000a;border:1px solid #fff3;border-radius:7px;padding:3px 8px;font-size:12.5px;font-weight:700}
#mjHud .chip.mal{border-color:#ff5a4f;color:#ffb3ad}
#mjBarras{display:flex;gap:4px;flex-wrap:wrap}
#mjBarras .b{width:46px;height:9px;border-radius:4px;background:#ffffff26;overflow:hidden;position:relative}
#mjBarras .b i{position:absolute;left:0;top:0;bottom:0;background:#8fd16f}
#mjBarras .b.over i{background:#ff7a5a}
#mjCuba{width:120px;height:9px;border-radius:4px;background:#ffffff26;overflow:hidden}#mjCuba i{display:block;height:100%;background:#cfd6dc}
#mjMando{position:absolute;left:0;right:0;bottom:0;height:200px;pointer-events:none}
#mjJoy{position:absolute;left:22px;bottom:26px;width:138px;height:138px;border-radius:50%;background:radial-gradient(circle at 50% 45%,#3a3f45,#1d2024);border:5px solid #f2b705;box-shadow:0 6px 18px #000a,inset 0 0 18px #000;pointer-events:auto;touch-action:none}
#mjJoy i{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#5b636b,#23272b);border:2px solid #111;box-shadow:0 4px 8px #000a}
#mjJoy span{position:absolute;left:0;right:0;top:-22px;text-align:center;font-size:11px;font-weight:800;color:#f2b705;text-shadow:0 1px 2px #000}
#mjBomba{position:absolute;right:24px;bottom:34px;width:118px;height:118px;border-radius:50%;background:radial-gradient(circle at 45% 40%,#ff6b5a,#b3160f);border:5px solid #f2b705;font-weight:900;font-size:15px;color:#fff;box-shadow:0 6px 18px #000a;pointer-events:auto;touch-action:none;letter-spacing:.5px}
#mjBomba.on{background:radial-gradient(circle at 45% 40%,#7dff8a,#178a2c);transform:scale(.95)}
#mjCam{position:absolute;right:12px;top:100px;display:flex;flex-direction:column;gap:6px;pointer-events:auto}#mjCam button{background:#000b;border:1px solid #fff4;color:#fff;border-radius:8px;padding:6px 9px;font-weight:700;font-size:13px;touch-action:none}
#mjFin{position:absolute;right:16px;top:64px;pointer-events:auto;background:#000b;border:1px solid #fff4;color:#fff;border-radius:8px;padding:6px 10px;font-weight:700;font-size:12.5px}
#mjPanel{position:absolute;inset:0;display:grid;place-items:center;background:#0009;pointer-events:auto}
#mjPanel .caja{width:min(430px,calc(100% - 32px));background:#151a21;border:1px solid #33404d;border-radius:14px;padding:18px 18px 16px;box-shadow:0 20px 50px #000c}
#mjPanel h3{margin:0 0 8px;font-size:19px}#mjPanel p{margin:6px 0;font-size:14px;line-height:1.45;color:#d6dde4}
#mjPanel button{margin-top:12px;width:100%;border:0;border-radius:9px;padding:12px;font-weight:800;font-size:15px;background:#d2201f;color:#fff;cursor:pointer}
#mjPanel .nota{font-size:40px;text-align:center;margin:4px 0}
#mjPanel .tab{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px}#mjPanel .tab td{padding:3px 0;border-bottom:1px solid #26303a}#mjPanel .tab td:last-child{text-align:right;font-weight:700}
#mjAviso{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font-size:22px;font-weight:900;color:#ffd84a;text-shadow:0 2px 6px #000;pointer-events:none;opacity:0;transition:opacity .3s}
@media (max-width:600px){#mjJoy{width:118px;height:118px;left:14px}#mjBomba{width:100px;height:100px;right:14px}}
`;

const MODOS = {
  suelo:   { n: 'Losa', txt: 'Rellena toda la losa hasta el canto (15 cm), sin pasarte del encofrado.' },
  muro:    { n: 'Muro', txt: 'Llena el muro por igual a lo largo, hasta arriba, sin derramar por fuera de los tableros.' },
  pilares: { n: 'Pilares', txt: 'Llena cada pilar hasta arriba. Son estrechos: controla el balanceo de la manguera.' },
  zapatas: { n: 'Zapatas', txt: 'Llena cada zapata de la cimentación hasta el borde del encofrado. Son bajas: no te pases o rebosan.' },
  escalera:{ n: 'Escalera', txt: 'Hormigona la escalera de abajo arriba: lo que sobra en un peldaño cae al de abajo. Cada peldaño, hasta su línea.' },
  piscina: { n: 'Piscina', txt: 'Llena los muros del vaso de la piscina por igual, dando la vuelta. Son finos: apunta al centro del muro.' }
};

let S = null;   // estado de la partida en curso

window.abrirMinijuego = function (op) {
  return new Promise(res => { try { iniciar(op, res); } catch (e) { console.error(e); cerrar(); res(null); } });
};

/* ------------------------------ utilidades ------------------------------ */
function lienzo(w, h, fn, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const ruido = (g, w, h, base, var_, n, tam = 2) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++){ const v = (Math.random() - .5) * var_; g.fillStyle = `rgba(${v > 0 ? '255,255,255' : '0,0,0'},${Math.abs(v)})`; const s = Math.random() * tam + .5; g.fillRect(Math.random() * w, Math.random() * h, s, s); } };
function caja(par, w, h, d, mat, x, y, z){ const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; par.add(m); return m; }
function cil(par, r1, r2, h, mat, x, y, z, seg = 12){ const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; par.add(m); return m; }
function barra(par, a, b, r, mat, seg = 6){   // cilindro entre dos puntos
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg), mat);
  m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; par.add(m); return m;
}
function poner(m, a, b){ const d = new THREE.Vector3().subVectors(b, a), L = d.length(); m.position.copy(a).addScaledVector(d, .5); m.scale.set(1, L, 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); }

/* ------------------------------- materiales ------------------------------- */
function materiales(){
  const M = {};
  M.picon = new THREE.MeshStandardMaterial({ map: lienzo(256, 256, (g, w, h) => ruido(g, w, h, '#3b3330', .35, 9000, 2.5), [40, 40]), roughness: 1 });
  M.zahorra = new THREE.MeshStandardMaterial({ map: lienzo(256, 256, (g, w, h) => ruido(g, w, h, '#8f8778', .3, 8000, 2), [6, 6]), roughness: 1 });
  M.fenolico = new THREE.MeshStandardMaterial({ map: lienzo(256, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#6b3c22'); gr.addColorStop(1, '#7b4a2c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++){ g.strokeStyle = `rgba(30,12,4,${Math.random() * .18})`; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + 4, w * .6, y - 4, w, y + 2); g.stroke(); }
    g.strokeStyle = '#3d2112'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2); }), roughness: .55 });
  M.marco = new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: .5, metalness: .3 });
  M.hormigon = new THREE.MeshStandardMaterial({ map: lienzo(256, 256, (g, w, h) => ruido(g, w, h, '#b9bdc0', .1, 5000, 3), [3, 3]), color: 0xe4e6e8, roughness: .28, metalness: .02 });
  M.hormigonViejo = new THREE.MeshStandardMaterial({ map: lienzo(256, 256, (g, w, h) => ruido(g, w, h, '#b5b3ad', .18, 6000, 2), [4, 4]), roughness: .95 });
  M.derrame = new THREE.MeshStandardMaterial({ color: 0x8a8e93, roughness: .25, metalness: .05 });
  M.ferralla = new THREE.MeshStandardMaterial({ color: 0x5a3b2a, roughness: .6, metalness: .6 });
  M.cal = new THREE.MeshStandardMaterial({ map: lienzo(128, 128, (g, w, h) => ruido(g, w, h, '#f4f1ea', .06, 2500, 2), [2, 2]), roughness: .9 });
  M.verde = new THREE.MeshStandardMaterial({ color: 0x1f7a43, roughness: .6 });
  M.amarillo = new THREE.MeshStandardMaterial({ color: 0xf2b705, roughness: .45, metalness: .25 });
  M.rojo = new THREE.MeshStandardMaterial({ color: 0xd2201f, roughness: .4, metalness: .25 });
  M.negro = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: .7 });
  M.goma = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: .45 });
  M.metal = new THREE.MeshStandardMaterial({ color: 0x9aa2aa, roughness: .35, metalness: .8 });
  M.cristal = new THREE.MeshStandardMaterial({ color: 0x223744, roughness: .05, metalness: .9, transparent: true, opacity: .7 });
  M.blanco = new THREE.MeshStandardMaterial({ color: 0xf3f3ef, roughness: .5 });
  M.piel = new THREE.MeshStandardMaterial({ color: 0xc89a7a, roughness: .7 });
  M.chaleco = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: .6 });
  M.vaquero = new THREE.MeshStandardMaterial({ color: 0x2c3e5c, roughness: .8 });
  M.tronco = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: .9 });
  M.hoja = new THREE.MeshStandardMaterial({ color: 0x3f7d2c, roughness: .8, side: THREE.DoubleSide });
  M.volcan = new THREE.MeshStandardMaterial({ color: 0x6b3d2b, roughness: 1, flatShading: true });
  M.andamio = new THREE.MeshStandardMaterial({ color: 0x8c949c, roughness: .4, metalness: .8 });
  M.tabla = new THREE.MeshStandardMaterial({ color: 0xb08a55, roughness: .8 });
  return M;
}

/* ------------------------------ escenario ------------------------------ */
function cielo(scene){
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = max(vP.y, 0.0); vec3 hor = vec3(.93,.86,.74); vec3 cen = vec3(.30,.55,.86); vec3 c = mix(hor, cen, pow(h, .55)); float s = pow(max(dot(vP, normalize(vec3(.5,.55,-.6))),0.0), 300.0); c += vec3(1.,.95,.8)*s*1.5; gl_FragColor = vec4(c,1.0); }' });
  scene.add(new THREE.Mesh(geo, mat));
}
function persona(par, M, x, z, yaw, casco = 0xffffff){
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; par.add(g);
  const pL = caja(g, .17, .85, .2, M.vaquero, -.11, .43, 0), pR = caja(g, .17, .85, .2, M.vaquero, .11, .43, 0);
  const t = caja(g, .48, .6, .28, M.chaleco, 0, 1.16, 0);
  caja(g, .5, .06, .3, new THREE.MeshStandardMaterial({ color: 0xf0f0f0, emissive: 0x666666 }), 0, 1.3, 0);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 10), M.piel); cab.position.set(0, 1.62, 0); g.add(cab);
  const ca = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: casco, roughness: .35 })); ca.position.set(0, 1.66, 0); g.add(ca);
  const bL = new THREE.Group(), bR = new THREE.Group(); bL.position.set(-.31, 1.42, 0); bR.position.set(.31, 1.42, 0); g.add(bL, bR);
  caja(bL, .12, .58, .12, M.chaleco, 0, -.29, 0); caja(bR, .12, .58, .12, M.chaleco, 0, -.29, 0);
  return { g, bL, bR, pL, pR, t };
}
function casa(par, M, x, z, w, d, h, rot){
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; par.add(g);
  caja(g, w, h, d, M.cal, 0, h / 2, 0);
  caja(g, w + .2, .25, d + .2, M.cal, 0, h + .12, 0);
  const n = Math.max(1, Math.floor(w / 3));
  for (let i = 0; i < n; i++){ const xx = -w / 2 + (i + .5) * w / n; caja(g, 1, 1.2, .08, M.verde, xx, h * .55, d / 2 + .03); }
  caja(g, 1.1, 2.1, .08, M.verde, w / 2 - 1.2, 1.05, d / 2 + .03);
  return g;
}
function palmera(par, M, x, z, h){
  const g = new THREE.Group(); g.position.set(x, 0, z); par.add(g);
  const t = cil(g, .2, .32, h, M.tronco, 0, h / 2, 0, 8); t.rotation.z = .05;
  for (let i = 0; i < 9; i++){ const hj = new THREE.Mesh(new THREE.PlaneGeometry(.8, 3.6, 1, 4), M.hoja); const a = i / 9 * Math.PI * 2;
    hj.geometry.translate(0, 1.8, 0); const p = hj.geometry.attributes.position; for (let k = 0; k < p.count; k++){ const y = p.getY(k); p.setZ(k, -y * y * .09); }
    hj.position.set(0, h, 0); hj.rotation.set(-1.0, a, 0, 'YXZ'); hj.castShadow = true; g.add(hj); }
}
function grua(par, M, x, z){
  const g = new THREE.Group(); g.position.set(x, 0, z); par.add(g);
  const H = 32;
  for (const [dx, dz] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) caja(g, .12, H, .12, M.amarillo, dx, H / 2, dz);
  for (let y = 1; y < H; y += 1.6){ for (const s of [-1, 1]){ barra(g, new THREE.Vector3(-.7, y, s * .7), new THREE.Vector3(.7, y + 1.6, s * .7), .04, M.amarillo, 4); barra(g, new THREE.Vector3(s * .7, y, -.7), new THREE.Vector3(s * .7, y + 1.6, .7), .04, M.amarillo, 4); } }
  caja(g, 34, .9, .9, M.amarillo, 9, H + .5, 0); caja(g, 2, 1.8, 1.6, M.amarillo, 0, H - .9, 1.2); caja(g, 1.8, 1, 1.4, M.cristal, 0, H - .7, 1.3);
  caja(g, 3, 1.6, 1.4, M.hormigonViejo, -6.5, H + .2, 0); cil(g, .06, .06, 14, M.negro, 18, H - 7, 0, 4);
  return g;
}
function camionBomba(par, M){
  const g = new THREE.Group(); par.add(g);
  caja(g, 11, .45, 1.0, M.negro, 0, 1.0, 0);                               // chasis
  cabina(g, 4.5);                                                         // cabina detallada (como la hormigonera)
  caja(g, 7.4, 1.0, 2.3, M.rojo, -1.2, 1.8, 0);                           // carrozado
  caja(g, 2.6, 1.6, 2.3, M.blanco, -4.2, 2.1, 0);                         // tolva y bomba
  for (const s of [-1, 1]){ rueda(g, 4.7, s * 1.07, .55, .4); rueda(g, 2.9, s * 1.07, .55, .4); rueda(g, -2.6, s * 1.0, .55, .36, true); rueda(g, -4.0, s * 1.0, .55, .36, true); }
  // estabilizadores abiertos
  for (const [x, s] of [[-3.6, -1], [-3.6, 1], [2.2, -1], [2.2, 1]]){ caja(g, .35, .35, 3.2, M.amarillo, x, 1.2, s * 2.6); caja(g, .3, 1.2, .3, M.amarillo, x, .6, s * 4.1); caja(g, .8, .1, .8, M.tabla, x, .05, s * 4.1); }
  const torre = new THREE.Group(); torre.position.set(-.8, 2.3, 0); g.add(torre);
  cil(torre, .9, 1.1, 1.2, M.rojo, 0, .6, 0, 16);
  return { g, torre };
}

/* ------------------------------ partida ------------------------------ */
function iniciar(op, res){
  if (!document.getElementById('mjCss')){ const st = document.createElement('style'); st.id = 'mjCss'; st.textContent = CSS; document.head.appendChild(st); }
  const modo = MODOS[op.modo] ? op.modo : 'suelo', dif = Math.max(1, Math.min(3, op.dif || 1));
  const capa = document.createElement('div'); capa.id = 'mjCapa'; document.body.appendChild(capa);
  window.MINIJUEGO = true;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
  capa.appendChild(renderer.domElement);
  // reflejos de entorno (cristales, cromados y pintura del camión)
  const pmrem = new THREE.PMREMGenerator(renderer), envTex = pmrem.fromScene(new RoomEnvironment(), .04).texture; pmrem.dispose();
  const scene = new THREE.Scene(); scene.environment = envTex; scene.fog = new THREE.Fog(0xe9dcc6, 60, 420);
  // en el móvil en vertical se abre el campo de visión para ver la obra entera
  const fovDe = asp => asp >= 1 ? 58 : Math.min(92, 58 * Math.pow(1 / asp, .62));
  const camera = new THREE.PerspectiveCamera(fovDe(innerWidth / innerHeight), innerWidth / innerHeight, .05, 1500);
  cielo(scene);
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6b5a48, .75));
  const sol = new THREE.DirectionalLight(0xfff1dc, 2.4); sol.position.set(22, 30, -18); sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048); Object.assign(sol.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 }); sol.shadow.bias = -.0004; sol.shadow.normalBias = .02;
  scene.add(sol, sol.target);
  const M = materiales();

  // terreno de picón y solar compactado
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), M.picon); suelo.rotation.x = -Math.PI / 2; suelo.position.y = -.02; suelo.receiveShadow = true; scene.add(suelo);
  const solar = new THREE.Mesh(new THREE.PlaneGeometry(30, 24), M.zahorra); solar.rotation.x = -Math.PI / 2; solar.position.y = -.005; solar.receiveShadow = true; scene.add(solar);
  // alrededores: casas blancas de Lanzarote, palmeras, volcanes y una grúa
  [[-24, -20, 10, 8, 6, .1], [-8, -26, 12, 8, 3.2, 0], [12, -24, 9, 9, 6.2, -.05], [27, -10, 8, 12, 3.3, Math.PI / 2], [-28, 4, 9, 10, 3.2, Math.PI / 2], [28, 14, 10, 8, 6.1, Math.PI / 2], [-20, 26, 12, 8, 3.1, Math.PI]]
    .forEach(([x, z, w, d, h, r]) => casa(scene, M, x, z, w, d, h, r));
  [[-17, -14, 7], [19, -16, 6], [-22, 14, 8], [21, 22, 6.5]].forEach(([x, z, h]) => palmera(scene, M, x, z, h));
  for (let i = 0; i < 9; i++){ const a = i / 9 * Math.PI * 2 + .4, r = 330 + Math.random() * 140, h = 28 + Math.random() * 40;
    const v = new THREE.Mesh(new THREE.ConeGeometry(h * 3.4, h, 16, 1, true), M.volcan); v.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r); scene.add(v);
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(h * .7, h * .8, 2, 16), M.volcan); cr.position.set(v.position.x, h - 2.5, v.position.z); scene.add(cr); }
  grua(scene, M, 9, -14);
  // vallado de obra
  for (let x = -15; x <= 15; x += 2.5){ caja(scene, 2.4, 1.8, .05, new THREE.MeshStandardMaterial({ color: 0xd8dcdf, roughness: .5, metalness: .6, transparent: true, opacity: .55 }), x, .9, -12); }
  // acopio de bloques, palés y saco de arena
  for (let i = 0; i < 3; i++){ caja(scene, 1.2, .12, 1.2, M.tabla, -12 + i * 1.5, .06, -9); caja(scene, 1.1, .8, 1.1, M.hormigonViejo, -12 + i * 1.5, .52, -9); }
  const arena = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.1, 14), new THREE.MeshStandardMaterial({ color: 0xc9b38a, roughness: 1 })); arena.position.set(12, .55, -8); arena.receiveShadow = arena.castShadow = true; scene.add(arena);

  // ---------------- encofrados según el modo ----------------
  const D = { suelo: [1, .85, .7], muro: [.42, .36, .3], pilares: [.62, .5, .42] };
  const ob = { modo, celdas: [], tops: 0 };
  const base = new THREE.Group(); scene.add(base);
  if (modo === 'suelo'){
    const W = [7, 8.5, 10][dif - 1], P = [5, 6, 7][dif - 1], esp = .15, nx = Math.round(W / .5), nz = Math.round(P / .5);
    Object.assign(ob, { W, P, esp, nx, nz, H: esp, cap: W * P * esp, lv: new Float32Array(nx * nz) });
    // encofrado perimetral (tablas con estacas) y mallazo
    for (const [w, d, x, z] of [[W + .1, .05, 0, -P / 2 - .025], [W + .1, .05, 0, P / 2 + .025], [.05, P, -W / 2 - .025, 0], [.05, P, W / 2 + .025, 0]]){ caja(base, w, .2, d, M.fenolico, x, .1, z); }
    for (let x = -W / 2; x <= W / 2 + .01; x += 1) for (const s of [-1, 1]){ caja(base, .05, .35, .05, M.tabla, x, .12, s * (P / 2 + .09)); }
    const mallazo = new THREE.Group(); base.add(mallazo);
    for (let x = -W / 2 + .15; x < W / 2; x += .3) caja(mallazo, .012, .012, P - .1, M.ferralla, x, .06, 0);
    for (let z = -P / 2 + .15; z < P / 2; z += .3) caja(mallazo, W - .1, .012, .012, M.ferralla, 0, .07, z);
    // superficie de hormigón: rejilla que sube donde cae y se reparte sola
    const g = new THREE.PlaneGeometry(W, P, nx, nz); g.rotateX(-Math.PI / 2);
    ob.malla = new THREE.Mesh(g, M.hormigon); ob.malla.receiveShadow = true; ob.malla.castShadow = false; base.add(ob.malla);
    ob.celdaDe = (x, z) => { const i = Math.floor((x + W / 2) / W * nx), j = Math.floor((z + P / 2) / P * nz); return i >= 0 && j >= 0 && i < nx && j < nz ? j * nx + i : -1; };
    ob.cubre = (x, z) => ob.celdaDe(x, z) >= 0;
    ob.altura = (x, z) => { const k = ob.celdaDe(x, z); return k < 0 ? 0 : ob.lv[k]; };
    ob.capCelda = (W / nx) * (P / nz) * esp;
    ob.area = (W / nx) * (P / nz);
    ob.puntoMira = new THREE.Vector3(0, 0, 0);
    ob.alturaPunta = 2.3; ob.camara = new THREE.Vector3(0, 4.2, P / 2 + 7.5);
  } else if (modo === 'muro'){
    const L = [6, 8, 10][dif - 1], w = D.muro[dif - 1], H = 2.4, n = Math.round(L / .5);
    Object.assign(ob, { L, w, H, n, cap: L * w * H, lv: new Float32Array(n) });
    for (const s of [-1, 1]){
      caja(base, L + .3, H + .1, .04, M.fenolico, 0, (H + .1) / 2, s * (w / 2 + .02));
      for (let x = -L / 2; x <= L / 2 + .01; x += 1.2){ caja(base, .1, H + .1, .1, M.marco, x, (H + .1) / 2, s * (w / 2 + .09)); }
      for (let x = -L / 2 + .6; x < L / 2; x += 2.4){ barra(base, new THREE.Vector3(x, H * .75, s * (w / 2 + .14)), new THREE.Vector3(x, 0, s * (w / 2 + 1.7)), .04, M.marco); }   // puntales
    }
    caja(base, .04, H + .1, w + .08, M.fenolico, -L / 2 - .17, (H + .1) / 2, 0); caja(base, .04, H + .1, w + .08, M.fenolico, L / 2 + .17, (H + .1) / 2, 0);
    for (let x = -L / 2 + .2; x < L / 2; x += .25) for (const s of [-1, 1]) caja(base, .016, H + .55, .016, M.ferralla, x, (H + .55) / 2, s * (w / 2 - .06));   // armadura que asoma
    for (let y = .3; y < H + .4; y += .3) for (const s of [-1, 1]) caja(base, L - .2, .016, .016, M.ferralla, 0, y, s * (w / 2 - .08));
    ob.seg = []; for (let i = 0; i < n; i++){ const m = new THREE.Mesh(new THREE.BoxGeometry(L / n + .002, 1, w - .01), M.hormigon); m.position.set(-L / 2 + (i + .5) * L / n, 0, 0); m.scale.y = .001; m.visible = false; m.receiveShadow = true; base.add(m); ob.seg.push(m); }
    ob.celdaDe = (x, z) => Math.abs(z) < w / 2 && Math.abs(x) < L / 2 ? Math.min(n - 1, Math.floor((x + L / 2) / L * n)) : -1;
    ob.cubre = (x, z) => Math.abs(z) < w / 2 + .06 && Math.abs(x) < L / 2 + .2;
    ob.altura = (x, z) => { const k = ob.celdaDe(x, z); return k < 0 ? (ob.cubre(x, z) ? H + .1 : 0) : ob.lv[k]; };
    ob.capCelda = (L / n) * w * H; ob.area = (L / n) * w;
    ob.alturaPunta = H + 1.4; ob.camara = new THREE.Vector3(0, 5.6, 7.4);
    // andamio donde está el bombista
    andamio(base, M, 0, 6.6, 4.4);
  } else {
    // obras por "huecos" (celdas): pilares, zapatas, peldaños de escalera o tramos de los muros de una piscina
    // cada celda: x, z (centro), sx, sz (planta), H (alto a llenar), b (cota del fondo)
    const C = [], suelo0 = modo === 'pilares' ? .12 : 0;
    const tablero = (x, z, sx, sz, y0, alto, esp = .04) => { for (const [w, d, dx, dz] of [[sx + .1, esp, 0, -sz / 2 - esp / 2], [sx + .1, esp, 0, sz / 2 + esp / 2], [esp, sz, -sx / 2 - esp / 2, 0], [esp, sz, sx / 2 + esp / 2, 0]]) caja(base, w, alto, d, M.fenolico, x + dx, y0 + alto / 2, z + dz); };
    if (modo === 'pilares'){
      const k = [3, 4, 5][dif - 1], s = D.pilares[dif - 1], H = 3, sep = 2.6;
      for (let i = 0; i < k; i++){
        const x = (i - (k - 1) / 2) * sep, z = (i % 2) * -1.4; C.push({ x, z, sx: s, sz: s, H, b: suelo0 });
        tablero(x, z, s, s, 0, H + .05);
        for (let y = .4; y < H; y += .8) for (const [w, d, dx, dz] of [[s + .22, .07, 0, -s / 2 - .07], [s + .22, .07, 0, s / 2 + .07], [.07, s + .22, -s / 2 - .07, 0], [.07, s + .22, s / 2 + .07, 0]]) caja(base, w, .1, d, M.marco, x + dx, y, z + dz);   // sargentos
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) caja(base, .02, H + .7, .02, M.ferralla, x + dx * (s / 2 - .06), (H + .7) / 2, z + dz * (s / 2 - .06));   // esperas
        for (const a of [0, Math.PI / 2, Math.PI]){ barra(base, new THREE.Vector3(x + Math.cos(a) * s * .5, H * .7, z + Math.sin(a) * s * .5), new THREE.Vector3(x + Math.cos(a) * 1.6, 0, z + Math.sin(a) * 1.6), .03, M.marco); }
      }
      caja(base, k * sep + 1.2, .12, 3.2, M.hormigonViejo, 0, .06, -.7);                     // losa de cimentación ya hecha
    } else if (modo === 'zapatas'){
      // cimentación: zapatas encofradas dentro de la excavación, con parrilla abajo y esperas de los pilares
      const k = [3, 4, 6][dif - 1], s = [1.7, 1.45, 1.25][dif - 1], H = .6, cols = k > 3 ? Math.ceil(k / 2) : 3, sep = 2.5;
      const exc = new THREE.Mesh(new THREE.PlaneGeometry(cols * sep + 2.4, (k > 3 ? 2 : 1) * 2.6 + 2), new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }));
      exc.rotation.x = -Math.PI / 2; exc.position.set(0, .002, k > 3 ? -1.3 : 0); exc.receiveShadow = true; base.add(exc);
      for (let i = 0; i < k; i++){
        const col = i % cols, fila = Math.floor(i / cols), x = (col - (cols - 1) / 2) * sep, z = -fila * 2.6;
        C.push({ x, z, sx: s, sz: s, H, b: 0 });
        tablero(x, z, s, s, 0, H + .04, .05);
        caja(base, s + .3, .06, .06, M.tabla, x, H + .02, z - s / 2 - .12); caja(base, s + .3, .06, .06, M.tabla, x, H + .02, z + s / 2 + .12);   // tablas de atado
        for (let t = -s / 2 + .15; t < s / 2; t += .2){ caja(base, .014, .014, s - .1, M.ferralla, x + t, .08, z); caja(base, s - .1, .014, .014, M.ferralla, x, .09, z + t); }   // parrilla
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) caja(base, .02, 1.4, .02, M.ferralla, x + dx * .14, .7, z + dz * .14);   // esperas del pilar
      }
    } else if (modo === 'escalera'){
      // escalera de hormigón entre dos muros: peldaños que suben alejándose del bombista
      const n = [5, 7, 9][dif - 1], w = [1.7, 1.45, 1.25][dif - 1], hu = .3, ti = .18, z0 = 1.4;
      for (let i = 0; i < n; i++){ const z = z0 - i * hu - hu / 2; C.push({ x: 0, z, sx: w, sz: hu, H: ti, b: i * ti + .02 }); }
      // costeros (tableros laterales escalonados) y tabicas de cada peldaño
      for (const sx of [-1, 1]){ for (let i = 0; i < n; i++){ const z = z0 - i * hu - hu / 2, alto = (i + 1) * ti + .12; caja(base, .04, alto, hu + .01, M.fenolico, sx * (w / 2 + .02), alto / 2, z); }
        barra(base, new THREE.Vector3(sx * (w / 2 + .25), 0, z0 + .2), new THREE.Vector3(sx * (w / 2 + .25), n * ti, z0 - n * hu), .05, M.marco); }
      for (let i = 1; i < n; i++){ const z = z0 - i * hu; caja(base, w, .03, .03, M.marco, 0, i * ti + .02, z + .015); }
      caja(base, w + .6, .1, .6, M.hormigonViejo, 0, .05, z0 + .3);                          // rellano de abajo
      caja(base, w + .6, n * ti + .1, .5, M.hormigonViejo, 0, (n * ti + .1) / 2, z0 - n * hu - .25);   // forjado de arriba
      for (let i = 0; i < n; i += 2) for (const sx of [-1, 1]) caja(base, .05, i * ti + .02, .05, M.marco, sx * w * .3, (i * ti + .02) / 2, z0 - i * hu - hu / 2);   // puntales bajo la losa
    } else {
      // piscina: muros del vaso alrededor de un fondo ya hormigonado, en tramos
      const Lx = [4.4, 5.4, 6.4][dif - 1], Lz = [2.6, 3, 3.4][dif - 1], t = [.42, .34, .28][dif - 1], H = 1.3, tr = .8;
      const tramos = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), m = Math.max(2, Math.round(L / tr)); for (let i = 0; i < m; i++){ const f = (i + .5) / m, hor = Math.abs(z1 - z0) < .01;
        C.push({ x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f, sx: hor ? L / m : t, sz: hor ? t : L / m, H, b: 0 }); } };
      tramos(-Lx / 2, Lz / 2, Lx / 2, Lz / 2); tramos(Lx / 2 + .0001, Lz / 2 - t, Lx / 2 + .0001, -Lz / 2 + t);       // de frente y lado derecho
      tramos(Lx / 2, -Lz / 2, -Lx / 2, -Lz / 2); tramos(-Lx / 2 + .0001, -Lz / 2 + t, -Lx / 2 + .0001, Lz / 2 - t);  // fondo y lado izquierdo
      // colocar los laterales justo dentro del rectángulo
      for (const c of C){ if (c.sx === t) c.x = Math.sign(c.x) * (Lx / 2 - t / 2); else c.z = Math.sign(c.z) * (Lz / 2 - t / 2); }
      caja(base, Lx - .02, .18, Lz - .02, M.hormigonViejo, 0, -.08, 0);                         // fondo ya hecho
      for (const s of [-1, 1]){ caja(base, Lx + .1, H + .05, .04, M.fenolico, 0, (H + .05) / 2, s * (Lz / 2 + .02)); caja(base, Lx - 2 * t, H + .05, .04, M.fenolico, 0, (H + .05) / 2, s * (Lz / 2 - t - .02));
        caja(base, .04, H + .05, Lz, M.fenolico, s * (Lx / 2 + .02), (H + .05) / 2, 0); caja(base, .04, H + .05, Lz - 2 * t, M.fenolico, s * (Lx / 2 - t - .02), (H + .05) / 2, 0); }
      for (let x = -Lx / 2 + .2; x < Lx / 2; x += .3) for (const s of [-1, 1]) caja(base, .014, H + .4, .014, M.ferralla, x, (H + .4) / 2, s * (Lz / 2 - t / 2));
      for (let z = -Lz / 2 + .4; z < Lz / 2 - .2; z += .3) for (const s of [-1, 1]) caja(base, .014, H + .4, .014, M.ferralla, s * (Lx / 2 - t / 2), (H + .4) / 2, z);
      const tierra = new THREE.Mesh(new THREE.RingGeometry(Math.max(Lx, Lz) * .62, Math.max(Lx, Lz) * .9, 32), new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }));
      tierra.rotation.x = -Math.PI / 2; tierra.scale.set(1, Lz / Lx * 1.3, 1); tierra.position.y = .003; base.add(tierra);
      ob.anillo = true;
    }
    // marca de nivel (tiza amarilla) por dentro del encofrado: hasta dónde hay que llenar
    const tiza = new THREE.MeshBasicMaterial({ color: 0xffe14a });
    for (const c of C) for (const [w, d, dx, dz] of [[c.sx - .02, .012, 0, -c.sz / 2 + .006], [c.sx - .02, .012, 0, c.sz / 2 - .006], [.012, c.sz - .02, -c.sx / 2 + .006, 0], [.012, c.sz - .02, c.sx / 2 - .006, 0]]){ const m = new THREE.Mesh(new THREE.BoxGeometry(w, .025, d), tiza); m.position.set(c.x + dx, c.b + c.H, c.z + dz); base.add(m); }
    ob.celdas = C; ob.lv = new Float32Array(C.length); ob.cap = C.reduce((a, c) => a + c.sx * c.sz * c.H, 0);
    ob.seg = C.map(c => { const m = new THREE.Mesh(new THREE.BoxGeometry(c.sx - .01, 1, c.sz - .01), M.hormigon); m.position.set(c.x, 0, c.z); m.scale.y = .001; m.visible = false; m.receiveShadow = m.castShadow = true; base.add(m); return m; });
    ob.celdaDe = (x, z) => { for (let i = 0; i < C.length; i++){ const c = C[i]; if (Math.abs(x - c.x) < c.sx / 2 && Math.abs(z - c.z) < c.sz / 2) return i; } return -1; };
    ob.cubre = (x, z) => { for (const c of C) if (Math.abs(x - c.x) < c.sx / 2 + .07 && Math.abs(z - c.z) < c.sz / 2 + .07) return true; return false; };
    ob.altura = (x, z) => { const k = ob.celdaDe(x, z); if (k >= 0) return C[k].b + ob.lv[k]; return ob.cubre(x, z) ? nearTop(x, z) + .05 : suelo0; };
    const nearTop = (x, z) => { let t = 0; for (const c of C) if (Math.abs(x - c.x) < c.sx / 2 + .1 && Math.abs(z - c.z) < c.sz / 2 + .1) t = Math.max(t, c.b + c.H); return t; };
    ob.capDe = k => C[k].sx * C[k].sz * C[k].H; ob.areaDe = k => C[k].sx * C[k].sz; ob.Hde = k => C[k].H; ob.baseDe = k => C[k].b;
    const top = Math.max(...C.map(c => c.b + c.H)), zMax = Math.max(...C.map(c => c.z + c.sz / 2));
    ob.bbox = [Math.max(...C.map(c => Math.abs(c.x) + c.sx / 2)), Math.min(...C.map(c => c.z - c.sz / 2)), zMax];
    ob.alturaPunta = top + 1.3; ob.camara = new THREE.Vector3(0, top + 3.6, zMax + 6.4);
    andamio(base, M, 0, zMax + 5.6, top + 2.2);
  }
  // ayudantes de la obra
  const obreros = [];
  if (modo === 'suelo'){ obreros.push(persona(scene, M, -ob.W / 2 - .8, -1, Math.PI / 2), persona(scene, M, ob.W / 2 + .8, 1, -Math.PI / 2, 0xf2c230)); }
  else if (modo === 'muro'){ obreros.push(persona(scene, M, -ob.L / 2 - 1.2, 1.2, Math.PI / 2), persona(scene, M, ob.L / 2 + 1.3, -1.6, -Math.PI / 2, 0xf2c230)); }
  else { obreros.push(persona(scene, M, -ob.bbox[0] - .9, (ob.bbox[1] + ob.bbox[2]) / 2 + .6, Math.PI / 2), persona(scene, M, ob.bbox[0] + .9, (ob.bbox[1] + ob.bbox[2]) / 2 - .6, -Math.PI / 2, 0xf2c230)); }
  // vibrador en manos del primero
  const vib = cil(obreros[0].bR, .025, .025, .9, M.metal, 0, -.75, .2, 6); vib.rotation.x = .9;

  // ---------------- bomba de pluma ----------------
  const bomba = camionBomba(scene, M); bomba.g.position.set(-13, 0, -2.5); bomba.g.rotation.y = -.25;
  scene.updateMatrixWorld(true);
  const B = new THREE.Vector3(); bomba.torre.getWorldPosition(B); B.y += 1.2;
  const L1 = 12.5, L2 = 11.5;
  const brazoGeo = new THREE.BoxGeometry(.55, 1, .45), brazo2Geo = new THREE.BoxGeometry(.42, 1, .36);
  const b1 = new THREE.Mesh(brazoGeo, M.rojo), b2 = new THREE.Mesh(brazo2Geo, M.rojo); b1.castShadow = b2.castShadow = true; scene.add(b1, b2);
  const tubo1 = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 1, 8), M.metal), tubo2 = tubo1.clone(); scene.add(tubo1, tubo2);
  const codo = new THREE.Mesh(new THREE.SphereGeometry(.42, 12, 10), M.negro); scene.add(codo);
  const punta = new THREE.Mesh(new THREE.SphereGeometry(.26, 10, 8), M.negro); scene.add(punta);
  const boquilla = new THREE.Mesh(new THREE.CylinderGeometry(.09, .07, .4, 10), M.metal); boquilla.castShadow = true; scene.add(boquilla);
  let manguera = null;
  // diana: dónde caería ahora mismo (solo en fácil y normal)
  const diana = new THREE.Mesh(new THREE.RingGeometry(.12, .17, 24), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: .8, depthWrite: false }));
  diana.rotation.x = -Math.PI / 2; diana.visible = dif < 3; scene.add(diana);
  const plomada = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]), new THREE.LineDashedMaterial({ color: 0x5fff7a, dashSize: .12, gapSize: .08, transparent: true, opacity: .9, depthTest: false }));
  plomada.frustumCulled = false; plomada.renderOrder = 5; scene.add(plomada);
  const punto = new THREE.Mesh(new THREE.CircleGeometry(.07, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5fff7a, depthTest: false, transparent: true })); punto.renderOrder = 6; scene.add(punto);

  // ---------------- hormigón que cae y derrames ----------------
  const NP = 700, gotaGeo = new THREE.SphereGeometry(1, 6, 5);
  const gotas = new THREE.InstancedMesh(gotaGeo, new THREE.MeshStandardMaterial({ color: 0xa9adb1, roughness: .3 }), NP); gotas.frustumCulled = false; gotas.castShadow = true; scene.add(gotas);
  const gp = new Float32Array(NP * 3), gv = new Float32Array(NP * 3), gvol = new Float32Array(NP), gr = new Float32Array(NP), gviva = new Uint8Array(NP);
  const NDER = 160, derr = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 18), M.derrame, NDER); derr.count = 0; derr.receiveShadow = true; scene.add(derr);
  const derrames = [];
  const o3 = new THREE.Object3D(), MCERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NP; i++) gotas.setMatrixAt(i, MCERO);

  // ---------------- estado ----------------
  const capCuba = ob.cap * (modo === 'suelo' ? 1.2 : 1.12), tiempo = [110, 95, 85][dif - 1];
  const balanceo = { len: [2.4, 2.9, 3.4][dif - 1], amort: [1.9, 1.05, .6][dif - 1] };
  const E = new THREE.Vector3(0, ob.alturaPunta + balanceo.len, ob.modo === 'suelo' ? ob.P / 2 + 1 : ob.bbox ? ob.bbox[2] + .6 : 2.2), vE = new THREE.Vector3();
  const H = E.clone(); H.y -= balanceo.len; const vH = new THREE.Vector3();
  // viento (niveles avanzados): empuja la manguera y el chorro, con rachas
  const vto = op.viento ? { a: Math.random() * Math.PI * 2, f: .55 * op.viento * (.8 + dif * .2), kmh: Math.round(22 + 12 * op.viento * dif / 3 + Math.random() * 8) } : null;
  let manga = null;
  if (vto){ manga = new THREE.Group(); const zM = (ob.bbox ? ob.bbox[1] : -3) - 1.5; manga.position.set(4.5, 0, zM); scene.add(manga);
    cil(manga, .04, .05, 5, M.metal, 0, 2.5, 0, 6);
    const cono = new THREE.Mesh(new THREE.ConeGeometry(.28, 1.6, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: .7, side: THREE.DoubleSide }));
    cono.rotation.z = Math.PI / 2; cono.position.set(.8, 0, 0); const piv = new THREE.Group(); piv.position.y = 4.9; piv.add(cono); manga.add(piv); manga.userData.piv = piv; }
  const racha = t => vto ? vto.f * (.65 + .35 * Math.sin(t * .8) + .3 * Math.max(0, Math.sin(t * 2.1 + 1)) ** 3) : 0;
  S = { capa, renderer, scene, camera, res, op, fin: false, empezado: false, t: 0, tiempo, cuba: capCuba, capCuba, vertido: 0, derramado: 0, dentro: 0,
        joy: new THREE.Vector2(), teclas: new Set(), bombeando: false, raf: 0, audio: null, ultimoGolpe: 0 };
  S.E = E; S.H = H; S.vH = vH; window.__mjS = S;     // para pruebas
  camera.position.copy(ob.camara); const mira = new THREE.Vector3().copy(H); camera.lookAt(mira);

  // ---------------- interfaz ----------------
  capa.insertAdjacentHTML('beforeend', `
    <div id="mjHud"><div class="fila"><span class="tit">🏗️ ${esc(op.cliente || 'Obra')} · ${MODOS[modo].n}${dif > 1 ? (dif === 2 ? ' · normal' : ' · difícil') : ' · fácil'}</span></div>
      <div class="fila"><span class="chip" id="mjT">⏱ ${tiempo}s</span><span class="chip">🚛 Cuba <span id="mjCuba"><i></i></span></span><span class="chip" id="mjDer">💦 Derramado 0 %</span><span class="chip" id="mjPts">⭐ 0</span><span class="chip" id="mjRacha" style="display:none"></span>${vto ? `<span class="chip mal" id="mjVto">💨 Viento ${vto.kmh} km/h <b id="mjFl" style="display:inline-block">➜</b></span>` : ''}</div>
      <div id="mjBarras"></div></div>
    <div id="mjAviso"></div>
    <button id="mjFin">Terminar</button>
    <div id="mjCam"><button data-cam="vista">📷 Andamio</button><button data-cam="izq">⟲</button><button data-cam="der">⟳</button><button data-cam="mas">＋</button><button data-cam="menos">－</button></div>
    <div id="mjMando"><div id="mjJoy"><span>PLUMA</span><i></i></div><button id="mjBomba">BOMBEAR</button></div>
    <div id="mjPanel"><div class="caja"><h3>🎮 ¡Te toca bombear!</h3>
      <p>${esc(op.chofer || 'El chófer')} ha llegado a <b>${esc(op.cliente || 'la obra')}</b> y la bomba ya está estabilizada. Coges tú el mando: <b>${MODOS[modo].txt}</b></p>
      <p>🕹️ <b>Joystick</b> (o WASD / flechas): mueve la punta de la pluma. La manguera <b>se balancea</b>: muévete suave y deja que se pare.</p>
      <p>🔴 <b>BOMBEAR</b> (mantén pulsado o barra espaciadora): sale el hormigón. Si cae fuera del encofrado, se derrama.</p>
      ${vto ? `<p>💨 <b>Hoy sopla viento</b> (${vto.kmh} km/h): empuja la manguera y el chorro. Mira la manga de viento y apunta un poco contra él.</p>` : ''}
      <p>Bien hecho: propina del cliente, experiencia y el equipo contento. Mal hecho: limpieza, quejas y menos reputación.</p>
      <button id="mjEmpezar">¡Empezar!</button></div></div>`);
  const $ = id => capa.querySelector('#' + id);
  ob.unica = modo === 'suelo' || modo === 'muro' || ob.lv.length > 9; const nB = ob.unica ? 0 : ob.lv.length;
  $('mjBarras').innerHTML = ob.unica ? '<div class="b" style="width:160px"><i></i></div>' : Array.from({ length: nB }, () => '<div class="b"><i></i></div>').join('');

  // joystick táctil y ratón
  const joy = $('mjJoy'), knob = joy.querySelector('i'); let joyId = null;
  const moverJoy = e => { const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const L = Math.hypot(dx, dy); if (L > 1){ dx /= L; dy /= L; }
    S.joy.set(dx, dy); knob.style.transform = `translate(${dx * r.width * .32}px,${dy * r.height * .32}px)`; };
  joy.addEventListener('pointerdown', e => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); moverJoy(e); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) moverJoy(e); });
  const soltarJoy = e => { if (e.pointerId !== joyId) return; joyId = null; S.joy.set(0, 0); knob.style.transform = ''; };
  joy.addEventListener('pointerup', soltarJoy); joy.addEventListener('pointercancel', soltarJoy);
  const bb = $('mjBomba');
  const bOn = e => { e.preventDefault(); S.bombeando = true; bb.classList.add('on'); }, bOff = () => { S.bombeando = false; bb.classList.remove('on'); };
  bb.addEventListener('pointerdown', bOn); bb.addEventListener('pointerup', bOff); bb.addEventListener('pointerleave', bOff); bb.addEventListener('pointercancel', bOff);
  S.kd = e => { const k = e.key.toLowerCase(); if (k === ' '){ S.bombeando = true; bb.classList.add('on'); e.preventDefault(); } S.teclas.add(k); if (k.startsWith('arrow')) e.preventDefault(); };
  S.ku = e => { const k = e.key.toLowerCase(); if (k === ' '){ bOff(); } S.teclas.delete(k); };
  addEventListener('keydown', S.kd); addEventListener('keyup', S.ku);
  S.rs = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.fov = fovDe(camera.aspect); camera.updateProjectionMatrix(); };
  addEventListener('resize', S.rs);
  $('mjEmpezar').onclick = () => { $('mjPanel').remove(); S.empezado = true; sonido(); };
  $('mjFin').onclick = () => terminar();
  // control de cámara: botones, arrastrar en la pantalla (fuera del mando) y rueda del ratón
  const nomV = ['📷 Andamio', '📷 Desde arriba', '📷 A ras de obra'];
  $('mjCam').addEventListener('pointerdown', e => { const b = e.target.closest('[data-cam]'); if (!b) return; e.preventDefault(); const k = b.dataset.cam;
    if (k === 'vista'){ S.vista = ((S.vista || 0) + 1) % 3; S.yaw = 0; S.pitch = 0; S.zoom = 1; b.textContent = nomV[S.vista]; }
    else if (k === 'izq') S.yaw = (S.yaw || 0) + .35; else if (k === 'der') S.yaw = (S.yaw || 0) - .35;
    else if (k === 'mas') S.zoom = Math.max(.45, (S.zoom || 1) * .8); else S.zoom = Math.min(2, (S.zoom || 1) * 1.25); });
  let arr = null; const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { arr = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointermove', e => { if (!arr || e.pointerId !== arr.id) return; S.yaw = (S.yaw || 0) - (e.clientX - arr.x) * .006; S.pitch = (S.pitch || 0) + (e.clientY - arr.y) * .004; arr.x = e.clientX; arr.y = e.clientY; });
  const fa = e => { if (arr && e.pointerId === arr.id) arr = null; }; cv.addEventListener('pointerup', fa); cv.addEventListener('pointercancel', fa);
  cv.addEventListener('wheel', e => { e.preventDefault(); S.zoom = Math.max(.45, Math.min(2, (S.zoom || 1) * (e.deltaY > 0 ? 1.1 : .9))); }, { passive: false });

  const aviso = (t) => { const a = $('mjAviso'); a.textContent = t; a.style.opacity = 1; clearTimeout(S.tav); S.tav = setTimeout(() => a.style.opacity = 0, 900); };

  // ---------------- física y dibujo ----------------
  let tPrev = performance.now(), nGota = 0;
  const tmp = new THREE.Vector3(), J1 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const lim = modo === 'suelo' ? [ob.W / 2 + 2, ob.P / 2 + 2.5] : modo === 'muro' ? [ob.L / 2 + 2, 3] : [ob.bbox[0] + 1.6, Math.max(3, (ob.bbox[2] - ob.bbox[1]) / 2 + 1.6)];
  function soltarGota(vol){
    const i = nGota; nGota = (nGota + 1) % NP;
    gp[i * 3] = H.x + (Math.random() - .5) * .08; gp[i * 3 + 1] = H.y - .2; gp[i * 3 + 2] = H.z + (Math.random() - .5) * .08;
    gv[i * 3] = vH.x * .9 + (Math.random() - .5) * .35; gv[i * 3 + 1] = -2.6 - Math.random() * .8; gv[i * 3 + 2] = vH.z * .9 + (Math.random() - .5) * .35;
    gvol[i] = vol; gr[i] = vol > 0 ? .07 + Math.random() * .05 : .025 + Math.random() * .02; gviva[i] = 1;
  }
  function derramar(x, z, vol){
    S.derramado += vol; if (vol > .002) S.racha = 0;
    let d = derrames.find(q => Math.hypot(q.x - x, q.z - z) < q.r * .8 + .15);
    if (!d && derrames.length < NDER){ d = { x, z, v: 0, r: .1 }; derrames.push(d); }
    if (!d) d = derrames[Math.floor(Math.random() * derrames.length)];
    d.v += vol; d.r = Math.min(2.2, Math.sqrt(d.v / (.03 * Math.PI)) + .05);
  }
  function caer(i){
    const x = gp[i * 3], z = gp[i * 3 + 2], v = gvol[i]; gviva[i] = 0; gotas.setMatrixAt(i, MCERO);
    if (v <= 0) return;
    const k = ob.celdaDe(x, z);
    if (k >= 0){
      const cap = ob.capDe ? ob.capDe(k) : ob.capCelda, area = ob.areaDe ? ob.areaDe(k) : ob.area, antes = ob.lv[k] * area;
      let entra = v;
      // en la escalera lo que sobra cae al peldaño de abajo (si cabe); en lo demás, rebosa por fuera
      if (modo === 'escalera' && antes + v > cap && k > 0 && ob.lv[k - 1] < ob.Hde(k - 1)){ entra = Math.max(0, cap - antes); ob.lv[k - 1] += (v - entra) / ob.areaDe(k - 1); S.dentro += v - entra; }
      else if (modo !== 'suelo' && antes + v > cap){ entra = Math.max(0, cap - antes); derramar(x + (Math.random() - .5) * .6, z + (Math.random() < .5 ? -1 : 1) * (ob.w || (ob.celdas ? ob.celdas[k].sz / 2 + .12 : .5)), v - entra); if (Math.random() < .2) aviso('¡Rebosa!'); }
      ob.lv[k] += entra / area; S.dentro += entra; S.racha = (S.racha || 0) + entra; S.mejorRacha = Math.max(S.mejorRacha || 0, S.racha); chof();
      for (let n = 0; n < 2; n++) if (Math.random() < .25){ const j = nGota; soltarGota(0); gp[j * 3] = x; gp[j * 3 + 2] = z; gp[j * 3 + 1] = ob.altura(x, z) + .05; gv[j * 3] = (Math.random() - .5) * 1.4; gv[j * 3 + 1] = 1 + Math.random(); gv[j * 3 + 2] = (Math.random() - .5) * 1.4; }
    } else {
      // encima de un tablero: la mitad entra, la otra mitad chorrea por fuera
      if (ob.cubre(x, z) && modo !== 'suelo'){ derramar(x + (Math.random() - .5) * .3, z + (z > 0 ? .35 : -.35), v * .6); }
      else derramar(x, z, v);
      if (Math.random() < .08) aviso('¡Fuera del encofrado!');
    }
  }
  function repartir(dt){
    if (modo === 'suelo'){
      // el hormigón fresco no es agua: solo se escurre si el montón tiene más de ~4 cm de desnivel
      const { nx, nz, lv } = ob, f = Math.min(.2, dt * 5), U = .03;
      const fl = (a, b) => { const df = lv[a] - lv[b], e = Math.abs(df) - U; if (e <= 0) return; const d = Math.sign(df) * e * f; lv[a] -= d; lv[b] += d; };
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++){ const k = j * nx + i; if (i < nx - 1) fl(k, k + 1); if (j < nz - 1) fl(k, k + nx); }
    } else if (modo === 'muro'){
      const { n, lv } = ob, f = Math.min(.3, dt * 5);
      for (let i = 0; i < n - 1; i++){ const d = (lv[i] - lv[i + 1]) * f; lv[i] -= d; lv[i + 1] += d; }
    } else if (ob.anillo){                       // muros de la piscina: el hormigón corre despacio de un tramo al de al lado
      const lv = ob.lv, n = lv.length, f = Math.min(.12, dt * 1.5);
      for (let i = 0; i < n; i++){ const j = (i + 1) % n, d = (lv[i] - lv[j]) * f; lv[i] -= d; lv[j] += d; }
    }
  }
  function pintarObra(){
    if (modo === 'suelo'){
      const p = ob.malla.geometry.attributes.position, { nx, nz, lv, W, P } = ob;
      for (let k = 0; k < p.count; k++){
        const i = k % (nx + 1), j = Math.floor(k / (nx + 1)); let s = 0, c = 0;
        for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (a >= 0 && b >= 0 && a < nx && b < nz){ s += lv[b * nx + a]; c++; }
        const h = c ? s / c : 0; p.setY(k, h > .004 ? h + .005 : -.05);
      }
      p.needsUpdate = true; ob.malla.geometry.computeVertexNormals();
    } else for (let i = 0; i < ob.seg.length; i++){ const h = ob.lv[i]; ob.seg[i].visible = h > .005; ob.seg[i].scale.y = Math.max(.001, h); ob.seg[i].position.y = h / 2 + (ob.baseDe ? ob.baseDe(i) : 0); }
  }
  // puntos: lo lleno, lo limpio, el tiempo que sobra y la mejor racha sin derramar
  function puntos(){ const { lleno, der } = puntuacion(); return Math.max(0, Math.round(lleno * 1000 * (1 - Math.min(1, der * 1.6)) + (lleno > .85 ? Math.max(0, S.tiempo - S.t) * 4 : 0) + Math.min(300, (S.mejorRacha || 0) / S.capCuba * 400))); }
  S.puntos = () => puntos();
  function puntuacion(){
    let lleno = 0;
    if (modo === 'suelo'){ let s = 0; for (const v of ob.lv) s += Math.min(1, v / ob.esp) * (v > ob.esp * 1.6 ? .85 : 1); lleno = s / ob.lv.length; }
    else { let s = 0; ob.lv.forEach((v, i) => { s += Math.min(1, v / (ob.Hde ? ob.Hde(i) : ob.H)); }); lleno = s / ob.lv.length; }
    const der = S.vertido > 0 ? S.derramado / S.vertido : 0;
    return { lleno, der };
  }
  function hud(){
    $('mjT').textContent = `⏱ ${Math.max(0, Math.ceil(S.tiempo - S.t))}s`;
    $('mjCuba').firstChild.style.width = Math.max(0, S.cuba / S.capCuba * 100) + '%';
    const { lleno, der } = puntuacion();
    const dd = $('mjDer'); dd.textContent = `💦 Derramado ${Math.round(der * 100)} %`; dd.classList.toggle('mal', der > .12);
    S.pts = puntos(); $('mjPts').textContent = `⭐ ${S.pts}`;
    const rc = $('mjRacha'), nr = Math.floor((S.racha || 0) / (S.capCuba * .12)); rc.style.display = nr >= 1 ? '' : 'none'; if (nr >= 1) rc.textContent = `🔥 Racha limpia ×${nr + 1}`;
    const bs = $('mjBarras').children;
    if (ob.unica){ if (bs[0]) bs[0].firstChild.style.width = Math.round(lleno * 100) + '%'; }
    else for (let i = 0; i < bs.length; i++){ const v = ob.lv[i] / (ob.Hde ? ob.Hde(i) : ob.H); bs[i].firstChild.style.width = Math.min(100, v * 100) + '%'; bs[i].classList.toggle('over', v > .99); }
  }

  function cuadro(){
    if (!S) return;
    S.raf = requestAnimationFrame(cuadro);
    const ahora = performance.now(), dtR = Math.min(.2, (ahora - tPrev) / 1000); tPrev = ahora;
    // la física va en pasos pequeños: se juega igual con 60 fps que con un PC lento
    const n = Math.max(1, Math.ceil(dtR / .02)); for (let k = 0; k < n; k++) paso(dtR / n);
    dibujar(dtR);
  }
  function paso(dt){
    if (S.empezado && !S.fin){
      S.t += dt;
      // mando: joystick + teclado, relativo a la cámara
      let jx = S.joy.x, jy = S.joy.y; const T = S.teclas;
      if (T.has('a') || T.has('arrowleft')) jx = -1; if (T.has('d') || T.has('arrowright')) jx = 1; if (T.has('w') || T.has('arrowup')) jy = -1; if (T.has('s') || T.has('arrowdown')) jy = 1;
      const fw = new THREE.Vector3(); camera.getWorldDirection(fw); fw.y = 0; fw.normalize(); const rt = new THREE.Vector3(-fw.z, 0, fw.x);
      const vmax = 2.2, objetivo = rt.multiplyScalar(jx * vmax).addScaledVector(fw, -jy * vmax);
      vE.lerp(objetivo, Math.min(1, dt * 2.6));                                // la pluma tiene inercia
      E.addScaledVector(vE, dt); E.x = Math.max(-lim[0], Math.min(lim[0], E.x)); E.z = Math.max(-lim[1], Math.min(lim[1], E.z));
      // péndulo de la manguera
      const rw = racha(S.t), w2 = 9.8 / balanceo.len, ax = (E.x - H.x) * w2 - vH.x * balanceo.amort + (vto ? Math.cos(vto.a) * rw : 0), az = (E.z - H.z) * w2 - vH.z * balanceo.amort + (vto ? Math.sin(vto.a) * rw : 0);
      vH.x += ax * dt; vH.z += az * dt; H.x += vH.x * dt; H.z += vH.z * dt;
      const dxz = Math.min(balanceo.len * .95, Math.hypot(H.x - E.x, H.z - E.z)); H.y = E.y - Math.sqrt(balanceo.len ** 2 - dxz ** 2);
      // bombeo: golpes de la bomba (cada émbolo) que dan tirones a la manguera
      if (S.bombeando && S.cuba > 0){
        const caudal = S.capCuba / 48 * (dif === 3 ? 1.15 : 1), v = Math.min(S.cuba, caudal * dt); S.cuba -= v; S.vertido += v;
        const n = 3; for (let k = 0; k < n; k++) soltarGota(v / n);
        if (S.t - S.ultimoGolpe > .75){ S.ultimoGolpe = S.t; S.sacudida = .06 * dif; vH.x += (Math.random() - .5) * .35 * dif; vH.z += (Math.random() - .5) * .35 * dif; golpe(); }
      }
      if (S.cuba <= 0 && !S.avisoCuba){ S.avisoCuba = true; aviso('Cuba vacía'); setTimeout(() => terminar(), 1800); }
      if (S.t >= S.tiempo) terminar();
    }
    // gotas
    for (let i = 0; i < NP; i++){
      if (!gviva[i]) continue;
      if (vto){ const rw = racha(S.t) * 1.4 * dt; gv[i * 3] += Math.cos(vto.a) * rw; gv[i * 3 + 2] += Math.sin(vto.a) * rw; }
      gv[i * 3 + 1] -= 9.8 * dt; gp[i * 3] += gv[i * 3] * dt; gp[i * 3 + 1] += gv[i * 3 + 1] * dt; gp[i * 3 + 2] += gv[i * 3 + 2] * dt;
      const yS = ob.altura(gp[i * 3], gp[i * 3 + 2]);
      if (gp[i * 3 + 1] <= yS && gv[i * 3 + 1] < 0){ caer(i); continue; }
    }
    repartir(dt);
  }
  function dibujar(dt){
    for (let i = 0; i < NP; i++){ if (!gviva[i]) continue;
      o3.position.set(gp[i * 3], gp[i * 3 + 1], gp[i * 3 + 2]); const r = gr[i]; o3.scale.set(r, r * (gvol[i] > 0 ? 1.6 : 1), r); o3.updateMatrix(); gotas.setMatrixAt(i, o3.matrix); }
    gotas.instanceMatrix.needsUpdate = true;
    pintarObra();
    derr.count = derrames.length; derrames.forEach((d, i) => { o3.position.set(d.x, .012, d.z); o3.scale.set(d.r, .025, d.r * .85); o3.rotation.set(0, i, 0); o3.updateMatrix(); derr.setMatrixAt(i, o3.matrix); o3.rotation.set(0, 0, 0); });
    derr.instanceMatrix.needsUpdate = true;
    // pluma: 2 tramos resueltos con cinemática inversa (codo hacia arriba)
    const v = tmp.subVectors(E, B), hd = new THREE.Vector3(v.x, 0, v.z); const dh = hd.length(); hd.normalize();
    const d = Math.min(L1 + L2 - .05, v.length()), a = Math.atan2(v.y, dh), c1 = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const th = a + c1; J1.copy(B).addScaledVector(hd, Math.cos(th) * L1).addScaledVector(up, Math.sin(th) * L1);
    const Ef = new THREE.Vector3().copy(B).add(v.setLength(d));
    poner(b1, B, J1); poner(b2, J1, Ef); codo.position.copy(J1); punta.position.copy(Ef);
    const ofs = new THREE.Vector3(0, -.32, 0); poner(tubo1, B.clone().add(ofs), J1.clone().add(ofs)); poner(tubo2, J1.clone().add(ofs), Ef.clone().add(ofs));
    bomba.torre.rotation.y = Math.atan2(-(E.z - B.z), E.x - B.x) - bomba.g.rotation.y;
    // manguera flexible (curva que cuelga) y boquilla
    const mid = new THREE.Vector3().lerpVectors(Ef, H, .5); mid.x -= vH.x * .18; mid.z -= vH.z * .18; mid.y -= .15;
    const curva = new THREE.QuadraticBezierCurve3(Ef, mid, H);
    if (manguera){ manguera.geometry.dispose(); manguera.geometry = new THREE.TubeGeometry(curva, 18, .1, 8); }
    else { manguera = new THREE.Mesh(new THREE.TubeGeometry(curva, 18, .1, 8), M.goma); manguera.castShadow = true; scene.add(manguera); }
    const dirB = new THREE.Vector3().subVectors(H, mid).normalize(); boquilla.position.copy(H).addScaledVector(dirB, .1); boquilla.quaternion.setFromUnitVectors(up, dirB.negate());
    // diana: punto bajo la boquilla
    if (diana.visible){ diana.position.set(H.x + vH.x * .25, ob.altura(H.x + vH.x * .25, H.z + vH.z * .25) + .02, H.z + vH.z * .25); diana.material.color.setHex(ob.celdaDe(diana.position.x, diana.position.z) >= 0 ? 0x7dff8a : 0xffe14a); }
    // ayudantes: el del vibrador mete la aguja; el otro reparte con la regla
    const tt = performance.now() / 1000;
    obreros.forEach((o, i) => { o.bL.rotation.x = -.9 + Math.sin(tt * (i ? 2 : 6)) * .25; o.bR.rotation.x = -1.1 + Math.sin(tt * (i ? 2 : 6) + 1) * .25; o.t.rotation.x = .12 + Math.sin(tt * 2) * .05;
      const objetivoX = Math.max(-lim[0] + 1, Math.min(lim[0] - 1, H.x + (i ? 1.4 : -1.4))); o.g.position.x += (objetivoX - o.g.position.x) * Math.min(1, dt * .6); });
    // cámara del bombista: mira a la boquilla con suavidad, un poco de movimiento de cabeza
    // cámaras: 0 andamio (bombista), 1 cenital (encima de la boquilla), 2 al ras del encofrado. Se giran arrastrando o con ⟲ ⟳
    S.sacudida = Math.max(0, (S.sacudida || 0) - dt * .25); const sk = S.sacudida * Math.sin(tt * 60);
    const yG = ob.altura(H.x, H.z), vista = S.vista || 0;
    const tgt = vista === 0 ? new THREE.Vector3(H.x * .8, Math.max(.2, H.y - 1.2), H.z * .8) : new THREE.Vector3(H.x, yG + (vista === 2 ? .6 : .2), H.z);
    mira.lerp(tgt, Math.min(1, dt * (vista === 0 ? 2.5 : 5)));
    const b0 = S.base0 || (S.base0 = (() => { const o = ob.camara.clone().sub(new THREE.Vector3(0, ob.alturaPunta - 1.2, 0)); return { d: o.length(), y: Math.atan2(o.x, o.z), p: Math.asin(o.y / o.length()) }; })());
    const bd = vista === 0 ? b0.d : vista === 1 ? 6.5 : 4.2, bp = vista === 0 ? b0.p : vista === 1 ? 1.32 : .32;
    S.yaw = S.yaw || 0; S.pitch = S.pitch || 0; S.zoom = S.zoom || 1;
    const yy = b0.y + S.yaw, pp = Math.max(.12, Math.min(1.48, bp + S.pitch)), dd = bd * S.zoom;
    const off = new THREE.Vector3(Math.cos(pp) * Math.sin(yy), Math.sin(pp), Math.cos(pp) * Math.cos(yy)).multiplyScalar(dd);
    const cp = (vista === 0 ? new THREE.Vector3(H.x * .18, ob.alturaPunta - 1.2, 0) : mira.clone()).add(off);
    S.camP = S.camP ? S.camP.lerp(cp, Math.min(1, dt * 6)) : cp;
    camera.position.set(S.camP.x + Math.sin(tt * .7) * .03 + sk * .5, Math.max(.4, S.camP.y) + Math.sin(tt * 1.3) * .02 + sk, S.camP.z);
    camera.lookAt(mira);
    // plomada: línea desde la boquilla hasta donde caerá el hormigón, verde dentro del encofrado y roja fuera
    { const cx = H.x + vH.x * .25, cz = H.z + vH.z * .25, dentro = ob.celdaDe(cx, cz) >= 0, y1 = ob.altura(cx, cz) + .02; const pa = plomada.geometry.attributes.position; pa.setXYZ(0, H.x, H.y - .25, H.z); pa.setXYZ(1, cx, y1, cz); pa.needsUpdate = true; plomada.material.color.setHex(dentro ? 0x5fff7a : 0xff4a3a); plomada.computeLineDistances();
      punto.position.set(cx, y1 + .01, cz); punto.material.color.setHex(dentro ? 0x5fff7a : 0xff4a3a); }
    if (manga){ const rw = racha(S.t), p = manga.userData.piv; p.rotation.y = -vto.a + Math.sin(tt * 3) * .12 * rw; p.rotation.z = -.9 + Math.min(.85, rw * .9) + Math.sin(tt * 5) * .05;
      const fl = capa.querySelector('#mjFl'); if (fl) fl.style.transform = `rotate(${vto.a}rad) scale(${.8 + rw * .4})`; }
    if (S.empezado && !S.fin) hud();
    renderer.render(scene, camera);
  }
  S.ob = ob; S.puntuacion = puntuacion; S.paso = paso; S.dibujar = dibujar;
  cuadro();
}

function andamio(par, M, x, z, alto){
  const g = new THREE.Group(); g.position.set(x, 0, z); par.add(g);
  for (const dx of [-1.6, 1.6]) for (const dz of [-.6, .6]) caja(g, .05, alto + 1, .05, M.andamio, dx, (alto + 1) / 2, dz);
  for (let y = 1.4; y <= alto; y += 1.5) for (const dz of [-.6, .6]){ caja(g, 3.2, .04, .04, M.andamio, 0, y, dz); }
  caja(g, 3.3, .06, 1.3, M.tabla, 0, alto - .6, 0);
  caja(g, 3.2, .04, .04, M.andamio, 0, alto + .45, .62); caja(g, 3.2, .04, .04, M.andamio, 0, alto - .1, -.62);   // barandilla (la delantera, baja: no tapa la vista)
  caja(g, .04, .04, 1.3, M.andamio, -1.6, alto + .45, 0); caja(g, .04, .04, 1.3, M.andamio, 1.6, alto + .45, 0);
}

/* ------------------------------ sonido ------------------------------ */
function sonido(){
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)(); const motor = ac.createOscillator(), gm = ac.createGain(), fil = ac.createBiquadFilter();
    motor.type = 'sawtooth'; motor.frequency.value = 46; fil.type = 'lowpass'; fil.frequency.value = 220; gm.gain.value = .035;
    motor.connect(fil).connect(gm).connect(ac.destination); motor.start();
    S.audio = { ac, motor, gm };
  } catch (e) { S.audio = null; }
}
// chof: el hormigón cae en el encofrado (ruido filtrado, como mucho unas 8 veces por segundo)
function chof(){
  const A = S && S.audio; if (!A) return; const ahora = A.ac.currentTime; if (ahora - (A.uc || 0) < .12) return; A.uc = ahora;
  try { if (!A.ruido){ const b = A.ac.createBuffer(1, A.ac.sampleRate * .25, A.ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2); A.ruido = b; }
    const s = A.ac.createBufferSource(), f = A.ac.createBiquadFilter(), g = A.ac.createGain(); s.buffer = A.ruido; f.type = 'lowpass'; f.frequency.value = 500 + Math.random() * 300; g.gain.value = .05;
    s.connect(f).connect(g).connect(A.ac.destination); s.start(); } catch (e) {}
}
function golpe(){
  const A = S && S.audio; if (!A) return;
  try { const o = A.ac.createOscillator(), g = A.ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, A.ac.currentTime); o.frequency.exponentialRampToValueAtTime(38, A.ac.currentTime + .25);
    g.gain.setValueAtTime(.16, A.ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, A.ac.currentTime + .3); o.connect(g).connect(A.ac.destination); o.start(); o.stop(A.ac.currentTime + .32); } catch (e) {}
}

/* ------------------------------ final ------------------------------ */
function terminar(){
  if (!S || S.fin) return; S.fin = true; S.bombeando = false;
  const { lleno, der } = S.puntuacion();
  const nota = S.vertido < S.capCuba * .1 ? 'nada' : lleno >= .85 && der <= .1 ? 'perfecto' : lleno >= .62 && der <= .25 ? 'bien' : 'mal';
  const pts = S.puntos ? S.puntos() : 0, estrellasN = nota === 'perfecto' ? 3 : nota === 'bien' ? 2 : nota === 'mal' && lleno > .4 ? 1 : 0;
  let rec = null; try { const R0 = JSON.parse(localStorage.getItem('horinsa-records') || '{}'), k = 'bomba-' + S.ob.modo; rec = { antes: R0[k] || 0 }; if (pts > rec.antes && nota !== 'nada'){ R0[k] = pts; rec.nuevo = true; localStorage.setItem('horinsa-records', JSON.stringify(R0)); } } catch (e) {}
  const r = { nota, lleno, derrame: der, vertido: S.vertido, modo: S.ob.modo, pts, estrellas: estrellasN };
  let resumen = '';
  try { resumen = S.op.alTerminar ? (S.op.alTerminar(r) || '') : ''; } catch (e) { console.error(e); }
  const cara = nota === 'perfecto' ? '🏆' : nota === 'bien' ? '👍' : nota === 'nada' ? '🤷' : '😬';
  const tit = nota === 'perfecto' ? '¡Trabajo perfecto!' : nota === 'bien' ? 'Buen trabajo' : nota === 'nada' ? 'Le devuelves el mando al bombista' : 'Ha salido regular…';
  S.capa.insertAdjacentHTML('beforeend', `<div id="mjPanel"><div class="caja"><div class="nota">${cara}</div><h3 style="text-align:center">${tit}</h3>
    <table class="tab"><tr><td>Encofrado lleno</td><td>${Math.round(lleno * 100)} %</td></tr><tr><td>Hormigón derramado</td><td>${Math.round(der * 100)} %</td></tr><tr><td>Puntos</td><td>${pts}</td></tr>${rec ? `<tr><td>Récord en este tipo de obra</td><td>${rec.nuevo ? '🏅 ¡Nuevo récord!' : rec.antes}</td></tr>` : ''}</table>
    <div style="text-align:center;font-size:30px;letter-spacing:4px;margin-top:6px">${'★'.repeat(estrellasN)}<span style="opacity:.25">${'★'.repeat(3 - estrellasN)}</span></div>
    ${resumen ? `<p>${resumen}</p>` : ''}<button id="mjVolver">Volver a la planta</button></div></div>`);
  S.capa.querySelector('#mjVolver').onclick = () => { const res = S.res; cerrar(); res(r); };
}
function cerrar(){
  if (!S) { window.MINIJUEGO = false; return; }
  cancelAnimationFrame(S.raf);
  removeEventListener('keydown', S.kd); removeEventListener('keyup', S.ku); removeEventListener('resize', S.rs);
  try { if (S.audio){ S.audio.motor.stop(); S.audio.ac.close(); } } catch (e) {}
  S.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material){ for (const m of [].concat(o.material)){ if (m.map) m.map.dispose(); m.dispose(); } } });
  S.renderer.dispose(); try { S.renderer.forceContextLoss(); } catch (e) {}
  S.capa.remove(); S = null; window.MINIJUEGO = false;
}
function esc(t){ return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
