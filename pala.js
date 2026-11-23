// =====================================================================
//  HORINSA · Minijuego de la pala cargadora (1 minuto)
//  Conduces la pala del patio: cargas el cazo en los acopios (arena, grava,
//  gravilla), subes el brazo y lo vuelcas en la tolva que toca. Sin mezclar
//  materiales y sin correr con el cazo arriba (vuelca).
//  window.abrirPala({ dif, palista, alTerminar }) → Promise
// =====================================================================
import * as THREE from 'three';

const CSS = `
#plCapa{position:fixed;inset:0;z-index:200;background:#000;touch-action:none;user-select:none;-webkit-user-select:none;font-family:system-ui,sans-serif;color:#fff}
#plCapa canvas{display:block;width:100%;height:100%}
#plHud{position:absolute;left:0;right:0;top:0;padding:10px 12px;display:flex;flex-direction:column;gap:6px;pointer-events:none;background:linear-gradient(#000b,#0000)}
#plHud .fila{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#plHud .tit{font-weight:800;font-size:15px;text-shadow:0 1px 3px #000}
#plHud .chip{background:#000a;border:1px solid #fff3;border-radius:7px;padding:3px 8px;font-size:12.5px;font-weight:700}
#plHud .chip.mal{border-color:#ff5a4f;color:#ffb3ad}
#plTolvas{display:flex;gap:6px;flex-wrap:wrap}
#plTolvas .tv{background:#000a;border:1px solid #fff3;border-radius:7px;padding:3px 6px;font-size:11.5px;font-weight:700;min-width:84px}
#plTolvas .tv .b{height:7px;border-radius:3px;background:#ffffff26;overflow:hidden;margin-top:3px;position:relative}
#plTolvas .tv .b i{position:absolute;left:0;top:0;bottom:0}
#plTolvas .tv.ok{border-color:#3fae5a}
#plJoy{position:absolute;left:22px;bottom:26px;width:138px;height:138px;border-radius:50%;background:radial-gradient(circle at 50% 45%,#3a3f45,#1d2024);border:5px solid #f2b705;box-shadow:0 6px 18px #000a,inset 0 0 18px #000;touch-action:none}
#plJoy i{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#5b636b,#23272b);border:2px solid #111}
#plJoy span{position:absolute;left:0;right:0;top:-22px;text-align:center;font-size:11px;font-weight:800;color:#f2b705;text-shadow:0 1px 2px #000}
#plBots{position:absolute;right:16px;bottom:22px;display:grid;grid-template-columns:repeat(2,74px);gap:10px}
#plBots button{line-height:1.15;height:64px;border-radius:14px;border:4px solid #f2b705;background:radial-gradient(circle at 45% 40%,#4b525a,#1f2327);color:#fff;font-weight:900;font-size:13px;touch-action:none;box-shadow:0 4px 12px #000a}
#plBots button.on{background:radial-gradient(circle at 45% 40%,#7dff8a,#178a2c)}
#plBots #plVolcar{grid-column:span 2;background:radial-gradient(circle at 45% 40%,#ff6b5a,#b3160f)}
#plPaso{position:absolute;left:50%;transform:translateX(-50%);top:150px;background:#000c;border:2px solid #f2b705;border-radius:10px;padding:6px 12px;font-weight:800;font-size:14px;max-width:calc(100% - 32px);text-align:center;pointer-events:none}
#plCam{position:absolute;right:12px;top:100px;display:flex;flex-direction:column;gap:6px}#plCam button{background:#000b;border:1px solid #fff4;color:#fff;border-radius:8px;padding:6px 10px;font-weight:700;font-size:14px;touch-action:none}
#plFin{position:absolute;right:16px;top:64px;background:#000b;border:1px solid #fff4;color:#fff;border-radius:8px;padding:6px 10px;font-weight:700;font-size:12.5px}
#plPanel{position:absolute;inset:0;display:grid;place-items:center;background:#0009}
#plPanel .caja{width:min(440px,calc(100% - 32px));background:#151a21;border:1px solid #33404d;border-radius:14px;padding:18px;box-shadow:0 20px 50px #000c}
#plPanel h3{margin:0 0 8px;font-size:19px}#plPanel p{margin:6px 0;font-size:14px;line-height:1.45;color:#d6dde4}
#plPanel button{margin-top:12px;width:100%;border:0;border-radius:9px;padding:12px;font-weight:800;font-size:15px;background:#d2201f;color:#fff;cursor:pointer}
#plPanel .nota{font-size:40px;text-align:center;margin:4px 0}
#plPanel .tab{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px}#plPanel .tab td{padding:3px 0;border-bottom:1px solid #26303a}#plPanel .tab td:last-child{text-align:right;font-weight:700}
#plAviso{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);font-size:22px;font-weight:900;color:#ffd84a;text-shadow:0 2px 6px #000;pointer-events:none;opacity:0;transition:opacity .3s;text-align:center}
@media (max-width:600px){#plJoy{width:118px;height:118px;left:12px}#plBots{grid-template-columns:repeat(2,62px);right:10px}#plBots button{height:56px;font-size:12px}}
`;
const MAT = {
  arena:    { n: 'Arena 0/4',      c: 0xd9c6a1, css: '#d9c6a1' },
  grava:    { n: 'Grava 12/20',    c: 0x8d8882, css: '#9a958e' },
  gravilla: { n: 'Gravilla 4/12',  c: 0xbdb3a2, css: '#bdb3a2' }
};
const CAZO = 2.5;           // toneladas por cazo
let S = null;

window.abrirPala = function (op) {
  return new Promise(res => { try { iniciar(op || {}, res); } catch (e) { console.error(e); cerrar(); res(null); } });
};

function lienzo(w, h, fn, rep){ const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
const ruido = (g, w, h, base, v, n, tam = 2) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++){ const q = (Math.random() - .5) * v; g.fillStyle = `rgba(${q > 0 ? '255,255,255' : '0,0,0'},${Math.abs(q)})`; const s = Math.random() * tam + .5; g.fillRect(Math.random() * w, Math.random() * h, s, s); } };
const std = (color, ex) => new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: .1, ...(ex || {}) });
function caja(par, w, h, d, m, x, y, z){ const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; par.add(o); return o; }
function cil(par, r1, r2, h, m, x, y, z, seg = 14){ const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; par.add(o); return o; }

// montón irregular (se va comiendo con cada cazo)
function monton(par, r, h, color, x, z, sem){
  const geo = new THREE.ConeGeometry(r, h, 30, 6); geo.translate(0, h / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++){ const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), a = Math.atan2(vz, vx), t = vy / h;
    const k = 1 + .08 * Math.sin(a * 3 + sem) + .05 * Math.sin(a * 7 + sem * 2) + (t < .1 ? .06 : 0); p.setXYZ(i, vx * k, t > .8 ? h * (.8 + (t - .8) * .5) : vy, vz * k); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, std(color, { roughness: 1, flatShading: true })); m.position.set(x, 0, z); m.castShadow = m.receiveShadow = true; par.add(m); return m;
}

function palaCargadora(par){
  const g = new THREE.Group(); par.add(g);
  const am = std(0xf2b705, { roughness: .45, metalness: .25 }), ng = std(0x1a1a1a, { roughness: .8 }), gr = std(0x3d4246, { metalness: .5, roughness: .5 });
  // chasis trasero (motor) y delantero, articulados
  caja(g, 2.4, 1.5, 2.3, am, -1.5, 1.6, 0); caja(g, 1.0, .9, 2.0, am, -2.9, 1.5, 0);              // motor y contrapeso
  caja(g, 2.1, 1.0, 2.0, am, 1.0, 1.4, 0);                                                           // bastidor delantero
  const cab = new THREE.Group(); cab.position.set(-.5, 2.35, 0); g.add(cab);
  caja(cab, 1.9, .15, 1.9, am, 0, 1.75, 0);                                                          // techo ROPS
  for (const [x, z] of [[-.9, -.9], [.9, -.9], [-.9, .9], [.9, .9]]) caja(cab, .1, 1.7, .1, ng, x, .85, z);
  const cr = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.8), std(0x2f4f66, { roughness: .05, metalness: .6, transparent: true, opacity: .45 })); cr.position.set(0, .8, 0); cab.add(cr);
  const op = new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 8), std(0xc89a7a)); op.position.set(-.1, 1.15, 0); cab.add(op);
  const cs = new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffffff)); cs.position.set(-.1, 1.22, 0); cab.add(cs);
  caja(cab, .3, .5, .35, std(0xff7a1a), -.1, .78, 0);
  cil(g, .12, .12, 1.3, ng, -2.6, 2.9, .6, 8);                                                       // escape
  const baliza = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff9a00, emissive: 0xff7a00, emissiveIntensity: 1 })); baliza.position.set(-.5, 4.25, 0); g.add(baliza);
  // ruedas grandes con taco
  const ruedas = [];
  for (const [x, z] of [[-1.8, 1.25], [-1.8, -1.25], [1.3, 1.25], [1.3, -1.25]]){ const r = new THREE.Group(); r.position.set(x, .85, z); g.add(r); ruedas.push(r);
    const n = cil(r, .85, .85, .7, ng, 0, 0, 0, 18); n.rotation.x = Math.PI / 2; const l = cil(r, .45, .45, .72, am, 0, 0, 0, 10); l.rotation.x = Math.PI / 2;
    for (let k = 0; k < 8; k++){ const t = caja(r, .18, .2, .72, ng, 0, 0, 0); const a = k / 8 * Math.PI * 2; t.position.set(Math.cos(a) * .84, Math.sin(a) * .84, 0); t.rotation.z = a; } }
  // brazo (pivota en el bastidor delantero) y cazo (bascula al final del brazo)
  const brazo = new THREE.Group(); brazo.position.set(1.4, 2.0, 0); g.add(brazo);
  for (const z of [-.75, .75]) caja(brazo, 3.2, .38, .3, am, 1.6, 0, z);
  cil(brazo, .1, .1, 1.8, gr, .8, -.3, 0, 8).rotation.x = Math.PI / 2;
  const cazo = new THREE.Group(); cazo.position.set(3.2, 0, 0); brazo.add(cazo);
  const cm = std(0x5a5f64, { metalness: .4, roughness: .55 });
  caja(cazo, .12, 1.0, 2.5, cm, .1, -.35, 0); caja(cazo, 1.1, .12, 2.5, cm, .6, -.85, 0); caja(cazo, .9, .9, .1, cm, .5, -.4, 1.2); caja(cazo, .9, .9, .1, cm, .5, -.4, -1.2);
  for (let k = -5; k <= 5; k++) caja(cazo, .2, .06, .1, gr, 1.18, -.86, k * .22);                  // dientes
  const carga = new THREE.Mesh(new THREE.SphereGeometry(.7, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), std(0xbdb3a2, { roughness: 1, flatShading: true }));
  carga.scale.set(.75, .6, 1.7); carga.position.set(.55, -.8, 0); carga.visible = false; cazo.add(carga);
  return { g, brazo, cazo, carga, ruedas, baliza };
}

function iniciar(op, res){
  if (!document.getElementById('plCss')){ const st = document.createElement('style'); st.id = 'plCss'; st.textContent = CSS; document.head.appendChild(st); }
  const dif = Math.max(1, Math.min(3, op.dif || 1));
  const capa = document.createElement('div'); capa.id = 'plCapa'; document.body.appendChild(capa); window.MINIJUEGO = true;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
  capa.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xe9dcc6, 70, 380);
  const fovDe = a => a >= 1 ? 55 : Math.min(88, 55 * Math.pow(1 / a, .6));
  const camera = new THREE.PerspectiveCamera(fovDe(innerWidth / innerHeight), innerWidth / innerHeight, .1, 1200);
  // cielo
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = max(vP.y, 0.0); vec3 c = mix(vec3(.93,.86,.74), vec3(.30,.55,.86), pow(h,.55)); c += vec3(1.,.95,.8)*pow(max(dot(vP, normalize(vec3(.5,.55,-.6))),0.0),300.0)*1.5; gl_FragColor = vec4(c,1.0); }' })));
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6b5a48, .8));
  const sol = new THREE.DirectionalLight(0xfff1dc, 2.4); sol.position.set(25, 35, -15); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 100 }); sol.shadow.bias = -.0004; sol.shadow.normalBias = .02; scene.add(sol, sol.target);

  // ---- patio de la planta ----
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: lienzo(256, 256, (g, w, h) => ruido(g, w, h, '#3b3330', .35, 9000, 2.5), [60, 60]), roughness: 1 }));
  suelo.rotation.x = -Math.PI / 2; suelo.position.y = -.02; suelo.receiveShadow = true; scene.add(suelo);
  const solera = new THREE.Mesh(new THREE.PlaneGeometry(56, 44), new THREE.MeshStandardMaterial({ map: lienzo(512, 512, (g, w, h) => { ruido(g, w, h, '#9d978d', .16, 22000, 2);
      g.strokeStyle = 'rgba(60,56,52,.45)'; g.lineWidth = 1.2; for (let i = 0; i <= 8; i++){ g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 8); g.lineTo(w, i * h / 8); g.stroke(); }
      for (let i = 0; i < 900; i++){ g.fillStyle = `rgba(${Math.random() < .5 ? '120,110,100' : '215,200,165'},.5)`; g.fillRect(Math.random() * w * .45, Math.random() * h, 2, 2); }
      g.strokeStyle = 'rgba(55,50,46,.16)'; g.lineWidth = 7; for (let k = 0; k < 6; k++){ g.beginPath(); g.moveTo(w * .15, h * (.2 + k * .12)); g.bezierCurveTo(w * .45, h * .5, w * .55, h * .5, w * .85, h * (.25 + k * .1)); g.stroke(); } }), roughness: .95 }));
  solera.rotation.x = -Math.PI / 2; solera.receiveShadow = true; scene.add(solera);
  const bloque = new THREE.MeshStandardMaterial({ map: lienzo(256, 128, (g, w, h) => { ruido(g, w, h, '#b8b4ac', .12, 3000, 2); g.strokeStyle = 'rgba(80,76,70,.5)'; g.lineWidth = 2;
      for (let y = 0; y <= h; y += 32){ g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 32) % 2 ? 32 : 0; x < w; x += 64){ g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } } }, [3, 1]), roughness: .9 });

  // acopios: tres boxes separados por muros, al oeste
  const mats = ['arena', 'gravilla', 'grava'], acopios = [];
  mats.forEach((k, i) => { const z = -12 + i * 12, m = monton(scene, 5.6, 4.4, MAT[k].c, -21, z, i + 1); acopios.push({ k, x: -21, z, r: 5.6, m, t: 0 });
    const et = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: lienzo(256, 64, (g, w, h) => { g.fillStyle = '#0e3a5c'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '800 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(MAT[k].n.toUpperCase(), w / 2, h / 2 + 2); }) }));
    et.position.set(-27.4, 3.4, z); et.rotation.y = Math.PI / 2; scene.add(et); });
  for (const z of [-18, -6, 6, 18]) caja(scene, 5, 3, .6, bloque, -25.5, 1.5, z);              // muros cortos: solo separan el fondo de cada acopio
  caja(scene, .6, 3, 36, bloque, -28, 1.5, 0);

  // tolvas en el este: elevadas, se vuelca con el brazo arriba. Cada una con su material (cartel de color)
  const nT = [2, 3, 4][dif - 1], pide = [7.5, 10, 12.5][dif - 1], tolvas = [];
  const orden = dif === 1 ? ['arena', 'grava'] : dif === 2 ? ['arena', 'gravilla', 'grava'] : ['arena', 'gravilla', 'grava', 'arena'];
  const acero = std(0x4b5560, { metalness: .5, roughness: .5 }), azul = std(0x5f8299, { metalness: .3, roughness: .5 }), rojo = std(0xd2201f, { roughness: .4 });
  const tw = [5.2, 4.6, 4.2][dif - 1];
  for (let i = 0; i < nT; i++){
    const z = (i - (nT - 1) / 2) * 6.6, x = 8;
    for (const [dx, dz] of [[-tw / 2 + .2, -tw / 2 + .2], [tw / 2 - .2, -tw / 2 + .2], [-tw / 2 + .2, tw / 2 - .2], [tw / 2 - .2, tw / 2 - .2]]) caja(scene, .35, 2.4, .35, acero, x + dx, 1.2, z + dz);
    const emb = new THREE.Mesh(new THREE.CylinderGeometry(tw * .72, .6, 1.4, 4, 1, true), azul); emb.rotation.y = Math.PI / 4; emb.position.set(x, 3.1, z); emb.castShadow = true; scene.add(emb);
    const borde = rojo.clone(); for (const [w, d, dx, dz] of [[tw, .2, 0, tw / 2], [tw, .2, 0, -tw / 2], [.2, tw, tw / 2, 0], [.2, tw, -tw / 2, 0]]) caja(scene, w, .45, d, borde, x + dx, 3.95, z + dz);
    const k = orden[i], lleno = new THREE.Mesh(new THREE.BoxGeometry(tw - .3, 1, tw - .3), std(MAT[k].c, { roughness: 1 })); lleno.position.set(x, 2.5, z); lleno.scale.y = .01; scene.add(lleno);
    const et = new THREE.Mesh(new THREE.PlaneGeometry(3.4, .8), new THREE.MeshBasicMaterial({ map: lienzo(256, 64, (g, w, h) => { g.fillStyle = MAT[k].css; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = '800 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${i + 1} · ${MAT[k].n.toUpperCase()}`, w / 2, h / 2 + 2); }), side: THREE.DoubleSide }));
    et.position.set(x - tw / 2 - .12, 4.6, z); et.rotation.y = -Math.PI / 2; scene.add(et);
    // rampa/tope de hormigón delante de la tolva (la pala no puede meterse debajo)
    caja(scene, .8, .7, tw, std(0xb5b3ad, { roughness: .95 }), x - tw / 2 - .7, .35, z);
    tolvas.push({ k, x, z, w: tw, t: 0, mal: 0, lleno, borde, meta: pide / nT * (1 + (k === 'arena' ? .2 : 0)) });
  }
  // cinta colectora bajo las tolvas y torre al fondo (decorado)
  caja(scene, 2, .6, nT * 6.6 + 3, std(0x26292c), 8, .6, 0);
  caja(scene, 9, 13, 9, std(0xeceeef), 20, 6.5, 0); caja(scene, 9.2, 2, 9.2, rojo, 20, 11, 0);
  cil(scene, 3.2, 3.2, 15, std(0xf3f5f6, { metalness: .3, roughness: .5 }), 20, 12, -12, 20);
  for (let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2 + .3, r = 260 + Math.random() * 100, h = 25 + Math.random() * 30;
    const v = new THREE.Mesh(new THREE.ConeGeometry(h * 3.6, h, 16, 1, true), std(0x6b3d2b, { roughness: 1, flatShading: true })); v.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r); scene.add(v); }
  // obstáculos (rectángulos en planta) para chocar
  const obst = [{ x: -28, z: 0, w: .6, d: 36 }, ...[-18, -6, 6, 18].map(z => ({ x: -25.5, z, w: 5, d: .6 })),
    ...tolvas.map(t => ({ x: t.x, z: t.z, w: t.w, d: t.w })), ...tolvas.map(t => ({ x: t.x - t.w / 2 - .7, z: t.z, w: .8, d: t.w })), { x: 20, z: 0, w: 9, d: 9 }, { x: 20, z: -12, w: 6.4, d: 6.4 },
    { x: 0, z: -22.5, w: 56, d: 1 }, { x: 0, z: 22.5, w: 56, d: 1 }, { x: 28.5, z: 0, w: 1, d: 44 }];
  if (dif >= 2) for (const [x, z] of [[-3, -7], [-1, 9]]){ const c = new THREE.Mesh(new THREE.ConeGeometry(.3, .8, 12), std(0xff6a00)); c.position.set(x, .4, z); c.castShadow = true; scene.add(c); obst.push({ x, z, w: .6, d: .6, cono: c }); }
  if (dif === 3){ caja(scene, 5, 2.4, 2.4, std(0xececec), 0, 1.3, -17); obst.push({ x: 0, z: -17, w: 5, d: 2.4 }); }   // hormigonera aparcada

  const P = palaCargadora(scene);
  const st = { x: -6, z: 0, a: Math.PI, v: 0, dir: 0, brazo: 0, cazo: 0, carga: 0, mat: null, t: 0, tiempo: [90, 80, 75][dif - 1], golpes: 0, mezclas: 0, derramado: 0, entregado: 0, vuelco: 0 };
  S = { capa, renderer, scene, camera, res, op, st, fin: false, empezado: false, joy: new THREE.Vector2(), teclas: new Set(), botones: { sub: false, baj: false, vol: false }, raf: 0, tolvas, acopios, obst, P, dif, pide };
  window.__plS = S;

  capa.insertAdjacentHTML('beforeend', `
    <div id="plHud"><div class="fila"><span class="tit">🚜 Pala cargadora · ${['fácil', 'normal', 'difícil'][dif - 1]}</span></div>
      <div class="fila"><span class="chip" id="plT">⏱</span><span class="chip" id="plCazo">🪣 Cazo vacío</span><span class="chip" id="plTot">📦 0 / ${pide} t</span><span class="chip" id="plBr">⬆ Brazo 0 %</span></div>
      <div id="plTolvas">${tolvas.map((t, i) => `<div class="tv" data-i="${i}">${i + 1} · ${MAT[t.k].n}<div class="b"><i style="background:${MAT[t.k].css}"></i></div></div>`).join('')}</div></div>
    <div id="plAviso"></div><button id="plFin">Terminar</button>
    <div id="plJoy"><span>CONDUCIR</span><i></i></div>
    <div id="plBots"><button id="plSub">⬆ SUBIR<br>BRAZO</button><button id="plBaj">⬇ BAJAR<br>BRAZO</button><button id="plVolcar">🪣 VOLCAR PALA</button></div><div id="plPaso"></div>
    <div id="plCam"><button data-cam="izq">⟲</button><button data-cam="der">⟳</button><button data-cam="alto">📷</button></div>
    <div id="plPanel"><div class="caja"><h3>🚜 ¡Coge la pala!</h3>
      <p>${esc(op.palista || 'El palista')} tiene que salir y te deja la pala: hay que llenar las tolvas antes de que se quede sin áridos la planta. Tienes <b>${[90, 80, 75][dif - 1]} segundos</b>.</p>
      <p>🕹️ <b>Joystick</b> (o WASD): adelante, atrás y girar. Métete de frente en el acopio con el <b>brazo abajo</b>: el cazo se llena al tocar el montón.</p>
      <p>⬆ <b>SUBIR BRAZO</b> (R) hasta arriba, acércate de frente a la tolva de <b>ese mismo material</b> (su borde se pone <b style="color:#5fe07a">verde</b>) y pulsa <b>🪣 VOLCAR PALA</b> (espacio). ⬇ <b>BAJAR BRAZO</b> (F) para volver a cargar.</p>
      <p>⚠️ No mezcles materiales, no choques y no gires a toda velocidad con el brazo arriba.</p>
      <button id="plEmpezar">¡Arrancar!</button></div></div>`);
  const $ = id => capa.querySelector('#' + id);
  const joy = $('plJoy'), knob = joy.querySelector('i'); let jid = null;
  const mj = e => { const r = joy.getBoundingClientRect(); let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2); const L = Math.hypot(dx, dy); if (L > 1){ dx /= L; dy /= L; } S.joy.set(dx, dy); knob.style.transform = `translate(${dx * r.width * .32}px,${dy * r.height * .32}px)`; };
  joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(e.pointerId); mj(e); }); joy.addEventListener('pointermove', e => { if (e.pointerId === jid) mj(e); });
  const sj = e => { if (e.pointerId !== jid) return; jid = null; S.joy.set(0, 0); knob.style.transform = ''; }; joy.addEventListener('pointerup', sj); joy.addEventListener('pointercancel', sj);
  for (const [id, k] of [['plSub', 'sub'], ['plBaj', 'baj'], ['plVolcar', 'vol']]){ const b = $(id), on = e => { e.preventDefault(); S.botones[k] = true; b.classList.add('on'); }, off = () => { S.botones[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off); }
  S.kd = e => { const k = e.key.toLowerCase(); S.teclas.add(k); if (k === ' ' || k.startsWith('arrow')) e.preventDefault(); }; S.ku = e => S.teclas.delete(e.key.toLowerCase());
  addEventListener('keydown', S.kd); addEventListener('keyup', S.ku);
  S.rs = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.fov = fovDe(camera.aspect); camera.updateProjectionMatrix(); }; addEventListener('resize', S.rs);
  $('plEmpezar').onclick = () => { $('plPanel').remove(); S.empezado = true; motor(); };
  $('plFin').onclick = () => terminar();
  $('plCam').addEventListener('pointerdown', e => { const b = e.target.closest('[data-cam]'); if (!b) return; e.preventDefault(); const k = b.dataset.cam; if (k === 'izq') S.yaw = (S.yaw || 0) + .4; else if (k === 'der') S.yaw = (S.yaw || 0) - .4; else S.alto = !S.alto; });
  { let arr = null; const cv = renderer.domElement; cv.addEventListener('pointerdown', e => { arr = { id: e.pointerId, x: e.clientX }; }); cv.addEventListener('pointermove', e => { if (arr && e.pointerId === arr.id){ S.yaw = (S.yaw || 0) - (e.clientX - arr.x) * .006; arr.x = e.clientX; } }); const fa = e => { if (arr && e.pointerId === arr.id) arr = null; }; cv.addEventListener('pointerup', fa); cv.addEventListener('pointercancel', fa); }
  const aviso = t => { const a = $('plAviso'); a.textContent = t; a.style.opacity = 1; clearTimeout(S.tav); S.tav = setTimeout(() => a.style.opacity = 0, 1100); };
  S.aviso = aviso;

  // ---- partículas de áridos al cargar/volcar ----
  const NP = 260, piedras = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.12, 0), std(0xffffff, { roughness: 1, flatShading: true }), NP); piedras.frustumCulled = false; piedras.castShadow = true; scene.add(piedras);
  const pp = new Float32Array(NP * 3), pv = new Float32Array(NP * 3), pvida = new Float32Array(NP); let np = 0; const o3 = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < NP; i++){ piedras.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); piedras.setColorAt(i, col.set(0xffffff)); }
  const soltar = (x, y, z, k, n, vy = 0) => { for (let j = 0; j < n; j++){ const i = np; np = (np + 1) % NP; pp[i * 3] = x + (Math.random() - .5) * 1.6; pp[i * 3 + 1] = y; pp[i * 3 + 2] = z + (Math.random() - .5) * 1.6;
    pv[i * 3] = (Math.random() - .5) * 1.5; pv[i * 3 + 1] = vy + Math.random() * 1.5; pv[i * 3 + 2] = (Math.random() - .5) * 1.5; pvida[i] = 1.6; piedras.setColorAt(i, col.set(MAT[k].c)); } piedras.instanceColor.needsUpdate = true; };

  // ---- física ----
  // caja de choque: la máquina (de −3,4 a +2,2 m) y, con el brazo abajo, también el cazo (hasta +5 m). Con el brazo arriba el cazo pasa por encima de los topes.
  const ancho = 2.6, batalla = 3.1;
  const esquinas = (x, z, a) => { const fr = st.brazo < .6 ? 4.4 : 2.2, at = 3.4, hl = (fr + at) / 2, centro = (fr - at) / 2, c = Math.cos(a), s = Math.sin(a), hw = ancho / 2, cx = x + c * centro, cz = z + s * centro;
    return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([u, v]) => [cx + c * u - s * v, cz + s * u + c * v]); };
  const choca = (x, z, a) => { const E = esquinas(x, z, a);
    for (const o of obst){ const R = [[o.x - o.w / 2, o.z - o.d / 2], [o.x + o.w / 2, o.z - o.d / 2], [o.x + o.w / 2, o.z + o.d / 2], [o.x - o.w / 2, o.z + o.d / 2]];
      let sep = false; for (const pol of [E, R]) for (let i = 0; i < 4 && !sep; i++){ const p1 = pol[i], p2 = pol[(i + 1) % 4], nx = p2[1] - p1[1], nz = p1[0] - p2[0];
        let a1 = 1e9, b1 = -1e9, a2 = 1e9, b2 = -1e9; for (const q of E){ const d = q[0] * nx + q[1] * nz; a1 = Math.min(a1, d); b1 = Math.max(b1, d); } for (const q of R){ const d = q[0] * nx + q[1] * nz; a2 = Math.min(a2, d); b2 = Math.max(b2, d); }
        if (b1 < a2 || b2 < a1) sep = true; }
      if (!sep) return o; }
    return null; };
  const angB = () => -.55 + st.brazo * 1.55;
  const puntaCazo = () => { const c = Math.cos(st.a), s = Math.sin(st.a), alc = 1.4 + 3.2 * Math.cos(angB()) + .9; return [st.x + c * alc, st.z + s * alc]; };

  function paso(dt){
    if (!S.empezado || S.fin) return;
    st.t += dt; const T = S.teclas, B = S.botones;
    let jx = S.joy.x, jy = S.joy.y;
    if (T.has('a') || T.has('arrowleft')) jx = -1; if (T.has('d') || T.has('arrowright')) jx = 1; if (T.has('w') || T.has('arrowup')) jy = -1; if (T.has('s') || T.has('arrowdown')) jy = 1;
    const sube = B.sub || T.has('r'), baja = B.baj || T.has('f'), volcar = B.vol || T.has(' ');
    // motor y dirección articulada
    // con el brazo arriba y cargada va más despacio (así no vuelca nunca)
    const objetivo = -jy * (jy < 0 ? 7 : 4.5) * (st.brazo > .5 && st.carga > 0 ? .55 : 1);
    st.v += Math.max(-6 * dt, Math.min(6 * dt, objetivo - st.v)); if (Math.abs(jy) < .05) st.v *= Math.max(0, 1 - dt * 3);
    st.dir += (jx * .6 - st.dir) * Math.min(1, dt * 4);
    const nx = st.x + Math.cos(st.a) * st.v * dt, nz = st.z + Math.sin(st.a) * st.v * dt, na = st.a + st.v / batalla * Math.tan(st.dir) * dt;
    // si ya está metida en algo (p. ej. al bajar el brazo pegada a la tolva) puede salir: solo bloquea lo que empeora
    const ya = choca(st.x, st.z, st.a), o = ya ? null : choca(nx, nz, na);
    if (o){ if (Math.abs(st.v) > 2.2 && st.t - (st.ultGolpe || -9) > .8){ st.golpes++; st.ultGolpe = st.t; aviso('¡Golpe!'); S.sacudida = .25; ton(70, .3); if (o.cono){ o.cono.rotation.z = 1.4; o.cono.position.y = .2; } } st.v *= -.1; }
    else { st.x = nx; st.z = nz; st.a = na; }
    // brazo y cazo
    // VOLCAR también sube el brazo solo: basta con acercarse a la tolva y pulsarlo
    if (sube) st.brazo = Math.min(1, st.brazo + dt * .9); if (baja) st.brazo = Math.max(0, st.brazo - dt * 1.1);
    // al alejarse de las tolvas con el cazo vacío, el brazo baja solo
    st.cazo += ((volcar ? 1 : 0) - st.cazo) * Math.min(1, dt * 6);
    // vuelco: correr o girar fuerte con el cazo arriba y cargado
    const riesgo = st.brazo > .8 && st.carga > 0 && Math.abs(st.v) > 3.5 ? Math.abs(st.v) * Math.abs(st.dir) * 1.2 : 0;
    st.vuelco = Math.max(0, st.vuelco + (riesgo > .9 ? dt * (riesgo - .9) * 2 : -dt * .8));
    if (false && st.vuelco > .5 && !st.avisoV){ st.avisoV = true; aviso('⚠️ ¡Que vuelcas! Baja el brazo o ve más despacio'); setTimeout(() => st.avisoV = false, 1500); }
    if (false && st.vuelco > 2.2){ st.vuelco = 0; st.golpes += 2; st.derramado += st.carga; if (st.mat) soltar(st.x + Math.cos(st.a) * 4, 2, st.z + Math.sin(st.a) * 4, st.mat, 30); st.carga = 0; st.mat = null; st.v = 0; aviso('😱 ¡Casi vuelcas! Se te cae la carga'); S.sacudida = .5; ton(55, .5); }
    // cargar: brazo abajo, de frente contra el acopio
    const [px, pz] = puntaCazo();
    if (st.brazo < .3 && st.cazo < .3 && st.carga < CAZO){
      const empuja = st.v > .05 || S.joy.y < -.2 || S.teclas.has('w') || S.teclas.has('arrowup');
      for (const a of acopios){ const d = Math.hypot(px - a.x, pz - a.z); if (d < a.r * 1.05 && (empuja || st.cargando)){
        if (st.mat && st.mat !== a.k && st.carga > .2){ if (!st.avisoMez){ st.avisoMez = true; aviso('Ya llevas otro material en el cazo'); setTimeout(() => st.avisoMez = false, 1500); } break; }
        st.mat = a.k; st.carga = Math.min(CAZO, st.carga + dt * 3); st.cargando = true; a.t += dt * 3; if (Math.random() < .5) soltar(px, .3, pz, a.k, 1, 1); if (st.carga >= CAZO) ton(120, .12); break; } }
    } else st.cargando = false;
    // volcar
    if (st.cazo > .6 && st.carga > 0 && !(st.brazo < .3 && !tolvas.some(t => Math.abs(px - t.x) < t.w / 2 + 2.1 && Math.abs(pz - t.z) < t.w / 2 + .6))){
      const v = Math.min(st.carga, dt * 6); st.carga -= v;
      let tv = null; for (const t of tolvas) if (Math.abs(px - t.x) < t.w / 2 + 2.1 && Math.abs(pz - t.z) < t.w / 2 + .6) tv = t;
      if (tv && st.brazo > .75){ tv.t += v; if (tv.k !== st.mat){ tv.mal += v; st.mezclas += v; if (!st.avisoMal){ st.avisoMal = true; aviso(`❌ ¡${MAT[st.mat].n} en la tolva de ${MAT[tv.k].n}!`); setTimeout(() => st.avisoMal = false, 1600); } } else st.entregado += v;
        soltar(Math.max(px, tv.x - tv.w / 2 + .6), 4.2, tv.z + (pz - tv.z) * .5, st.mat, 2, -1); }
      else { st.derramado += v; soltar(px, .9 + st.brazo * 3, pz, st.mat, 2, 0); if (!st.avisoDer){ st.avisoDer = true; aviso(tv ? '⬆ Sube el brazo del todo antes de volcar en la tolva' : 'Lo estás tirando al suelo'); setTimeout(() => st.avisoDer = false, 1500); } }
      if (st.carga <= 0){ st.carga = 0; st.mat = null; }
    }
    // partículas
    for (let i = 0; i < NP; i++){ if (pvida[i] <= 0) continue; pvida[i] -= dt; pv[i * 3 + 1] -= 9.8 * dt; pp[i * 3] += pv[i * 3] * dt; pp[i * 3 + 1] += pv[i * 3 + 1] * dt; pp[i * 3 + 2] += pv[i * 3 + 2] * dt;
      if (pp[i * 3 + 1] < .05){ pp[i * 3 + 1] = .05; pv[i * 3] *= .3; pv[i * 3 + 1] = 0; pv[i * 3 + 2] *= .3; } }
    if (S.audio){ S.audio.motor.frequency.value = 38 + Math.abs(st.v) * 7 + (sube ? 10 : 0); }
    if (st.t >= st.tiempo) terminar();
  }
  function dibujar(dt){
    const g = P.g; g.position.set(st.x, 0, st.z); g.rotation.y = -st.a;
    P.brazo.rotation.z = -.55 + st.brazo * 1.55; P.cazo.rotation.z = .55 - st.brazo * 1.55 - st.cazo * 1.5;
    for (const r of P.ruedas) r.rotation.z -= st.v * dt / .85;
    P.ruedas[2].rotation.y = P.ruedas[3].rotation.y = -st.dir * .6;
    P.carga.visible = st.carga > .05; if (st.mat) P.carga.material.color.set(MAT[st.mat].c); P.carga.scale.y = .25 + .45 * st.carga / CAZO;
    P.baliza.material.emissiveIntensity = Math.sin(performance.now() / 90) > 0 ? 2 : .2;
    for (const a of acopios){ const k = Math.max(.55, 1 - a.t / 45); a.m.scale.set(1, k, 1); }
    // el borde de la tolva se ilumina en verde si el cazo está encima de la correcta (rojo si no es su material)
    { const c = Math.cos(st.a), s = Math.sin(st.a), alc = 1.4 + 3.2 * Math.cos(-.55 + st.brazo * 1.55) + .9, px = st.x + c * alc, pz = st.z + s * alc;
      for (const t of tolvas){ const enc = st.carga > 0 && Math.abs(px - t.x) < t.w / 2 + 2.1 && Math.abs(pz - t.z) < t.w / 2 + .6; t.borde.emissive.set(enc ? (t.k === st.mat ? 0x1faa3a : 0xaa1a10) : 0x000000); t.borde.emissiveIntensity = enc ? 1.2 : 0; } }
    for (const t of tolvas){ const f = Math.min(1, t.t / (t.meta * 1.25)); t.lleno.scale.y = Math.max(.01, f * 1.3); t.lleno.position.y = 2.5 + f * .65; }
    for (let i = 0; i < NP; i++){ if (pvida[i] <= 0){ if (pvida[i] > -1){ pvida[i] = -2; piedras.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); } continue; }
      o3.position.set(pp[i * 3], pp[i * 3 + 1], pp[i * 3 + 2]); o3.rotation.set(i, i * 2, 0); o3.scale.setScalar(.8 + (i % 5) * .2); o3.updateMatrix(); piedras.setMatrixAt(i, o3.matrix); }
    piedras.instanceMatrix.needsUpdate = true;
    // cámara de persecución por detrás y por encima, con algo de inercia
    const c = Math.cos(st.a), s = Math.sin(st.a), tt = performance.now() / 1000;
    S.sacudida = Math.max(0, (S.sacudida || 0) - dt); const sk = S.sacudida * Math.sin(tt * 55) * .4;
    // cámara alta y algo de lado para ver el brazo y el cazo; se gira con ⟲ ⟳ o arrastrando
    const yaw = st.a + Math.PI + .55 + (S.yaw || 0), dist = S.alto ? 9 : 12.5, alto = S.alto ? 14 : 8.5;
    const objetivo = new THREE.Vector3(st.x + Math.cos(yaw) * dist, alto + sk, st.z + Math.sin(yaw) * dist);
    S.camP = S.camP ? S.camP.lerp(objetivo, Math.min(1, dt * 3)) : objetivo.clone(); camera.position.copy(S.camP);
    camera.lookAt(st.x + c * 3, 1.6 + st.brazo * 1.5, st.z + s * 3);
    if (S.empezado && !S.fin) hud();
    renderer.render(scene, camera);
  }
  function hud(){
    $('plT').textContent = `⏱ ${Math.max(0, Math.ceil(st.tiempo - st.t))} s`; $('plT').classList.toggle('mal', st.tiempo - st.t < 10);
    $('plCazo').textContent = st.carga > .05 ? `🪣 ${st.carga.toFixed(1)} t de ${MAT[st.mat].n}` : '🪣 Cazo vacío';
    $('plTot').textContent = `📦 ${st.entregado.toFixed(1)} / ${S.pide} t`;
    $('plBr').textContent = `⬆ Brazo ${Math.round(st.brazo * 100)} %`; $('plBr').classList.toggle('mal', st.vuelco > .3);
    // siguiente paso, para que siempre se sepa qué hacer
    { const [px, pz] = puntaCazo(), cerca = tolvas.find(t => Math.abs(px - t.x) < t.w / 2 + 2.1 && Math.abs(pz - t.z) < t.w / 2 + .6), pend = tolvas.filter(t => t.t - t.mal < t.meta);
      let m; if (st.carga <= .05) m = st.brazo > .3 ? '⬇ Baja el brazo y métete en un acopio' : (pend.length ? `1 · Ve al acopio de ${MAT[pend[0].k].n} con el brazo abajo` : '¡Tolvas llenas! Pulsa Terminar');
      else if (st.brazo < .9) m = '2 · ⬆ Sube el brazo del todo';
      else if (!cerca) m = `3 · Acércate de frente a la tolva de ${MAT[st.mat].n}`;
      else m = cerca.k === st.mat ? '4 · 🪣 ¡Pulsa VOLCAR PALA!' : `❌ Esta tolva es de ${MAT[cerca.k].n}`;
      const e = $('plPaso'); if (e.textContent !== m) e.textContent = m; }
    capa.querySelectorAll('#plTolvas .tv').forEach((el, i) => { const t = tolvas[i], f = Math.min(1, (t.t - t.mal) / t.meta); el.querySelector('i').style.width = Math.round(f * 100) + '%'; el.classList.toggle('ok', f >= 1); });
  }
  S.paso = paso; S.dibujar = dibujar;
  let tPrev = performance.now();
  function cuadro(){ if (!S) return; S.raf = requestAnimationFrame(cuadro); const ahora = performance.now(), dtR = Math.min(.2, (ahora - tPrev) / 1000); tPrev = ahora;
    const n = Math.max(1, Math.ceil(dtR / .02)); for (let k = 0; k < n; k++) paso(dtR / n); dibujar(dtR); }
  cuadro();
}

/* ------------------------------ sonido ------------------------------ */
function motor(){
  try { const ac = new (window.AudioContext || window.webkitAudioContext)(), o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 40; f.type = 'lowpass'; f.frequency.value = 260; g.gain.value = .04; o.connect(f).connect(g).connect(ac.destination); o.start(); S.audio = { ac, motor: o }; } catch (e) { S.audio = null; }
}
function ton(fr, dur){ const A = S && S.audio; if (!A) return;
  try { const o = A.ac.createOscillator(), g = A.ac.createGain(); o.frequency.setValueAtTime(fr, A.ac.currentTime); o.frequency.exponentialRampToValueAtTime(fr * .5, A.ac.currentTime + dur);
    g.gain.setValueAtTime(.18, A.ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, A.ac.currentTime + dur); o.connect(g).connect(A.ac.destination); o.start(); o.stop(A.ac.currentTime + dur + .02); } catch (e) {} }

/* ------------------------------ final ------------------------------ */
function terminar(){
  if (!S || S.fin) return; S.fin = true; const st = S.st;
  const tot = S.tolvas.reduce((a, t) => a + Math.min(t.t - t.mal, t.meta), 0), meta = S.tolvas.reduce((a, t) => a + t.meta, 0), f = tot / meta;
  const nota = st.entregado < 1 && st.t < 8 ? 'nada' : f >= .95 && st.mezclas < .3 && st.golpes === 0 ? 'perfecto' : f >= .6 && st.mezclas < 1.5 && st.golpes <= 2 ? 'bien' : 'mal';
  const pts = Math.max(0, Math.round(st.entregado * 60 - st.mezclas * 120 - st.derramado * 25 - st.golpes * 80 + (f >= .95 ? Math.max(0, st.tiempo - st.t) * 8 : 0)));
  const estrellas = nota === 'perfecto' ? 3 : nota === 'bien' ? 2 : nota === 'mal' && f > .3 ? 1 : 0;
  let rec = null; try { const R0 = JSON.parse(localStorage.getItem('horinsa-records') || '{}'), k = 'pala-' + S.dif; rec = { antes: R0[k] || 0 }; if (pts > rec.antes && nota !== 'nada'){ R0[k] = pts; rec.nuevo = true; localStorage.setItem('horinsa-records', JSON.stringify(R0)); } } catch (e) {}
  const r = { nota, lleno: f, entregado: st.entregado, mezclas: st.mezclas, golpes: st.golpes, derramado: st.derramado, pts, estrellas };
  let resumen = ''; try { resumen = S.op.alTerminar ? (S.op.alTerminar(r) || '') : ''; } catch (e) { console.error(e); }
  const cara = nota === 'perfecto' ? '🏆' : nota === 'bien' ? '👍' : nota === 'nada' ? '🤷' : '😬';
  const tit = nota === 'perfecto' ? '¡Tolvas llenas y sin mezclar!' : nota === 'bien' ? 'Buen trabajo con la pala' : nota === 'nada' ? 'Le devuelves la pala al palista' : 'Ha salido regular…';
  S.capa.insertAdjacentHTML('beforeend', `<div id="plPanel"><div class="caja"><div class="nota">${cara}</div><h3 style="text-align:center">${tit}</h3>
    <table class="tab"><tr><td>Áridos en su tolva</td><td>${st.entregado.toFixed(1)} t (${Math.round(Math.min(1, f) * 100)} %)</td></tr><tr><td>Mezclado en tolva equivocada</td><td>${st.mezclas.toFixed(1)} t</td></tr>
    <tr><td>Tirado al suelo</td><td>${st.derramado.toFixed(1)} t</td></tr><tr><td>Golpes</td><td>${st.golpes}</td></tr><tr><td>Puntos</td><td>${pts}</td></tr>${rec ? `<tr><td>Récord en este nivel</td><td>${rec.nuevo ? '🏅 ¡Nuevo récord!' : rec.antes}</td></tr>` : ''}</table>
    <div style="text-align:center;font-size:30px;letter-spacing:4px;margin-top:6px">${'★'.repeat(estrellas)}<span style="opacity:.25">${'★'.repeat(3 - estrellas)}</span></div>
    ${resumen ? `<p>${resumen}</p>` : ''}<button id="plVolver">Volver a la planta</button></div></div>`);
  S.capa.querySelector('#plVolver').onclick = () => { const res = S.res; cerrar(); res(r); };
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
