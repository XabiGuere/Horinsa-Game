/* =====================================================================
   HORINSA · Vista 3D (Three.js)
   Mundo en km: x = este, z = sur, y = altura (con exageración vertical).
   Los modelos se construyen en metros y se escalan.
   ===================================================================== */
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const EX = 1.5;          // exageración vertical del relieve
const PASO = 4;          // 1 vértice cada 4 píxeles del terreno (120 m)
const M = 0.001;         // 1 metro en km
var luzTaller = null;    // foco del taller (turno de noche)
const ROJO = 0xd2201f;

let renderer, scene, camera, controls, sol, hemi, terreno, aguaMat, overlay, octx, alturas, GW, GH;
let carreterasMat = [], edificiosMesh, piscinasMesh, palmerasMesh = [], plantaH, tolvasHechas = -1;
let listo = false, H3 = [], ETQ = [], tAnt = performance.now(), dtJuego = 0;
const camionesObj = new Map(), obrasObj = new Map();
let coches = null, barcos = [], nubes = [];
const v3 = new THREE.Vector3();
let anim = null;

/* ----------------------------- Alturas ----------------------------- */
function hMesh(x, z){
  const gx = (x - X0) / RES / PASO, gz = (z - Y0) / RES / PASO;
  const i = Math.floor(gx), j = Math.floor(gz);
  if (i < 0 || j < 0 || i >= GW - 1 || j >= GH - 1) return -0.04;
  const fx = gx - i, fz = gz - j, k = j * GW + i;
  // misma diagonal que los triángulos de la malla
  if (fx + fz <= 1) return alturas[k] + (alturas[k + 1] - alturas[k]) * fx + (alturas[k + GW] - alturas[k]) * fz;
  return alturas[k + GW + 1] + (alturas[k + GW] - alturas[k + GW + 1]) * (1 - fx) + (alturas[k + 1] - alturas[k + GW + 1]) * (1 - fz);
}
function esMar(x, z){ const px = Math.round((x - X0) / RES), py = Math.round((z - Y0) / RES); if (px < 0 || py < 0 || px >= TW || py >= TH) return true; return LAND[py * TW + px] < 20; }

/* ----------------------------- Ayudas ----------------------------- */
const matCache = new Map();
function mat(color, extra){
  const k = color + JSON.stringify(extra || {});
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .05, ...(extra || {}) }));
  return matCache.get(k);
}
function caja(g, w, h, d, color, x, y, z, ex){ const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, ex)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
function cil(g, rt, rb, h, color, x, y, z, seg = 16, ex){ const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, ex)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
function cono(g, r, h, color, x, y, z, seg = 20){ const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; }
function texCartel(txt, fondo, letra, w = 256, h = 128){
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = fondo; g.fillRect(0, 0, w, h); g.fillStyle = letra; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${Math.round(h * (txt.length > 3 ? .42 : .78))}px "Arial Black", Arial, sans-serif`; g.fillText(txt, w / 2, h / 2 + h * .04);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function cartel(g, txt, fondo, letra, w, h, x, y, z, ry = 0){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texCartel(txt, fondo, letra), roughness: .6, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; g.add(m); return m;
}
// Junta todas las piezas fijas de un modelo en una malla por material (muchas menos llamadas de dibujo)
function fusionar(g){
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), cubos = new Map(), quitar = [];
  g.traverse(o => {
    if (!o.isMesh) return;
    for (let p = o; p && p !== g; p = p.parent) if (p.userData.vivo) return;   // piezas animadas
    if (!o.geometry.index || !o.geometry.attributes.uv) return;
    const geo = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const k = o.material.uuid; if (!cubos.has(k)) cubos.set(k, { m: o.material, gs: [] }); cubos.get(k).gs.push(geo); quitar.push(o);
  });
  for (const o of quitar) o.parent.remove(o);
  for (const { m, gs } of cubos.values()){ const mesh = new THREE.Mesh(mergeGeometries(gs), m); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); }
  return g;
}
function colocarEn(obj, x, z, escala = 1){ if (!obj.userData.sinFusion) fusionar(obj); obj.position.set(x, hMesh(x, z), z); obj.scale.setScalar(M * escala); scene.add(obj); return obj; }
const camDist = () => camera.position.distanceTo(controls.target);
const RR = () => (typeof R !== 'undefined' ? R : null);      // estado del día (juego.js)

/* ============================ ESCENA ============================ */
function crearEscena(){
  const cv = document.getElementById('c3');
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fcbe6);
  scene.fog = new THREE.Fog(0x9fcbe6, 60, 160);
  camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .002, 600);
  controls = new MapControls(camera, cv);
  controls.enableDamping = true; controls.dampingFactor = .09;
  controls.minDistance = .12; controls.maxDistance = 95;
  controls.maxPolarAngle = 1.22; controls.minPolarAngle = .15;
  controls.zoomToCursor = true; controls.zoomSpeed = 1.2;
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  const [cx, cz] = P(29.035, -13.64);
  const fv = innerWidth < innerHeight ? 1.9 : 1;          // en vertical (móvil) hay que alejarse más
  controls.target.set(cx, 0, cz + 2 + (fv > 1 ? 9 : 0));
  camera.position.set(cx, 52 * fv, cz + 2 + (fv > 1 ? 9 : 0) + 48 * fv);
  controls.update();

  hemi = new THREE.HemisphereLight(0xdcefff, 0x8a6a4a, 1.1); scene.add(hemi);
  sol = new THREE.DirectionalLight(0xfff1dc, 2.6);
  // sombras más definidas (2048) salvo en móviles con poca memoria
  const sombraHD = !(navigator.deviceMemory && navigator.deviceMemory <= 3);
  sol.castShadow = true; sol.shadow.mapSize.set(sombraHD ? 2048 : 1024, sombraHD ? 2048 : 1024);
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = .0015;
  scene.add(sol, sol.target);

  overlay = document.getElementById('o3'); octx = overlay.getContext('2d');
  addEventListener('resize', redim3D); redim3D();
}
function redim3D(){
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const d = Math.min(2, devicePixelRatio || 1); overlay.width = innerWidth * d; overlay.height = innerHeight * d;
}

/* ----------------------------- Terreno ----------------------------- */
function crearTerreno(){
  GW = Math.floor((TW - 1) / PASO) + 1; GH = Math.floor((TH - 1) / PASO) + 1;
  alturas = new Float32Array(GW * GH);
  const pos = new Float32Array(GW * GH * 3), uv = new Float32Array(GW * GH * 2);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++){
    const k = j * GW + i, px = i * PASO, py = j * PASO, idx = py * TW + px, l = LAND[idx] / 255;
    const tierra = ELEV[idx] / 1000 * EX + .003;
    const y = l * tierra + (1 - l) * -.04;
    alturas[k] = y;
    pos[k * 3] = X0 + px * RES; pos[k * 3 + 1] = y; pos[k * 3 + 2] = Y0 + py * RES;
    uv[k * 2] = (px + .5) / TW; uv[k * 2 + 1] = 1 - (py + .5) / TH;
  }
  const ind = new Uint32Array((GW - 1) * (GH - 1) * 6); let n = 0;
  for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++){
    const a = j * GW + i, b = a + 1, c = a + GW, d = c + 1;
    ind[n++] = a; ind[n++] = c; ind[n++] = b; ind[n++] = b; ind[n++] = c; ind[n++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(ind, 1));
  geo.computeVertexNormals();
  const tex = new THREE.CanvasTexture(COLOR3D);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // textura de detalle (grano de picón y piedras) que aparece al acercarse
  const det = lienzo(256, 256, (g, w, h) => {
    const im = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++){ const v = 128 + (Math.random() - .5) * 70; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    for (let i = 0; i < 160; i++){ g.fillStyle = `rgba(${Math.random() < .5 ? '40,30,25' : '235,225,205'},${.25 + Math.random() * .3})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 1 + Math.random() * 3, Math.random() * 3, 0, 7); g.fill(); }
  }, false);
  det.wrapS = det.wrapT = THREE.RepeatWrapping;
  const tm = new THREE.MeshStandardMaterial({ map: tex, roughness: .96, metalness: 0 });
  // zonas reales (malpaís, jable, La Geria, enarenados): cada una con su textura al acercarse
  const Z = window.ZONAS3D, zt = Z ? new THREE.DataTexture(Z.data, Z.w, Z.h, THREE.RGBAFormat) : null;
  if (zt){ zt.magFilter = THREE.LinearFilter; zt.minFilter = THREE.LinearMipmapLinearFilter; zt.generateMipmaps = true; zt.needsUpdate = true; }
  tm.onBeforeCompile = sh => {
    sh.uniforms.uDet = { value: det }; sh.uniforms.uDetF = { value: 0 }; sh.uniforms.uZon = { value: zt }; tm.userData.sh = sh;
    sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWp=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D uDet; uniform float uDetF; uniform sampler2D uZon; varying vec3 vWp;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      `#include <map_fragment>
       float d1=texture2D(uDet,vWp.xz*45.0).r, d2=texture2D(uDet,vWp.xz*7.0).r; diffuseColor.rgb*=mix(1.0,(0.7+0.6*d1)*(0.85+0.3*d2),uDetF);
       ${zt ? `
       float nf=uDetF;
       if(nf>0.01){
         vec4 zn=texture2D(uZon,vec2(vMapUv.x,1.0-vMapUv.y));
         vec2 w=vWp.xz; float n1=texture2D(uDet,w*60.0).r, n2=texture2D(uDet,w*11.0).r, n3=texture2D(uDet,w*3.0).r;
         // malpaís: lava escoriácea negra y rugosa, con vetas rojizas
         vec3 lava=vec3(.13,.11,.10)*(.45+1.1*n1*n2)+vec3(.25,.08,.03)*smoothstep(.62,.8,n3)*.6;
         diffuseColor.rgb=mix(diffuseColor.rgb,lava,zn.r*.75*nf);
         // jable: arena clara con ondas del viento
         float rip=sin(dot(w,vec2(.6,.8))*1400.0+n2*7.0)*.5+.5;
         diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.86,.77,.58)*(.9+.14*rip)*(.92+.12*n1),zn.g*.7*nf);
         // La Geria: hoyos de picón con su zoco (muro de piedra en media luna) y la parra en el centro
         vec2 q=w/.016, cid=floor(q), f=fract(q)-.5; float hh=fract(sin(dot(cid,vec2(12.9898,78.233)))*43758.5453);
         f+=(vec2(hh,fract(hh*7.13))-.5)*.34; float r=length(f)/(.8+.4*fract(hh*3.7)); if(fract(hh*5.31)<.12) r=9.0;
         vec3 ger=vec3(.10,.09,.09)*(.7+.5*n1); ger*=mix(1.0,.55+.45*smoothstep(.0,.3,r),1.0-smoothstep(.3,.4,r));
         float zoco=smoothstep(.30,.34,r)*(1.0-smoothstep(.40,.46,r))*smoothstep(-.05,.1,f.y);
         ger=mix(ger,vec3(.42,.38,.34)*(.8+.4*n2),zoco);
         ger=mix(ger,vec3(.28,.40,.12),(1.0-smoothstep(.06,.11,r))*step(.22,hh));
         diffuseColor.rgb=mix(diffuseColor.rgb,ger,zn.b*.85*nf);
         // enarenados: parcelas de picón negro con muretes de piedra seca
         vec2 pq=w/.045, pid=floor(pq), pf=fract(pq); float ph=fract(sin(dot(pid,vec2(41.3,17.7)))*9137.1);
         float borde=1.0-smoothstep(.0,.035,min(min(pf.x,1.0-pf.x),min(pf.y,1.0-pf.y)));
         vec3 ena=mix(vec3(.12,.11,.10),vec3(.45,.36,.26),step(.78,ph))*(.8+.35*n1); ena=mix(ena,vec3(.5,.46,.4),borde*.8);
         diffuseColor.rgb=mix(diffuseColor.rgb,ena,zn.a*.8*nf);
       }` : ''}`);
  };
  terreno = new THREE.Mesh(geo, tm);
  terreno.receiveShadow = true; terreno.castShadow = false;
  scene.add(terreno);

  // Mar: fondo profundo + lámina de agua con reflejos
  const fondo = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: 0x0b3a57 }));
  fondo.rotation.x = -Math.PI / 2; fondo.position.y = -.06; scene.add(fondo);
  aguaMat = new THREE.MeshStandardMaterial({ color: 0x1a6f98, transparent: true, opacity: .62, roughness: .12, metalness: .25 });
  aguaMat.onBeforeCompile = sh => {             // oleaje suave en el color
    sh.uniforms.uT = { value: 0 }; aguaMat.userData.sh = sh;
    sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vW=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = 'uniform float uT; varying vec3 vW;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n float o=sin(vW.x*9.0+uT*1.3)*sin(vW.z*7.0-uT*1.1)+sin((vW.x+vW.z)*23.0+uT*2.0)*.5; gl_FragColor.rgb+=vec3(.035,.05,.06)*o;');
  };
  const agua = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), aguaMat);
  agua.rotation.x = -Math.PI / 2; agua.position.y = 0; agua.receiveShadow = true; scene.add(agua);
}

/* ------------------- Espuma en la orilla y cielo ------------------- */
let espumaMat = null, cielo = null;
function crearEspuma(){
  espumaMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uT: { value: 0 } },
    vertexShader: 'attribute float f; attribute float al; varying float vF; varying float vA; void main(){ vF=f; vA=al; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform float uT; varying float vF; varying float vA; void main(){ float ola=smoothstep(.75,1.0,sin(vF*16.0-uT*1.6+vA*2.3)); float r=sin(vA*55.0+uT*.7)*.5+.5; float a=pow(1.0-vF,2.2)*.75*(.75+.25*r)+ola*(1.0-vF)*.45; gl_FragColor=vec4(.97,.99,1.0,a); }'
  });
  for (const poly of ISLAS){
    const n = poly.length, pos = [], f = [], al = [], ind = [];
    // normal hacia fuera: se comprueba con unas muestras si apunta al mar
    let fuera = 0; for (let k = 0; k < n; k += Math.max(1, Math.floor(n / 40))){ const a = poly[(k - 1 + n) % n], b = poly[(k + 1) % n]; let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; if (esMar(poly[k][0] + dz / L * .12, poly[k][1] - dx / L * .12)) fuera++; else fuera--; }
    const sg = fuera >= 0 ? 1 : -1; let acc = 0;
    for (let i = 0; i <= n; i++){
      const p = poly[i % n], a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const nx = dz * sg, nz = -dx * sg;
      if (i > 0) acc += Math.hypot(p[0] - poly[(i - 1) % n][0], p[1] - poly[(i - 1) % n][1]);
      pos.push(p[0] - nx * .01, .0007, p[1] - nz * .01, p[0] + nx * .085, .0007, p[1] + nz * .085);
      f.push(0, 1); al.push(acc, acc);
      if (i > 0){ const q = (i - 1) * 2; ind.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('f', new THREE.Float32BufferAttribute(f, 1)); geo.setAttribute('al', new THREE.Float32BufferAttribute(al, 1));
    geo.setIndex(ind); const m = new THREE.Mesh(geo, espumaMat); m.renderOrder = 2; scene.add(m);
  }
}
function crearCielo(){
  cielo = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(0x3f82c6) }, uHor: { value: new THREE.Color(0xcfe5f2) }, uSol: { value: new THREE.Vector3(0, 1, 0) }, uSolCol: { value: new THREE.Color(0xfff1d0) } },
    vertexShader: 'varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uTop,uHor,uSol,uSolCol; varying vec3 vD; void main(){ vec3 d=normalize(vD); float h=clamp(d.y,0.0,1.0); vec3 c=mix(uHor,uTop,pow(h,.5)); float s=max(dot(d,normalize(uSol)),0.0); c+=uSolCol*(pow(s,1500.0)*3.0+pow(s,14.0)*.22); gl_FragColor=vec4(c,1.0); }'
  }));
  cielo.renderOrder = -10; cielo.frustumCulled = false; scene.add(cielo);
}

/* ------------- Explanadas: terreno plano bajo plantas y canteras ------------- */
function aplanar(cx, cz, rx, rz){
  const h = hMesh(cx, cz), pos = terreno.geometry.attributes.position, m = .12;
  const i0 = Math.max(0, Math.floor((cx - rx - m - X0) / RES / PASO)), i1 = Math.min(GW - 1, Math.ceil((cx + rx + m - X0) / RES / PASO));
  const j0 = Math.max(0, Math.floor((cz - rz - m - Y0) / RES / PASO)), j1 = Math.min(GH - 1, Math.ceil((cz + rz + m - Y0) / RES / PASO));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++){
    const k = j * GW + i, x = X0 + i * PASO * RES, z = Y0 + j * PASO * RES;
    const dx = Math.max(0, Math.abs(x - cx) - rx), dz = Math.max(0, Math.abs(z - cz) - rz), d = Math.hypot(dx, dz);
    if (d > m || alturas[k] < 0) continue;
    const f = d <= 0 ? 1 : 1 - d / m; alturas[k] = alturas[k] + (h - alturas[k]) * f; pos.setY(k, alturas[k]);
  }
  pos.needsUpdate = true;
}
function aplanarSitios(){
  const k = M * 1.6, sitios = [];
  const [px, pz] = P(HORINSA.planta.la, HORINSA.planta.lo); sitios.push([px, pz, 82 * k, 58 * k], [px + OFF_ASF[0], pz + OFF_ASF[1], 62 * k, 40 * k]);
  const [qx, qz] = P(HORINSA.cantera.la, HORINSA.cantera.lo); sitios.push([qx, qz, 150 * k, 115 * k]);
  for (const m of MARCAS){ if (m.t === 'hp' || m.t === 'hc') continue; const [x, z] = P(m.la, m.lo); sitios.push([x, z, m.t === 'cr' ? 150 * k : 82 * k, m.t === 'cr' ? 115 * k : 82 * k]); }
  if (typeof DELEG !== 'undefined'){ const [sx, sz] = P(DELEG.sur.la, DELEG.sur.lo); sitios.push([sx, sz, 82 * k, 58 * k]); }
  for (const s of sitios) aplanar(...s);
  terreno.geometry.computeVertexNormals();
}

/* ---------------------------- Carreteras ----------------------------
   Cinta sobre el terreno. El ancho se agranda al alejarse (como un mapa)
   mediante el atributo 'lado' y el uniforme uAncho.                    */
function crearCarreteras(){
  const tipos = { auto: { a: .022, c: 0x3d3d40, y: .0035 }, prin: { a: .014, c: 0x4a4a4e, y: .0032 }, sec: { a: .009, c: 0x6a645c, y: .003 }, calle: { a: .0075, c: 0x5a5650, y: .0027 }, pista: { a: .006, c: 0xb39a72, y: .0028 } };
  const texVia = t => { const tx = lienzo(64, 128, (g, w, h) => {
      g.fillStyle = { auto: '#3a3a3d', prin: '#45454a', sec: '#5c5853', calle: '#6a665f', pista: '#b39a72' }[t]; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 600; i++){ const c = Math.random() < .5 ? 255 : 0; g.fillStyle = `rgba(${c},${c},${c},${Math.random() * .07})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      if (t === 'pista'){ g.fillStyle = 'rgba(90,70,45,.35)'; g.fillRect(12, 0, 9, h); g.fillRect(43, 0, 9, h); return; }
      if (t === 'calle'){ g.fillStyle = 'rgba(235,230,220,.5)'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); return; }   // bordillos
      g.fillStyle = '#efefe9';
      if (t !== 'sec'){ g.fillRect(3, 0, 2.5, h); g.fillRect(w - 5.5, 0, 2.5, h); }
      if (t === 'auto'){ g.fillRect(w / 2 - 3, 0, 2, h); g.fillRect(w / 2 + 1, 0, 2, h); }
      else { g.globalAlpha = t === 'sec' ? .55 : 1; g.fillRect(w / 2 - 1.5, 0, 3, h * .5); g.globalAlpha = 1; }
    }); tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 8; return tx; };
  for (const t in tipos){
    const T = tipos[t], pos = [], lado = [], ind = [], uv = [];
    for (const r of CARRETERAS){
      if (r.t !== t || r.j) continue;                    // las rotondas se construyen aparte, como anillos
      const d = densificar(r.k), pts = [];
      for (let k = 0; k < d.length; k++){
        if (k === 0){ pts.push(d[0]); continue; }
        const a = d[k - 1], b = d[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / .04));
        for (let s = 1; s <= n; s++) pts.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]);
      }
      const base = pos.length / 3; let largo = 0;
      for (let k = 0; k < pts.length; k++){
        if (k > 0) largo += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
        uv.push(0, largo / .024, 1, largo / .024);
        const p = pts[k], a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        const nx = -dz, nz = dx, y = hMesh(p[0], p[1]) + T.y;
        pos.push(p[0], y, p[1], p[0], y, p[1]);
        lado.push(nx * T.a / 2, nz * T.a / 2, -nx * T.a / 2, -nz * T.a / 2);
        if (k > 0){ const q = base + (k - 1) * 2; ind.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('lado', new THREE.Float32BufferAttribute(lado, 2));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(ind); geo.computeBoundingSphere(); geo.boundingSphere.radius += 5;
    const m = new THREE.MeshStandardMaterial({ map: texVia(t), roughness: .9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uAncho = { value: 1 }; m.userData.sh = sh;
      sh.vertexShader = 'attribute vec2 lado; uniform float uAncho;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.xz += lado*uAncho; transformed.y += 0.0015*(uAncho-1.0);');
    };
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.normal = new THREE.Vector3(0, 1, 0);
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    mesh.userData.tipo = t; scene.add(mesh); carreterasMat.push(mesh);
  }
}

/* ------------------------------- Rotondas -------------------------------
   Se unen los tramos de rotonda que comparten puntos, se ajusta un círculo y se
   dibuja: anillo de asfalto con líneas, bordillo, isleta de picón y adorno.      */
let rotondas = null;
function crearRotondas(){
  const segs = CARRETERAS.filter(r => r.j && r.k.length > 1); if (!segs.length) return;
  const padre = segs.map((_, i) => i), raiz = i => padre[i] === i ? i : (padre[i] = raiz(padre[i]));
  const clave = p => p[0].toFixed(5) + ',' + p[1].toFixed(5), porPunto = new Map();
  segs.forEach((s, i) => { for (const p of [s.k[0], s.k[s.k.length - 1]]){ const k = clave(p); if (porPunto.has(k)) padre[raiz(i)] = raiz(porPunto.get(k)); else porPunto.set(k, i); } });
  const grupos = new Map(); segs.forEach((s, i) => { const r = raiz(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(s); });
  const g = new THREE.Group(); rotondas = { g, molinos: [] };
  const mAsf = new THREE.MeshStandardMaterial({ color: 0x46464a, roughness: .9, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const mLinea = new THREE.MeshBasicMaterial({ color: 0xeeeeea, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
  const texPicon = lienzo(128, 128, (c, w, h) => { c.fillStyle = '#2a2523'; c.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++){ const v = 20 + Math.random() * 45; c.fillStyle = `rgb(${v + 8},${v},${v - 4})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); } });
  texPicon.wrapS = texPicon.wrapT = THREE.RepeatWrapping; texPicon.repeat.set(4, 4);
  const mPicon = new THREE.MeshStandardMaterial({ map: texPicon, roughness: 1, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 });
  const mBordillo = mat(0xf2f0ea), mVerde = mat(0x4f7a2c, { flatShading: true });
  let n = 0;
  for (const lista of grupos.values()){
    const pts = lista.flatMap(s => s.k); if (pts.length < 4) continue;
    let cx = 0, cz = 0; for (const p of pts){ cx += p[0]; cz += p[1]; } cx /= pts.length; cz /= pts.length;
    let r = 0; for (const p of pts) r += Math.hypot(p[0] - cx, p[1] - cz); r /= pts.length;
    let dev = 0; for (const p of pts) dev += Math.abs(Math.hypot(p[0] - cx, p[1] - cz) - r); dev /= pts.length;
    if (r < .006 || r > .09 || dev > r * .25){ lista.forEach(s => s.j = 0); continue; }   // no parece un círculo: se deja como vía normal
    const tipo = lista[0].t, w = tipo === 'auto' || tipo === 'prin' ? .011 : .008, y = hMesh(cx, cz) + .0034, ri = Math.max(.002, r - w / 2), re = r + w / 2;
    const anillo = (a, b, m, dy) => { const me = new THREE.Mesh(new THREE.RingGeometry(a, b, 56), m); me.rotation.x = -Math.PI / 2; me.position.set(cx, y + dy, cz); me.receiveShadow = true; g.add(me); return me; };
    anillo(ri, re, mAsf, 0);
    anillo(re - .0007, re - .00045, mLinea, .00005); anillo(ri + .00045, ri + .0007, mLinea, .00005);     // líneas de borde
    const isla = new THREE.Mesh(new THREE.CircleGeometry(ri - .0006, 40), mPicon); isla.rotation.x = -Math.PI / 2; isla.position.set(cx, y + .0004, cz); isla.receiveShadow = true; g.add(isla);
    const bord = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, .0005, 48, 1, true), mBordillo); bord.position.set(cx, y + .0002, cz); g.add(bord);
    // adorno de la isleta
    const sem = (Math.abs(Math.sin(cx * 91.7 + cz * 13.1)) * 1000) % 1, adorno = new THREE.Group(); adorno.position.set(cx, y + .0004, cz); adorno.scale.setScalar(M);
    if (ri > .01 && sem < .4){                          // juguete del viento: mástil y aspas de colores que giran
      cil(adorno, .25, .35, 9, 0xdcdcdc, 0, 4.5, 0, 8);
      const aspas = new THREE.Group(); aspas.position.y = 9; adorno.add(aspas);
      [0xd2201f, 0x1f5fbf, 0xf2c230].forEach((col, k) => { const b = caja(aspas, 4.5, .15, 1.1, col, 2.3, 0, 0); b.parent.remove(b); const piv = new THREE.Group(); piv.rotation.y = k * 2.094; piv.add(b); aspas.add(piv); });
      aspas.userData.vivo = true; rotondas.molinos.push(aspas);
    } else if (ri > .007 && sem < .75){                 // palmeras
      for (let k = 0; k < 3; k++){ const a = k * 2.1 + sem * 6, d = ri * 450 * (k ? .5 : 0); cil(adorno, .2, .3, 8, 0x7a5a3a, Math.cos(a) * d, 4, Math.sin(a) * d, 6); const cp = cono(adorno, 2.6, 1.5, 0x4a7a2a, Math.cos(a) * d, 8.3, Math.sin(a) * d, 7); cp.scale.y = .6; }
    } else {                                            // cactus y aloes sobre el picón
      for (let k = 0; k < 6; k++){ const a = k * 1.05 + sem * 4, d = ri * 600 * (.3 + .5 * ((k * .37) % 1)); const c = cono(adorno, .7 + (k % 3) * .3, 1.4 + (k % 2), 0x5f8a3a, Math.cos(a) * d, .8, Math.sin(a) * d, 6); c.material = mVerde; }
    }
    g.add(adorno); n++;
  }
  fusionar(g); g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  scene.add(g); rotondas.n = n;
}

/* -------------------- Edificios, piscinas y palmeras --------------------
   Casas blancas de Lanzarote: cubos encalados, azotea con pretil, carpintería
   verde (interior) o azul (costa), chimeneas blancas y depósitos en la azotea.
   Las ventanas se encienden al atardecer.                                    */
const matsLuz = [];
function lienzo(w, h, fn, srgb = true){
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function texCasa(pisos, carp, luz){
  return lienzo(128, 64 * pisos, (g, w, h) => {
    g.fillStyle = luz ? '#000' : '#f5f2eb'; g.fillRect(0, 0, w, h);
    if (!luz){ for (let i = 0; i < 260; i++){ g.fillStyle = `rgba(115,100,80,${Math.random() * .07})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 7, 1 + Math.random() * 3); }
      g.fillStyle = '#ddd4c4'; g.fillRect(0, h - 5, w, 5); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, 3); }
    for (let p = 0; p < pisos; p++){
      const y0 = p * 64, baja = p === pisos - 1;
      for (const x of [14, 92]){
        if (luz){ g.fillStyle = Math.random() < .6 ? '#ffcf7a' : '#000'; g.fillRect(x + 3, y0 + 21, 16, 20); }
        else { g.fillStyle = carp; g.fillRect(x, y0 + 18, 22, 26); g.fillStyle = '#25323b'; g.fillRect(x + 3, y0 + 21, 16, 20); g.fillStyle = carp; g.fillRect(x + 10, y0 + 21, 2, 20); g.fillRect(x + 3, y0 + 30, 16, 2); }
      }
      if (!luz){
        if (baja){ g.fillStyle = carp; g.fillRect(53, y0 + 20, 22, 44); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(55, y0 + 22, 18, 40); }
        else { g.fillStyle = carp; g.fillRect(55, y0 + 18, 18, 26); g.fillStyle = '#25323b'; g.fillRect(58, y0 + 21, 12, 20); }
      } else if (!baja && Math.random() < .5){ g.fillStyle = '#ffcf7a'; g.fillRect(58, y0 + 21, 12, 20); }
    }
  });
}
function texHotel(luz){
  return lienzo(256, 256, (g, w, h) => {
    g.fillStyle = luz ? '#000' : '#f6f4ef'; g.fillRect(0, 0, w, h);
    for (let f = 0; f < 5; f++){ const y = f * 51 + 9;
      for (let x = 8; x < w - 20; x += 40){
        if (luz){ g.fillStyle = Math.random() < .55 ? '#ffd38a' : '#000'; g.fillRect(x, y, 30, 30); }
        else { g.fillStyle = '#5c86a0'; g.fillRect(x, y, 30, 30); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, y, 30, 6); g.fillStyle = '#ffffff'; g.fillRect(x - 3, y + 27, 36, 5); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x - 3, y + 19, 36, 2); }
      }
      if (!luz){ g.fillStyle = '#e4ded2'; g.fillRect(0, y + 33, w, 3); }
    }
  });
}
const texAzotea = () => lienzo(64, 64, (g, w, h) => {
  g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++){ g.fillStyle = `rgba(90,80,60,${Math.random() * .05})`; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 8, 2 + Math.random() * 5); }
  g.strokeStyle = '#fbfaf7'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; g.strokeRect(6.5, 6.5, w - 13, h - 13);
});
// Los edificios se agrupan en cuadrículas de 1,5 km y solo se dibujan las cercanas a la cámara
const bloquesEdif = [];
function crearEdificios(){
  const caja1 = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
  const azotea = new THREE.MeshStandardMaterial({ map: texAzotea(), roughness: .9 });
  const base = mat(0xd9d2c4);
  const matCasa = (tex, luz) => { const f = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: luz, emissive: 0xffc070, emissiveIntensity: 0, roughness: .85 }); matsLuz.push(f); return [f, f, azotea, base, f, f]; };
  const MATS = { v1: matCasa(texCasa(1, '#2f7d4a'), texCasa(1, '', true)), v2: matCasa(texCasa(2, '#2f7d4a'), texCasa(2, '', true)),
    a1: matCasa(texCasa(1, '#2a5f9e'), texCasa(1, '', true)), a2: matCasa(texCasa(2, '#2a5f9e'), texCasa(2, '', true)), h: matCasa(texHotel(false), texHotel(true)) };
  const geoChim = mergeGeometries([new THREE.BoxGeometry(1, 1.8, 1).translate(0, .9, 0), new THREE.ConeGeometry(.85, .9, 4).rotateY(Math.PI / 4).translate(0, 2.25, 0)]);
  const geoDep = new THREE.CylinderGeometry(.6, .6, 1.3, 6).translate(0, .65, 0);
  const mChim = mat(0xfbfaf6), mDep = mat(0x2a2a2a, { roughness: .5 }), mPisc = new THREE.MeshStandardMaterial({ color: 0x3fc1e0, roughness: .08, metalness: .1 }), mSol = mat(0xe9dcc0);
  const o = new THREE.Object3D(), rot = (b, ox, oz) => [b.x + ox * Math.cos(b.a) - oz * Math.sin(b.a), b.y + ox * Math.sin(b.a) + oz * Math.cos(b.a)];
  const poner = (m, x, y, z, a, sx, sy, sz) => { o.position.set(x, y, z); o.rotation.set(0, -a, 0); o.scale.set(sx, sy, sz); o.updateMatrix(); m.setMatrixAt(m.count++, o.matrix); };
  const costa = (x, z) => { for (let k = 0; k < 6; k++){ const a = k * 1.047; if (esMar(x + Math.cos(a) * .35, z + Math.sin(a) * .35)) return true; } return false; };
  const T = 1.5, celdas = new Map();
  EDIFICIOS.forEach((b, i) => { const k = Math.floor(b.x / T) + ',' + Math.floor(b.y / T); if (!celdas.has(k)) celdas.set(k, []); celdas.get(k).push([b, i]); });
  edificiosMesh = new THREE.Group(); piscinasMesh = new THREE.Group();
  for (const [k, lista] of celdas){
    const n = lista.length, im = (g, m) => { const x = new THREE.InstancedMesh(g, m, n); x.count = 0; return x; };
    const tipos = { v1: im(caja1, MATS.v1), v2: im(caja1, MATS.v2), a1: im(caja1, MATS.a1), a2: im(caja1, MATS.a2), h: im(caja1, MATS.h) };
    const chim = im(geoChim, mChim), dep = im(geoDep, mDep), pisc = im(caja1, mPisc), solarium = im(caja1, mSol);
    for (const [b, i] of lista){
    const y0 = hMesh(b.x, b.y) - .0012, r = (Math.sin(i * 12.9898) * 43758.5453) % 1, rr = Math.abs(r);
    if (b.pool){
      const alto = .011 + b.c * .014; poner(tipos.h, b.x, y0, b.y, b.a, b.w, alto, b.h);
      const [px, pz] = rot(b, 0, b.h * .95); const yp = hMesh(px, pz);
      poner(solarium, px, yp - .0005, pz, b.a, b.w * .85, .0009, b.h * .6);
      poner(pisc, px, yp, pz, b.a, b.w * .5, .0006, b.h * .32);
      continue;
    }
    const dos = b.c > .55, alto = (dos ? .0068 : .0039) + rr * .0008;
    const azul = costa(b.x, b.y) ? rr < .7 : rr < .2;
    poner(tipos[(azul ? 'a' : 'v') + (dos ? 2 : 1)], b.x, y0, b.y, b.a, b.w, alto, b.h);
    if (rr < .3){ const [cx, cz] = rot(b, b.w * .32, -b.h * .3); poner(chim, cx, y0 + alto, cz, b.a, M, M * (1 + rr), M); }
    else if (rr > .62){ const [cx, cz] = rot(b, -b.w * .3, b.h * .28); poner(dep, cx, y0 + alto, cz, b.a, M, M, M); }
    }
    const g = new THREE.Group();
    for (const m of [...Object.values(tipos), chim, dep, pisc, solarium]){ if (!m.count){ continue; } m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.castShadow = m !== chim && m !== dep && m !== pisc && m !== solarium; m.receiveShadow = true; g.add(m); }
    const [a, b2] = k.split(',').map(Number); g.visible = false;
    edificiosMesh.add(g); bloquesEdif.push({ g, cx: (a + .5) * T, cz: (b2 + .5) * T });
  }
  scene.add(edificiosMesh);

  // Palmeras: valle de Haría y zonas turísticas
  const pos = []; const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(91);
  const [hx, hz] = P(29.145, -13.499);
  for (let k = 0; k < 420; k++){ const a = rng() * 6.28, r = Math.sqrt(rng()) * 1.6; const x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r * .8; if (!esMar(x, z)) pos.push([x, z, .7 + rng() * .6]); }
  for (const b of EDIFICIOS) if (b.pool && rng() < .7){ const x = b.x + (rng() - .5) * .06, z = b.y + (rng() - .5) * .06; if (!esMar(x, z)) pos.push([x, z, .8 + rng() * .5]); }
  const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .3, 1, 6).translate(0, .5, 0), mat(0x7a5a3a), pos.length);
  const hojas = []; for (let i = 0; i < 8; i++){ const f = new THREE.ConeGeometry(.42, 3.6, 3); f.scale(1, 1, .25); f.rotateX(Math.PI / 2); f.translate(0, 0, 1.8); f.rotateX(.5 + (i % 2) * .25); f.rotateY(i / 8 * Math.PI * 2); hojas.push(f); }
  hojas.push(new THREE.SphereGeometry(.45, 6, 4));
  const copa = new THREE.InstancedMesh(mergeGeometries(hojas), mat(0x4a7a2a, { side: THREE.DoubleSide }), pos.length);
  pos.forEach(([x, z, s], i) => {
    const y = hMesh(x, z);
    o.position.set(x, y, z); o.rotation.set(0, i, 0); o.scale.set(M * s, M * 9 * s, M * s); o.updateMatrix(); tronco.setMatrixAt(i, o.matrix);
    o.position.set(x, y + M * 9 * s, z); o.scale.setScalar(M * 1.2 * s); o.updateMatrix(); copa.setMatrixAt(i, o.matrix);
  });
  tronco.castShadow = copa.castShadow = false; scene.add(tronco, copa); palmerasMesh = [tronco, copa];
}

/* ------------- Vegetación, malpaís y viñas de La Geria -------------
   Solo se ven de cerca (para no gastar al ver la isla entera).         */
let cercanos = [];
function enPueblo(x, z){
  for (const t of PUEBLOS){ const [cx, cz] = P(t[1], t[2]), a = t[7] * Math.PI / 180, dx = x - cx, dz = z - cz;
    const u = (dx * Math.cos(a) + dz * Math.sin(a)) / (t[5] + .15), v = (-dx * Math.sin(a) + dz * Math.cos(a)) / (t[6] + .15); if (u * u + v * v < 1) return true; }
  return false;
}
function crearVegetacion(){
  let s = 4242; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const o = new THREE.Object3D(), col = new THREE.Color();
  const tab = [], roc = [], vid = [];
  for (let k = 0; k < 60000 && (tab.length < 7000 || roc.length < 5000); k++){
    const x = X0 + r() * (X1 - X0), z = Y0 + r() * (Y1 - Y0); if (esMar(x, z)) continue;
    const p = [x, z];
    if (pip(p, Z_LAVA) || pip(p, Z_CORONA)){ if (roc.length < 5000) roc.push([x, z, .6 + r() * 1.8, r()]); continue; }
    if (pip(p, Z_GERIA) || enPueblo(x, z)) continue;
    if (tab.length < 7000) tab.push([x, z, .6 + r() * .9, r()]);
  }
  // hoyos de La Geria: cada vid en su hoyo de picón protegida por un muro semicircular (zoco)
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9; for (const [x, z] of Z_GERIA){ minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  for (let x = minx; x < maxx; x += .042) for (let z = minz; z < maxz; z += .042){ const jx = x + (r() - .5) * .02, jz = z + (r() - .5) * .02; if (pip([jx, jz], Z_GERIA) && !enPueblo(jx, jz) && !esMar(jx, jz)) vid.push([jx, jz, .8 + r() * .4, r()]); }
  // Se reparten en cuadrículas de 1,5 km: solo se dibujan las cercanas a la cámara
  const T = 1.5;
  const malla = (geo, material, lista, color, escala, giroLibre) => {
    const celdas = new Map();
    for (const it of lista){ const k = Math.floor(it[0] / T) + ',' + Math.floor(it[1] / T); if (!celdas.has(k)) celdas.set(k, []); celdas.get(k).push(it); }
    for (const [k, l] of celdas){
      const m = new THREE.InstancedMesh(geo, material, l.length);
      l.forEach(([x, z, sc, q], i) => { o.position.set(x, hMesh(x, z) - .0002, z); o.rotation.set(0, giroLibre ? q * 6.28 : -.6, 0); o.scale.setScalar(M * sc * escala); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (color) m.setColorAt(i, color(col, q)); });
      m.receiveShadow = true; m.computeBoundingSphere(); m.visible = false; scene.add(m);
      const [a, b] = k.split(',').map(Number); cercanos.push({ m, cx: (a + .5) * T, cz: (b + .5) * T });
    }
  };
  malla(new THREE.IcosahedronGeometry(1, 0).scale(1.3, .75, 1.3).translate(0, .5, 0), new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), tab, (c, q) => c.setHSL(.2 + q * .06, .25 + q * .15, .32 + q * .12), 1.4, true);
  malla(new THREE.DodecahedronGeometry(1, 0).scale(1, .6, 1.2).translate(0, .25, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), roc, (c, q) => c.setHSL(.03, .25 + q * .2, .12 + q * .1), 1.3, true);
  malla(new THREE.TorusGeometry(4.2, .8, 3, 6, Math.PI).rotateX(Math.PI / 2).translate(0, .3, 0), mat(0x4a4440, { flatShading: true }), vid, null, 1, false);
  malla(new THREE.IcosahedronGeometry(1.5, 0).scale(1.2, .8, 1.2).translate(0, .6, 1.2), mat(0x7a9a32, { flatShading: true }), vid, null, 1, false);
}

/* ------------------------------ Aeropuerto ------------------------------ */
function crearAeropuerto(){
  const [ax, az] = P(28.938, -13.613), [bx, bz] = P(28.957, -13.598);
  const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), cx = (ax + bx) / 2, cz = (az + bz) / 2;
  const g = new THREE.Group();
  caja(g, L * 1000, .6, 45, 0x2e2e30, 0, .3, 0);
  for (let s = -L * 500 + 40; s < L * 500 - 40; s += 60) caja(g, 30, .65, 1.2, 0xf2f2f2, s, .32, 0);
  caja(g, L * 1000 * .7, .5, 23, 0x3a3a3c, 0, .25, -120);                 // calle de rodaje
  caja(g, 380, .45, 110, 0x55575a, 120, .22, -230);                        // plataforma
  caja(g, 260, 16, 55, 0xe8ecef, 120, 8, -330); caja(g, 262, 4, 57, 0x4f7f9f, 120, 13, -330, { roughness: .2, metalness: .4 });
  cil(g, 4, 5, 34, 0xe8ecef, -60, 17, -330); cil(g, 9, 9, 7, 0x4f7f9f, -60, 36, -330);   // torre de control
  for (const dx of [40, 140]){ const av = avion(); av.position.set(dx, 2.2, -235); av.rotation.y = Math.PI / 2; g.add(av); }
  g.rotation.y = -ang; colocarEn(g, cx, cz, 1);
}
function avion(){
  const g = new THREE.Group();
  const f = cil(g, 2, 2, 36, 0xf4f6f8, 0, 0, 0, 14); f.rotation.z = Math.PI / 2;
  const n = cono(g, 2, 5, 0xf4f6f8, 20.5, 0, 0, 14); n.rotation.z = -Math.PI / 2;
  caja(g, 9, .6, 34, 0xe4e8ec, -2, -.6, 0); caja(g, 4, .4, 12, 0xe4e8ec, -16, .8, 0);
  caja(g, 5, 6, .5, 0x1f4f8f, -16, 3.6, 0);
  return g;
}

/* ============================ PLANTAS ============================ */
// Montón de áridos con forma natural: cono irregular de laderas a 35°, cima redondeada y faldón de material suelto
function monton(g, r, h, color, x, y, z, sem = 1){
  const geo = new THREE.ConeGeometry(r, h, 28, 6); geo.translate(0, h / 2, 0);
  const p = geo.attributes.position, rn = (a, b) => Math.sin(a * 12.9898 + b * 78.233 + sem * 17.1) * 43758.5453 % 1;
  for (let i = 0; i < p.count; i++){
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), a = Math.atan2(vz, vx), t = vy / h;
    const ond = 1 + .09 * Math.sin(a * 3 + sem) + .06 * Math.sin(a * 7 + sem * 2) + .03 * Math.abs(rn(Math.round(a * 20), Math.round(t * 6)));
    const k = ond * (t < .12 ? 1.08 : 1);                                         // faldón más ancho abajo
    let yy = vy; if (t > .78) yy = h * (.78 + (t - .78) * .55);                    // cima achatada (la pala la va comiendo)
    p.setXYZ(i, vx * k, yy * (1 + .05 * Math.sin(a * 5 + sem)), vz * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat(color, { flatShading: true, roughness: 1 })); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
// Palmera canaria sencilla (tronco con anillos y penacho de hojas)
function palmeraPlanta(g, x, z, h){
  const t = cil(g, .35, .55, h, 0x8a6a4a, x, h / 2 + .5, z, 8); t.rotation.z = (x % 3 - 1) * .04;
  for (let i = 0; i < 9; i++){ const a = i / 9 * Math.PI * 2, f = caja(g, .5, .12, 5, 0x4e7a2e, x + Math.cos(a) * 2, h + .2, z + Math.sin(a) * 2); f.rotation.y = -a + Math.PI / 2; f.rotation.x = .45; }
  cil(g, .7, .5, 1, 0x6e5a36, x, h + .4, z, 8);
}
// Textura de la solera de la planta (1 px ≈ 15 cm)
function soleraPlanta(o){
  const W = 160, D = 110, s = 6.4;
  const tex = lienzo(1024, 704, (c, w, h) => {
    const X = x => (x + W / 2) * s, Z = z => (z + D / 2) * s, R = (a = 1) => Math.random() * a;
    c.fillStyle = '#9d978d'; c.fillRect(0, 0, w, h);
    // grano del hormigón
    for (let i = 0; i < 26000; i++){ const v = 130 + R(50) | 0; c.fillStyle = `rgba(${v},${v - 4},${v - 10},.18)`; c.fillRect(R(w), R(h), 1 + R(2), 1 + R(2)); }
    // losas de 6 m con su junta y tono algo distinto
    for (let x = -W / 2; x < W / 2; x += 6) for (let z = -D / 2; z < D / 2; z += 6){ c.fillStyle = `rgba(${R() < .5 ? '255,250,240' : '60,55,50'},${.03 + R(.05)})`; c.fillRect(X(x), Z(z), 6 * s, 6 * s); }
    c.strokeStyle = 'rgba(60,56,52,.45)'; c.lineWidth = 1.3;
    for (let x = -W / 2; x <= W / 2; x += 6){ c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), h); c.stroke(); }
    for (let z = -D / 2; z <= D / 2; z += 6){ c.beginPath(); c.moveTo(0, Z(z)); c.lineTo(w, Z(z)); c.stroke(); }
    const mancha = (x, z, r, col, n = 14) => { for (let i = 0; i < n; i++){ const a = R(6.28), d = R(r); c.fillStyle = col; c.beginPath(); c.ellipse(X(x + Math.cos(a) * d), Z(z + Math.sin(a) * d), (r * .35 + R(r * .4)) * s, (r * .25 + R(r * .3)) * s, R(3), 0, 7); c.fill(); } };
    // polvo y áridos esparcidos junto a los acopios y las tolvas
    mancha(-55, -10, 22, 'rgba(201,180,140,.10)', 40); mancha(-20, -22, 12, 'rgba(190,170,130,.10)', 22);
    for (let i = 0; i < 1400; i++){ const x = -75 + R(40), z = -50 + R(85); c.fillStyle = `rgba(${R() < .5 ? '120,110,100' : '215,200,165'},.55)`; c.fillRect(X(x), Z(z), 1.5, 1.5); }
    // cemento y lechada bajo la torre de carga, y zona de lavado mojada
    mancha(35, -22, 9, 'rgba(70,72,74,.14)', 26); mancha(35, -12, 6, 'rgba(200,204,206,.12)', 12);
    mancha(10, -45, 8, 'rgba(45,50,54,.16)', 26); mancha(4, -38, 5, 'rgba(45,50,54,.10)', 10);
    // manchas de gasoil donde aparcan los camiones y en el taller
    for (let k = 0; k < 6; k++) mancha(-9 + k * 6, 32, 1.6, 'rgba(25,22,20,.16)', 5);
    mancha(-25, 45, 6, 'rgba(25,22,20,.12)', 10);
    // rodadas: de la puerta al foso de carga, al aparcamiento, a los acopios y al lavadero
    const rodada = (pts, a = .16) => { for (const off of [-1.1, 1.1]){ c.strokeStyle = `rgba(55,50,46,${a})`; c.lineWidth = .5 * s; c.lineCap = 'round'; c.beginPath();
        pts.forEach(([x, z], i) => { const [nx, nz] = i < pts.length - 1 ? [pts[i + 1][1] - z, x - pts[i + 1][0]] : [z - pts[i - 1][1], pts[i - 1][0] - x]; const L = Math.hypot(nx, nz) || 1;
          const px = X(x + nx / L * off), pz = Z(z + nz / L * off); i ? c.lineTo(px, pz) : c.moveTo(px, pz); }); c.stroke(); } };
    for (let v = 0; v < 3; v++){ const j = () => R(2) - 1;
      rodada([[42 + j(), 58], [40, 44], [37 + j(), 20], [35, -6], [35 + j(), -18]], .1);
      rodada([[35, -10], [26, 8], [12 + j(), 22], [2 + j() * 5, 30]], .09);
      rodada([[-40, -20], [-30, -24], [-22, -22]], .12); rodada([[-46, -8], [-40, -20]], .12);
      rodada([[30, 40], [18, 0], [12, -30], [10, -42]], .07); }
    // marcas viales: paso peatonal amarillo frente a la oficina, línea de STOP y flechas
    c.fillStyle = 'rgba(242,194,48,.85)'; for (let k = 0; k < 8; k++) c.fillRect(X(36 + k * 1.6), Z(21), .8 * s, 3 * s);
    c.fillStyle = 'rgba(245,242,232,.9)'; c.fillRect(X(32), Z(50), 20 * s, .5 * s);
    c.font = `900 ${3.2 * s}px Arial`; c.textAlign = 'center'; c.fillText('STOP', X(42), Z(48.5));
    const flecha = (x, z, ang) => { c.save(); c.translate(X(x), Z(z)); c.rotate(ang); c.beginPath(); c.moveTo(0, -3 * s); c.lineTo(1.4 * s, -.6 * s); c.lineTo(.5 * s, -.6 * s); c.lineTo(.5 * s, 2.5 * s); c.lineTo(-.5 * s, 2.5 * s); c.lineTo(-.5 * s, -.6 * s); c.lineTo(-1.4 * s, -.6 * s); c.closePath(); c.fill(); c.restore(); };
    flecha(38, 36, -.1); flecha(36, 6, 0); flecha(22, 14, -2.3);
    // báscula: marco de chapa
    c.strokeStyle = 'rgba(40,40,40,.6)'; c.lineWidth = 2; c.strokeRect(X(10), Z(39.8), 20 * s, 4.5 * s);
  });
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W - .4, D - .4), new THREE.MeshStandardMaterial({ map: tex, roughness: .95, metalness: 0 }));
  m.rotation.x = -Math.PI / 2; m.position.y = .505; m.receiveShadow = true; return m;
}
function crearPlanta(o){
  // o: {marca:'H', fondo:'#d2201f', color: 0xd2201f, tolvas:3, principal:true}
  const g = new THREE.Group(), C = o.color;
  caja(g, 160, .5, 110, 0x9c968c, 0, .25, 0);                                  // solera
  // superficie de la solera pintada: losas con juntas, polvo de áridos, manchas de cemento y agua, rodadas y marcas viales
  g.add(soleraPlanta(o));
  for (const [w, d, x, z] of [[160, .6, 0, -55], [.6, 110, -80, 0], [.6, 110, 80, 0], [110, .6, -25, 55]]) caja(g, w, 2, d, 0x6f7f6a, x, 1, z);   // vallado
  // malla del vallado (semitransparente) y palmeras canarias junto a la entrada y la oficina
  for (const [w, d, x, z] of [[160, .05, 0, -55], [.05, 110, -80, 0], [.05, 110, 80, 0], [110, .05, -25, 55]]) caja(g, w, 2.2, d, 0xc9d0d4, x, 3.1, z, { transparent: true, opacity: .35, metalness: .6, roughness: .4 });
  for (const [x, z, h] of [[60, 53, 9], [70, 52, 11], [24, 53, 8], [77, 22, 10], [77, 8, 8.5]]) palmeraPlanta(g, x, z, h);
  // acopios con muros de bloque (montones irregulares, no conos perfectos)
  const st = o.principal ? (window.STOCK_PLANTA || { acopio: .6 }) : { acopio: .7 };
  const k = .45 + .8 * st.acopio;
  [[0xd9c6a1, -45, 1], [0x8d8882, -10, 2], [0xbdb3a2, 25, 3]].forEach(([c, z, sem]) => { const a = monton(g, 13 * k, 8 * k, c, -58, .5, z, sem); a.userData.acopio = a.userData.vivo = true; });
  for (const z of [-27, 8]) caja(g, 26, 3.5, 1.6, 0xb8b4ac, -58, 2.2, z);
  caja(g, 1.6, 3.5, 74, 0xb8b4ac, -72, 2.2, -10);
  // pala cargadora
  const pala = new THREE.Group();
  caja(pala, 3.6, 1.8, 2.4, 0xf2b705, -1.6, 2.1, 0); caja(pala, 2.6, 1.2, 2.2, 0xe0a800, 1.1, 1.8, 0);              // motor y bastidor
  caja(pala, 2.2, 2.2, 2.3, 0x2a2a2a, -.6, 4.1, 0); caja(pala, 2.25, 1.6, 2.35, 0x2f4f66, -.6, 4.2, 0, { roughness: .1, metalness: .6, transparent: true, opacity: .45 });   // cabina acristalada
  caja(pala, 2.5, .2, 2.6, 0xf2b705, -.6, 5.3, 0);                                                              // techo ROPS
  caja(pala, .5, .62, .35, 0xff7a1a, -.7, 3.7, 0); const cab = new THREE.Mesh(new THREE.SphereGeometry(.15, 8, 6), mat(0xc89a7a)); cab.position.set(-.7, 4.2, 0); pala.add(cab);
  const cas = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff)); cas.position.set(-.7, 4.26, 0); pala.add(cas);   // palista
  caja(pala, .2, 1.2, .2, 0x333333, -3.4, 3.4, .7);                                                             // escape
  for (const [x, z] of [[-1.9, 1.35], [-1.9, -1.35], [1.5, 1.35], [1.5, -1.35]]){ const r = cil(pala, 1.05, 1.05, .9, 0x1a1a1a, x, 1.05, z, 14); r.rotation.x = Math.PI / 2; const l = cil(pala, .5, .5, .92, 0xe0a800, x, 1.05, z, 10); l.rotation.x = Math.PI / 2; }
  const brazo = new THREE.Group(); brazo.position.set(1.8, 2.6, 0); pala.add(brazo);                            // brazos y cazo (se levantan)
  for (const z of [-.8, .8]){ const b = caja(brazo, 3.4, .45, .35, 0xf2b705, 1.6, -.4, z); b.rotation.z = -.25; }
  const cazo = new THREE.Group(); cazo.position.set(3.3, -1.3, 0); brazo.add(cazo); caja(cazo, 1.3, 1.1, 3.1, 0x5a5f64, .3, 0, 0); caja(cazo, .2, 1.1, 3.1, 0x3d4246, .95, -.2, 0);
  pala.position.set(-40, .5, -20); pala.rotation.y = .6; g.add(pala);
  pala.userData.vivo = true; g.userData.pala = pala; g.userData.palaBrazo = brazo; g.userData.palaCazo = cazo;
  g.userData.fusionar = true;
  // tolvas de áridos (3 a 5)
  const n = o.tolvas || 3, x0 = -28;
  for (let i = 0; i < n; i++){
    const x = x0 + i * 9.5;
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) caja(g, .6, 6, .6, 0x4b5560, x + dx, 3.5, -22 + dz);
    const t = cono(g, 4.8, 5.5, 0x5f8299, x, 9.2, -22, 4); t.rotation.y = Math.PI / 4; t.rotation.x = Math.PI;
    for (const [w, d, dx, dz] of [[7.4, .5, 0, 3.45], [7.4, .5, 0, -3.45], [.5, 7.4, 3.45, 0], [.5, 7.4, -3.45, 0]]) caja(g, w, .8, d, C, x + dx, 12, -22 + dz);   // borde con el color de la empresa
  }
  const largoC = n * 9.5 + 4;
  // material propio de las cintas para poder animarlas (la goma «corre»)
  const texCinta = lienzo(64, 16, (c, w, h) => { c.fillStyle = '#26292c'; c.fillRect(0, 0, w, h); c.fillStyle = '#4a4e52'; for (let x = 0; x < w; x += 8) c.fillRect(x, 0, 3, h); });
  texCinta.wrapS = THREE.RepeatWrapping; texCinta.repeat.set(6, 1);
  const matCinta = new THREE.MeshStandardMaterial({ map: texCinta, roughness: .8 }); g.userData.cinta = matCinta;
  const conCinta = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matCinta); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  conCinta(largoC, .7, 1.8, x0 - 4.5 + largoC / 2, 2.2, -22);                      // cinta colectora
  // cinta inclinada hasta la torre
  const x1 = x0 - 4.5 + largoC, y1 = 2.2, x2 = 30, y2 = 17, Lc = Math.hypot(x2 - x1, y2 - y1);
  const cinta = conCinta(Lc, .9, 2, (x1 + x2) / 2, (y1 + y2) / 2, -22); cinta.rotation.z = Math.atan2(y2 - y1, x2 - x1);
  for (let s = .25; s < 1; s += .25){ const xx = x1 + (x2 - x1) * s, yy = y1 + (y2 - y1) * s; caja(g, .5, yy, .5, 0x4b5560, xx, yy / 2, -23); caja(g, .5, yy, .5, 0x4b5560, xx, yy / 2, -21); }
  // áridos que viajan por las cintas mientras se carga (uno por línea)
  const caminos = []; for (let l = 0; l < (o.lineas || 1); l++){ const zL = -22 + 24 * l; caminos.push({ zL, p: [[x0 - 4.5, 2.75, zL], [x1, 2.75, zL], [x2, y2 + .55, zL]] }); }
  const trozos = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.55, 0), mat(0xb9a682, { flatShading: true }), 36 * caminos.length);
  trozos.userData.vivo = true; trozos.count = 0; trozos.frustumCulled = false; trozos.castShadow = true; g.add(trozos);
  g.userData.trozos = { m: trozos, caminos, tolvasX: Array.from({ length: n }, (_, i) => x0 + i * 9.5), o: new THREE.Object3D() };
  // torre de amasado sobre el foso de carga
  for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) caja(g, 1, 7, 1, 0x4b5560, 35 + dx, 3.5, -22 + dz);
  caja(g, 12, 13, 12, 0xeceeef, 35, 13.5, -22);
  caja(g, 12.2, 2.4, 12.2, C, 35, 17.5, -22);
  cartel(g, o.marca, o.fondo, '#ffffff', 7, 7 * .5, 35, 12, -15.85);
  caja(g, 13, .6, 13, 0x7b858f, 35, 20.3, -22);
  // silo(s) de cemento + tornillo
  const nsilos = o.silos || 1;
  for (let s = 0; s < nsilos; s++){
    const sx = 50 + s * 9;
    for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) caja(g, .5, 6, .5, 0x8a9096, sx + dx, 3, -30 + dz);
    const b = cono(g, 3.8, 4, 0xe9ecee, sx, 7.6, -30, 20); b.rotation.x = Math.PI;
    cil(g, 3.8, 3.8, 17, 0xf3f5f6, sx, 18, -30, 20, { metalness: .3, roughness: .5 });
    cono(g, 3.8, 1.6, 0xd7dbde, sx, 27.3, -30, 20);
    const tor = cil(g, .5, .5, 17, 0x9aa1a7, sx - 7, 12, -26, 8); tor.rotation.z = .9; tor.rotation.y = .3;
  }
  // foso de carga marcado y báscula
  caja(g, 14, .08, 14, 0x404244, 35, .55, -22);
  caja(g, 20, .4, 4.5, 0x37393c, 20, .6, 42);
  // oficina y laboratorio
  caja(g, 26, 4, 11, 0xf6f6f3, 50, 2.5, 30); caja(g, 26.2, 1.3, 11.2, 0x2d5d7b, 50, 2.8, 30, { roughness: .2, metalness: .5 });
  caja(g, 26.4, .3, 11.4, 0x8e9499, 50, 4.6, 30);
  for (const [w, d, dz] of [[26.6, .4, 5.7], [26.6, .4, -5.7]]) caja(g, w, .9, d, C, 50, 4.6, 30 + dz);
  cartel(g, o.marca, o.fondo, '#ffffff', 6, 3, 50, 7.6, 35.8);
  for (const x of [47.5, 52.5]) caja(g, .3, 3, .3, 0x666666, x, 6, 35.7);
  caja(g, 12, 3, 3, 0xcfd5da, 22, 2, 30);                                         // laboratorio (contenedor)
  cil(g, 2.4, 2.4, 5, 0xbfc7cc, 64, 3, -6, 16);                                   // depósito de agua
  for (const [x, z] of [[-75, -50], [75, -50], [75, 50], [-20, 50]]){ cil(g, .25, .3, 11, 0x777777, x, 6, z, 6); caja(g, 1.4, .4, .7, 0xfafafa, x, 11.5, z); }
  // rótulo pintado en el silo y escalera de gato
  const rotulo = o.marca === 'H' ? 'HORINSA' : o.marca;
  const tsilo = lienzo(256, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = o.fondo; c.font = `900 ${rotulo.length > 3 ? 54 : 100}px "Arial Black",Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(rotulo, w / 2, h / 2 + 4); });
  const dec = new THREE.Mesh(new THREE.CylinderGeometry(3.86, 3.86, 6, 24, 1, true, -.75, 1.5), new THREE.MeshStandardMaterial({ map: tsilo, transparent: true, roughness: .5 }));
  dec.position.set(50, 20, -30); g.add(dec);
  for (const dz of [-.35, .35]) caja(g, .12, 17, .12, 0x555c62, 46.1, 18, -30 + dz);
  for (let y = 10; y < 27; y += 1.2) caja(g, .1, .1, .8, 0x555c62, 46.1, y, -30);
  // barandillas y pasarela en lo alto de la torre
  for (const [w, d, dx, dz] of [[13, .1, 0, 6.4], [13, .1, 0, -6.4], [.1, 13, 6.4, 0], [.1, 13, -6.4, 0]]){ caja(g, w, .1, d, 0xf2c230, 35 + dx, 21.6, -22 + dz); caja(g, w, .1, d, 0xf2c230, 35 + dx, 21, -22 + dz); }
  const esc = caja(g, 1.2, .2, 16, 0x6c747b, 43, 11, -14); esc.rotation.x = -.95;   // escalera de acceso
  // puerta de entrada con rótulo
  for (const x of [32, 52]) caja(g, 1.6, 6, 1.6, 0xeceae4, x, 3, 56);
  caja(g, 22, 3, .5, o.color, 42, 7.5, 56);
  cartel(g, rotulo, o.fondo, '#ffffff', 14, 2.4, 42, 7.5, 56.3);
  // plazas pintadas para las hormigoneras y zona de lavado
  for (let k = 0; k < 6; k++) caja(g, .3, .06, 14, 0xf4f1e8, -12 + k * 6, .53, 32);
  caja(g, 16, .1, 10, 0x6f7a80, 10, .5, -45); caja(g, 16, 4, .3, 0x9aa3a8, 10, 2, -50);
  cil(g, .15, .15, 4, 0x3a87c8, 3, 2, -46, 6);
  if (o.principal){
    // taller mecánico (abierto hacia el patio) con elevador de columnas, banco y herramientas
    caja(g, 26, .3, 14, 0x7d8388, -25, .65, 45);
    caja(g, .4, 7, 14, 0xd9dcdf, -37.8, 4, 45); caja(g, .4, 7, 14, 0xd9dcdf, -12.2, 4, 45);
    // tejado, pared trasera, frontal y persiana: aparte, para quitarlos al acercar la cámara (se ve dentro)
    const techo = new THREE.Group();
    caja(techo, 26, 7, .4, 0xd9dcdf, -25, 4, 51.8); caja(techo, 27, .4, 15, 0x9aa1a7, -25, 7.6, 45); caja(techo, 26.2, 1.2, .5, o.color, -25, 6.8, 38.2); caja(techo, 25, 1.6, .3, 0xb9bec3, -25, 6, 38.3);
    cartel(techo, 'TALLER', o.fondo, '#ffffff', 7, 1.2, -25, 6.8, 37.9, Math.PI);
    caja(g, 26, 1.2, .4, 0xd9dcdf, -25, 1.1, 51.8);                                   // zócalo trasero (queda siempre)
    techo.userData.vivo = true; g.add(techo); g.userData.techoTaller = techo;
    // foco del taller: se enciende por la noche cuando trabaja el mecánico del turno de tarde
    luzTaller = new THREE.PointLight(0xffe2b0, 0, 40 * M * 1.6, 1.6); luzTaller.position.set(-25, 6.5, 45); luzTaller.visible = false; g.add(luzTaller);
    for (const x of [-31, -19]){ caja(g, .5, 4, .5, 0x2a5f9e, x, 2.6, 41.5); caja(g, .5, 4, .5, 0x2a5f9e, x, 2.6, 48.5); }                   // elevador
    caja(g, 8, 1, 1.4, 0x6b4a2a, -33, 1.2, 51); caja(g, 2, 2.6, 1, 0xc0392b, -27, 2, 51.2); cil(g, .7, .7, 1.4, 0x3a87c8, -16, 1.5, 50, 10);    // banco, armario y compresor
    for (let k = 0; k < 4; k++){ const r = cil(g, .9, .9, .35, 0x1a1a1a, -14.5, .9 + k * .38, 41, 12); }                                       // neumáticos apilados
    // caseta de control acristalada junto a la torre
    caja(g, 6, .3, 4, 0x8a9096, 24, .65, -9); caja(g, 6, 3.4, .2, 0xf2f2f0, 24, 2.4, -11); caja(g, .2, 3.4, 4, 0xf2f2f0, 21, 2.4, -9);
    caja(g, .2, 3.4, 4, 0x2f4f66, 27, 2.4, -9, { roughness: .1, metalness: .6, transparent: true, opacity: .35 }); caja(g, 6, .3, 4.2, 0x9aa1a7, 24, 4.2, -9);
    caja(g, 1.6, .9, .8, 0x333333, 26, 1.6, -9.5);                                                                                          // pupitre de mandos
    // vestuarios / comedor, contenedor de escombros y coches del personal
    caja(g, 12, 3, 3.6, 0x3c6e8f, 2, 2.1, 49); caja(g, 1, 2.1, .1, 0xdcdcdc, 4, 1.7, 47.15); cartel(g, 'VESTUARIOS', '#3c6e8f', '#ffffff', 5, .8, -1, 2.9, 47.1, Math.PI);
    const cont = caja(g, 7, 2, 3.2, 0xf2b705, 66, 1.6, -46); cont.scale.set(1, 1, 1); caja(g, 6, .8, 2.6, 0x9e9a92, 66, 2.6, -46);
    [[0xb3261e, 58], [0xf2f2f2, 63], [0x2b2b2b, 68], [0x1f4e8c, 73]].forEach(([c, x]) => { caja(g, 2, 1.2, 4.3, c, x, 1.25, 45, { metalness: .4, roughness: .35 }); caja(g, 1.8, .7, 2.3, 0x1b252e, x, 2.15, 45.3, { metalness: .7, roughness: .1 }); });
    for (let k = 0; k < 5; k++) caja(g, .2, .05, 5, 0xf4f1e8, 55.5 + k * 5, .52, 45);
    // panel de días sin accidentes en la entrada (se repinta cada día)
    for (const x of [27, 33]) caja(g, .3, 4, .3, 0x666666, x, 2.5, 60);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardMaterial({ map: tx, roughness: .6 })); panel.position.set(30, 4, 60.2); panel.userData.vivo = true; g.add(panel);
    g.userData.panelDias = { cv, tx, ultimo: -1 };
  }
  // segunda línea: copia de tolvas, cintas y torre, 24 m más al sur
  if ((o.lineas || 1) > 1) for (const m of g.children.slice()) if (m.isMesh && m.position.z > -29 && m.position.z < -15 && m.position.x > -34 && m.position.x < 42){ const c = m.clone(); c.position.z += 24; g.add(c); }
  return g;
}
/* ------------------------- Planta de asfalto ------------------------- */
let plantaA = null, plantaSur = null;
const OFF_ASF = [.24, 0];                                          // km al este de la planta de hormigón
function crearPlantaAsfalto(){
  const g = new THREE.Group();
  caja(g, 120, .4, 76, 0x5d5a56, 0, .2, 0);
  for (const [w, d, x, z] of [[120, .6, 0, -38], [.6, 76, -60, 0], [.6, 76, 60, 0], [120, .6, 0, 38]]) caja(g, w, 2, d, 0x6f7f6a, x, 1, z);
  // tolvas de alimentación en frío
  for (let i = 0; i < 4; i++){ const x = -44 + i * 7;
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) caja(g, .4, 4, .4, 0x4b5560, x + dx, 2.2, -22 + dz);
    const t = cono(g, 3.4, 3.8, 0xd9a521, x, 6, -22, 4); t.rotation.y = Math.PI / 4; t.rotation.x = Math.PI; }
  caja(g, 30, .6, 1.5, 0x26292c, -33, 1.6, -22);
  const cin = caja(g, 22, .7, 1.6, 0x26292c, -12, 4, -15); cin.rotation.y = -.35; cin.rotation.z = .18;
  // tambor secador con quemador
  const tam = cil(g, 2.4, 2.4, 18, 0x9aa1a7, 2, 5.2, -8, 20, { metalness: .5, roughness: .45 }); tam.rotation.z = Math.PI / 2 + .07;
  for (const x of [-5, 9]){ const a = cil(g, 2.6, 2.6, .5, 0x5c6268, x, 5.2, -8, 20); a.rotation.z = Math.PI / 2; caja(g, 1.2, 3.5, 4, 0x4b5560, x, 1.8, -8); }
  caja(g, 3, 3, 3, 0xe0662a, -9, 4.8, -8);                                                // quemador
  // filtro de mangas y chimenea
  caja(g, 11, 9, 7, 0xb9bec3, 18, 6, -20); caja(g, 11.2, .6, 7.2, ROJO, 18, 10.8, -20);
  cil(g, .9, 1.1, 20, 0x8a9096, 26, 10, -20, 12);
  // elevador de cangilones y silo de mezcla caliente
  const el = caja(g, 1.6, 24, 1.6, 0x707780, 13, 12, 4); el.rotation.z = -.12;
  for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) caja(g, .6, 9, .6, 0x4b5560, 20 + dx, 4.5, 10 + dz);
  caja(g, 7, 8, 7, 0xeceeef, 20, 13, 10); const cb = cono(g, 4.6, 3, 0xd8dadc, 20, 7.6, 10, 4); cb.rotation.y = Math.PI / 4; cb.rotation.x = Math.PI;
  caja(g, 7.2, 1.6, 7.2, ROJO, 20, 16.2, 10); cartel(g, 'H', '#d2201f', '#ffffff', 4, 2, 20, 12, 13.6);
  // tanques de betún (horizontales y negros) y cabina de control
  for (const z of [22, 29]){ const t = cil(g, 2, 2, 13, 0x1c1c1c, -28, 2.6, z, 16, { roughness: .4 }); t.rotation.z = Math.PI / 2; caja(g, 13, .6, 4, 0x4b5560, -28, .5, z); }
  caja(g, 9, 3.2, 5, 0xf6f6f3, 38, 1.9, 24); caja(g, 9.2, 1, 5.2, 0x2d5d7b, 38, 2.4, 24, { roughness: .2, metalness: .5 });
  cartel(g, 'HORINSA', '#d2201f', '#ffffff', 7, 1.6, 38, 4.6, 26.6);
  // acopio de áridos para el asfalto
  cono(g, 9, 6, 0x8d8882, -44, 3.2, 18); cono(g, 8, 5, 0xbdb3a2, -44, 2.8, 2);
  return g;
}
function puestoAsfalto(c, i){
  if (!plantaA) return null;
  const k = M * 1.6, P0 = plantaA.position;
  if (c.estado === 'cargando') return [P0.x + 22 * k, P0.z + 10 * k, 0];
  if (c.estado === 'cola') return [P0.x + 40 * k, P0.z + (6 + (R.colaA ? R.colaA.indexOf(c) : 0) * 7) * k, Math.PI];
  if (c.estado === 'libre') return [P0.x + (-10 + (i % 4) * 7) * k, P0.z + 28 * k, Math.PI / 2];
  return null;
}
const plantasRivales = {};
const rivalComprado = k => typeof J !== 'undefined' && J && J.rivales && J.rivales[k] && J.rivales[k].comprada;
function actualizarRivales(){
  for (const k in plantasRivales){ const pr = plantasRivales[k];
    if (rivalComprado(k) && !pr.mia){ scene.remove(pr.obj); const p = crearPlanta({ marca: 'H', fondo: '#d2201f', color: ROJO, tolvas: 4, silos: 2 }); p.rotation.y = pr.rot; colocarEn(p, pr.x, pr.z, 1.6); pr.obj = p; pr.mia = true; } }
}
// hacia dónde mira la boca de una cantera: hacia el comienzo de su carretera de acceso (o hacia la vía más cercana)
function anguloAcceso(x, z){
  let mejor = null;
  for (const r of CARRETERAS){ if (r.acceso){ const f = r.k[r.k.length - 1]; if (Math.hypot(f[0] - x, f[1] - z) < .25){ mejor = r.k[0]; break; } } }
  if (!mejor){ let bd = 1e9; for (const r of CARRETERAS){ if (r.t === 'pista') continue; for (const p of r.k){ const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd){ bd = d; mejor = p; } } } }
  return mejor ? Math.atan2(mejor[0] - x, mejor[1] - z) : 0;
}
function crearPlantas(){
  // HORINSA
  const [px, pz] = P(HORINSA.planta.la, HORINSA.planta.lo);
  plantaH = colocarEn(crearPlanta({ marca: 'H', fondo: '#d2201f', color: ROJO, tolvas: HORINSA.planta.tolvas, principal: true }), px, pz, 1.6);
  tolvasHechas = HORINSA.planta.tolvas;
  // Rivales
  const rivales = { L: ['#1f5fbf', 0x1f5fbf], HC: ['#1d8a4a', 0x1d8a4a], T: ['#7a3db8', 0x7a3db8] };
  for (const m of MARCAS){
    const [x, z] = P(m.la, m.lo);
    if (rivales[m.t]){ const p = crearPlanta({ marca: m.t, fondo: rivales[m.t][0], color: rivales[m.t][1], tolvas: 4, silos: 2 }); p.rotation.y = (m.la * 1000) % 1.5; colocarEn(p, x, z, 1.6); plantasRivales[m.t] = { obj: p, x, z, rot: p.rotation.y, mia: false }; }
    if (m.t === 'cr'){ const c = crearCantera(false); c.rotation.y = anguloAcceso(x, z); colocarEn(c, x, z, 1.6); }
    if (m.t === 'ce') colocarEn(crearTerminalCemento(), x, z, 1.6);
  }
  const [qx, qz] = P(HORINSA.cantera.la, HORINSA.cantera.lo);
  const cq = crearCantera(true); cq.rotation.y = anguloAcceso(qx, qz); colocarEn(cq, qx, qz, 1.6);
}
// Cantera a cielo abierto cortada en un cono volcánico: bancos escalonados con estratos de basalto y picón,
// fondo con rodadas, planta de machaqueo (tolva, machacadora, criba, cintas y acopios), excavadora en el frente,
// dúmper, pala, caseta, báscula, depósito de agua y torre de luz.
function crearCantera(propia){
  const g = new THREE.Group(), rn = i => { const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };
  const AM = 0xf2b705, GR = 0x3b3f44, NG = 0x222222, VI = 0x1c2a36;
  // ---- el hoyo: perfil de bancos (r, y, tipo) ----
  const pf = [[0, 1, 'f'], [30, 1, 'f'], [58, 1, 'f']];
  let r = 58, y = 1;
  for (let b = 0; b < 4; b++){ pf.push([r + 1.2, y + 2.5, 'c'], [r + 2.2, y + 5, 'c'], [r + 3, y + 7, 'c']); r += 3; y += 7; pf.push([r + 6, y, 'b'], [r + 14, y, 'b']); r += 14; }
  pf.push([r + 3, y + 1.5, 'o'], [r + 12, y - 6, 'o'], [r + 22, y - 16, 'o'], [r + 32, y - 25, 'o'], [r + 38, 0, 'o']);
  const hueco = .62, SEG = 72, NP = pf.length;
  const geo = new THREE.LatheGeometry(pf.map(([a, b]) => new THREE.Vector2(a, b)), SEG, hueco / 2, Math.PI * 2 - hueco);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const cF = new THREE.Color(0xb39d7c), cB = new THREE.Color(0x857160), cBas = new THREE.Color(0x4a3a34), cRoj = new THREE.Color(0x7d4532), cPic = new THREE.Color(0x8a4a30), cNeg = new THREE.Color(0x3a2c28);
  for (let v = 0; v < pos.count; v++){
    const i = Math.floor(v / NP), j = v % NP, t = pf[j][2], x = pos.getX(v), z = pos.getZ(v), yy = pos.getY(v), ph = Math.atan2(x, z), rr = Math.hypot(x, z);
    const borde = Math.min(1, Math.min(i, SEG - i) / 6);                                      // sin deformar junto a la boca (encaja con las tapas)
    let k = 1 + borde * (.06 * Math.sin(ph * 3 + 1) + .035 * Math.sin(ph * 7 + 2) + .015 * Math.sin(ph * 17));
    if (t === 'c') k += borde * (rn(v) - .5) * .035;                                           // frentes de roca rugosos
    if (t !== 'f' || j > 1) pos.setXYZ(v, x * k, yy + (t === 'o' ? borde * (rn(i * 3 + j) - .5) * 2.5 : 0), z * k);
    const n = rn(v * 7.3) * .18;
    if (t === 'f') c.copy(cF).offsetHSL(0, 0, n - .09);
    else if (t === 'b') c.copy(cB).lerp(cRoj, rn(i * 5 + j) * .25).offsetHSL(0, 0, n * 1.2 - .12);
    else if (t === 'c'){ const e = .5 + .5 * Math.sin(yy * 1.7 + Math.sin(ph * 5) * .8); c.copy(cBas).lerp(cRoj, e * .8).offsetHSL(0, 0, n - .06); }
    else { const e = .5 + .5 * Math.sin(ph * 4 + rr * .05); c.copy(cNeg).lerp(cPic, e).offsetHSL(0, 0, n - .05); }
    col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const hoyo = new THREE.Group(); hoyo.scale.set(1, 1, .75); g.add(hoyo);
  const bowl = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide })); bowl.castShadow = bowl.receiveShadow = true; hoyo.add(bowl);
  // tapas de la boca: el corte del cono visto de lado
  const forma = new THREE.Shape(); forma.moveTo(0, 0); for (const [a, b] of pf) forma.lineTo(a, b); forma.lineTo(pf[NP - 1][0], 0); forma.lineTo(0, 0);
  for (const ph of [hueco / 2, Math.PI * 2 - hueco / 2]){ const m = new THREE.Mesh(new THREE.ShapeGeometry(forma), mat(0x5a4236, { side: THREE.DoubleSide, roughness: 1 })); m.rotation.y = ph - Math.PI / 2; m.castShadow = m.receiveShadow = true; hoyo.add(m); }
  // fondo con rodadas de dúmper, charcos de agua de riego y piedras sueltas
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(57.5, 48), new THREE.MeshStandardMaterial({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, map: lienzo(512, 512, (x, w, h) => {
    x.fillStyle = '#b39d7c'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++){ const q = Math.random(); x.fillStyle = q < .5 ? 'rgba(70,55,45,.18)' : 'rgba(235,220,190,.16)'; const s = Math.random() * 3 + .5; x.fillRect(Math.random() * w, Math.random() * h, s, s); }
    x.strokeStyle = 'rgba(80,64,50,.28)'; x.lineCap = 'round';
    for (let k = 0; k < 7; k++){ x.lineWidth = 9 + Math.random() * 6; const y0 = h * (.15 + k * .11); x.beginPath(); x.moveTo(w * .5, h); x.bezierCurveTo(w * (.2 + Math.random() * .6), h * .7, w * Math.random(), y0 + 40, w * (.15 + Math.random() * .7), y0); x.stroke(); }
    for (let k = 0; k < 5; k++){ x.fillStyle = 'rgba(95,80,66,.35)'; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 30, 8 + Math.random() * 12, Math.random() * 3, 0, 7); x.fill(); }
    for (let i = 0; i < 260; i++){ x.fillStyle = Math.random() < .5 ? '#5b4a40' : '#7d6a58'; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 0, 7); x.fill(); } }) }));
  suelo.rotation.x = -Math.PI / 2; suelo.position.y = 1.03; suelo.receiveShadow = true; hoyo.add(suelo);
  // pista que sube al primer banco (pegada a la pared oeste)
  const pista = caja(hoyo, 7, .8, 34, 0xa8916f, -63, 4.6, 4); pista.rotation.x = -Math.atan2(7, 34);
  // bloques de roca caídos al pie de los frentes
  for (let i = 0; i < 46; i++){ const ph = hueco / 2 + .15 + rn(i + 50) * (Math.PI * 2 - hueco - .3), rr = 52 + rn(i + 90) * 5, s = 1 + rn(i + 130) * 2.4;
    const p = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 4), mat(rn(i) < .5 ? 0x4a3a34 : 0x6a4434, { flatShading: true, roughness: 1 }));
    p.position.set(Math.sin(ph) * rr, 1 + s * .45, Math.cos(ph) * rr * .75); p.scale.set(1, .7, .85); p.rotation.set(rn(i + 3) * 3, rn(i + 7) * 3, 0); p.castShadow = p.receiveShadow = true; g.add(p); }

  // ---- planta de machaqueo ----
  const patas = (x, z, w, d, h, color = GR) => { for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) caja(g, .5, h, .5, color, x + a, 1 + h / 2, z + b); };
  const cinta = (x1, y1, z1, x2, y2, z2) => { const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, L = Math.hypot(dx, dy, dz), H = Math.hypot(dx, dz);
    const o = new THREE.Group(); o.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); o.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, H)); g.add(o);
    caja(o, L, .45, 1.5, GR, 0, 0, 0); caja(o, L, .12, 1.1, 0x161616, 0, .28, 0); caja(o, L, .7, .08, 0x8a9096, 0, .55, .8); caja(o, L, .7, .08, 0x8a9096, 0, .55, -.8);
    const nL = Math.max(1, Math.floor(H / 7)); for (let k = 1; k <= nL; k++){ const f = k / (nL + 1), py = y1 + dy * f; caja(g, .35, py - 1, .35, GR, x1 + dx * f, (py + 1) / 2, z1 + dz * f); } };
  // tolva de alimentación y machacadora de mandíbulas
  const TX = -30, TZ = -22;
  patas(TX, TZ, 5, 5, 6); caja(g, 6, .6, 6, GR, TX, 7.3, TZ);
  const tv = cil(g, 5.2, 2, 3.6, AM, TX, 9.4, TZ, 4); tv.rotation.y = Math.PI / 4;
  caja(g, 7.5, 1, .4, 0x8a9096, TX, 11.3, TZ - 3.6); caja(g, .4, 1, 7.5, 0x8a9096, TX - 3.6, 11.3, TZ);
  caja(g, 5, 4, 3.6, 0x5f6870, TX + 5, 3, TZ); for (const zz of [-2.1, 2.1]){ const v = cil(g, 1.7, 1.7, .5, 0xd2201f, TX + 4, 4, TZ + zz, 18); v.rotation.x = Math.PI / 2; }
  caja(g, 3, 2.4, 2.2, 0x2d3236, TX + 5, 6.2, TZ);                                         // motor
  // rampa de tierra para que el dúmper vuelque en la tolva
  const rmp = caja(g, 18, 1.2, 8, 0x9c8668, TX - 13, 4.4, TZ); rmp.rotation.z = Math.atan2(7, 18) * .9; caja(g, 8, 7.2, 8, 0x9c8668, TX - 6.5, 4.6, TZ);
  // criba vibrante elevada
  const CX = -6, CZ = -16;
  patas(CX, CZ, 6, 3.6, 7); const cb = caja(g, 7.5, 2, 4, 0x4b7a99, CX, 9.4, CZ); cb.rotation.z = -.18; caja(g, 7.6, .3, 4.2, 0x8a9096, CX, 10.6, CZ).rotation.z = -.18;
  cinta(TX + 7, 2.5, TZ, CX - 3.5, 10.5, CZ);
  // tres cintas a los acopios
  const ac = propia ? [[0x2e2726, 'picón'], [0x7a4a36, 'arena'], [0x9a8f80, 'grava']] : [[0x3a3331], [0x86573f], [0xa29684]];
  const destinos = [[8, -34], [22, -22], [24, -4]];
  destinos.forEach(([x, z], i) => { cinta(CX + 3, 8.5 - i, CZ + (i - 1) * 1.2, x, 11, z); monton(g, 10.5, 9, ac[i][0], x + 2, .9, z, i + 3); });
  // acopio de todo-uno junto a la tolva
  monton(g, 8, 5.5, 0x5a4438, TX - 4, .9, TZ + 15, 9);

  // ---- maquinaria ----
  // excavadora de cadenas en el frente este
  { const e = new THREE.Group(); e.position.set(43, 1, 6); e.rotation.y = -.25; g.add(e);
    for (const s of [-1.6, 1.6]){ caja(e, 6.4, 1.2, 1.1, NG, 0, .6, s); caja(e, 5.4, .3, 1.15, 0x3a3a3a, 0, 1.25, s); }
    caja(e, 2.2, .6, 2.2, 0x2a2a2a, 0, 1.45, 0);
    const t = new THREE.Group(); t.position.y = 1.75; e.add(t);
    caja(t, 4.6, 1.5, 3.2, AM, -.6, .75, 0); caja(t, 1.2, 1.7, 3.2, 0x2f2f2f, -3.3, .85, 0);
    caja(t, 1.9, 2, 1.4, AM, 1.1, 2.1, 1.0); caja(t, 1.95, 1.2, 1.3, VI, 1.15, 2.4, 1.0, { roughness: .1, metalness: .6 });
    const bo = new THREE.Group(); bo.position.set(1.4, 1.5, -.4); bo.rotation.z = .7; t.add(bo); caja(bo, 6.6, .8, .7, AM, 3.3, 0, 0);
    const pa = new THREE.Group(); pa.position.set(6.6, 0, 0); pa.rotation.z = -2.0; bo.add(pa); caja(pa, 4.2, .55, .55, AM, 2.1, 0, 0);
    const cz = new THREE.Group(); cz.position.set(4.2, 0, 0); cz.rotation.z = -.6; pa.add(cz); caja(cz, 1.5, 1.3, 1.6, 0x55595d, .6, 0, 0); }
  monton(g, 6, 3.4, 0x4f3c34, 50, .9, 13, 11);                                               // roca volada al pie del frente
  // dúmper rígido cargado
  const dumper = (x, z, ry) => { const d = new THREE.Group(); d.position.set(x, 1, z); d.rotation.y = ry; g.add(d);
    for (const [px, pz] of [[2.8, 1.8], [2.8, -1.8], [-2.4, 1.8], [-2.4, -1.8]]){ const w = cil(d, 1.35, 1.35, 1, NG, px, 1.35, pz, 16); w.rotation.x = Math.PI / 2; const l = cil(d, .7, .7, 1.02, AM, px, 1.35, pz, 10); l.rotation.x = Math.PI / 2; }
    caja(d, 8, .8, 2.4, 0x2e2e2e, 0, 1.9, 0); caja(d, 1.8, 1.8, 1.4, AM, 3.4, 3.2, 1.05); caja(d, 1.85, 1, 1.3, VI, 3.45, 3.5, 1.05, { roughness: .1, metalness: .6 });
    caja(d, 1.2, 1.4, 2.4, AM, 3.6, 2.9, -.6);
    caja(d, 6.2, .35, 3.8, AM, -.7, 2.8, 0); for (const s of [-1.85, 1.85]) caja(d, 6.2, 1.9, .25, AM, -.7, 3.8, s); caja(d, .35, 2.6, 3.8, AM, 2.4, 4.1, 0); caja(d, 1.6, .25, 3.8, AM, 3.2, 5.4, 0);
    monton(d, 2.3, 1.5, 0x4f3c34, -.8, 3, 0, 5); };
  dumper(26, 20, 2.6); dumper(-16, -30, -.2);
  // pala cargadora junto a los acopios
  { const p = new THREE.Group(); p.position.set(12, 1, -12); p.rotation.y = 2.2; g.add(p);
    for (const [px, pz] of [[1.6, 1.3], [1.6, -1.3], [-1.6, 1.3], [-1.6, -1.3]]){ const w = cil(p, .95, .95, .75, NG, px, .95, pz, 14); w.rotation.x = Math.PI / 2; }
    caja(p, 2.6, 1.5, 2.2, AM, -1.6, 1.9, 0); caja(p, 2.2, 1, 2, AM, 1, 1.6, 0); caja(p, 1.6, 1.9, 1.7, AM, -.4, 3.5, 0); caja(p, 1.65, 1.1, 1.6, VI, -.35, 3.7, 0, { roughness: .1, metalness: .6 });
    const br = caja(p, 3.4, .4, 1.8, AM, 3.2, 2, 0); br.rotation.z = -.25; caja(p, 1.2, 1.1, 2.8, 0x55595d, 4.9, 1.2, 0); }
  // ---- instalaciones ----
  caja(g, 9, 2.8, 3.2, 0xeeeeee, -20, 2.4, 31); caja(g, 9.2, .3, 3.4, 0xcfcfcf, -20, 3.9, 31); caja(g, 6, .9, .06, VI, -20, 2.6, 32.63, { roughness: .1, metalness: .6 });
  caja(g, 3.6, .3, 17, 0x6d7177, 9, 1.15, 36); caja(g, 3, .5, 1, 0xd2201f, 9, 1.5, 27.2); caja(g, 3, .5, 1, 0xd2201f, 9, 1.5, 44.8);      // báscula
  caja(g, 2.2, 2.4, 2, 0xeeeeee, 13, 2.2, 36); caja(g, 2.25, .8, 1.6, VI, 13, 2.6, 36);
  patas(-34, 20, 3, 3, 4); cil(g, 2.6, 2.6, 4.5, 0x2d6fa8, -34, 7.3, 20, 16, { metalness: .3, roughness: .5 });               // depósito de agua para regar
  cil(g, .25, .25, 14, 0x8a9096, -42, 8, 2, 8); caja(g, 3, 1.4, .4, 0xdddddd, -42, 15, 2, { emissive: 0x111111 }); caja(g, 2, 1, 2, 0xf2b705, -42, 1.5, 2);  // torre de luz
  if (propia){ cartel(g, 'H', '#d2201f', '#ffffff', 6, 6, 4, 6.5, 47); cil(g, .3, .3, 6, 0x8a9096, 1.6, 3.5, 47, 8); cil(g, .3, .3, 6, 0x8a9096, 6.4, 3.5, 47, 8);
    cartel(g, 'HORINSA', '#d2201f', '#ffffff', 7, 1.6, -20, 4.9, 32.7); }
  const rampa = caja(g, 26, .6, 95, propia ? 0xc8b088 : 0xbfa983, 0, .5, 115 * .75); rampa.receiveShadow = true;   // explanada de entrada por la boca (bajo el asfalto)
  return g;
}function crearTerminalCemento(){
  const g = new THREE.Group();
  caja(g, 60, .5, 40, 0x8f8a83, 0, .25, 0);
  for (const x of [-12, 4]){ cil(g, 7, 7, 30, 0xf2f3f4, x, 15.5, 0, 24, { metalness: .3, roughness: .5 }); cono(g, 7, 3, 0xd8dadc, x, 32, 0, 24); }
  caja(g, 26, 2, 3, 0x7a7f84, -4, 31, 0);
  const b = crearBarco('cementero'); b.position.set(0, -.2, 45); b.rotation.y = 0; g.add(b);
  return g;
}

/* ============================ VEHÍCULOS ============================ */
function ruedas(g, xs, w = 2.5){ for (const x of xs) for (const z of [-w / 2, w / 2]){ const r = cil(g, .55, .55, .45, 0x161616, x, .55, z, 14); r.rotation.x = Math.PI / 2; const l = cil(g, .3, .3, .47, 0xb8bcc0, x, .55, z, 10, { metalness: .7, roughness: .3 }); l.rotation.x = Math.PI / 2; } }
function crearCamion(tipo){
  const g = new THREE.Group();
  caja(g, 9.5, .5, 2.4, 0x2a2a2a, 0, 1.1, 0);                                     // chasis
  ruedas(g, [3.4, -1.6, -3.2]);
  const cabCol = tipo === 'hormigonera' || tipo === 'asfaltera' ? ROJO : tipo === 'banera' ? 0xf2b705 : 0x5a6068;
  if (tipo === 'asfaltera'){                                                         // caja de volquete negra con lona térmica
    const caj = new THREE.Group(); caj.position.set(-1.3, 1.4, 0); g.add(caj);
    caja(caj, 6.2, .3, 2.4, 0x2a2a2a, 0, 0, 0); caja(caj, 6.2, 1.7, .2, 0x2a2a2a, 0, .95, 1.15); caja(caj, 6.2, 1.7, .2, 0x2a2a2a, 0, .95, -1.15); caja(caj, .2, 1.9, 2.4, 0x2a2a2a, -3.05, 1, 0); caja(caj, .2, 1.7, 2.4, 0x2a2a2a, 3.05, .95, 0);
    const lona = caja(caj, 6.3, .12, 2.5, 0x1a3a5a, 0, 1.85, 0); lona.userData.vivo = true; g.userData.lona = lona;
    for (const s of [-1, 1]){ const t = cartel(caj, 'HORINSA', '#2a2a2a', '#d2201f', 3.6, .8, 0, 1, s * 1.27, s > 0 ? 0 : Math.PI); t.material.side = THREE.FrontSide; }
  }
  caja(g, 2.3, 2.6, 2.5, cabCol, 3.7, 2.6, 0);
  caja(g, .1, 1.1, 2.1, 0x1c2a36, 4.86, 3.1, 0, { roughness: .1, metalness: .6 });   // parabrisas
  if (tipo === 'hormigonera'){
    const piv = new THREE.Group(); piv.position.set(-1.2, 2.9, 0); piv.rotation.z = .12; g.add(piv);
    const tambor = new THREE.Group(); piv.add(tambor);
    const t1 = cil(tambor, 1.5, 1.05, 4.2, 0xd9dcdf, 0, 0, 0, 18, { metalness: .4, roughness: .45 }); t1.rotation.z = Math.PI / 2;
    const t2 = cono(tambor, 1.05, 1.4, 0xd9dcdf, -2.8, 0, 0, 18); t2.rotation.z = Math.PI / 2;
    const t3 = cono(tambor, 1.5, 1.2, 0xd9dcdf, 2.7, 0, 0, 18); t3.rotation.z = -Math.PI / 2;
    for (let k = 0; k < 3; k++){ const b = caja(tambor, 4.4, .35, .35, ROJO, 0, 1.3, 0); b.position.set(0, Math.cos(k * 2.1) * 1.32, Math.sin(k * 2.1) * 1.32); b.rotation.x = k * 2.1; }
    g.userData.tambor = tambor;
  } else if (tipo === 'banera'){
    const caj = new THREE.Group(); caj.position.set(-1.3, 1.4, 0); g.add(caj);
    caja(caj, 6.2, .3, 2.4, 0xd9a404, 0, 0, 0); caja(caj, 6.2, 1.6, .2, 0xd9a404, 0, .9, 1.15); caja(caj, 6.2, 1.6, .2, 0xd9a404, 0, .9, -1.15); caja(caj, .2, 1.6, 2.4, 0xd9a404, -3.05, .9, 0); caja(caj, .2, 1.8, 2.4, 0xd9a404, 3.05, 1, 0);
    const carga = cono(caj, 2, 1.4, 0x9a7a55, 0, 1.3, 0, 10); carga.scale.set(1.4, 1, .6); g.userData.carga = carga;
  } else if (tipo === 'cisterna' || tipo === 'betun'){
    const tq = cil(g, 1.25, 1.25, 6.6, tipo === 'betun' ? 0x1c1c1c : 0xe1e5e8, -1.2, 2.7, 0, 18, { metalness: .6, roughness: .3 }); tq.rotation.z = Math.PI / 2;
    for (const x of [-3, 0, 2.4]){ const a = cil(g, 1.3, 1.3, .2, 0x9aa2a8, x - 1.2 + 1.2, 2.7, 0, 18); a.rotation.z = Math.PI / 2; }
  }
  // detalles comunes
  caja(g, .35, .55, 2.55, 0x2b2b2b, 4.95, 1.15, 0);                               // parachoques
  for (const z of [-.85, .85]){ const f = new THREE.Mesh(new THREE.BoxGeometry(.1, .28, .45), MAT_FARO); f.position.set(4.92, 1.6, z); g.add(f); caja(g, .25, .5, .12, 0x222222, 4.3, 3.2, z * 1.6); }   // faros y espejos
  caja(g, 2.35, .18, 2.55, 0x1a1a1a, 3.7, 3.98, 0);                               // techo
  const dep = cil(g, .38, .38, 1.4, 0xbfc5ca, 1.6, 1.35, -1.25, 10, { metalness: .6, roughness: .3 }); dep.rotation.z = Math.PI / 2;
  if (tipo !== 'cisterna' && tipo !== 'betun'){                                   // logo HORINSA en las dos puertas
    for (const s of [-1, 1]){ caja(g, 1.25, 1.25, .04, 0xffffff, 3.75, 2.6, s * 1.27); const lg = cartel(g, 'H', '#d2201f', '#ffffff', 1.05, 1.05, 3.75, 2.6, s * 1.30, s > 0 ? 0 : Math.PI); lg.material.side = THREE.FrontSide; }
  }
  if (tipo === 'hormigonera'){
    cil(g, .16, .16, .3, 0xff8c1a, 3.7, 4.25, 0, 8, { emissive: 0xff7a00, emissiveIntensity: .5 });     // girofaro
    const tx = lienzo(512, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#d2201f'; c.font = '900 46px "Arial Black",Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('HORINSA', w / 4, h / 2 + 2); c.fillText('HORINSA', w * 3 / 4, h / 2 + 2); });
    const banda = new THREE.Mesh(new THREE.CylinderGeometry(1.43, 1.12, 3.2, 24, 1, true), new THREE.MeshStandardMaterial({ map: tx, transparent: true, roughness: .5 }));
    banda.rotation.z = Math.PI / 2; g.userData.tambor.add(banda);
    // canaleta de descarga (se despliega al verter en obra)
    const can = new THREE.Group(); can.position.set(-4.4, 2.2, 0); can.rotation.y = .5; g.add(can);
    const ca = caja(can, 3.2, .25, .7, 0x8a9096, -1.6, -.6, 0); ca.rotation.z = .4; caja(can, .5, .5, .5, 0x5c6268, 0, 0, 0);
    can.userData.vivo = true; can.visible = false; g.userData.canaleta = can;
  }
  if (g.userData.tambor) g.userData.tambor.userData.vivo = true;
  if (g.userData.carga) g.userData.carga.userData.vivo = true;
  return fusionar(g);
}
function escalaVehiculo(){ return Math.min(45, Math.max(1.6, camDist() * 1.1)); }
// Puestos dentro de la planta (en metros locales de la planta, que está escalada ×1,6)
function puestoEnPlanta(c, i){
  if (!plantaH) return null;
  if (c.tipo === 'asfaltera') return puestoAsfalto(c, i);
  if (c.tipo === 'cisterna' && c.mat === 'betun'){ if (c.estado === 'descargando' && plantaA){ const k = M * 1.6; return [plantaA.position.x - 28 * k, plantaA.position.z + 16 * k, 0]; } return null; }
  const est = c.estado, P0 = plantaH.position, k = M * 1.6;
  let l = null;
  // en el taller: averiado en planta o en mantenimiento
  const enTaller = c.chofer && est === 'libre' && (averiada(c.id) || J.personal.some(s => s.rol === 'mecanico' && s.tarea && s.tarea.id === c.id && s.tarea.tipo === 'mant'));
  if (enTaller){ const libreTaller = !R.camiones.some((o, j) => j < i && o.chofer && o.estado === 'libre' && (averiada(o.id) || J.personal.some(s => s.tarea && s.tarea.id === o.id && s.tarea.tipo === 'mant')));
    l = libreTaller ? [-28, 45, 0] : [-25, 30 - (i % 3) * 7, 0]; }
  else if (c.tipo === 'hormigonera' && est === 'libre' && c.lavarHasta > R.min) l = [12, -44, Math.PI];   // lavadero
  else if (c.tipo === 'hormigonera'){
    if (est === 'cargando') l = [39, -22 + (c.linea ? 24 : 0), 0];
    else if (est === 'cola') l = [62, 9 + (Math.max(0, R.cola.indexOf(c)) % 2) * 7, Math.PI];
    else if (est === 'libre') l = [-9 + (i % 5) * 6, 32, Math.PI / 2];
  } else if (c.tipo === 'banera'){
    if (est === 'descargando') l = [-38, -8, Math.PI];
    else if (est === 'libre') l = [-9 + (i % 5) * 6, 32, Math.PI / 2];
  } else if (c.tipo === 'cisterna' && est === 'descargando') l = c.mat === 'arido' ? [-38, 12, Math.PI] : [64, -40, Math.PI];
  if (!l) return null;
  const x = P0.x + l[0] * k, z = P0.z + l[1] * k;
  return [x, z, l[2]];
}
function sincronizarCamiones(dtR){
  if (!RR()) { for (const o of camionesObj.values()) o.visible = false; return; }
  const vivos = new Set(), s = escalaVehiculo();
  R.camiones.forEach((c, i) => {
    const k = c.id;
    vivos.add(k);
    let o = camionesObj.get(k);
    if (!o){ o = crearCamion(c.mat === 'betun' ? 'betun' : c.mat === 'arido' ? 'banera' : c.tipo); scene.add(o); camionesObj.set(k, o); }
    if (o.userData.lona) o.userData.lona.visible = c.carga > 0;
    if (c.tipo === 'asfaltera' && c.carga > 0 && dtR && R.vel > 0 && camDist() < 4) emitir(c.x, c.y, 0xe8e8e8, .008, 4 * dtR, .004);
    o.visible = true;
    const pp = puestoEnPlanta(c, i), u = o.userData;
    let x, z, ang;
    if (pp){
      // dentro de la planta el camión se desplaza despacio hasta su puesto (no salta)
      if (u.vx === undefined){ u.vx = pp[0]; u.vz = pp[1]; u.va = pp[2]; }
      const dx = pp[0] - u.vx, dz = pp[1] - u.vz, d = Math.hypot(dx, dz), paso = .025 * (dtR || .016) * Math.max(1, R.vel || 1);
      if (d > paso){ u.vx += dx / d * paso; u.vz += dz / d * paso; const obj = Math.atan2(dz, dx); let da = obj - u.va; da = Math.atan2(Math.sin(da), Math.cos(da)); u.va += da * .2; }
      else { u.vx = pp[0]; u.vz = pp[1]; let da = pp[2] - u.va; da = Math.atan2(Math.sin(da), Math.cos(da)); u.va += da * .1; }
      x = u.vx; z = u.vz; ang = u.va;
    } else {
      // al salir de su plaza alcanza su ruta en un momento en vez de teletransportarse
      const d = u.vx === undefined ? 0 : Math.hypot(c.x - u.vx, c.y - u.vz), paso = .06 * (dtR || .016) * Math.max(1, R.vel || 1);
      // en la obra, los que esperan turno se quedan en fila detrás del que descarga
      let tx = c.x, tz = c.y;
      if (c.estado === 'esperando' && c.ped){ const cola = R.camiones.filter(x => x.estado === 'esperando' && x.ped === c.ped), n = cola.indexOf(c) + 1, a = c.ang || 0; tx -= Math.cos(a) * .02 * n; tz -= Math.sin(a) * .02 * n; }
      const dd = Math.hypot(tx - u.vx, tz - u.vz);
      if (u.vx !== undefined && dd > paso && dd < .25){ u.vx += (tx - u.vx) / dd * paso; u.vz += (tz - u.vz) / dd * paso; if (c.estado !== 'esperando') u.va = Math.atan2(tz - u.vz, tx - u.vx); }
      else { u.vx = tx; u.vz = tz; u.va = c.ang || 0; }
      x = u.vx; z = u.vz; ang = u.va;
    }
    o.position.set(x, hMesh(x, z) + .0003, z);
    o.rotation.y = -ang;
    o.scale.setScalar(M * s);
    if (o.userData.tambor) o.userData.tambor.rotation.x = (c.giro || 0) * 3 + (c.estado === 'cargando' ? performance.now() / 300 : 0);
    if (o.userData.carga) o.userData.carga.visible = c.carga > 0;
    if (o.userData.canaleta) o.userData.canaleta.visible = c.estado === 'descargando';
    // polvo y nubecillas
    if (!dtR || R.vel === 0) return;
    const atras = (d) => [x - Math.cos(ang) * d, z - Math.sin(ang) * d];
    if (c.ruta && c.tipo === 'banera'){ const dc = Math.hypot(c.x - SIT.cantera.x, c.y - SIT.cantera.y); if (dc < .7) emitir(...atras(.008 * s / 1.6), 0xb79b72, .02, 30 * dtR); }
    if (c.ruta && c.tipo !== 'cisterna' && esPista(c.x, c.y)) emitir(...atras(.008 * s / 1.6), 0xc8ad80, .016, 20 * dtR);
    if (c.tipo === 'banera' && c.estado === 'cargando') emitir(x, z, 0xb79b72, .028, 14 * dtR, .012);
    if (c.tipo === 'banera' && c.estado === 'descargando') emitir(...atras(.006), 0xc9b48c, .03, 18 * dtR, .01);
    if (c.tipo === 'hormigonera' && c.estado === 'descargando') emitir(...atras(.007 * s / 1.6), 0x9e9e98, .012, 8 * dtR, .004);
    if (c.tipo === 'hormigonera' && c.estado === 'cargando'){ const [px, pz] = [plantaH.position.x + 35 * M * 1.6, plantaH.position.z - 22 * M * 1.6]; emitir(px, pz, 0xd8d6d0, .016, 10 * dtR, .02); }
    if (c.tipo === 'cisterna' && c.estado === 'descargando'){ const [px, pz] = [plantaH.position.x + 50 * M * 1.6, plantaH.position.z - 30 * M * 1.6]; emitir(px, pz, 0xf2f2f0, .014, 6 * dtR, .045); }
  });
  for (const [k, o] of camionesObj) if (!vivos.has(k)){ scene.remove(o); camionesObj.delete(k); }
}

/* ------------------------------ Tráfico ------------------------------ */
function crearTrafico(){
  const vias = CARRETERAS.filter(r => r.t !== 'pista').map(r => { const pts = densificar(r.k), cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, cum, len: cum[cum.length - 1], t: r.t }; });
  const pesos = vias.map(v => v.len * (v.t === 'auto' ? 6 : v.t === 'prin' ? 2 : v.t === 'calle' ? .25 : .7)), tot = pesos.reduce((a, b) => a + b, 0);
  const N = 170, lista = [];
  const colores = [0xffffff, 0xd8d8d8, 0x2b2b2b, 0x9a9da1, 0xb3261e, 0x1f4e8c, 0xf2f2f2, 0x5b6770, 0x7a1f1f, 0x2e6b3a, 0xc9b27c];
  for (let i = 0; i < N; i++){
    let q = Math.random() * tot, v = vias[0]; for (let k = 0; k < vias.length; k++){ q -= pesos[k]; if (q <= 0){ v = vias[k]; break; } }
    lista.push({ v, d: Math.random() * v.len, dir: Math.random() < .5 ? 1 : -1, vel: (v.t === 'auto' ? 75 : v.t === 'prin' ? 62 : 45) * (.85 + Math.random() * .3), col: colores[i % colores.length], furgo: Math.random() < .18 });
  }
  // carrocería con capó y maletero más bajos + cabina acristalada + 4 ruedas
  const geoCuerpo = mergeGeometries([new THREE.BoxGeometry(4.4, .75, 1.85).translate(0, .78, 0), new THREE.BoxGeometry(2.5, .5, 1.8).translate(-.2, 1.4, 0)]);
  const cuerpo = new THREE.InstancedMesh(geoCuerpo, new THREE.MeshStandardMaterial({ roughness: .3, metalness: .5 }), N);
  const cabina = new THREE.InstancedMesh(new THREE.BoxGeometry(2.25, .62, 1.7).translate(-.25, 1.95, 0), new THREE.MeshStandardMaterial({ color: 0x1b252e, roughness: .1, metalness: .8 }), N);
  const ruedasM = new THREE.InstancedMesh(new THREE.CylinderGeometry(.36, .36, .26, 10).rotateX(Math.PI / 2), mat(0x141414), N * 4);
  const col = new THREE.Color(); lista.forEach((c, i) => cuerpo.setColorAt(i, col.set(c.col)));
  cuerpo.castShadow = cabina.castShadow = true; cuerpo.frustumCulled = cabina.frustumCulled = ruedasM.frustumCulled = false;
  scene.add(cuerpo, cabina, ruedasM);
  const locR = [[1.35, .36, .85], [1.35, .36, -.85], [-1.35, .36, .85], [-1.35, .36, -.85]].map(p => new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]));
  coches = { lista, cuerpo, cabina, ruedasM, locR, tmp: new THREE.Matrix4(), o: new THREE.Object3D() };
}
function moverTrafico(dtMin){
  if (!coches) return;
  const s = Math.min(30, Math.max(1.6, camDist() * .9)), { o } = coches;
  coches.lista.forEach((c, i) => {
    const v = c.v; c.d += c.dir * c.vel * dtMin / 60;
    if (c.d > v.len){ c.d = v.len; c.dir = -1; } if (c.d < 0){ c.d = 0; c.dir = 1; }
    let lo = 0, hi = v.cum.length - 1; while (hi - lo > 1){ const m = (lo + hi) >> 1; if (v.cum[m] <= c.d) lo = m; else hi = m; }
    const a = v.pts[lo], b = v.pts[hi], L = (v.cum[hi] - v.cum[lo]) || 1e-9, t = (c.d - v.cum[lo]) / L;
    let dx = b[0] - a[0], dz = b[1] - a[1]; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
    const lat = .0035 * Math.max(1, s / 3);                           // circulan por la derecha
    const x = a[0] + (b[0] - a[0]) * t - dz * lat * c.dir, z = a[1] + (b[1] - a[1]) * t + dx * lat * c.dir;
    o.position.set(x, hMesh(x, z) + .0003, z);
    o.rotation.set(0, -Math.atan2(dz * c.dir, dx * c.dir), 0);
    o.scale.set(M * s * (c.furgo ? 1.25 : 1), M * s * (c.furgo ? 1.5 : 1), M * s);
    o.updateMatrix(); coches.cuerpo.setMatrixAt(i, o.matrix); coches.cabina.setMatrixAt(i, o.matrix);
    for (let k = 0; k < 4; k++) coches.ruedasM.setMatrixAt(i * 4 + k, coches.tmp.multiplyMatrices(o.matrix, coches.locR[k]));
    if (lucesCoches && lucesCoches.visible && i < 400){ const lp = lucesCoches.geometry.attributes.position.array, fx = dx * c.dir, fz = dz * c.dir; lp[i * 3] = x + fx * .0025 * s; lp[i * 3 + 1] = o.position.y + .0008 * s; lp[i * 3 + 2] = z + fz * .0025 * s; }
  });
  coches.cuerpo.instanceMatrix.needsUpdate = coches.cabina.instanceMatrix.needsUpdate = coches.ruedasM.instanceMatrix.needsUpdate = true;
  if (lucesCoches && lucesCoches.visible) lucesCoches.geometry.attributes.position.needsUpdate = true;
}

/* ------------------------------- Barcos ------------------------------- */
function crearBarco(tipo){
  const g = new THREE.Group();
  if (tipo === 'ferry'){
    caja(g, 95, 7, 19, 0xf7f8f9, 0, 1.5, 0); caja(g, 95.4, 2.2, 19.4, 0x1f4f8f, 0, -1.2, 0);
    caja(g, 60, 6, 16, 0xffffff, -8, 7.5, 0); caja(g, 60.4, 1.6, 16.4, 0x22384f, -8, 8, 0, { roughness: .2, metalness: .5 });
    caja(g, 14, 4, 14, 0xffffff, 12, 12.5, 0); cil(g, 2.2, 2.6, 7, 0xd2201f, -25, 14, 0, 12);
    const proa = cono(g, 9.5, 14, 0xf7f8f9, 54, 1.5, 0, 4); proa.rotation.z = -Math.PI / 2; proa.rotation.x = Math.PI / 4; proa.scale.set(1, 1, .5);
  } else if (tipo === 'lancha'){
    caja(g, 32, 4, 8, 0xffffff, 0, 1, 0); caja(g, 32.2, 1.4, 8.2, 0x1c7fa6, 0, -.6, 0); caja(g, 16, 3.5, 6.5, 0xf2f2f2, -3, 4.5, 0); caja(g, 16.2, 1, 6.7, 0x22384f, -3, 5, 0);
  } else if (tipo === 'carguero' || tipo === 'cementero'){
    const L = tipo === 'carguero' ? 150 : 110;
    caja(g, L, 10, 23, 0x23384d, 0, 2, 0); caja(g, L + .4, 3, 23.4, 0x8c1f1f, 0, -2.5, 0);
    caja(g, 18, 16, 21, 0xf3f3f3, -L / 2 + 12, 15, 0); cil(g, 2.5, 3, 8, 0x222222, -L / 2 + 8, 26, 0, 10);
    if (tipo === 'carguero'){ const cols = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x7f8c8d]; let k = 0;
      for (let x = -L / 2 + 30; x < L / 2 - 12; x += 13) for (let y = 0; y < 2; y++) for (const z of [-6, 0, 6]) caja(g, 12, 2.6, 5.5, cols[(k++) % cols.length], x, 8.4 + y * 2.7, z); }
    else for (let x = -20; x < 50; x += 22){ cil(g, 4, 4, 5, 0xd8dcdf, x, 9.5, 0, 16); }
  } else if (tipo === 'velero'){
    caja(g, 11, 1.6, 3.6, 0xffffff, 0, .4, 0); caja(g, 4, 1.2, 2.6, 0xeeeeee, -1, 1.7, 0);
    cil(g, .12, .15, 14, 0xcccccc, .8, 8, 0, 6);
    const v = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.9, 2, 0), new THREE.Vector3(.9, 14, 0), new THREE.Vector3(-4.5, 2.2, 0)]), new THREE.MeshStandardMaterial({ color: 0xfafafa, side: THREE.DoubleSide }));
    v.geometry.computeVertexNormals(); g.add(v);
  } else {                                                                    // pesquero
    caja(g, 16, 3, 5, 0x1f6fa8, 0, .8, 0); caja(g, 5, 3, 4, 0xffffff, 2, 3.6, 0); cil(g, .15, .15, 7, 0x999999, -4, 5, 0, 6);
  }
  return fusionar(g);
}
let _estela = null;
function estelaMat(){
  if (_estela) return _estela;
  const t = lienzo(128, 64, (g, w, h) => {
    for (let x = 0; x < w; x++){ const a = Math.pow(x / w, 1.6) * .75;
      for (let y = 0; y < h; y++){ const v = Math.abs(y - h / 2) / (h / 2), borde = Math.exp(-Math.pow((v - (x / w) * .85) * 6, 2)), centro = Math.exp(-v * v * 18) * .6;
        g.fillStyle = `rgba(255,255,255,${Math.min(1, a * (borde + centro) * (.75 + Math.random() * .25))})`; g.fillRect(x, y, 1, 1); } }
  });
  _estela = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }); return _estela;
}
function crearBarcos(){
  const ruta = (pts, tipo, periodo, espera) => {
    const k = pts.map(([la, lo]) => P(la, lo)), cum = [0];
    for (let i = 1; i < k.length; i++) cum.push(cum[i - 1] + Math.hypot(k[i][0] - k[i - 1][0], k[i][1] - k[i - 1][1]));
    const o = crearBarco(tipo); scene.add(o);
    const L = { ferry: 95, lancha: 32, pesquero: 16 }[tipo] || 20;
    const estela = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), estelaMat());
    estela.position.set(-L / 2 - L * .7, .4, 0); estela.scale.set(L * 1.4, 1, L * .28); estela.renderOrder = 3; o.add(estela);
    barcos.push({ o, k, cum, len: cum[cum.length - 1], periodo, espera, t: Math.random() * periodo * 2, tipo, estela });
  };
  ruta([[28.8585, -13.8265], [28.850, -13.835], [28.830, -13.850], [28.790, -13.865], [28.745, -13.872]], 'ferry', 70, 20);
  ruta([[28.8580, -13.8250], [28.846, -13.832], [28.815, -13.852], [28.770, -13.868]], 'ferry', 70, 35);
  ruta([[29.2215, -13.4465], [29.228, -13.458], [29.232, -13.478], [29.2305, -13.5005]], 'lancha', 30, 15);
  // pesqueros que faenan
  ruta([[28.915, -13.676], [28.900, -13.690], [28.880, -13.700], [28.900, -13.660]], 'pesquero', 80, 10);
  ruta([[29.115, -13.660], [29.135, -13.680], [29.150, -13.640]], 'pesquero', 90, 10);
  // fijos: carguero en Los Mármoles y veleros en los puertos deportivos
  const fijo = (la, lo, tipo, ang) => { const [x, z] = P(la, lo); const o = crearBarco(tipo); o.position.set(x, .001, z); o.rotation.y = ang; o.scale.setScalar(M * 1.6); scene.add(o); barcos.push({ o, fijo: true, x, z, tipo, fase: Math.random() * 6 }); };
  fijo(28.9668, -13.5262, 'carguero', -0.9);
  const marinas = [[28.8555, -13.8165], [28.9145, -13.7045], [28.9570, -13.5420], [29.2295, -13.5040], [28.9190, -13.6745]];
  let semilla = 7; const r = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
  for (const [la, lo] of marinas){ let n = 0; for (let k = 0; k < 40 && n < 4; k++){ const [cx, cz] = P(la, lo); const x = cx + (r() - .5) * .5, z = cz + (r() - .5) * .5; if (!esMar(x, z)) continue; const o = crearBarco(r() < .7 ? 'velero' : 'pesquero'); o.position.set(x, .001, z); o.rotation.y = r() * 6.28; o.scale.setScalar(M * 1.6); scene.add(o); barcos.push({ o, fijo: true, x, z, fase: r() * 6 }); n++; } }
}
function moverBarcos(dtMin, tReal){
  const s = Math.min(14, Math.max(1.6, camDist() * .45));
  for (const b of barcos){
    if (b.fijo){ b.o.position.y = .0004 * Math.sin(tReal * 1.3 + b.fase); b.o.rotation.z = .03 * Math.sin(tReal * 1.1 + b.fase); b.o.scale.setScalar(M * Math.min(s, b.tipo === 'carguero' ? 3 : s)); continue; }
    b.t = (b.t + dtMin) % (2 * (b.periodo + b.espera));
    const ciclo = b.periodo + b.espera; let ida = b.t < ciclo, u = (ida ? b.t : b.t - ciclo) - b.espera;
    let f = Math.max(0, Math.min(1, u / b.periodo)); const ease = f * f * (3 - 2 * f); let d = (ida ? ease : 1 - ease) * b.len;
    if (b.estela){ b.estela.visible = f > .02 && f < .98; b.estela.material.opacity = 1; }
    let lo = 0; while (lo < b.cum.length - 2 && b.cum[lo + 1] < d) lo++;
    const a = b.k[lo], c = b.k[lo + 1], L = (b.cum[lo + 1] - b.cum[lo]) || 1e-9, t = (d - b.cum[lo]) / L;
    b.o.position.set(a[0] + (c[0] - a[0]) * t, .0005 * Math.sin(tReal * 1.5), a[1] + (c[1] - a[1]) * t);
    const dir = ida ? 1 : -1; b.o.rotation.y = -Math.atan2((c[1] - a[1]) * dir, (c[0] - a[0]) * dir);
    b.o.scale.setScalar(M * s);
  }
}

/* -------------------------------- Obras -------------------------------- */
function crearObra(){
  const g = new THREE.Group();
  caja(g, 30, .5, 22, 0x9a9389, 0, .25, 0);
  for (const [w, d, x, z] of [[30, .4, 0, -11], [30, .4, 0, 11], [.4, 22, -15, 0], [.4, 22, 15, 0]]) caja(g, w, 2, d, 0xf08a24, x, 1, z);
  caja(g, 1.4, 26, 1.4, 0xf2c230, 8, 13, -4); const pluma = caja(g, 26, 1, 1.2, 0xf2c230, 2, 26, -4); caja(g, 3, 2.5, 2.5, 0x666666, -9, 25.5, -4);
  caja(g, 12, 3, 8, 0xd8d2c4, -6, 1.75, 4);
  const anillo = new THREE.Mesh(new THREE.RingGeometry(20, 24, 40), new THREE.MeshBasicMaterial({ color: 0xf08a24, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
  anillo.rotation.x = -Math.PI / 2; anillo.position.y = .8; g.add(anillo); g.userData.anillo = anillo; g.userData.pluma = pluma;
  anillo.userData.vivo = pluma.userData.vivo = true;
  return g;
}
function sincronizarObras(tReal){
  const vivos = new Set();
  if (RR()) for (const p of R.pedidos){
    if (!['llamada', 'aceptado', 'servido'].includes(p.estado)) continue;
    vivos.add(p.id); let o = obrasObj.get(p.id);
    if (!o){ o = crearObra(); o.rotation.y = p.id; colocarEn(o, p.x, p.y, 1.6); obrasObj.set(p.id, o); }
    const col = p.estado === 'llamada' ? 0x8a96a3 : p.estado === 'servido' ? 0x3fae5a : 0xf08a24;
    o.userData.anillo.material.color.setHex(col);
    const s = Math.min(12, Math.max(1.6, camDist() * .25)); o.userData.anillo.scale.setScalar(s / 1.6);
    o.userData.pluma.rotation.y = Math.sin(tReal * .3 + p.id) * .8;
  }
  for (const [k, o] of obrasObj) if (!vivos.has(k)){ scene.remove(o); obrasObj.delete(k); }
}

/* ------------------------- Farolas y faros ------------------------- */
const MAT_FARO = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: .5 });
let farolas = null, lucesCoches = null;
function texBrillo(){ return lienzo(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(.25, 'rgba(255,210,140,.55)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }
function crearFarolas(){
  const pts = [];
  for (const r of CARRETERAS){
    if (r.t === 'pista') continue;
    const d = densificar(r.k), paso = r.t === 'auto' ? .05 : r.t === 'calle' ? .1 : .065; let resto = 0, lado = 1;
    for (let k = 1; k < d.length; k++){
      const a = d[k - 1], b = d[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue;
      const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      for (let s = resto; s < L; s += paso){
        const x = a[0] + (b[0] - a[0]) * s / L, z = a[1] + (b[1] - a[1]) * s / L;
        if (r.t === 'auto' || enPueblo(x, z)){ lado = -lado; pts.push([x + nx * .011 * lado, z + nz * .011 * lado, Math.atan2(nz * lado, nx * lado)]); }
      }
      resto = ((resto - L) % paso + paso) % paso;
    }
  }
  const geo = mergeGeometries([new THREE.CylinderGeometry(.09, .13, 8, 5).translate(0, 4, 0), new THREE.BoxGeometry(1.6, .12, .12).translate(-.8, 7.9, 0), new THREE.BoxGeometry(.7, .22, .35).translate(-1.5, 7.8, 0)]);
  const postes = new THREE.InstancedMesh(geo, mat(0x6b7075, { metalness: .5, roughness: .5 }), pts.length);
  const o = new THREE.Object3D(), pos = new Float32Array(pts.length * 3);
  pts.forEach(([x, z, a], i) => {
    const y = hMesh(x, z); o.position.set(x, y, z); o.rotation.set(0, -a, 0); o.scale.setScalar(M); o.updateMatrix(); postes.setMatrixAt(i, o.matrix);
    pos[i * 3] = x - Math.cos(a) * .0015; pos[i * 3 + 1] = y + .0076; pos[i * 3 + 2] = z - Math.sin(a) * .0015;
  });
  postes.receiveShadow = true; scene.add(postes);
  const gpts = new THREE.BufferGeometry(); gpts.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const brillo = new THREE.Points(gpts, new THREE.PointsMaterial({ map: texBrillo(), size: 14, sizeAttenuation: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  brillo.renderOrder = 4; scene.add(brillo);
  farolas = { postes, brillo };
  // faros de los coches (un punto de luz delante de cada uno)
  const gl = new THREE.BufferGeometry(); gl.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
  lucesCoches = new THREE.Points(gl, new THREE.PointsMaterial({ map: texBrillo(), size: 9, sizeAttenuation: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xfff4dc }));
  lucesCoches.frustumCulled = false; lucesCoches.renderOrder = 4; scene.add(lucesCoches);
}

/* ---------------------------- Polvo y humo ---------------------------- */
const NPOLVO = 600;
let polvo = null, pistasPts = null;
function esPista(x, z){
  if (!pistasPts){ pistasPts = []; for (const r of CARRETERAS) if (r.t === 'pista') for (const p of densificar(r.k)) pistasPts.push(p);
    for (const k of ['planta', 'cantera']){ const q = SIT[k], n = RED.N[q.n]; for (let t = 0; t <= 1; t += .1) pistasPts.push([q.x + (n[0] - q.x) * t, q.y + (n[1] - q.y) * t]); } }
  for (const p of pistasPts) if (Math.abs(p[0] - x) < .05 && Math.abs(p[1] - z) < .05) return true;
  return false;
}
function crearPolvo(){
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(NPOLVO * 3), col = new Float32Array(NPOLVO * 3), a = new Float32Array(NPOLVO), s = new Float32Array(NPOLVO);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aC', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aA', new THREE.BufferAttribute(a, 1)); geo.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const tex = lienzo(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.6, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { map: { value: tex }, uEsc: { value: 500 } },
    vertexShader: 'attribute vec3 aC; attribute float aA; attribute float aS; uniform float uEsc; varying vec3 vC; varying float vA; void main(){ vC=aC; vA=aA; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(256.0,aS*uEsc/-mv.z); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t=texture2D(map,gl_PointCoord); if(vA<=0.0) discard; gl_FragColor=vec4(vC,t.a*vA); }'
  });
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
  polvo = { pts, pos, col, a, s, vida: new Float32Array(NPOLVO), vmax: new Float32Array(NPOLVO), vel: new Float32Array(NPOLVO * 3), tam: new Float32Array(NPOLVO), i: 0, acum: 0, c: new THREE.Color() };
}
function emitir(x, z, color, tam, n, alto = 0){
  if (!polvo || camDist() > 8) return;
  polvo.acum += n; const P = polvo;
  while (P.acum >= 1){
    P.acum -= 1; const i = P.i; P.i = (P.i + 1) % NPOLVO;
    const y = hMesh(x, z) + alto + .001;
    P.pos[i * 3] = x + (Math.random() - .5) * .004; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z + (Math.random() - .5) * .004;
    P.vel[i * 3] = (Math.random() - .5) * .004; P.vel[i * 3 + 1] = .002 + Math.random() * .003; P.vel[i * 3 + 2] = (Math.random() - .5) * .004 + .0015;
    P.c.setHex(color); P.col[i * 3] = P.c.r; P.col[i * 3 + 1] = P.c.g; P.col[i * 3 + 2] = P.c.b;
    P.vida[i] = P.vmax[i] = 2 + Math.random() * 2; P.tam[i] = tam * (.6 + Math.random() * .6);
  }
}
function moverPolvo(dtR){
  if (!polvo) return; const P = polvo;
  for (let i = 0; i < NPOLVO; i++){
    if (P.vida[i] <= 0){ P.a[i] = 0; continue; }
    P.vida[i] -= dtR; const f = Math.max(0, P.vida[i] / P.vmax[i]);
    P.pos[i * 3] += P.vel[i * 3] * dtR; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dtR; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dtR;
    P.a[i] = .55 * f * Math.min(1, (1 - f) * 6); P.s[i] = P.tam[i] * (1.6 - f);
  }
  const g = P.pts.geometry; g.attributes.position.needsUpdate = g.attributes.aA.needsUpdate = g.attributes.aS.needsUpdate = g.attributes.aC.needsUpdate = true;
  P.pts.material.uniforms.uEsc.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
}

/* ------------------------------ Personas ------------------------------
   Cada persona se arma con piezas (tronco con chaleco y bandas reflectantes, cabeza, casco,
   brazos, piernas y herramienta) que se mueven según lo que hace: andar, barrer, agacharse a
   reparar, manguera, carpeta, cargar escombros…                                            */
const NOBR = 220;
let obreros = null, furgonetas = new Map();
const UP = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const MB0 = new THREE.Matrix4(), MT = new THREE.Matrix4(), MA = new THREE.Matrix4(), MR = new THREE.Matrix4(), MS = new THREE.Matrix4(), MCERO = new THREE.Matrix4().makeScale(0, 0, 0);
function crearObreros(){
  const mk = (geo, material, n = NOBR) => { const x = new THREE.InstancedMesh(geo, material, n); for (let i = 0; i < n; i++){ x.setColorAt(i, new THREE.Color(0xffffff)); x.setMatrixAt(i, MCERO); } x.count = n; x.castShadow = true; x.frustumCulled = false; scene.add(x); return x; };
  obreros = {
    tronco: mk(new THREE.BoxGeometry(.52, .62, .3).translate(0, .31, 0), new THREE.MeshStandardMaterial({ roughness: .6 })),
    banda: mk(new THREE.BoxGeometry(.54, .06, .32), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, emissive: 0x777777, roughness: .25 })),
    cabeza: mk(new THREE.SphereGeometry(.13, 10, 8), mat(0xc89a7a)),
    casco: mk(new THREE.SphereGeometry(.165, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: .35 })),
    brazo: mk(new THREE.BoxGeometry(.13, .6, .13).translate(0, -.3, 0), new THREE.MeshStandardMaterial({ roughness: .6 }), NOBR * 2),
    pierna: mk(new THREE.BoxGeometry(.19, .86, .21).translate(0, -.43, 0), mat(0x2c3e5c), NOBR * 2),
    herr: mk(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .6 }), NOBR * 2),
    c: new THREE.Color(), n: 0, usados: 0
  };
}
// coloca una pieza: base · traslación · giro (x, z) · escala
function pieza(mesh, i, base, tx, ty, tz, rx, rz, sx = 1, sy = 1, sz = 1){
  MA.makeTranslation(tx, ty, tz); MR.makeRotationFromEuler(_e.set(rx || 0, 0, rz || 0)); MS.makeScale(sx, sy, sz);
  MT.multiplyMatrices(base, MA).multiply(MR).multiply(MS); mesh.setMatrixAt(i, MT);
}
// una persona completa. pose: quieto | andar | barrer | agachado | reparar | manguera | carpeta | cargar | canaleta
function persona3d(x, y, z, yaw, esc, pose, ph, chaleco, casco, nombre){
  const O = obreros; if (!O || O.n >= NOBR) return; const i = O.n++;
  _q.setFromAxisAngle(UP, yaw); MB0.compose(_v.set(x, y, z), _q, _s.set(esc, esc, esc));
  const w = Math.sin(ph), anda = pose === 'andar' || pose === 'barrer' || pose === 'cargar', agach = pose === 'agachado';
  const cadera = agach ? .52 : .88 + (anda ? Math.abs(w) * .03 : 0), incl = agach ? .55 : pose === 'barrer' ? .22 : pose === 'reparar' ? .1 : 0;
  // piernas
  const pL = anda ? w * (pose === 'barrer' ? .3 : .55) : agach ? -1.3 : 0, pR = anda ? -w * (pose === 'barrer' ? .3 : .55) : agach ? -1.1 : 0;
  pieza(O.pierna, i * 2, MB0, -.12, cadera, 0, pL, 0); pieza(O.pierna, i * 2 + 1, MB0, .12, cadera, 0, pR, 0);
  // tronco (inclinado hacia delante si barre o se agacha)
  const TB = new THREE.Matrix4().multiplyMatrices(MB0, MA.makeTranslation(0, cadera, 0)).multiply(MR.makeRotationX(incl));
  pieza(O.tronco, i, TB, 0, 0, 0); pieza(O.banda, i, TB, 0, .22, 0); O.banda.setMatrixAt(i, MT);
  pieza(O.cabeza, i, TB, 0, .76, .02);
  const sinCasco = window.STOCK_PLANTA && window.STOCK_PLANTA.epi < 30 && i % 2 === 0;
  if (sinCasco) O.casco.setMatrixAt(i, MCERO); else pieza(O.casco, i, TB, 0, .81, .02);
  // brazos según la tarea
  let aL = anda ? -w * .45 : .05 * Math.sin(ph * .5), aR = anda ? w * .45 : -.05 * Math.sin(ph * .5);
  if (pose === 'barrer'){ aL = -.75 + .25 * Math.sin(ph * 2); aR = -.55 + .25 * Math.sin(ph * 2); }
  else if (agach){ aL = -1.15 + .3 * Math.sin(ph * 6); aR = -1.2 - .3 * Math.sin(ph * 6); }
  else if (pose === 'reparar'){ aL = -2.3 + .25 * Math.sin(ph * 5); aR = -2.1 - .25 * Math.sin(ph * 5); }
  else if (pose === 'manguera' || pose === 'canaleta'){ aL = -1.0; aR = -1.25 + .1 * Math.sin(ph * 2); }
  else if (pose === 'carpeta'){ aL = -1.05; aR = -.75 + .12 * Math.sin(ph * 4); }
  else if (pose === 'cargar'){ aL = -1.25; aR = -1.25; }
  pieza(O.brazo, i * 2, TB, -.33, .58, 0, aL, .08); pieza(O.brazo, i * 2 + 1, TB, .33, .58, 0, aR, -.08);
  O.tronco.setColorAt(i, O.c.setHex(chaleco)); O.brazo.setColorAt(i * 2, O.c); O.brazo.setColorAt(i * 2 + 1, O.c);
  if (!sinCasco) O.casco.setColorAt(i, O.c.setHex(casco));
  // herramienta en las manos
  const H = O.herr; H.setMatrixAt(i * 2, MCERO); H.setMatrixAt(i * 2 + 1, MCERO);
  if (pose === 'barrer'){ pieza(H, i * 2, TB, 0, .15, .42, .45, 0, .04, 1.35, .04); H.setColorAt(i * 2, O.c.setHex(0x8b5a2b));
    pieza(H, i * 2 + 1, MB0, 0, .05, .75 + .08 * Math.sin(ph * 2), 0, 0, .45, .09, .14); H.setColorAt(i * 2 + 1, O.c.setHex(0x2a2a2a)); }
  else if (pose === 'manguera'){ pieza(H, i * 2, TB, .2, .4, .45, -1.25, 0, .07, .07, .9); H.setColorAt(i * 2, O.c.setHex(0x2a6fd6)); }
  else if (pose === 'carpeta'){ pieza(H, i * 2, TB, -.15, .45, .4, -.4, 0, .26, .34, .03); H.setColorAt(i * 2, O.c.setHex(0xf4f4f0)); }
  else if (pose === 'reparar' || agach){ pieza(H, i * 2, TB, .3, agach ? .2 : 1.05, .45, 0, .6, .05, .28, .05); H.setColorAt(i * 2, O.c.setHex(0xb8bec4)); }
  else if (pose === 'cargar'){ pieza(H, i * 2, TB, 0, .3, .45, 0, 0, .45, .3, .35); H.setColorAt(i * 2, O.c.setHex(0x9e9a92)); }
  if (nombre && window.__figs) window.__figs.push({ x, y: y + 2.1 * esc, z, n: nombre.n || nombre, id: nombre.id });
}
function limpiarPersonas(desde){
  const O = obreros; for (let i = desde; i < NOBR; i++){ for (const m of [O.tronco, O.banda, O.cabeza, O.casco]) m.setMatrixAt(i, MCERO); for (const m of [O.brazo, O.pierna, O.herr]){ m.setMatrixAt(i * 2, MCERO); m.setMatrixAt(i * 2 + 1, MCERO); } }
}
function crearFurgoneta(){
  const g = new THREE.Group();
  caja(g, 5.2, 2.1, 2.1, 0xf6f6f3, 0, 1.6, 0); caja(g, 1.4, 1.3, 2.05, 0xf6f6f3, 2.9, 1.2, 0); caja(g, .1, .8, 1.9, 0x1c2a36, 3.6, 1.6, 0, { metalness: .6, roughness: .1 });
  caja(g, 5.3, .35, 2.15, 0xff7a1a, 0, 1.3, 0); ruedas(g, [1.9, -1.6], 2);
  for (const s of [-1, 1]){ const c = cartel(g, 'TALLER H', '#ffffff', '#d2201f', 2.6, .7, -.4, 2.1, s * 1.07, s > 0 ? 0 : Math.PI); c.material.side = THREE.FrontSide; }
  return fusionar(g);
}
// ir y volver entre dos puntos (con paradas en los extremos): devuelve posición, orientación y si anda
function trayecto(A, B, T, desfase, t){
  const f = ((t / T + desfase) % 1 + 1) % 1, ida = f < .5, u0 = ida ? f * 2 : (f - .5) * 2, u = Math.min(1, Math.max(0, (u0 - .15) / .7));
  const a = ida ? A : B, b = ida ? B : A, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
  return { x, z, ida, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]), anda: u0 > .15 && u0 < .85, final: u0 >= .85 };
}
function moverObreros(t){
  if (!obreros) return;
  const O = obreros, dist = camDist(), vis = dist < 3.5 && !!RR();
  for (const m of [O.tronco, O.banda, O.cabeza, O.casco, O.brazo, O.pierna, O.herr]) m.visible = vis;
  for (const f of furgonetas.values()) f.visible = false;
  window.__figs = vis && dist < 1.6 ? [] : null;
  if (!vis){ return; }
  O.n = 0;
  const esc = M * Math.max(1.6, dist * 1.1);
  const ph = k => t * 6 + k;
  // --- en la planta ---
  if (plantaH){
    const P0 = plantaH.position, k = M * 1.6, yP = P0.y + .5 * k, L = (lx, lz) => [P0.x + lx * k, P0.z + lz * k];
    const pon = (lx, lz, yaw, pose, fase, chaleco, casco, nom) => { const [x, z] = L(lx, lz); persona3d(x, yP, z, yaw, esc, pose, ph(fase), chaleco, casco, nom); };
    const ida = (A, B, T, off, poseAnda, poseFin, fase, chal, cas, nom) => { const r = trayecto(A, B, T, off, t); pon(r.x, r.z, r.yaw, r.anda ? poseAnda : poseFin, fase, chal, cas, nom); return r; };
    // con la planta cerrada (tarde/noche) solo queda el mecánico de noche
    const disp = rol => J.personal.filter(s => s.rol === rol && disponible(s) && (!R.tarde || s.noche));
    const cargando = R.cargando || R.cargando2, enc = encargadoAct();
    // operario de planta: en la caseta mientras carga; si no, barriendo el foso o revisando las tolvas
    const op = disp('planta')[0];
    if (op){ if (cargando) pon(25.2, -9, Math.PI / 2, 'quieto', 1, 0xff7a1a, 0xffffff, { n: `${op.nombre} · planta`, id: op.id });
      else if (R.limpiando && J.suciedad > 8) ida([28, -12], [44, -12], 26, .1, 'barrer', 'barrer', 2, 0xff7a1a, 0xffffff, { n: `${op.nombre} · limpiando el foso`, id: op.id });
      else ida([24, -6], [-12, -15], 40, .3, 'andar', 'carpeta', 3, 0xff7a1a, 0xffffff, { n: `${op.nombre} · revisando tolvas`, id: op.id }); }
    // encargado/a: recorre la planta con su carpeta
    if (enc && enc.rol !== 'planta') ida([46, 22], [-38, 4], 60, .6, 'andar', 'carpeta', 4, 0xf2c230, 0xffffff, { n: `${enc.nombre} · encargado/a`, id: enc.id });
    // peones: barren el patio o llevan escombros al contenedor
    disp('peon').forEach((s, j) => {
      if (j % 2 === 0) ida([4, -2], [44, 4], 34, j * .37, 'barrer', 'barrer', 5 + j, 0x2e9e4f, 0xf2c230, { n: `${s.nombre} · barriendo`, id: s.id });
      else { const r = trayecto([34, -40], [63, -44], 22, j * .21, t); pon(r.x, r.z, r.yaw, r.anda ? (r.ida ? 'cargar' : 'andar') : (r.final ? (r.ida ? 'quieto' : 'agachado') : (r.ida ? 'agachado' : 'quieto')), 6 + j, 0x2e9e4f, 0xf2c230, { n: `${s.nombre} · recogiendo escombros`, id: s.id }); }
    });
    // oficina: alguien sale de vez en cuando a la puerta
    const of = disp('oficina')[0]; if (of && Math.sin(t * .05) > .6) pon(45, 23.5, Math.PI, 'quieto', 7, 0x3c6e8f, 0xffffff, { n: `${of.nombre} · oficina`, id: of.id });
    // mecánico sin tarea: en el banco del taller
    disp('mecanico').forEach((s, j) => { if (!s.tarea) pon(-33 + j * 3, 49.6, 0, 'reparar', 8 + j, 0x1f5fbf, 0xffffff, { n: `${s.nombre} · en el taller`, id: s.id }); });
    // reparaciones de la planta y mejoras: junto a la torre / tolvas, con chispas
    for (const s of disp('mecanico')){ const tk = s.tarea; if (!tk) continue;
      if (tk.id === 'planta' || tk.tipo === 'mej'){ const [lx, lz] = tk.tipo === 'mej' ? [-18, -16] : [33, -15]; pon(lx, lz, Math.PI, 'reparar', 9, 0x1f5fbf, 0xffffff, { n: `${s.nombre} · ${tk.tipo === 'mej' ? 'instalando mejora' : tk.tipo === 'mant' ? 'mantenimiento' : 'reparando la planta'}`, id: s.id });
        if (tk.tipo !== 'mant' && Math.sin(t * 9) > .3){ const [x, z] = L(lx, lz - 1); emitir(x, z, 0xffb040, .0012, 20 * .016, .004); } } }
  }
  // --- chóferes junto a su camión ---
  for (const [i, c] of R.camiones.entries()){
    const s = choferDe(c); if (!s || !disponible(s) || R.tarde) continue;
    const ob = camionesObj.get(c.id); if (!ob || ob.userData.vx === undefined) continue;
    const va = ob.userData.va, ts = M * escalaVehiculo(), f = [Math.cos(va), Math.sin(va)], sd = [-Math.sin(va), Math.cos(va)], x0 = ob.userData.vx, z0 = ob.userData.vz;
    const en = (af, al) => [x0 + f[0] * af * ts + sd[0] * al * ts, z0 + f[1] * af * ts + sd[1] * al * ts];
    const y = hMesh(x0, z0) + (plantaH && Math.hypot(x0 - plantaH.position.x, z0 - plantaH.position.z) < .2 ? .5 * M * 1.6 : .0003);
    const escF = ts;                                             // misma escala que el camión
    let pos = null, pose = 'quieto', mirar = null, txt = '';
    if (averiada(c.id)){ const av = J.maq[c.id].averia; if (av && !av.ext){ pos = en(1.2, 1.9); mirar = en(1.2, 0); pose = 'agachado'; txt = 'arreglando su camión'; if (Math.sin(t * 7 + i) > .6) emitir(...en(1, 1.3), 0xffb040, .0008, .4, .0006); } else { pos = en(1, 4.2); mirar = en(2.6, 0); txt = 'esperando al taller'; if (Math.sin(t * .2 + i) > .4) pose = 'carpeta'; } }
    else if (c.estado === 'libre' && c.lavarHasta > R.min){ pos = en(-6, 1.8); pose = 'manguera'; mirar = en(-4.5, 0); txt = 'lavando la cuba';
      if (Math.random() < .5) emitir(...en(-5.2, .6), 0xcfe8ff, .0015, .6, .0015); }
    else if (c.estado === 'libre' || c.estado === 'cola' || c.estado === 'cargando'){ pos = en(3.4, 2.1); mirar = en(3.4, 0); txt = c.estado === 'cargando' ? 'vigilando la carga' : c.estado === 'cola' ? 'esperando para cargar' : 'en su camión'; if (c.estado === 'libre' && Math.sin(t * .07 + i) > .7) pose = 'carpeta'; }
    else if (c.estado === 'descargando'){ pos = en(-6.2, 1.5); pose = 'canaleta'; mirar = en(-6.2, 0); txt = 'descargando con la canaleta'; }
    if (!pos) continue;
    persona3d(pos[0], y, pos[1], Math.atan2(mirar[0] - pos[0], mirar[1] - pos[1]), escF, pose, ph(10 + i), 0xff7a1a, 0xffffff, { n: `${s.nombre} · ${txt}`, id: s.id });
  }
  // --- mecánicos con camiones (en el taller o en carretera con su furgoneta) ---
  for (const s of J.personal){
    if (s.rol !== 'mecanico' || !disponible(s) || !s.tarea || (R.tarde && !s.noche)) continue;
    const tk = s.tarea, c = R.camiones.find(x => x.id === tk.id), ob = c && camionesObj.get(c.id);
    if (tk.id === 'cantera' || tk.id === 'asfalto'){ const [qx, qz] = tk.id === 'cantera' ? P(HORINSA.cantera.la, HORINSA.cantera.lo) : plantaA ? [plantaA.position.x, plantaA.position.z] : [0, 0];
      persona3d(qx - .016, hMesh(qx, qz) + .003, qz - .048, 0, esc, 'reparar', ph(20), 0x1f5fbf, 0xffffff, { n: `${s.nombre} · reparando ${tk.id === 'cantera' ? 'la machacadora' : 'el quemador'}`, id: s.id }); continue; }
    if (!c || !ob || ob.userData.vx === undefined) continue;
    const a = J.maq[c.id] && J.maq[c.id].averia, va = ob.userData.va, ts = M * escalaVehiculo(), x0 = ob.userData.vx, z0 = ob.userData.vz;
    const f = [Math.cos(va), Math.sin(va)], sd = [-Math.sin(va), Math.cos(va)], en = (af, al) => [x0 + f[0] * af * ts + sd[0] * al * ts, z0 + f[1] * af * ts + sd[1] * al * ts];
    const lejos = !plantaH || Math.hypot(x0 - plantaH.position.x, z0 - plantaH.position.z) > .25;
    let van = furgonetas.get(s.id); if (!van && lejos){ van = crearFurgoneta(); scene.add(van); furgonetas.set(s.id, van); }
    if (lejos && a && a.viaje > 0 && plantaH){                 // la furgoneta del taller va de camino
      const p = Math.max(0, Math.min(1, 1 - a.viaje / (a.viaje0 || a.viaje))), [gx, gz] = [plantaH.position.x + 42 * M * 1.6, plantaH.position.z + 64 * M * 1.6];
      const x = gx + (x0 - gx) * p, z = gz + (z0 - gz) * p; van.visible = true; van.position.set(x, hMesh(x, z) + .0003, z); van.rotation.y = -Math.atan2(z0 - gz, x0 - gx); van.scale.setScalar(ts); continue;
    }
    if (lejos && van){ const [vx, vz] = en(-12, 0); van.visible = true; van.position.set(vx, hMesh(vx, vz) + .0003, vz); van.rotation.y = -va; van.scale.setScalar(ts); }
    const pos = en(2.6, 1.9), mirar = en(2.6, 0), y = hMesh(x0, z0) + (lejos ? .0003 : .5 * M * 1.6);
    persona3d(pos[0], y, pos[1], Math.atan2(mirar[0] - pos[0], mirar[1] - pos[1]), ts, 'agachado', ph(30), 0x1f5fbf, 0xffffff, { n: `${s.nombre} · ${tk.tipo === 'mant' ? 'mantenimiento de' : 'reparando'} ${c.id}`, id: s.id });
    if (tk.tipo === 'rep' && Math.sin(t * 8) > .5) emitir(...en(2.2, 1.2), 0xffb040, .0012, .5, .0008);
  }
  // --- cuadrillas en las obras ---
  for (const p of R.pedidos){
    if (p.estado !== 'aceptado' && p.estado !== 'servido') continue;
    const k = M * 1.6, yo = hMesh(p.x, p.y) + .0008;
    for (let j = 0; j < 5; j++){
      const ang = p.id + j * 1.26, r = (5 + j * 2.4) * k, x = p.x + Math.cos(ang) * r, z = p.y + Math.sin(ang) * r * .7;
      const pose = j === 0 ? 'carpeta' : j < 3 ? 'agachado' : (Math.sin(t * .3 + j) > 0 ? 'andar' : 'quieto');
      const xx = pose === 'andar' ? x + Math.sin(t * .3 + j) * 4 * k : x;
      persona3d(xx, yo, z, ang + Math.PI, esc, pose, ph(40 + j + p.id), j % 2 ? 0xf2c230 : 0xff7a1a, j === 0 ? 0xffffff : 0xf2c230, j === 0 ? `Encargado de obra · ${p.cliente}` : null);
    }
  }
  limpiarPersonas(O.n);
  for (const m of [O.tronco, O.banda, O.cabeza, O.casco, O.brazo, O.pierna, O.herr]){ m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}

/* ---------------- Escombros y sobrantes (crecen con la suciedad) ---------------- */
let escombros = null;
function crearEscombros(){
  const N = 70, g = new THREE.DodecahedronGeometry(1, 0).scale(1, .55, 1.2).translate(0, .3, 0);
  const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), N);
  const o = new THREE.Object3D(), c = new THREE.Color(); let s = 99; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const lista = [];
  for (let i = 0; i < N; i++){
    // zona de sobrantes junto al lavadero, y alguno suelto por el patio, el foso y los acopios
    const zona = i < 40 ? [22 + r() * 28, -46 + r() * 10] : i < 55 ? [28 + r() * 14, -30 + r() * 16] : [-50 + r() * 70, -5 + r() * 30];
    lista.push([zona[0], zona[1], .8 + r() * 1.6, r()]);
    m.setColorAt(i, c.setHSL(.08, .05 + r() * .08, .45 + r() * .2));
  }
  m.count = 0; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
  escombros = { m, lista, o, n: -1 };
}
function actualizarEscombros(){
  if (!escombros || !plantaH) return;
  const st = window.STOCK_PLANTA || { suciedad: .15 }, n = Math.round(Math.min(1, st.suciedad * 1.25) * escombros.lista.length);
  escombros.m.visible = camDist() < 5;
  if (n === escombros.n && !escombros.mover) return;
  escombros.n = n; const P0 = plantaH.position, k = M * 1.6, { o, m } = escombros;
  for (let i = 0; i < n; i++){ const [lx, lz, sc, q] = escombros.lista[i]; const x = P0.x + lx * k, z = P0.z + lz * k;
    o.position.set(x, hMesh(x, z) + .0006, z); o.rotation.set(0, q * 6.28, 0); o.scale.setScalar(M * sc * 1.6); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }
  m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

/* --------------------------- Planta animada --------------------------- */
function animarPlantas(dtR, t){
  if (!plantaH) return;
  const activa = !!(RR() && R.enDia && R.vel > 0), cargando = !!(activa && (R.cargando || R.cargando2));
  const mc = plantaH.userData.cinta; if (mc && cargando) mc.map.offset.x -= dtR * 1.2;
  const tz = plantaH.userData.trozos;
  if (tz){
    const lin = [R && R.cargando, R && R.cargando2], k = M * 1.6, P0 = plantaH.position, o = tz.o; let n = 0;
    tz.caminos.forEach((cam, l) => {
      if (!(activa && lin[l])) return;
      const [a, b, c] = cam.p, L1 = Math.hypot(b[0] - a[0], b[1] - a[1]), L2 = Math.hypot(c[0] - b[0], c[1] - b[1]), L = L1 + L2;
      for (let i = 0; i < 36; i++){
        const s = ((t * .22 + i / 36) % 1) * L, f = s < L1 ? s / L1 : (s - L1) / L2, p0 = s < L1 ? a : b, p1 = s < L1 ? b : c;
        o.position.set(p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, p0[2] + (p1[2] - p0[2]) * f + ((i * .61) % 1 - .5) * 1.1);
        o.rotation.set(i, i * 2.3, 0); o.scale.setScalar(.6 + ((i * .37) % 1) * .7); o.updateMatrix(); tz.m.setMatrixAt(n++, o.matrix);
      }
      // polvo al caer el árido de las tolvas a la cinta y al entrar en la torre
      for (const tx of tz.tolvasX) emitir(P0.x + tx * k, P0.z + cam.zL * k, 0xcbb894, .007, 2.5 * dtR, .009);
      emitir(P0.x + 33 * k, P0.z + cam.zL * k, 0xd8d0c0, .01, 4 * dtR, .028);
    });
    tz.m.count = n; tz.m.instanceMatrix.needsUpdate = true;
  }
  if (plantaA && activa){ const k = M * 1.6, P0 = plantaA.position;
    emitir(P0.x + 26 * k, P0.z - 20 * k, R.cargandoA ? 0x6e6a66 : 0x9c9894, R.cargandoA ? .022 : .014, (R.cargandoA ? 9 : 3) * dtR, .034);     // chimenea
    if (R.cargandoA) emitir(P0.x + 22 * k, P0.z + 10 * k, 0xf0f0f0, .012, 6 * dtR, .006); }                                                   // vapor al cargar
  const pala = plantaH.userData.pala;
  if (pala && activa){
    // ciclo: acopio → tolvas → acopio
    const ciclo = (t * .07) % 1, ida = ciclo < .5, f = ida ? ciclo * 2 : (1 - ciclo) * 2, e = f * f * (3 - 2 * f);
    const tol = (Math.floor(t * .07) % (HORINSA.planta.tolvas || 3));
    const ax = -44, az = -10 + (Math.floor(t * .07) % 3 - 1) * 20, bx = -28 + tol * 9.5, bz = -12;
    pala.position.set(ax + (bx - ax) * e, .5, az + (bz - az) * e);
    pala.rotation.y = Math.atan2(-(bz - az), bx - ax) + (ida ? 0 : Math.PI);
    if (f > .97 || f < .03) emitir(plantaH.position.x + pala.position.x * M * 1.6, plantaH.position.z + pala.position.z * M * 1.6, 0xcbb894, .012, 6 * dtR, .004);
    // brazo: abajo al cargar en el acopio, se levanta de camino y vuelca el cazo sobre la tolva
    const br = plantaH.userData.palaBrazo, cz = plantaH.userData.palaCazo;
    if (br && cz){ const alto = ida ? Math.min(1, f * 1.6) : Math.max(0, f * 1.6 - .6), vuelca = ida && f > .9 ? (f - .9) * 10 : 0;
      br.rotation.z = -.15 + alto * .95; cz.rotation.z = .35 - alto * .5 - vuelca * 1.3 + (!ida && f > .95 ? .4 : 0); }
  } else if (pala && plantaH.userData.palaBrazo){ plantaH.userData.palaBrazo.rotation.z = -.15; plantaH.userData.palaCazo.rotation.z = .35; }
  if (plantaH.userData.techoTaller) plantaH.userData.techoTaller.visible = camDist() > .14;
  // panel de días sin accidentes en la entrada
  const pd =plantaH.userData.panelDias, sp = window.STOCK_PLANTA;
  if (pd && sp && pd.ultimo !== sp.dsa){ pd.ultimo = sp.dsa; const c = pd.cv.getContext('2d');
    c.fillStyle = '#1f7a3a'; c.fillRect(0, 0, 256, 128); c.fillStyle = '#fff'; c.fillRect(6, 6, 244, 116); c.fillStyle = '#1f7a3a'; c.fillRect(10, 10, 236, 108);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '700 17px Arial'; c.fillText('LLEVAMOS', 128, 32); c.font = '900 50px "Arial Black",Arial'; c.fillText(String(sp.dsa), 128, 82);
    c.font = '700 15px Arial'; c.fillText('DÍAS SIN ACCIDENTES', 128, 108); pd.tx.needsUpdate = true; }
}

/* -------------------------------- Nubes -------------------------------- */
function crearNubes(){
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  for (let i = 0; i < 14; i++){
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: .35, depthWrite: false }));
    sp.position.set(X0 + Math.random() * (X1 - X0), 3.2 + Math.random() * 1.6, Y0 + Math.random() * (Y1 - Y0));
    const s = 4 + Math.random() * 7; sp.scale.set(s * 1.8, s, 1); scene.add(sp); nubes.push(sp);
  }
}

/* ============================ ETIQUETAS ============================ */
function proy(x, y, z){ v3.set(x, y, z).project(camera); if (v3.z > 1 || v3.z < -1) return null; return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight]; }
function libre3(x, y, w, h){ for (const r of ETQ) if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return false; ETQ.push([x, y, w, h]); return true; }
function txt3(t, x, y, font, fill, halo, align = 'center'){
  octx.font = font; const w = octx.measureText(t).width, hh = parseInt(font.match(/(\d+)px/)[1]);
  const bx = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
  if (!libre3(bx - 2, y - hh, w + 4, hh + 4)) return false;
  octx.textAlign = align; octx.textBaseline = 'alphabetic'; octx.lineJoin = 'round';
  if (halo){ octx.strokeStyle = halo; octx.lineWidth = 3.5; octx.strokeText(t, x, y); }
  octx.fillStyle = fill; octx.fillText(t, x, y); return true;
}
function pastilla(X, Y, t, fondo, r = 11){
  octx.font = '900 12px "Arial Black",Arial,sans-serif'; const w = Math.max(r * 2, octx.measureText(t).width + 10);
  octx.fillStyle = fondo; octx.strokeStyle = '#fff'; octx.lineWidth = 2; octx.beginPath(); octx.roundRect(X - w / 2, Y - r, w, r * 2, 4); octx.fill(); octx.stroke();
  octx.fillStyle = '#fff'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText(t, X, Y + .5); libre3(X - w / 2 - 1, Y - r - 1, w + 2, r * 2 + 2);
}
function pintarEtiquetas(){
  const d = Math.min(2, devicePixelRatio || 1);
  octx.setTransform(d, 0, 0, d, 0, 0); octx.clearRect(0, 0, innerWidth, innerHeight);
  ETQ = []; H3 = [];
  const dist = camDist();
  const en = (x, z, alto = 0) => proy(x, hMesh(x, z) + alto, z);
  // Plantas y marcas (prioridad)
  { const [x, z] = P(HORINSA.planta.la, HORINSA.planta.lo); const q = en(x, z, .05); if (q){ if (typeof averiada === 'function' && averiada('planta')) pastilla(q[0], q[1] - 42, '⚠ Planta averiada', '#d9534f', 10); pastilla(q[0], q[1] - 18, 'H', '#d2201f', 12); txt3('HORINSA', q[0], q[1] + 4, '800 12px system-ui,sans-serif', '#d2201f', '#fff'); H3.push({ x: q[0], y: q[1] - 18, r: 16, o: { tipo: 'planta' } }); } }
  if (plantaH && dist < 2.5 && window.STOCK_PLANTA && window.STOCK_PLANTA.suciedad > .7){ const k = M * 1.6; const q2 = proy(plantaH.position.x + 36 * k, plantaH.position.y + .02, plantaH.position.z - 40 * k); if (q2) txt3('🧹 Planta muy sucia', q2[0], q2[1], '700 10.5px system-ui', '#c0392b', '#fff'); }
  // nombres y tarea de cada persona al acercarse mucho
  // Encima de cada persona, como en los Sims: rombo con su ánimo (verde/amarillo/rojo) y un aviso si está parada o con un problema.
  // Se puede pinchar para abrir su ficha con acciones.
  if (window.__figs) for (const f of window.__figs){ const q = proy(f.x, f.y, f.z); if (!q) continue;
    const s = f.id && typeof persona === 'function' ? persona(f.id) : null, est = s && typeof estadoPersona === 'function' ? estadoPersona(s) : null;
    if (s){ const X = q[0], Y = q[1] - 10, col = s.contento >= 60 ? '#3fdc5a' : s.contento >= 35 ? '#f2c230' : '#ff4f44';
      octx.beginPath(); octx.moveTo(X, Y - 8); octx.lineTo(X + 5, Y); octx.lineTo(X, Y + 8); octx.lineTo(X - 5, Y); octx.closePath(); octx.fillStyle = col; octx.fill(); octx.strokeStyle = 'rgba(0,0,0,.45)'; octx.lineWidth = 1; octx.stroke();
      if (est && est.ic){ octx.font = '13px system-ui'; octx.textAlign = 'left'; octx.textBaseline = 'middle'; octx.fillText(est.ic, X + 7, Y - 2); }
      H3.push({ x: X, y: Y, r: 14, o: { tipo: 'j-persona', d: s.id } }); }
    if (dist < .45) txt3(f.n, q[0], q[1] - 22, '600 10px system-ui,sans-serif', '#1d1a17', 'rgba(255,255,255,.92)'); }
  if (plantaSur){ const [x, z] = P(DELEG.sur.la, DELEG.sur.lo); const q = en(x, z, .05); if (q){ pastilla(q[0], q[1] - 18, 'H', '#d2201f', 12); txt3('HORINSA Sur', q[0], q[1] + 4, '800 12px system-ui,sans-serif', '#d2201f', '#fff'); } }
  if (plantaA && dist < 20){ const q = proy(plantaA.position.x, plantaA.position.y + .03, plantaA.position.z); if (q) txt3('Planta de asfalto', q[0], q[1], '800 11px system-ui,sans-serif', '#333', '#fff'); }
  { const [x, z] = P(HORINSA.cantera.la, HORINSA.cantera.lo); const q = en(x, z, .03); if (q){ pastilla(q[0], q[1] - 16, '⛏', '#6b4a2a', 10); txt3('Cantera HORINSA', q[0], q[1] + 4, '700 11px system-ui,sans-serif', '#4b2f15', '#fff'); H3.push({ x: q[0], y: q[1] - 16, r: 14, o: { tipo: 'cantera' } }); } }
  for (const m of MARCAS){ const T = TIPOS_M[m.t]; if (T.unico) continue; const [x, z] = P(m.la, m.lo); const q = en(x, z, .04); if (!q) continue;
    if (rivalComprado(m.t)){ pastilla(q[0], q[1] - 16, 'H', '#d2201f', 10); if (dist < 30) txt3(`HORINSA (antes ${m.t})`, q[0], q[1] + 4, '700 11px system-ui,sans-serif', '#d2201f', 'rgba(255,255,255,.9)'); H3.push({ x: q[0], y: q[1] - 16, r: 13, o: { tipo: 'marca', d: m } }); continue; }
    pastilla(q[0], q[1] - 16, T.txt, T.col, 10); if (dist < 30) txt3(m.nota || T.corto, q[0], q[1] + 4, '700 11px system-ui,sans-serif', T.col, 'rgba(255,255,255,.9)'); H3.push({ x: q[0], y: q[1] - 16, r: 13, o: { tipo: 'marca', d: m } }); }
  // Capitales y municipios primero: así no parpadean cuando pasan camiones por delante
  if (capas.nom) for (const t of PUEBLOS){ if (t[3] !== 'capital' && t[3] !== 'muni') continue; const [x, z] = P(t[1], t[2]); const q = en(x, z, .02); if (!q) continue;
    if (txt3(t[0], q[0], q[1], `bold ${t[3] === 'capital' ? 16 : 13.5}px system-ui,sans-serif`, '#1d1a17', 'rgba(255,255,255,.88)')) H3.push({ x: q[0], y: q[1] - 6, r: 14, o: { tipo: 'pueblo', d: t } }); }
  // Obras
  if (RR()) for (const p of R.pedidos){
    if (!['llamada', 'aceptado', 'servido'].includes(p.estado)) continue;
    const q = en(p.x, p.y, .03); if (!q) continue;
    const col = p.estado === 'llamada' ? '#7b8794' : p.estado === 'servido' ? '#3fae5a' : '#f08a24';
    const pul = 1;                                     // fijo: sin latidos
    octx.fillStyle = col; octx.strokeStyle = '#fff'; octx.lineWidth = 2; octx.beginPath(); octx.arc(q[0], q[1] - 18, 10 * pul, 0, 7); octx.fill(); octx.stroke();
    if (p.estado === 'aceptado' && p.entregado > 0){ octx.strokeStyle = '#3fae5a'; octx.lineWidth = 3; octx.beginPath(); octx.arc(q[0], q[1] - 18, 13, -Math.PI / 2, -Math.PI / 2 + p.entregado / p.m3 * Math.PI * 2); octx.stroke(); }
    octx.fillStyle = '#fff'; octx.font = '11px system-ui'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText(p.estado === 'llamada' ? '☎' : p.estado === 'servido' ? '✓' : '🏗', q[0], q[1] - 17.5);
    libre3(q[0] - 12, q[1] - 30, 24, 24);
    txt3(`${p.cliente} · ${p.m3} ${p.mat === 'asfalto' ? 't' : 'm³'}`, q[0], q[1] + 6, '700 10.5px system-ui,sans-serif', col === '#7b8794' ? '#333' : col, 'rgba(255,255,255,.9)');
    H3.push({ x: q[0], y: q[1] - 18, r: 14, o: { tipo: 'j-obra', d: p } });
  }
  // Camiones: ruta que les queda + marcador siempre visible (se dibujan al final, encima de todo)
  if (RR()){
    const colT = { hormigonera: '#d2201f', banera: '#e0a800', asfaltera: '#2b2b2b', cisterna: '#5a6068' }, letra = { hormigonera: 'H', banera: 'B', asfaltera: 'A', cisterna: 'C' };
    const marcas = [];
    for (const [i, c] of R.camiones.entries()){
      const ob = camionesObj.get(c.id), cx = ob && ob.userData.vx !== undefined ? ob.userData.vx : c.x, cz = ob && ob.userData.vz !== undefined ? ob.userData.vz : c.y;
      if (c.ruta && c.ruta.pts.length > 1){                          // trazado pendiente hasta el destino
        const r = c.ruta; let lo = 0; while (lo < r.cum.length - 2 && r.cum[lo + 1] < r.d) lo++;
        const paso = Math.max(1, Math.floor((r.pts.length - lo) / 60));
        octx.beginPath(); let ok = false; const q0 = proy(c.x, hMesh(c.x, c.y) + .002, c.y); if (q0){ octx.moveTo(q0[0], q0[1]); ok = true; }
        for (let k = lo + 1; k < r.pts.length; k += paso){ const p = r.pts[k], q = proy(p[0], hMesh(p[0], p[1]) + .002, p[1]); if (q){ ok ? octx.lineTo(q[0], q[1]) : octx.moveTo(q[0], q[1]); ok = true; } }
        const fin = r.pts[r.pts.length - 1], qf = proy(fin[0], hMesh(fin[0], fin[1]) + .002, fin[1]); if (qf && ok) octx.lineTo(qf[0], qf[1]);
        octx.strokeStyle = colT[c.tipo] || '#333'; octx.globalAlpha = c.id === window.SEGUIDO ? .9 : .45; octx.lineWidth = c.id === window.SEGUIDO ? 3 : 2; octx.setLineDash([6, 5]); octx.stroke(); octx.setLineDash([]); octx.globalAlpha = 1;
      }
      const q = proy(cx, hMesh(cx, cz) + .004 * escalaVehiculo() / 1.6, cz); if (!q) continue;
      marcas.push([c, q]);
      H3.push({ x: q[0], y: q[1], r: 16, o: { tipo: 'j-camion', d: c } });
    }
    for (const [c, q] of marcas){
      const av = c.chofer && averiada(c.id), sel = c.id === window.SEGUIDO, col = av ? '#d9534f' : colT[c.tipo] || '#333';
      if (dist > 1.2 || av || sel){
        const ang = c.ang || 0, r0 = sel ? 11 : 9;
        octx.fillStyle = col; octx.strokeStyle = sel ? '#ffd54a' : '#fff'; octx.lineWidth = sel ? 3 : 2;
        octx.beginPath(); octx.arc(q[0], q[1], r0, 0, 7); octx.fill(); octx.stroke();
        if (c.ruta){ const a2 = Math.atan2(Math.sin(ang), Math.cos(ang)); const pr = proy(c.x + Math.cos(a2) * .05, hMesh(c.x, c.y), c.y + Math.sin(a2) * .05);   // flecha hacia donde va
          if (pr){ const da = Math.atan2(pr[1] - q[1], pr[0] - q[0]); octx.beginPath(); octx.moveTo(q[0] + Math.cos(da) * (r0 + 7), q[1] + Math.sin(da) * (r0 + 7)); octx.lineTo(q[0] + Math.cos(da + 2.5) * r0, q[1] + Math.sin(da + 2.5) * r0); octx.lineTo(q[0] + Math.cos(da - 2.5) * r0, q[1] + Math.sin(da - 2.5) * r0); octx.closePath(); octx.fill(); } }
        octx.fillStyle = '#fff'; octx.font = '900 10px system-ui'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText(av ? '⚠' : letra[c.tipo] || '•', q[0], q[1] + .5);
      }
      if (window.SELCAM && window.SELCAM.has(c.id)){        // seleccionado para órdenes en grupo: anillo verde
        octx.strokeStyle = '#3fe07a'; octx.lineWidth = 3; octx.setLineDash([4, 3]); octx.beginPath(); octx.arc(q[0], q[1], 17 + Math.sin(performance.now() / 200) * 1.5, 0, 7); octx.stroke(); octx.setLineDash([]); }
      if (dist < 14 || sel){ const t = c.id + (c.carga > 0 && c.tipo !== 'cisterna' ? ` · ${c.carga}${c.tipo === 'hormigonera' ? 'm³' : 't'}` : ''); octx.font = '700 10px system-ui'; octx.lineWidth = 3; octx.strokeStyle = 'rgba(255,255,255,.9)'; octx.strokeText(t, q[0], q[1] - 15); octx.fillStyle = '#222'; octx.fillText(t, q[0], q[1] - 15); }
    }
  }
  if (capas.poi) for (const l of LUGARES){
    if (l.t === 'poi' && dist > 25) continue; if (l.t === 'puerto' && dist > 40 && !/Arrecife|Playa Blanca|Órzola|Sebo/.test(l.n)) continue;
    const [x, z] = P(l.la, l.lo); const q = en(x, z, .01); if (!q) continue;
    const col = l.t === 'puerto' ? '#1c4f8a' : l.t === 'aero' ? '#444' : '#2f7d4a', gl = l.t === 'puerto' ? '⚓' : l.t === 'aero' ? '✈' : '★';
    if (!libre3(q[0] - 9, q[1] - 9, 18, 18)) continue;
    octx.fillStyle = col; octx.strokeStyle = '#fff'; octx.lineWidth = 1.6; octx.beginPath(); octx.arc(q[0], q[1], 8, 0, 7); octx.fill(); octx.stroke();
    octx.fillStyle = '#fff'; octx.font = '10px system-ui'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText(gl, q[0], q[1] + .5);
    if (dist < 14) txt3(l.n, q[0] + 11, q[1] + 4, '600 10.5px system-ui,sans-serif', col, 'rgba(255,255,255,.85)', 'left');
    H3.push({ x: q[0], y: q[1], r: 11, o: { tipo: l.t, d: l } });
  }
  if (capas.nom){
    const lim = { capital: 999, muni: 999, turis: 60, pueblo: 30, aldea: 13 };
    const ord = PUEBLOS.slice().sort((a, b) => lim[b[3]] - lim[a[3]]);
    for (const t of ord){ if (dist > lim[t[3]] || t[3] === 'capital' || t[3] === 'muni') continue; const [x, z] = P(t[1], t[2]); const q = en(x, z, .02); if (!q) continue;
      const big = t[3] === 'capital' ? 16 : t[3] === 'muni' ? 13.5 : 12;
      if (txt3(t[0], q[0], q[1], `${t[3] === 'capital' || t[3] === 'muni' ? 'bold' : '600'} ${big}px system-ui,sans-serif`, '#1d1a17', 'rgba(255,255,255,.88)')) H3.push({ x: q[0], y: q[1] - 6, r: 14, o: { tipo: 'pueblo', d: t } }); }
    if (dist < 32) for (const [n, la, lo, h] of MONTES){ if (dist > 18 && h < 450) continue; const [x, z] = P(la, lo); const q = en(x, z, .02); if (!q) continue;
      if (txt3(`▲ ${n} · ${h} m`, q[0], q[1], 'italic 600 10.5px system-ui,sans-serif', '#4a2414', 'rgba(255,240,225,.8)')) H3.push({ x: q[0], y: q[1] - 5, r: 10, o: { tipo: 'monte', d: [n, la, lo, h] } }); }
    if (dist > 12 && dist < 70) for (const [n, la, lo, f] of ZONAS_TXT){ const [x, z] = P(la, lo); const q = en(x, z, .05); if (q) txt3(n.toUpperCase(), q[0], q[1], `italic 600 ${f}px Georgia,serif`, 'rgba(255,248,235,.95)', 'rgba(40,25,15,.55)'); }
    if (dist > 20) for (const [n, la, lo, f] of MAR_TXT){ const [x, z] = P(la, lo); const q = proy(x, 0, z); if (q) txt3(n, q[0], q[1], `italic ${f}px Georgia,serif`, 'rgba(230,245,252,.95)', 'rgba(10,50,80,.45)'); }
  }
}

/* ============================ CÁMARA Y SOL ============================ */
function actualizarSol(){
  const hora = RR() ? R.min / 60 : 10.5;
  // Lanzarote: amanece hacia las 07:00 y anochece hacia las 19:15; a las 22:00 es noche cerrada
  const th = Math.max(-.25, Math.min(Math.PI + .25, (hora - 6.9) / (19.3 - 6.9) * Math.PI));
  const elev = Math.sin(th), dir = new THREE.Vector3(Math.cos(th), Math.max(.06, elev * 1.15), .55 + .25 * elev).normalize();
  const tgt = controls.target, dist = camDist();
  const tam = Math.min(9, Math.max(.35, dist * .75));
  sol.position.copy(tgt).addScaledVector(dir, 30); sol.target.position.copy(tgt);
  const sc = sol.shadow.camera; if (Math.abs(sc.right - tam) > tam * .05){ sc.left = sc.bottom = -tam; sc.right = sc.top = tam; sc.near = 1; sc.far = 80; sc.updateProjectionMatrix(); }
  const tarde = Math.max(0, Math.min(1, (hora - 16.2) / 3)), luz = Math.max(.06, Math.min(1, elev * 1.6 + .15) - Math.max(0, hora - 19.2) * .2);
  sol.intensity = 2.7 * luz; sol.color.setRGB(1, .95 - tarde * .25, .86 - tarde * .4);
  hemi.intensity = .3 + .85 * luz;
  const noche = Math.max(0, Math.min(1, (hora - 18.9) / 1.4));
  const hor = new THREE.Color(0xd3e8f4).lerp(new THREE.Color(0xf3b48a), tarde * .7).lerp(new THREE.Color(0x3a4560), noche * .75);
  const top = new THREE.Color(0x3f82c6).lerp(new THREE.Color(0x5a6fa8), tarde * .5).lerp(new THREE.Color(0x141d33), noche * .8);
  // clima del día
  const clima = RR() ? R.clima : 'sol';
  if (clima === 'calima'){ hor.lerp(new THREE.Color(0xd9b98a), .65); top.lerp(new THREE.Color(0xcdb38c), .6); sol.intensity *= .7; sol.color.lerp(new THREE.Color(0xffd9a0), .5); }
  else if (clima === 'lluvia'){ hor.lerp(new THREE.Color(0x7d8792), .7); top.lerp(new THREE.Color(0x56606a), .75); sol.intensity *= .35; hemi.intensity *= .8; }
  else if (clima === 'nublado'){ hor.lerp(new THREE.Color(0xc5ccd2), .4); top.lerp(new THREE.Color(0x8d99a5), .45); sol.intensity *= .6; }
  scene.background.copy(hor); scene.fog.color.copy(hor);
  if (cielo){ const u = cielo.material.uniforms; u.uHor.value.copy(hor); u.uTop.value.copy(top); u.uSol.value.copy(dir); u.uSolCol.value.setRGB(1, .93 - tarde * .3, .8 - tarde * .45); cielo.position.copy(camera.position); }
  const luces = Math.max(0, Math.min(1, (hora - 18) / 1.2));
  if (luzTaller){ luzTaller.intensity = (RR() && R.tarde ? 1 : .0) * Math.max(.25, luces) * 3; luzTaller.visible = luzTaller.intensity > .01 && dist < 3; }
  for (const m of matsLuz) m.emissiveIntensity = luces * 1.4;
  MAT_FARO.emissiveIntensity = .4 + luces * 3;
  if (farolas){ farolas.brillo.material.opacity = luces; farolas.brillo.visible = luces > .01; farolas.postes.visible = dist < 6; }
  if (lucesCoches){ lucesCoches.material.opacity = luces * .9; lucesCoches.visible = luces > .01; }
  if (terreno.material.userData.sh) terreno.material.userData.sh.uniforms.uDetF.value = Math.max(0, Math.min(1, 1.6 - dist / 1.2));
  if (espumaMat) espumaMat.uniforms.uT.value = performance.now() / 1000;
  scene.fog.near = Math.max(30, dist * 1.6); scene.fog.far = Math.max(120, dist * 4);
  if (clima === 'calima'){ scene.fog.near = Math.max(.6, dist * .5); scene.fog.far = Math.max(8, dist * 2.4); }
  else if (clima === 'lluvia'){ scene.fog.near = Math.max(1, dist * .8); scene.fog.far = Math.max(15, dist * 3); }
  // lluvia: gotas alrededor de la cámara
  if (lluvia){ lluvia.visible = clima === 'lluvia';
    if (lluvia.visible){ const p = lluvia.geometry.attributes.position, a = p.array, dtl = Math.min(.05, (performance.now() - (lluvia.userData.t || performance.now())) / 1000);
      for (let i = 1; i < a.length; i += 3){ a[i] -= dtl * 1.6; if (a[i] < -.5) a[i] += 1; } p.needsUpdate = true;
      lluvia.position.copy(controls.target); lluvia.scale.setScalar(Math.max(.4, dist * 1.3)); }
    lluvia.userData.t = performance.now(); }
}
let lluvia = null;
function crearLluvia(){
  const n = 2600, pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = Math.random() - .5;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lluvia = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb8c6d4, size: 2, sizeAttenuation: false, transparent: true, opacity: .6, depthWrite: false }));
  lluvia.frustumCulled = false; lluvia.visible = false; scene.add(lluvia);
}
function limitarCamara(){
  const t = controls.target;
  t.x = Math.max(X0 + 2, Math.min(X1 - 2, t.x)); t.z = Math.max(Y0 + 2, Math.min(Y1 - 2, t.z));
  const hy = Math.max(0, hMesh(t.x, t.z)); t.y += (hy - t.y) * .15;
  const hc = Math.max(0, hMesh(camera.position.x, camera.position.z)) + .03;
  if (camera.position.y < hc) camera.position.y = hc;
}
function enfocar3D(x, z, d){
  const dist = d || Math.min(camDist(), 1.8);
  const off = camera.position.clone().sub(controls.target).setLength(dist);
  const desde = { t: controls.target.clone(), off: camera.position.clone().sub(controls.target) };
  const hasta = { t: new THREE.Vector3(x, Math.max(0, hMesh(x, z)), z), off };
  anim = { desde, hasta, t0: performance.now(), dur: 900 };
}
function animar(){
  if (!anim) return;
  let f = Math.min(1, (performance.now() - anim.t0) / anim.dur); f = f * f * (3 - 2 * f);
  controls.target.lerpVectors(anim.desde.t, anim.hasta.t, f);
  const off = anim.desde.off.clone().lerp(anim.hasta.off, f);
  camera.position.copy(controls.target).add(off);
  if (f >= 1) anim = null;
}
function vistaIsla(){ const [cx, cz] = P(29.035, -13.64), fv = innerWidth < innerHeight ? 1.9 : 1; anim = { desde: { t: controls.target.clone(), off: camera.position.clone().sub(controls.target) }, hasta: { t: new THREE.Vector3(cx, 0, cz + 2 + (fv > 1 ? 9 : 0)), off: new THREE.Vector3(0, 52 * fv, 48 * fv) }, t0: performance.now(), dur: 1100 }; }

/* ============================ INTERACCIÓN ============================ */
function instalarEventos(){
  const cv = document.getElementById('c3'); let ini = null;
  cv.addEventListener('pointerdown', e => { ini = [e.clientX, e.clientY]; anim = null; });
  cv.addEventListener('pointermove', e => { if (ini && e.buttons && Math.hypot(e.clientX - ini[0], e.clientY - ini[1]) > 8 && window.SEGUIDO){ window.SEGUIDO = null; } });
  cv.addEventListener('pointerup', e => {
    if (!ini || Math.hypot(e.clientX - ini[0], e.clientY - ini[1]) > 5){ ini = null; return; } ini = null;
    if (modoMarcar){
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), camera);
      const hit = ray.intersectObject(terreno)[0]; if (hit) colocarKm(hit.point.x, hit.point.z); return;
    }
    let best = null, bd = 1e9; for (const h of H3){ const d = Math.hypot(h.x - e.clientX, h.y - e.clientY); if (d < h.r && d < bd){ bd = d; best = h; } }
    if (best){
      // Mayús/Ctrl + clic en un camión: lo añade a la selección múltiple (para dar órdenes a varios)
      if (best.o.tipo === 'j-camion' && (e.shiftKey || e.ctrlKey || window.MODO_SEL) && window.selCamion){ window.selCamion(best.o.d.id); return; }
      // tocar un camión lo sigue con la cámara (y abre su ficha)
      if (best.o.tipo === 'j-camion'){ window.SEGUIDO = best.o.d.id; const ob = camionesObj.get(best.o.d.id); const x = ob ? ob.userData.vx : best.o.d.x, z = ob ? ob.userData.vz : best.o.d.y; enfocar3D(x, z, Math.min(camDist(), 1.4)); }
      ficha(best.o);
    } else document.getElementById('ficha').style.display = 'none';
  });
  cv.addEventListener('pointermove', e => {
    let sobre = false; for (const h of H3) if (Math.hypot(h.x - e.clientX, h.y - e.clientY) < h.r){ sobre = true; break; }
    cv.style.cursor = modoMarcar ? 'crosshair' : sobre ? 'pointer' : 'grab';
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), camera);
    if (!(e.buttons)){ const hit = ray.intersectObject(terreno)[0]; if (hit){ const [la, lo] = INV(hit.point.x, hit.point.z); document.getElementById('coord').textContent = `${la.toFixed(4)}° N · ${Math.abs(lo).toFixed(4)}° O`; } }
  });
  cv.addEventListener('dblclick', e => {
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), camera);
    const hit = ray.intersectObject(terreno)[0]; if (hit) enfocar3D(hit.point.x, hit.point.z, camDist() * .45);
  });
  const zin = document.getElementById('zin'), zout = document.getElementById('zout'), zh = document.getElementById('zhome');
  const z0 = zin.onclick, z1 = zout.onclick, z2 = zh.onclick;
  const zoom = f => { const off = camera.position.clone().sub(controls.target); const nd = Math.max(controls.minDistance, Math.min(controls.maxDistance, off.length() * f)); anim = { desde: { t: controls.target.clone(), off }, hasta: { t: controls.target.clone(), off: off.clone().setLength(nd) }, t0: performance.now(), dur: 350 }; };
  // girar alrededor del punto central y alternar inclinación (para móvil y para quien no use el botón derecho)
  const girar = ang => { const off = camera.position.clone().sub(controls.target), off2 = off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    anim = { desde: { t: controls.target.clone(), off }, hasta: { t: controls.target.clone(), off: off2 }, t0: performance.now(), dur: 450 }; };
  const inclinar = () => { const off = camera.position.clone().sub(controls.target), L = off.length(), pol = Math.acos(off.y / L), az = Math.atan2(off.x, off.z);
    const np = pol > .55 ? .2 : 1.0; const off2 = new THREE.Vector3(Math.sin(np) * Math.sin(az), Math.cos(np), Math.sin(np) * Math.cos(az)).multiplyScalar(L);
    anim = { desde: { t: controls.target.clone(), off }, hasta: { t: controls.target.clone(), off: off2 }, t0: performance.now(), dur: 500 }; };
  document.getElementById('rIzq').onclick = () => girar(Math.PI / 6);
  document.getElementById('rDer').onclick = () => girar(-Math.PI / 6);
  document.getElementById('rInc').onclick = inclinar;
  zin.onclick = () => window.MODO3D ? zoom(.6) : z0(); zout.onclick = () => window.MODO3D ? zoom(1.6) : z1(); zh.onclick = () => window.MODO3D ? vistaIsla() : z2();
}

/* =============================== BUCLE =============================== */
function cuadro3D(){
  if (!listo) return;
  const ahora = performance.now(), dtR = Math.min(.1, (ahora - tAnt) / 1000); tAnt = ahora;
  const dtMin = RR() && R.enDia ? dtR * MIN_POR_SEG * R.vel : 0;
  animar();
  // seguir un camión: la cámara se desplaza con él manteniendo el ángulo
  if (window.SEGUIDO && RR()){ const c = R.camiones.find(c => c.id === window.SEGUIDO);
    if (!c) window.SEGUIDO = null;
    else if (!anim){ const ob = camionesObj.get(c.id), x = ob && ob.userData.vx !== undefined ? ob.userData.vx : c.x, z = ob && ob.userData.vz !== undefined ? ob.userData.vz : c.y;
      const d = new THREE.Vector3(x - controls.target.x, hMesh(x, z) - controls.target.y, z - controls.target.z).multiplyScalar(.12);
      controls.target.add(d); camera.position.add(d); } }
  controls.update(); limitarCamara();
  { const d = camDist(), n = Math.max(.002, d * .004), f = d * 25 + 80; if (Math.abs(camera.near - n) > n * .1 || Math.abs(camera.far - f) > f * .1){ camera.near = n; camera.far = f; camera.updateProjectionMatrix(); } }
  // tolvas nuevas → reconstruir la planta
  actualizarRivales();
  if (!plantaSur && typeof J !== 'undefined' && J && J.deleg && J.deleg.sur){ const [sx, sz] = P(DELEG.sur.la, DELEG.sur.lo); plantaSur = colocarEn(crearPlanta({ marca: 'H', fondo: '#d2201f', color: ROJO, tolvas: 4, silos: 2 }), sx, sz, 1.6); }
  if (!plantaA && typeof J !== 'undefined' && J && J.asfalto){ const [px, pz] = P(HORINSA.planta.la, HORINSA.planta.lo); plantaA = colocarEn(crearPlantaAsfalto(), px + OFF_ASF[0], pz + OFF_ASF[1], 1.6); }
  const firma = HORINSA.planta.tolvas + '|' + (HORINSA.planta.lineas || 1);
  if (firma !== tolvasHechas){ scene.remove(plantaH); const [px, pz] = P(HORINSA.planta.la, HORINSA.planta.lo); plantaH = colocarEn(crearPlanta({ marca: 'H', fondo: '#d2201f', color: ROJO, tolvas: HORINSA.planta.tolvas, lineas: HORINSA.planta.lineas || 1, principal: true }), px, pz, 1.6); tolvasHechas = firma; }
  if (window.STOCK_PLANTA){ const k = .45 + .8 * STOCK_PLANTA.acopio; plantaH.traverse(o => { if (o.userData.acopio){ o.scale.setScalar(k / (o.userData.k0 || (o.userData.k0 = k))); } }); }
  const ancho = Math.min(14, Math.max(1, camDist() / 2.5));
  for (const m of carreterasMat){ if (m.material.userData.sh) m.material.userData.sh.uniforms.uAncho.value = m.userData.tipo === 'calle' ? Math.min(2, ancho) : ancho; m.visible = capas.car && (m.userData.tipo !== 'calle' || camDist() < 9); }
  edificiosMesh.visible = capas.edi;
  if (rotondas){ rotondas.g.visible = capas.car && camDist() < 9; if (rotondas.g.visible) for (const a of rotondas.molinos) a.rotation.y += dtR * 1.6; }
  { const dd = camDist(), t = controls.target, R2 = Math.max(2.4, dd * 1.4); for (const b of bloquesEdif) b.g.visible = dd < 16 && Math.hypot(b.cx - t.x, b.cz - t.z) < R2; }
  { const dd = camDist(), t = controls.target, R2 = Math.min(3.2, .9 + dd * 1.2); for (const c of cercanos) c.m.visible = dd < 4 && Math.hypot(c.cx - t.x, c.cz - t.z) < R2; }
  if (aguaMat.userData.sh) aguaMat.userData.sh.uniforms.uT.value = ahora / 1000;
  sincronizarCamiones(dtR); sincronizarObras(ahora / 1000); animarPlantas(dtR, ahora / 1000); actualizarEscombros(); moverObreros(ahora / 1000); moverPolvo(dtR); // coches y barcos van a velocidad creíble (unas 3 veces la real), no al reloj acelerado del juego
  const enMarcha = !!(RR() && R.enDia && R.vel > 0);
  moverTrafico(enMarcha ? dtR * 3 / 60 : 0); moverBarcos(dtR * .5, ahora / 1000);
  for (const n of nubes){ n.position.x += dtR * (RR() && R.clima === 'viento' ? .35 : .05); if (n.position.x > X1 + 5) n.position.x = X0 - 5; n.material.opacity = Math.min(.35, Math.max(0, (camDist() - 10) / 40)); }
  actualizarSol();
  renderer.render(scene, camera);
  pintarEtiquetas();
}

/* =============================== ARRANQUE =============================== */
function iniciar3D(){
  if (listo || !window.ELEV || !window.COLOR3D || typeof densificar !== 'function') return;
  try{
    window.__3d = () => ({ renderer, scene, camera, controls, hMesh });
    crearEscena(); crearCielo(); crearTerreno(); aplanarSitios(); crearEspuma(); crearRotondas(); crearCarreteras(); crearEdificios(); crearVegetacion(); crearAeropuerto(); crearPlantas(); crearTrafico(); crearBarcos(); crearNubes(); crearFarolas(); crearPolvo(); crearObreros(); crearEscombros(); crearLluvia(); instalarEventos();
    // precompilar todos los materiales (evita tirones la primera vez que algo aparece)
    for (const c of cercanos) c.m.visible = true; for (const b of bloquesEdif) b.g.visible = true; for (const o of camionesObj.values()) o.visible = true;
    try{ renderer.compile(scene, camera); }catch(e){}
    for (const c of cercanos) c.m.visible = false; for (const b of bloquesEdif) b.g.visible = false;
    listo = true;
    window.cuadro3D = cuadro3D; window.enfocar3D = enfocar3D;
    document.getElementById('bModo').style.display = '';
    document.getElementById('bModo').onclick = () => ponerModo(!window.MODO3D);
    let pref = '3d'; try{ pref = localStorage.getItem('horinsa-modo') || '3d'; }catch(e){}
    ponerModo(pref !== '2d');
  }catch(err){ console.error('No se pudo iniciar el 3D', err); window.MODO3D = false; }
}
window.iniciar3D = iniciar3D;
if (window.ELEV) iniciar3D();