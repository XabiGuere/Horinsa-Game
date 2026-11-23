// =====================================================================
//  HORINSA · Camiones detallados para los minijuegos (hormigonera y cabina)
//  Medidas en metros, el camión mira hacia +x y las ruedas apoyan en y = 0.
// =====================================================================
import * as THREE from 'three';

const ROJO = 0xd2201f;
const cache = {};
function lienzo(w, h, fn, rep){ const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
const std = (color, ex) => new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .15, ...(ex || {}) });
function M(){
  if (cache.m) return cache.m;
  const m = {
    rojo: std(ROJO, { roughness: .32, metalness: .35 }),
    blanco: std(0xf2f2f0, { roughness: .35, metalness: .2 }),
    negro: std(0x232527, { roughness: .6, metalness: .1 }),
    gris: std(0x8a9096, { roughness: .5, metalness: .25 }),
    cromo: std(0xe4e8eb, { roughness: .25, metalness: .55 }),
    cristal: new THREE.MeshPhysicalMaterial({ color: 0x1b2f3d, roughness: .04, metalness: .3, transmission: 0, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1 }),
    goma: std(0x111111, { roughness: .9, metalness: 0 }),
    amarillo: std(0xf2b705, { roughness: .4, metalness: .3 }),
    naranja: new THREE.MeshStandardMaterial({ color: 0xff9a00, emissive: 0xff7a00, emissiveIntensity: .6, roughness: .3 }),
    faro: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: .9, roughness: .1, metalness: .5 }),
    piloto: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xaa0a00, emissiveIntensity: .6, roughness: .2 })
  };
  // dibujo del neumático
  m.rueda = new THREE.MeshStandardMaterial({ roughness: .9, map: lienzo(256, 32, (g, w, h) => { g.fillStyle = '#151515'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2a2a';
    for (let x = 0; x < w; x += 16){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, h / 2); g.lineTo(x, h); g.lineTo(x + 6, h); g.lineTo(x + 14, h / 2); g.lineTo(x + 6, 0); g.fill(); } }, [6, 1]) });
  // cuba: espiral roja y blanca con algo de suciedad de hormigón
  m.cuba = new THREE.MeshStandardMaterial({ roughness: .38, metalness: .25, map: lienzo(512, 256, (g, w, h) => { g.fillStyle = '#efefec'; g.fillRect(0, 0, w, h); g.fillStyle = '#d2201f';
    for (let i = -2; i < 6; i++){ g.beginPath(); g.moveTo(i * 128, h); g.lineTo(i * 128 + 64, h); g.lineTo(i * 128 + 64 + 180, 0); g.lineTo(i * 128 + 180, 0); g.fill(); }
    for (let i = 0; i < 260; i++){ g.fillStyle = `rgba(150,150,145,${Math.random() * .25})`; g.beginPath(); g.ellipse(Math.random() * w, h * (.6 + Math.random() * .4), 2 + Math.random() * 10, 1 + Math.random() * 4, 0, 0, 7); g.fill(); } }) });
  m.logo = new THREE.MeshStandardMaterial({ roughness: .4, transparent: true, map: lienzo(128, 128, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(8, 8, w - 16, h - 16); g.fillStyle = '#d2201f'; g.font = '900 92px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w / 2, h / 2 + 6); }) });
  m.rejilla = new THREE.MeshStandardMaterial({ roughness: .5, metalness: .6, map: lienzo(128, 64, (g, w, h) => { g.fillStyle = '#121314'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a3e42'; for (let y = 4; y < h; y += 9) g.fillRect(4, y, w - 8, 4); }) });
  return cache.m = m;
}
function caja(par, w, h, d, m, x, y, z){ const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; par.add(o); return o; }
function cil(par, r1, r2, h, m, x, y, z, seg = 20){ const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; par.add(o); return o; }

// Rueda con neumático de tacos, llanta y tuercas (eje a lo largo de z)
export function rueda(par, x, z, r = .55, ancho = .42, doble = false){
  const m = M(), g = new THREE.Group(); g.position.set(x, r, z); par.add(g);
  const n = new THREE.Mesh(new THREE.CylinderGeometry(r, r, ancho, 28, 1), [m.rueda, m.goma, m.goma]); n.rotation.x = Math.PI / 2; n.castShadow = true; g.add(n);
  const ll = cil(g, r * .58, r * .58, ancho + .02, m.gris, 0, 0, 0, 20); ll.rotation.x = Math.PI / 2;
  const cu = cil(g, r * .22, r * .22, ancho + .06, m.cromo, 0, 0, 0, 12); cu.rotation.x = Math.PI / 2;
  for (let k = 0; k < 8; k++){ const a = k / 8 * Math.PI * 2, t = cil(g, .03, .03, ancho + .08, m.cromo, Math.cos(a) * r * .36, Math.sin(a) * r * .36, 0, 6); t.rotation.x = Math.PI / 2; }
  if (doble){ const n2 = n.clone(); n2.position.z = z > 0 ? -ancho - .04 : ancho + .04; g.add(n2); }
  return g;
}

// Cabina de camión de obra (estilo Arocs / FMX): esquinas redondeadas, parabrisas inclinado, rejilla, faros, espejos y balizas
export function cabina(par, x0, color = ROJO){
  const m = M(), g = new THREE.Group(); g.position.x = x0; par.add(g);
  const pint = color === ROJO ? m.rojo : std(color, { roughness: .32, metalness: .35 });
  // perfil lateral (x adelante, y arriba) extruido a lo ancho, con bisel
  const s = new THREE.Shape(); s.moveTo(-1.05, 1.05); s.lineTo(1.0, 1.05); s.lineTo(1.08, 1.9); s.quadraticCurveTo(1.12, 2.15, 1.02, 2.35); s.lineTo(.82, 3.32);
  s.quadraticCurveTo(.76, 3.55, .5, 3.56); s.lineTo(-.9, 3.56); s.quadraticCurveTo(-1.05, 3.56, -1.05, 3.4); s.lineTo(-1.05, 1.05);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 2.3, bevelEnabled: true, bevelThickness: .1, bevelSize: .1, bevelSegments: 4, curveSegments: 10 }); geo.translate(0, 0, -1.15);
  const cuerpo = new THREE.Mesh(geo, pint); cuerpo.castShadow = cuerpo.receiveShadow = true; g.add(cuerpo);
  // parabrisas inclinado, ventanillas laterales y marco negro
  const pb = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.05), m.cristal); pb.position.set(1.03, 2.86, 0); pb.rotation.y = Math.PI / 2; pb.rotation.x = 0; pb.rotateOnAxis(new THREE.Vector3(1, 0, 0), -.2); g.add(pb);
  for (const zs of [-1, 1]){ const v = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .9), m.cristal); v.position.set(.25, 2.85, zs * 1.262); v.rotation.y = zs > 0 ? 0 : Math.PI; g.add(v);
    caja(g, 1.2, .05, .02, m.negro, .25, 2.38, zs * 1.258); }
  caja(g, .08, .12, 2.4, m.negro, 1.0, 2.3, 0);                                                // junta del parabrisas
  caja(g, .5, .12, 2.2, m.negro, .85, 3.5, 0);                                                 // visera
  // rejilla, logotipo, faros y parachoques
  const rj = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .8), m.rejilla); rj.position.set(1.2, 1.85, 0); rj.rotation.y = Math.PI / 2; g.add(rj);
  caja(g, .25, .45, 2.5, m.negro, 1.12, .95, 0);                                               // parachoques
  caja(g, .08, .16, .9, m.gris, 1.25, 1.15, 0);                                                // matrícula/escalón
  for (const zs of [-1, 1]){ caja(g, .1, .2, .42, m.faro, 1.2, 1.42, zs * .9); caja(g, .06, .1, .2, m.naranja, 1.24, 1.42, zs * 1.15);
    caja(g, .1, .12, .18, m.faro, 1.25, .95, zs * .98); }
  // logotipo en la puerta
  for (const zs of [-1, 1]){ const l = new THREE.Mesh(new THREE.PlaneGeometry(.55, .55), m.logo); l.position.set(.1, 1.75, zs * 1.262); l.rotation.y = zs > 0 ? 0 : Math.PI; g.add(l); }
  // espejos retrovisores con brazo
  for (const zs of [-1, 1]){ caja(g, .05, .05, .45, m.negro, .95, 3.0, zs * 1.4); caja(g, .12, .55, .25, m.negro, .95, 2.75, zs * 1.62); caja(g, .1, .25, .2, m.negro, .95, 2.32, zs * 1.55); }
  // balizas naranjas y bocina en el techo
  for (const zs of [-1, 1]){ const b = cil(g, .1, .12, .2, m.naranja, .3, 3.72, zs * .85, 12); }
  cil(g, .07, .07, .9, m.cromo, -.7, 3.7, .45, 10).rotation.x = Math.PI / 2;
  // escalones y asideros
  for (const zs of [-1, 1]){ caja(g, .5, .05, .3, m.gris, .25, .62, zs * 1.2); caja(g, .5, .05, .3, m.gris, .25, .95, zs * 1.2); cil(g, .025, .025, .9, m.cromo, -.55, 2.1, zs * 1.3, 6); }
  // aletas sobre la rueda delantera
  for (const zs of [-1, 1]){ const al = new THREE.Mesh(new THREE.TorusGeometry(.68, .09, 6, 16, Math.PI), m.negro); al.position.set(.2, .58, zs * 1.12); g.add(al); }
  return g;
}

// Hormigonera completa: devuelve { g, cuba (gira), piv (giro de la canaleta), can, ruedas, luzAtras }
export function hormigonera(par){
  const m = M(), g = new THREE.Group(); par.add(g);
  // bastidor y largueros
  caja(g, 8.4, .32, .9, m.negro, -.3, .95, 0);
  for (const zs of [-1, 1]) caja(g, 8.2, .1, .08, m.gris, -.3, 1.1, zs * .46);
  cabina(g, 3.3);
  // depósito de gasoil (cromado) y caja de baterías
  const dep = cil(g, .32, .32, 1.1, m.cromo, 1.7, .95, 1.05, 18); dep.rotation.z = Math.PI / 2;
  caja(g, .7, .5, .5, m.negro, 1.7, .95, -1.05);
  // depósito de agua blanco detrás de la cabina
  const ag = cil(g, .42, .42, 1.6, m.blanco, 1.65, 2.35, 0, 18); ag.rotation.x = Math.PI / 2;
  // soportes de la cuba
  caja(g, .5, 1.3, 1.6, m.gris, 1.25, 1.75, 0);
  for (const zs of [-1, 1]){ const pata = caja(g, .16, 2.2, .16, m.gris, -3.3, 2.0, zs * .7); pata.rotation.x = zs * .12; }   // patas del soporte trasero
  caja(g, .16, .16, 1.7, m.gris, -3.3, 2.95, 0); for (const zs of [-1, 1]) cil(g, .16, .16, .2, m.negro, -2.1, 2.05, zs * .62, 12).rotation.x = Math.PI / 2;   // travesaño y rodillos
  // cuba torneada (perfil real: cono delantero, cuerpo y cono trasero con la boca)
  const perfil = [[0, .9], [.25, .95], [.75, 1.0], [1.2, .85], [1.25, .55], [1.27, .1], [1.2, -.5], [1.05, -1.2], [.85, -1.85], [.62, -2.35], [.45, -2.55], [.44, -2.62]].reverse().map(([r, y]) => new THREE.Vector2(r, y));
  const lg = new THREE.LatheGeometry(perfil, 40); lg.rotateZ(-Math.PI / 2);     // eje a lo largo de x (boca hacia −x)
  const cubaG = new THREE.Group(); cubaG.position.set(-.2, 2.55, 0); cubaG.rotation.z = -.2; g.add(cubaG);
  const cuba = new THREE.Mesh(lg, m.cuba); cuba.castShadow = true; cubaG.add(cuba);
  const boca = new THREE.Mesh(new THREE.CircleGeometry(.43, 24), m.negro); boca.rotation.y = -Math.PI / 2; boca.position.x = -2.615; cubaG.add(boca);
  const aro = new THREE.Mesh(new THREE.TorusGeometry(.44, .05, 8, 24), m.gris); aro.rotation.y = Math.PI / 2; aro.position.x = -2.6; cubaG.add(aro);
  const pista = new THREE.Mesh(new THREE.TorusGeometry(1.2, .06, 8, 36), m.gris); pista.rotation.y = Math.PI / 2; pista.position.x = -1.2; cubaG.add(pista);   // camino de rodadura
  // tolva de carga, embudo de descarga y escalera trasera
  const tolva = new THREE.Mesh(new THREE.CylinderGeometry(.55, .2, .7, 4, 1, true), m.amarillo); tolva.rotation.y = Math.PI / 4; tolva.position.set(-3.45, 3.45, 0); tolva.material.side = THREE.DoubleSide; g.add(tolva);
  const emb = new THREE.Mesh(new THREE.CylinderGeometry(.35, .18, .6, 12, 1, true), m.amarillo); emb.position.set(-3.7, 2.05, 0); g.add(emb);
  for (const zs of [-.25, .25]) caja(g, .05, 2.6, .05, m.gris, -3.95, 2.0, zs + .55);
  for (let y = .9; y < 3.2; y += .32) caja(g, .05, .04, .5, m.gris, -3.95, y, .55);
  // canaleta orientable (media caña) con su pivote
  const piv = new THREE.Group(); piv.position.set(-3.95, 1.6, 0); g.add(piv);
  const can = new THREE.Group(); can.rotation.z = -.32; piv.add(can);
  const media = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, 2.8, 14, 1, true, 0, Math.PI), m.amarillo); media.material.side = THREE.DoubleSide;
  media.rotation.z = Math.PI / 2; media.rotation.y = Math.PI; media.position.set(-1.4, .12, 0); media.castShadow = true; can.add(media);
  caja(can, 2.8, .05, .06, m.gris, -1.4, .02, .28); caja(can, 2.8, .05, .06, m.gris, -1.4, .02, -.28);
  // tramos de canaleta de repuesto colgados en el lateral
  for (const [x, y] of [[-1.2, 1.45], [-.2, 1.45]]){ const t = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .95, 10, 1, true, 0, Math.PI), m.amarillo); t.material.side = THREE.DoubleSide; t.rotation.z = Math.PI / 2; t.position.set(x, y, 1.18); g.add(t); }
  // guardabarros traseros, faldillas y pilotos
  for (const zs of [-1, 1]){ caja(g, 2.4, .08, .65, m.negro, -2.05, 1.22, zs * 1.0); caja(g, .05, .5, .6, m.goma, -3.3, .75, zs * 1.0);
    caja(g, .05, .14, .3, m.piloto, -4.4, 1.05, zs * .95); }
  const luzAtras = new THREE.Mesh(new THREE.BoxGeometry(.05, .12, .22), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000 })); luzAtras.position.set(-4.42, 1.05, 0); g.add(luzAtras);
  caja(g, .12, .2, 2.4, m.amarillo, -4.4, .78, 0);                                              // parachoques trasero de obra
  // ruedas: delantera simple y dos ejes traseros gemelos
  const ruedas = [];
  for (const zs of [-1, 1]){ ruedas.push(rueda(g, 3.5, zs * 1.07, .55, .4)); ruedas.push(rueda(g, -1.45, zs * 1.0, .55, .36, true)); ruedas.push(rueda(g, -2.75, zs * 1.0, .55, .36, true)); }
  return { g, cuba, piv, can, ruedas, luzAtras };
}
