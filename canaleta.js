// =====================================================================
//  HORINSA · Minijuego de descarga por canaleta
//  El chófer acerca la hormigonera marcha atrás a la zanja de la obra,
//  orienta la canaleta y descarga. Hay que llenar la zanja hasta la línea
//  sin derramar y sin golpear nada. Se puede mover el camión mientras se
//  descarga (despacio), como en la realidad.
//  window.abrirCanaleta({ dif, cliente, chofer, alTerminar }) → Promise
// =====================================================================
import * as THREE from 'three';

const CSS = `
#cnCapa{position:fixed;inset:0;z-index:200;background:#000;touch-action:none;user-select:none;-webkit-user-select:none;font-family:system-ui,sans-serif;color:#fff}
#cnCapa canvas{display:block;width:100%;height:100%}
#cnHud{position:absolute;left:0;right:0;top:0;padding:10px 12px;display:flex;flex-direction:column;gap:6px;pointer-events:none;background:linear-gradient(#000b,#0000)}
#cnHud .fila{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#cnHud .tit{font-weight:800;font-size:15px;text-shadow:0 1px 3px #000}
#cnHud .chip{background:#000a;border:1px solid #fff3;border-radius:7px;padding:3px 8px;font-size:12.5px;font-weight:700}
#cnHud .chip.mal{border-color:#ff5a4f;color:#ffb3ad}#cnHud .chip.ok{border-color:#3fae5a;color:#9ff0ae}
#cnBarra{width:170px;height:9px;border-radius:4px;background:#ffffff26;overflow:hidden}#cnBarra i{display:block;height:100%;background:#8fd16f}
#cnJoy{position:absolute;left:22px;bottom:26px;width:138px;height:138px;border-radius:50%;background:radial-gradient(circle at 50% 45%,#3a3f45,#1d2024);border:5px solid #f2b705;box-shadow:0 6px 18px #000a,inset 0 0 18px #000;touch-action:none}
#cnJoy i{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#5b636b,#23272b);border:2px solid #111}
#cnJoy span{position:absolute;left:0;right:0;top:-22px;text-align:center;font-size:11px;font-weight:800;color:#f2b705;text-shadow:0 1px 2px #000}
#cnBots{position:absolute;right:16px;bottom:22px;display:grid;grid-template-columns:repeat(2,74px);gap:10px}
#cnBots button{height:62px;border-radius:14px;border:4px solid #f2b705;background:radial-gradient(circle at 45% 40%,#4b525a,#1f2327);color:#fff;font-weight:900;font-size:13px;touch-action:none;box-shadow:0 4px 12px #000a}
#cnBots button.on{background:radial-gradient(circle at 45% 40%,#7dff8a,#178a2c)}
#cnBots #cnDesc{grid-column:span 2;background:radial-gradient(circle at 45% 40%,#ff6b5a,#b3160f)}
#cnBots #cnDesc.on{background:radial-gradient(circle at 45% 40%,#7dff8a,#178a2c)}
#cnCam{position:absolute;right:12px;top:100px;display:flex;flex-direction:column;gap:6px}#cnCam button{background:#000b;border:1px solid #fff4;color:#fff;border-radius:8px;padding:6px 9px;font-weight:700;font-size:13px;touch-action:none}
#cnFin{position:absolute;right:16px;top:64px;background:#000b;border:1px solid #fff4;color:#fff;border-radius:8px;padding:6px 10px;font-weight:700;font-size:12.5px}
#cnPanel{position:absolute;inset:0;display:grid;place-items:center;background:#0009}
#cnPanel .caja{width:min(440px,calc(100% - 32px));background:#151a21;border:1px solid #33404d;border-radius:14px;padding:18px;box-shadow:0 20px 50px #000c}
#cnPanel h3{margin:0 0 8px;font-size:19px}#cnPanel p{margin:6px 0;font-size:14px;line-height:1.45;color:#d6dde4}
#cnPanel button{margin-top:12px;width:100%;border:0;border-radius:9px;padding:12px;font-weight:800;font-size:15px;background:#d2201f;color:#fff;cursor:pointer}
#cnPanel .nota{font-size:40px;text-align:center;margin:4px 0}
#cnPanel .tab{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px}#cnPanel .tab td{padding:3px 0;border-bottom:1px solid #26303a}#cnPanel .tab td:last-child{text-align:right;font-weight:700}
#cnAviso{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);font-size:22px;font-weight:900;color:#ffd84a;text-shadow:0 2px 6px #000;pointer-events:none;opacity:0;transition:opacity .3s;text-align:center}
@media (max-width:600px){#cnJoy{width:118px;height:118px;left:12px}#cnBots{grid-template-columns:repeat(2,62px);right:10px}#cnBots button{height:54px;font-size:12px}}
`;
let S = null;
window.abrirCanaleta = function (op) {
  return new Promise(res => { try { iniciar(op || {}, res); } catch (e) { console.error(e); cerrar(); res(null); } });
};

function lienzo(w, h, fn, rep){ const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
const ruido = (g, w, h, base, v, n, tam = 2) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++){ const q = (Math.random() - .5) * v; g.fillStyle = `rgba(${q > 0 ? '255,255,255' : '0,0,0'},${Math.abs(q)})`; const s = Math.random() * tam + .5; g.fillRect(Math.random() * w, Math.random() * h, s, s); } };
const std = (color, ex) => new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: .1, ...(ex || {}) });
function caja(par, w, h, d, m, x, y, z){ const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; par.add(o); return o; }
function cil(par, r1, r2, h, m, x, y, z, seg = 14){ const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; par.add(o); return o; }

// hormigonera de 3 ejes con cuba que gira y canaleta trasera orientable
function hormigonera(par){
  const g = new THREE.Group(); par.add(g);
  const bl = std(0xf2f2f0, { roughness: .4 }), rj = std(0xd2201f, { roughness: .4 }), ng = std(0x1a1a1a, { roughness: .8 }), gr = std(0x8a9096, { metalness: .6, roughness: .4 });
  caja(g, 8.4, .45, 1.1, ng, -.2, 1.0, 0);                                                         // chasis
  caja(g, 2.2, 2.3, 2.5, bl, 3.0, 2.3, 0); caja(g, 2.22, .45, 2.52, rj, 3.0, 1.35, 0);              // cabina
  caja(g, .1, 1.0, 2.2, std(0x223744, { roughness: .05, metalness: .9 }), 4.12, 2.7, 0);
  for (const s of [-1, 1]) caja(g, .1, .35, .25, ng, 3.6, 2.8, s * 1.42);                          // retrovisores
  const cuba = new THREE.Group(); cuba.position.set(-1.1, 2.75, 0); cuba.rotation.z = -.2; g.add(cuba);
  const cubaGeo = new THREE.CylinderGeometry(.9, 1.25, 4.6, 20, 1); cubaGeo.rotateZ(Math.PI / 2);
  const tc = lienzo(256, 64, (c, w, h) => { c.fillStyle = '#eceeef'; c.fillRect(0, 0, w, h); c.fillStyle = '#d2201f'; for (let i = 0; i < 4; i++){ c.save(); c.translate(i * 64, 0); c.beginPath(); c.moveTo(0, 0); c.lineTo(22, 0); c.lineTo(56, h); c.lineTo(34, h); c.fill(); c.restore(); } });
  const cm = new THREE.Mesh(cubaGeo, new THREE.MeshStandardMaterial({ map: tc, roughness: .45, metalness: .2 })); cm.castShadow = true; cuba.add(cm);
  cil(cuba, .55, .8, .6, bl, -2.55, 0, 0, 16).rotation.z = Math.PI / 2;                            // boca de carga/descarga
  caja(g, .6, 1.4, 1.2, gr, -3.6, 2.1, 0);                                                         // tolva y soporte de canaleta
  const piv = new THREE.Group(); piv.position.set(-3.95, 1.55, 0); g.add(piv);                     // la canaleta gira sobre este eje
  const cmat = std(0xd2a20f, { metalness: .4, roughness: .45 });
  const can = new THREE.Group(); can.rotation.z = -.32; piv.add(can);
  caja(can, 2.8, .05, .5, cmat, -1.4, 0, 0); caja(can, 2.8, .25, .05, cmat, -1.4, .12, .25); caja(can, 2.8, .25, .05, cmat, -1.4, .12, -.25);
  const ruedas = [];
  for (const x of [-2.9, -1.6, 3.0]) for (const s of [-1, 1]){ const r = cil(g, .55, .55, .4, ng, x, .55, s * 1.15, 16); r.rotation.x = Math.PI / 2; ruedas.push(r); }
  const luzAtras = new THREE.Mesh(new THREE.BoxGeometry(.06, .2, .5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000 })); luzAtras.position.set(-4.3, 1.1, 0); g.add(luzAtras);
  return { g, cuba: cm, piv, can, ruedas, luzAtras };
}

function iniciar(op, res){
  if (!document.getElementById('cnCss')){ const st = document.createElement('style'); st.id = 'cnCss'; st.textContent = CSS; document.head.appendChild(st); }
  const dif = Math.max(1, Math.min(3, op.dif || 1));
  const capa = document.createElement('div'); capa.id = 'cnCapa'; document.body.appendChild(capa); window.MINIJUEGO = true;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
  capa.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xe9dcc6, 70, 380);
  const fovDe = a => a >= 1 ? 55 : Math.min(88, 55 * Math.pow(1 / a, .6));
  const camera = new THREE.PerspectiveCamera(fovDe(innerWidth / innerHeight), innerWidth / innerHeight, .1, 1200);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = max(vP.y, 0.0); vec3 c = mix(vec3(.93,.86,.74), vec3(.30,.55,.86), pow(h,.55)); c += vec3(1.,.95,.8)*pow(max(dot(vP, normalize(vec3(.5,.55,-.6))),0.0),300.0)*1.5; gl_FragColor = vec4(c,1.0); }' })));
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6b5a48, .8));
  const sol = new THREE.DirectionalLight(0xfff1dc, 2.4); sol.position.set(20, 32, -14); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 }); sol.shadow.bias = -.0004; sol.shadow.normalBias = .02; scene.add(sol, sol.target);

  // ---- calle y solar ----
  const picon = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: lienzo(256, 256, (g, w, h) => ruido(g, w, h, '#3b3330', .35, 9000, 2.5), [60, 60]), roughness: 1 }));
  picon.rotation.x = -Math.PI / 2; picon.position.y = -.02; picon.receiveShadow = true; scene.add(picon);
  const asf = new THREE.Mesh(new THREE.PlaneGeometry(80, 8), new THREE.MeshStandardMaterial({ map: lienzo(512, 64, (g, w, h) => { ruido(g, w, h, '#3a3b3d', .2, 9000, 1.5); g.fillStyle = '#e8e4d8'; for (let x = 0; x < w; x += 40) g.fillRect(x, h / 2 - 1, 22, 2); }, [4, 1]), roughness: .9 }));
  asf.rotation.x = -Math.PI / 2; asf.position.set(0, .01, -9); asf.receiveShadow = true; scene.add(asf);
  const cal = std(0xf4f1ea, { roughness: .9 }), verde = std(0x1f7a43), tabla = std(0xb08a55, { roughness: .8 }), hv = std(0xb5b3ad, { roughness: .95 });
  caja(scene, 80, .15, 1.4, std(0xc9c4b8, { roughness: .9 }), 0, .07, -4.3);                       // acera
  // casas blancas al otro lado de la calle y a los lados del solar
  for (const [x, z, w, d, h] of [[-22, -18, 12, 8, 6.2], [-6, -18, 14, 8, 3.2], [12, -18, 10, 8, 6.1], [27, -18, 12, 8, 3.2], [-20, 6, 9, 12, 3.2], [20, 6, 9, 12, 6.2]]){
    caja(scene, w, h, d, cal, x, h / 2, z); caja(scene, w + .2, .25, d + .2, cal, x, h + .12, z);
    for (let i = 0; i < Math.max(1, Math.floor(w / 3)); i++) caja(scene, 1, 1.2, .08, verde, x - w / 2 + (i + .5) * w / Math.max(1, Math.floor(w / 3)), h * .55, z + (z < 0 ? d / 2 + .03 : -d / 2 - .03)); }
  // solar: zahorra compactada con la zanja de cimentación
  // (el suelo del solar se crea más abajo, con el hueco de la zanja recortado)
  // zanja (celdas de 1 m): recta (fácil), en L (normal), en L más estrecha y con obstáculos (difícil)
  const ancho = [.8, .65, .5][dif - 1], prof = .5, C = [];
  const nRecto = [9, 8, 8][dif - 1], nL = [0, 4, 5][dif - 1], z0 = 3.2;
  for (let i = 0; i < nRecto; i++) C.push({ x: -nRecto / 2 + .5 + i, z: z0, sx: 1, sz: ancho });
  for (let i = 0; i < nL; i++) C.push({ x: nRecto / 2 - ancho / 2, z: z0 + ancho / 2 + .5 + i, sx: ancho, sz: 1 });
  const tierra = std(0x5b4636, { roughness: 1 });
  // suelo del solar con el hueco de la zanja; el picón de alrededor deja un hueco para el solar
  { const rect = (sh, x0, z0, x1, z1, hole) => { const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => new THREE.Vector2(x, -z)); if (hole) pts.reverse(); sh.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) sh.lineTo(q.x, q.y); sh.closePath(); };
    const sh = new THREE.Shape(); rect(sh, -14, -3.5, 14, 12.5);
    const runs = [[-nRecto / 2, z0 - ancho / 2, nRecto / 2, z0 + ancho / 2]]; if (nL) runs.push([nRecto / 2 - ancho, z0 + ancho / 2, nRecto / 2, z0 + ancho / 2 + nL]);
    for (const [x0, za, x1, zb] of runs){ const ho = new THREE.Path(); rect(ho, x0, za, x1, zb, true); sh.holes.push(ho); }
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 5.6, uv.getY(i) / 5.3);
    const zah = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: lienzo(256, 256, (gg, w, h) => ruido(gg, w, h, '#8f8778', .3, 8000, 2), [1, 1]), roughness: 1 })); zah.material.map.wrapS = zah.material.map.wrapT = THREE.RepeatWrapping;
    zah.position.y = .012; zah.receiveShadow = true; scene.add(zah);
    // el picón: un anillo grande alrededor del solar
    const sp = new THREE.Shape(); rect(sp, -300, -300, 300, 300); const hp = new THREE.Path(); rect(hp, -14, -3.5, 14, 12.5, true); sp.holes.push(hp);
    const gp2 = new THREE.ShapeGeometry(sp); gp2.rotateX(-Math.PI / 2); const uv2 = gp2.attributes.uv; for (let i = 0; i < uv2.count; i++) uv2.setXY(i, uv2.getX(i) / 10, uv2.getY(i) / 10);
    const pm = picon.material.map; pm.repeat.set(1, 1); picon.geometry.dispose(); picon.geometry = gp2; picon.rotation.x = 0; }
  const hm = std(0xc9cdd0, { roughness: .25, metalness: .02 });
  for (const c of C){
    const fondo = new THREE.Mesh(new THREE.PlaneGeometry(c.sx, c.sz), tierra); fondo.rotation.x = -Math.PI / 2; fondo.position.set(c.x, -prof + .01, c.z); scene.add(fondo);
    c.m = new THREE.Mesh(new THREE.BoxGeometry(c.sx + .002, 1, c.sz + .002), hm); c.m.position.set(c.x, -prof, c.z); c.m.scale.y = .001; c.m.visible = false; c.m.receiveShadow = true; scene.add(c.m);
    // parrilla de ferralla en el fondo
    for (let k = -1; k <= 1; k++) caja(scene, c.sx > c.sz ? c.sx : .012, .012, c.sx > c.sz ? .012 : c.sz, std(0x5a3b2a, { metalness: .6 }), c.x + (c.sx > c.sz ? 0 : k * c.sx * .3), -prof + .08, c.z + (c.sx > c.sz ? k * c.sz * .3 : 0));
  }
  // bordes de tierra de la zanja (para que se vea el hueco) y línea de nivel (cuerda amarilla)
  for (const c of C){ for (const s of [-1, 1]){ if (c.sx >= c.sz){ caja(scene, c.sx, prof, .04, tierra, c.x, -prof / 2, c.z + s * c.sz / 2); } else { caja(scene, .04, prof, c.sz, tierra, c.x + s * c.sx / 2, -prof / 2, c.z); } } }
  const tierraG = new THREE.Mesh(new THREE.PlaneGeometry(28, 16), new THREE.MeshStandardMaterial({ color: 0x8f8778, roughness: 1, transparent: true, opacity: 0 })); tierraG.visible = false;
  // montón de tierra de la excavación y palés de bloques
  { const m = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.4, 14), tierra); m.position.set(-9, .7, 9); m.castShadow = m.receiveShadow = true; scene.add(m); }
  const obst = [{ x: -9, z: 9, w: 4, d: 4 }];
  for (const [x, z] of dif >= 2 ? [[-3, 8.5], [-1.5, 8.5]] : [[-3, 9.5]]){ caja(scene, 1.2, .15, 1.2, tabla, x, .08, z); caja(scene, 1.1, .8, 1.1, hv, x, .55, z); obst.push({ x, z, w: 1.2, d: 1.2 }); }
  if (dif === 3){ const f = cil(scene, .12, .12, 6, std(0x777777, { metalness: .6 }), 6.5, 3, -4.6, 8); obst.push({ x: 6.5, z: -4.6, w: .3, d: .3 }); caja(scene, 1.4, .3, .5, std(0xfafafa), 6.5, 6.1, -4.4); }
  obst.push({ x: -20, z: 6, w: 9, d: 12 }, { x: 20, z: 6, w: 9, d: 12 }, ...[[-22, -18, 12, 8], [-6, -18, 14, 8], [12, -18, 10, 8], [27, -18, 12, 8]].map(([x, z, w, d]) => ({ x, z, w, d })));
  // el obrero que hace señas
  const obrero = new THREE.Group(); scene.add(obrero);
  caja(obrero, .45, .55, .28, std(0xff7a1a), 0, 1.15, 0); caja(obrero, .16, .85, .2, std(0x2c3e5c), -.11, .43, 0); caja(obrero, .16, .85, .2, std(0x2c3e5c), .11, .43, 0);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), std(0xc89a7a)); cab.position.y = 1.6; obrero.add(cab);
  const casc = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf2c230)); casc.position.y = 1.64; obrero.add(casc);
  const brazoO = new THREE.Group(); brazoO.position.set(.3, 1.4, 0); obrero.add(brazoO); caja(brazoO, .11, .58, .11, std(0xff7a1a), 0, -.29, 0);
  obrero.position.set(nRecto / 2 + 1.6, 0, z0 - 1.4);

  const T = hormigonera(scene);
  const cap = C.reduce((a, c) => a + c.sx * c.sz * prof, 0) * 1.15;
  const st = { x: -12, z: -9, a: 0, v: 0, dir: 0, ang: 0, t: 0, tiempo: [120, 110, 100][dif - 1], golpes: 0, vertido: 0, derramado: 0, dentro: 0, cuba: cap, cap, lv: new Float32Array(C.length) };
  S = { capa, renderer, scene, camera, res, op, st, fin: false, empezado: false, joy: new THREE.Vector2(), teclas: new Set(), bot: { izq: false, der: false, desc: false }, raf: 0, C, T, obst, dif, prof };
  window.__cnS = S;

  capa.insertAdjacentHTML('beforeend', `
    <div id="cnHud"><div class="fila"><span class="tit">🚚 Descarga por canaleta · ${esc(op.cliente || 'Obra')} · ${['fácil', 'normal', 'difícil'][dif - 1]}</span></div>
      <div class="fila"><span class="chip" id="cnT">⏱</span><span class="chip">Zanja <span id="cnBarra" style="display:inline-block;vertical-align:middle"><i></i></span></span><span class="chip" id="cnDer">💦 0 %</span><span class="chip" id="cnCuba">🚛 Cuba 100 %</span><span class="chip" id="cnInfo">Acerca la canaleta a la zanja</span></div></div>
    <div id="cnAviso"></div><button id="cnFin">Terminar</button>
    <div id="cnCam"><button data-cam="vista">📷 Detrás</button><button data-cam="izq">⟲</button><button data-cam="der">⟳</button><button data-cam="mas">＋</button><button data-cam="menos">－</button></div>
    <div id="cnJoy"><span>CAMIÓN</span><i></i></div>
    <div id="cnBots"><button id="cnIzq">◀ CANALETA</button><button id="cnDer2">CANALETA ▶</button><button id="cnDesc">DESCARGAR</button></div>
    <div id="cnPanel"><div class="caja"><h3>🚚 ¡A descargar por canaleta!</h3>
      <p>${esc(op.chofer || 'El chófer')} llega a <b>${esc(op.cliente || 'la obra')}</b>. Aquí no hace falta bomba: se descarga directamente con la <b>canaleta</b> del camión en la <b>zanja de la cimentación</b>.</p>
      <p>🕹️ <b>Joystick</b> (o WASD): mueve el camión hacia donde mira la cámara (marcha atrás si miras hacia atrás). Lleva la punta de la canaleta encima de la zanja.</p>
      <p>◀ ▶ <b>Gira la canaleta</b> (Q / E) y mantén <b>DESCARGAR</b> (espacio). Solo sale hormigón con el camión parado o muy despacio. Llena toda la zanja hasta la cuerda amarilla.</p>
      <p>📷 Gira la cámara arrastrando en la pantalla o con ⟲ ⟳.</p>
      <button id="cnEmpezar">¡Empezar!</button></div></div>`);
  const $ = id => capa.querySelector('#' + id);
  const joy = $('cnJoy'), knob = joy.querySelector('i'); let jid = null;
  const mj = e => { const r = joy.getBoundingClientRect(); let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2); const L = Math.hypot(dx, dy); if (L > 1){ dx /= L; dy /= L; } S.joy.set(dx, dy); knob.style.transform = `translate(${dx * r.width * .32}px,${dy * r.height * .32}px)`; };
  joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(e.pointerId); mj(e); }); joy.addEventListener('pointermove', e => { if (e.pointerId === jid) mj(e); });
  const sj = e => { if (e.pointerId !== jid) return; jid = null; S.joy.set(0, 0); knob.style.transform = ''; }; joy.addEventListener('pointerup', sj); joy.addEventListener('pointercancel', sj);
  for (const [id, k] of [['cnIzq', 'izq'], ['cnDer2', 'der'], ['cnDesc', 'desc']]){ const b = $(id), on = e => { e.preventDefault(); S.bot[k] = true; b.classList.add('on'); }, off = () => { S.bot[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off); }
  S.kd = e => { const k = e.key.toLowerCase(); S.teclas.add(k); if (k === ' ' || k.startsWith('arrow')) e.preventDefault(); }; S.ku = e => S.teclas.delete(e.key.toLowerCase());
  addEventListener('keydown', S.kd); addEventListener('keyup', S.ku);
  S.rs = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.fov = fovDe(camera.aspect); camera.updateProjectionMatrix(); }; addEventListener('resize', S.rs);
  $('cnEmpezar').onclick = () => { $('cnPanel').remove(); S.empezado = true; motor(); };
  $('cnFin').onclick = () => terminar();
  const nomV = ['📷 Detrás', '📷 Desde arriba', '📷 Canaleta'];
  $('cnCam').addEventListener('pointerdown', e => { const b = e.target.closest('[data-cam]'); if (!b) return; e.preventDefault(); const k = b.dataset.cam;
    if (k === 'vista'){ S.vista = ((S.vista || 0) + 1) % 3; S.yaw = 0; S.pitch = 0; S.zoom = 1; b.textContent = nomV[S.vista]; }
    else if (k === 'izq') S.yaw = (S.yaw || 0) + .4; else if (k === 'der') S.yaw = (S.yaw || 0) - .4;
    else if (k === 'mas') S.zoom = Math.max(.4, (S.zoom || 1) * .8); else S.zoom = Math.min(2.2, (S.zoom || 1) * 1.25); });
  let arr = null; const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { arr = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointermove', e => { if (!arr || e.pointerId !== arr.id) return; S.yaw = (S.yaw || 0) - (e.clientX - arr.x) * .006; S.pitch = (S.pitch || 0) + (e.clientY - arr.y) * .004; arr.x = e.clientX; arr.y = e.clientY; });
  const fa = e => { if (arr && e.pointerId === arr.id) arr = null; }; cv.addEventListener('pointerup', fa); cv.addEventListener('pointercancel', fa);
  cv.addEventListener('wheel', e => { e.preventDefault(); S.zoom = Math.max(.4, Math.min(2.2, (S.zoom || 1) * (e.deltaY > 0 ? 1.1 : .9))); }, { passive: false });
  const aviso = t => { const a = $('cnAviso'); a.textContent = t; a.style.opacity = 1; clearTimeout(S.tav); S.tav = setTimeout(() => a.style.opacity = 0, 1100); };

  // ---- hormigón que cae por la canaleta y derrames ----
  const NP = 500, gotas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), std(0xa9adb1, { roughness: .3 }), NP); gotas.frustumCulled = false; gotas.castShadow = true; scene.add(gotas);
  const gp = new Float32Array(NP * 3), gv = new Float32Array(NP * 3), gvol = new Float32Array(NP), gviva = new Uint8Array(NP); let ng = 0; const o3 = new THREE.Object3D(), M0 = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NP; i++) gotas.setMatrixAt(i, M0);
  const NDER = 120, derr = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 18), std(0x8a8e93, { roughness: .25 }), NDER); derr.count = 0; derr.receiveShadow = true; scene.add(derr); const derrames = [];
  const derramar = (x, z, v) => { st.derramado += v; let d = derrames.find(q => Math.hypot(q.x - x, q.z - z) < q.r * .8 + .15); if (!d && derrames.length < NDER){ d = { x, z, v: 0, r: .1 }; derrames.push(d); } if (!d) d = derrames[0]; d.v += v; d.r = Math.min(2, Math.sqrt(d.v / (.03 * Math.PI)) + .05); };
  const celdaDe = (x, z) => { for (let i = 0; i < C.length; i++){ const c = C[i]; if (Math.abs(x - c.x) < c.sx / 2 && Math.abs(z - c.z) < c.sz / 2) return i; } return -1; };

  // ---- física del camión ----
  const largo = 8.6, anchoC = 2.5, batalla = 4.4, centro = -.2;
  const esquinas = (x, z, a) => { const c = Math.cos(a), s = Math.sin(a), hl = largo / 2, hw = anchoC / 2, cx = x + c * centro, cz = z + s * centro;
    return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([u, v]) => [cx + c * u - s * v, cz + s * u + c * v]); };
  const choca = (x, z, a) => { const E = esquinas(x, z, a);
    for (const o of obst){ const Rr = [[o.x - o.w / 2, o.z - o.d / 2], [o.x + o.w / 2, o.z - o.d / 2], [o.x + o.w / 2, o.z + o.d / 2], [o.x - o.w / 2, o.z + o.d / 2]]; let sep = false;
      for (const pol of [E, Rr]) for (let i = 0; i < 4 && !sep; i++){ const p1 = pol[i], p2 = pol[(i + 1) % 4], nx = p2[1] - p1[1], nz = p1[0] - p2[0]; let a1 = 1e9, b1 = -1e9, a2 = 1e9, b2 = -1e9;
        for (const q of E){ const d = q[0] * nx + q[1] * nz; a1 = Math.min(a1, d); b1 = Math.max(b1, d); } for (const q of Rr){ const d = q[0] * nx + q[1] * nz; a2 = Math.min(a2, d); b2 = Math.max(b2, d); } if (b1 < a2 || b2 < a1) sep = true; }
      if (!sep) return o; }
    // la zanja: si una rueda cae dentro, se atasca (cuenta como golpe)
    for (const q of E) if (celdaDe(q[0], q[1]) >= 0) return { zanja: true };
    return null; };
  // punta de la canaleta en planta: pivote trasero + giro de la canaleta
  const LC = 2.75;
  const punta = () => { const c = Math.cos(st.a), s = Math.sin(st.a), px = st.x + c * -3.95, pz = st.z + s * -3.95, ag = st.a + Math.PI + st.ang; return [px + Math.cos(ag) * LC, pz + Math.sin(ag) * LC]; };
  S.punta = punta;

  function paso(dt){
    if (!S.empezado || S.fin) return;
    st.t += dt; const K = S.teclas, B = S.bot;
    let jx = S.joy.x, jy = S.joy.y;
    if (K.has('a') || K.has('arrowleft')) jx = -1; if (K.has('d') || K.has('arrowright')) jx = 1; if (K.has('w') || K.has('arrowup')) jy = -1; if (K.has('s') || K.has('arrowdown')) jy = 1;
    // el joystick va "hacia donde mira la cámara": si miras hacia atrás, arriba es marcha atrás
    const cd = new THREE.Vector3(); camera.getWorldDirection(cd); const sc = cd.x * Math.cos(st.a) + cd.z * Math.sin(st.a) >= 0 ? 1 : -1;
    const objetivo = -jy * sc * (sc * -jy > 0 ? 4.5 : 2.4);
    st.v += Math.max(-4 * dt, Math.min(4 * dt, objetivo - st.v)); if (Math.abs(jy) < .05) st.v *= Math.max(0, 1 - dt * 3);
    // dirección: con la cámara mirando hacia donde se mueve, joystick a la derecha = el camión va hacia la derecha de la pantalla
    st.dir += (jx * .55 * (st.v >= 0 ? 1 : -1) - st.dir) * Math.min(1, dt * 4);
    const nx = st.x + Math.cos(st.a) * st.v * dt, nz = st.z + Math.sin(st.a) * st.v * dt, na = st.a + st.v / batalla * Math.tan(st.dir) * dt;
    const o = choca(nx, nz, na);
    if (o){ if (Math.abs(st.v) > .6 && st.t - (st.ultG || -9) > .8){ st.golpes++; st.ultG = st.t; aviso(o.zanja ? '¡Cuidado, la rueda se mete en la zanja!' : '¡Golpe!'); S.sacudida = .25; ton(70, .3); } st.v *= -.2; }
    else { st.x = nx; st.z = nz; st.a = na; }
    // canaleta: gira ±80°
    if (B.izq || K.has('q')) st.ang = Math.min(1.4, st.ang + dt * .9); if (B.der || K.has('e')) st.ang = Math.max(-1.4, st.ang - dt * .9);
    // descarga: solo con el camión casi parado
    const desc = (B.desc || K.has(' ')) && st.cuba > 0;
    st.desc = desc && Math.abs(st.v) < .5;
    if (desc && !st.desc && !st.avisoV){ st.avisoV = true; aviso('Para el camión para descargar'); setTimeout(() => st.avisoV = false, 1500); }
    if (st.desc){ const q = Math.min(st.cuba, st.cap / 40 * dt); st.cuba -= q; st.vertido += q; const [px, pz] = punta();
      for (let k = 0; k < 2; k++){ const i = ng; ng = (ng + 1) % NP; gp[i * 3] = px + (Math.random() - .5) * .12; gp[i * 3 + 1] = .95; gp[i * 3 + 2] = pz + (Math.random() - .5) * .12;
        const ag = st.a + Math.PI + st.ang; gv[i * 3] = Math.cos(ag) * .9 + (Math.random() - .5) * .3; gv[i * 3 + 1] = -.5; gv[i * 3 + 2] = Math.sin(ag) * .9 + (Math.random() - .5) * .3; gvol[i] = q / 2; gviva[i] = 1; } }
    for (let i = 0; i < NP; i++){ if (!gviva[i]) continue; gv[i * 3 + 1] -= 9.8 * dt; gp[i * 3] += gv[i * 3] * dt; gp[i * 3 + 1] += gv[i * 3 + 1] * dt; gp[i * 3 + 2] += gv[i * 3 + 2] * dt;
      const k = celdaDe(gp[i * 3], gp[i * 3 + 2]), suelo = k >= 0 ? -prof + st.lv[k] : 0;
      if (gp[i * 3 + 1] <= suelo){ gviva[i] = 0; gotas.setMatrixAt(i, M0); const v = gvol[i];
        if (k >= 0){ const c = C[k], area = c.sx * c.sz, capC = area * prof, antes = st.lv[k] * area; let entra = v; if (antes + v > capC){ entra = Math.max(0, capC - antes); derramar(gp[i * 3] + (Math.random() - .5) * .4, gp[i * 3 + 2] + (Math.random() < .5 ? -1 : 1) * (c.sz / 2 + .2), v - entra); }
          st.lv[k] += entra / area; st.dentro += entra; }
        else { derramar(gp[i * 3], gp[i * 3 + 2], v); if (Math.random() < .06) aviso('¡Fuera de la zanja!'); } } }
    // el hormigón se reparte un poco entre tramos vecinos de la zanja
    for (let i = 0; i < C.length - 1; i++){ if (i === nRecto - 1 && nL) continue; const d = (st.lv[i] - st.lv[i + 1]) * Math.min(.1, dt * 1.2); st.lv[i] -= d; st.lv[i + 1] += d; }
    if (nL){ const a = nRecto - 1, b = nRecto, d = (st.lv[a] - st.lv[b]) * Math.min(.1, dt * 1.2); st.lv[a] -= d; st.lv[b] += d; }
    if (S.audio){ S.audio.motor.frequency.value = 36 + Math.abs(st.v) * 6 + (st.desc ? 8 : 0); }
    if (st.v < -.2 && S.audio && st.t - (st.ultBip || 0) > .7){ st.ultBip = st.t; ton(1050, .18, .06); }      // pitido de marcha atrás
    if (st.cuba <= 0 && !st.vacia){ st.vacia = true; aviso('Cuba vacía'); setTimeout(() => terminar(), 1600); }
    if (st.t >= st.tiempo) terminar();
  }
  function lleno(){ let s = 0; for (let i = 0; i < C.length; i++) s += Math.min(1, st.lv[i] / prof); return s / C.length; }
  S.lleno = lleno;
  function dibujar(dt){
    const g = T.g; g.position.set(st.x, 0, st.z); g.rotation.y = -st.a;
    T.piv.rotation.y = -st.ang; T.cuba.rotation.x += dt * (st.desc ? -3 : .8);
    for (const r of T.ruedas) r.rotation.y += st.v * dt / .55;
    T.luzAtras.material.emissive.set(st.v < -.1 ? 0xffffff : 0x000000);
    for (let i = 0; i < C.length; i++){ const h = st.lv[i], m = C[i].m; m.visible = h > .005; m.scale.y = Math.max(.001, h); m.position.y = -prof + h / 2; }
    for (let i = 0; i < NP; i++){ if (!gviva[i]) continue; o3.position.set(gp[i * 3], gp[i * 3 + 1], gp[i * 3 + 2]); o3.scale.setScalar(.09); o3.updateMatrix(); gotas.setMatrixAt(i, o3.matrix); }
    gotas.instanceMatrix.needsUpdate = true;
    derr.count = derrames.length; derrames.forEach((d, i) => { o3.position.set(d.x, .02, d.z); o3.scale.set(d.r, .03, d.r * .85); o3.updateMatrix(); derr.setMatrixAt(i, o3.matrix); }); derr.instanceMatrix.needsUpdate = true;
    // el obrero mira a la punta de la canaleta y hace señas
    const [px, pz] = punta(), tt = performance.now() / 1000; obrero.rotation.y = Math.atan2(px - obrero.position.x, pz - obrero.position.z);
    brazoO.rotation.x = -2 + Math.sin(tt * 4) * .5;
    marca.position.set(px, (celdaDe(px, pz) >= 0 ? -prof + st.lv[celdaDe(px, pz)] : 0) + .03, pz); marca.material.color.setHex(celdaDe(px, pz) >= 0 ? 0x5fff7a : 0xff4a3a);
    // cámara: 0 detrás (sobre la cabina, mirando la canaleta), 1 desde arriba, 2 junto a la canaleta
    const c = Math.cos(st.a), s = Math.sin(st.a), vista = S.vista || 0; S.yaw = S.yaw || 0; S.pitch = S.pitch || 0; S.zoom = S.zoom || 1;
    const tgt = vista === 0 ? new THREE.Vector3(st.x - c * 6.2, .3, st.z - s * 6.2) : new THREE.Vector3(px, 0, pz);
    const baseYaw = Math.atan2(c, s) + (vista === 2 ? Math.PI * .5 : 0), d0 = vista === 0 ? 13 : vista === 1 ? 9 : 5.2, p0 = vista === 0 ? 1.0 : vista === 1 ? 1.35 : .45;
    const yy = baseYaw + S.yaw, pp = Math.max(.1, Math.min(1.5, p0 + S.pitch)), dd = d0 * S.zoom;
    const cp = tgt.clone().add(new THREE.Vector3(Math.cos(pp) * Math.sin(yy), Math.sin(pp), Math.cos(pp) * Math.cos(yy)).multiplyScalar(dd));
    S.sacudida = Math.max(0, (S.sacudida || 0) - dt); const sk = S.sacudida * Math.sin(tt * 55) * .4;
    S.camP = S.camP ? S.camP.lerp(cp, Math.min(1, dt * 4)) : cp; S.camT = S.camT ? S.camT.lerp(tgt, Math.min(1, dt * 5)) : tgt.clone();
    camera.position.set(S.camP.x, Math.max(.6, S.camP.y) + sk, S.camP.z); camera.lookAt(S.camT);
    if (S.empezado && !S.fin) hud();
    renderer.render(scene, camera);
  }
  const marca = new THREE.Mesh(new THREE.RingGeometry(.12, .2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5fff7a, depthTest: false, transparent: true })); marca.renderOrder = 5; scene.add(marca);
  function hud(){
    $('cnT').textContent = `⏱ ${Math.max(0, Math.ceil(st.tiempo - st.t))} s`; $('cnT').classList.toggle('mal', st.tiempo - st.t < 10);
    $('cnBarra').firstChild.style.width = Math.round(lleno() * 100) + '%';
    const der = st.vertido > 0 ? st.derramado / st.vertido : 0; $('cnDer').textContent = `💦 Derramado ${Math.round(der * 100)} %`; $('cnDer').classList.toggle('mal', der > .12);
    $('cnCuba').textContent = `🚛 Cuba ${Math.round(st.cuba / st.cap * 100)} %`;
    const [px, pz] = punta(), k = celdaDe(px, pz), info = $('cnInfo');
    if (k >= 0){ info.textContent = st.lv[k] >= prof * .97 ? 'Este tramo ya está lleno: mueve la canaleta' : '✅ Canaleta sobre la zanja: ¡descarga!'; info.className = 'chip ok'; }
    else { let dm = 99; for (const c of C) dm = Math.min(dm, Math.hypot(px - c.x, pz - c.z)); info.textContent = dm < 4 ? `La zanja está a ${dm.toFixed(1)} m de la canaleta` : 'Acerca la canaleta a la zanja'; info.className = 'chip'; }
  }
  S.paso = paso; S.dibujar = dibujar;
  let tPrev = performance.now();
  function cuadro(){ if (!S) return; S.raf = requestAnimationFrame(cuadro); const ahora = performance.now(), dtR = Math.min(.2, (ahora - tPrev) / 1000); tPrev = ahora;
    const n = Math.max(1, Math.ceil(dtR / .02)); for (let k = 0; k < n; k++) paso(dtR / n); dibujar(dtR); }
  cuadro();
}

function motor(){
  try { const ac = new (window.AudioContext || window.webkitAudioContext)(), o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 38; f.type = 'lowpass'; f.frequency.value = 240; g.gain.value = .04; o.connect(f).connect(g).connect(ac.destination); o.start(); S.audio = { ac, motor: o }; } catch (e) { S.audio = null; }
}
function ton(fr, dur, vol = .18){ const A = S && S.audio; if (!A) return;
  try { const o = A.ac.createOscillator(), g = A.ac.createGain(); o.frequency.setValueAtTime(fr, A.ac.currentTime); if (fr < 500) o.frequency.exponentialRampToValueAtTime(fr * .5, A.ac.currentTime + dur);
    g.gain.setValueAtTime(vol, A.ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, A.ac.currentTime + dur); o.connect(g).connect(A.ac.destination); o.start(); o.stop(A.ac.currentTime + dur + .02); } catch (e) {} }

function terminar(){
  if (!S || S.fin) return; S.fin = true; const st = S.st, ll = S.lleno(), der = st.vertido > 0 ? st.derramado / st.vertido : 0;
  const nota = st.vertido < st.cap * .08 ? 'nada' : ll >= .85 && der <= .1 && st.golpes === 0 ? 'perfecto' : ll >= .6 && der <= .25 && st.golpes <= 1 ? 'bien' : 'mal';
  const pts = Math.max(0, Math.round(ll * 1000 * (1 - Math.min(1, der * 1.6)) - st.golpes * 120 + (ll > .85 ? Math.max(0, st.tiempo - st.t) * 4 : 0)));
  const estrellas = nota === 'perfecto' ? 3 : nota === 'bien' ? 2 : nota === 'mal' && ll > .4 ? 1 : 0;
  let rec = null; try { const R0 = JSON.parse(localStorage.getItem('horinsa-records') || '{}'), k = 'canaleta-' + S.dif; rec = { antes: R0[k] || 0 }; if (pts > rec.antes && nota !== 'nada'){ R0[k] = pts; rec.nuevo = true; localStorage.setItem('horinsa-records', JSON.stringify(R0)); } } catch (e) {}
  const r = { nota, lleno: ll, derrame: der, golpes: st.golpes, vertido: st.vertido, modo: 'canaleta', pts, estrellas };
  let resumen = ''; try { resumen = S.op.alTerminar ? (S.op.alTerminar(r) || '') : ''; } catch (e) { console.error(e); }
  const cara = nota === 'perfecto' ? '🏆' : nota === 'bien' ? '👍' : nota === 'nada' ? '🤷' : '😬';
  const tit = nota === 'perfecto' ? '¡Zanja perfecta!' : nota === 'bien' ? 'Buena descarga' : nota === 'nada' ? 'Le devuelves el camión al chófer' : 'Ha salido regular…';
  S.capa.insertAdjacentHTML('beforeend', `<div id="cnPanel"><div class="caja"><div class="nota">${cara}</div><h3 style="text-align:center">${tit}</h3>
    <table class="tab"><tr><td>Zanja llena</td><td>${Math.round(ll * 100)} %</td></tr><tr><td>Hormigón derramado</td><td>${Math.round(der * 100)} %</td></tr><tr><td>Golpes</td><td>${st.golpes}</td></tr><tr><td>Puntos</td><td>${pts}</td></tr>${rec ? `<tr><td>Récord en este nivel</td><td>${rec.nuevo ? '🏅 ¡Nuevo récord!' : rec.antes}</td></tr>` : ''}</table>
    <div style="text-align:center;font-size:30px;letter-spacing:4px;margin-top:6px">${'★'.repeat(estrellas)}<span style="opacity:.25">${'★'.repeat(3 - estrellas)}</span></div>
    ${resumen ? `<p>${resumen}</p>` : ''}<button id="cnVolver">Volver a la planta</button></div></div>`);
  S.capa.querySelector('#cnVolver').onclick = () => { const res = S.res; cerrar(); res(r); };
}
function cerrar(){
  if (!S){ window.MINIJUEGO = false; return; }
  cancelAnimationFrame(S.raf); removeEventListener('keydown', S.kd); removeEventListener('keyup', S.ku); removeEventListener('resize', S.rs);
  try { if (S.audio){ S.audio.motor.stop(); S.audio.ac.close(); } } catch (e) {}
  S.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) for (const m of [].concat(o.material)){ if (m.map) m.map.dispose(); m.dispose(); } });
  S.renderer.dispose(); try { S.renderer.forceContextLoss(); } catch (e) {}
  S.capa.remove(); S = null; window.MINIJUEGO = false;
}
function esc(t){ return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
