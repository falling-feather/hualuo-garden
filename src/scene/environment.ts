import * as THREE from 'three';
import type { StateSnapshot } from '../domain/state.ts';
import {RoofShelter} from '../domain/shelter.ts';
import {windAmplitude} from '../domain/material-roles.ts';
import {styleLandscapeShader,landscapeVariant}from'./landscape-style.ts';
import{createLandscapeField}from'../domain/landscape.ts';
import type{Manifest}from'../domain/types.ts';

const mix = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const clamp = THREE.MathUtils.clamp;
const outdoorSky = { zenith: '#397fae', horizon: '#b9d2dd', ground: '#66705a' };

/** Low-frequency outdoor radiance; the directional light supplies the sun separately. */
export function createGardenEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(10, 24, 12);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: {
      zenith: { value: new THREE.Color(outdoorSky.zenith).multiplyScalar(1.8) },
      horizon: { value: new THREE.Color(outdoorSky.horizon).multiplyScalar(1.25) },
      ground: { value: new THREE.Color(outdoorSky.ground).multiplyScalar(.35) },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground;
      void main() {
        float y = normalize(vDirection).y;
        vec3 sky = mix(horizon,zenith,pow(max(y,0.0),.55));
        vec3 reflectedGround = mix(ground,horizon*.25,pow(1.0+min(y,0.0),8.0));
        gl_FragColor = vec4(mix(reflectedGround,sky,smoothstep(-.04,.06,y)),1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(geometry, material));
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    // Smooth sky irradiance needs no high-resolution image or repeated per-frame capture.
    const target = generator.fromScene(scene, 0, .1, 30, { size: 128 });
    const texture = target.texture;
    texture.name = 'Garden outdoor sky radiance';
    const releaseTarget = () => {
      texture.removeEventListener('dispose', releaseTarget);
      target.dispose();
    };
    texture.addEventListener('dispose', releaseTarget);
    return texture;
  } finally {
    geometry.dispose();
    material.dispose();
    generator.dispose();
  }
}

export class GardenEnvironment {
  #presence=1;
  setPresence(value:boolean){this.#presence=value?1:0;}
  readonly uniforms = {
    time: { value: 0 }, wind: { value: .22 }, snow: { value: 0 }, wet: { value: 0 },
  };
  readonly sun = new THREE.DirectionalLight(0xfff6e9, 2.9);
  readonly hemisphere = new THREE.HemisphereLight(0xc2d4e0, 0x605f52, .38);
  readonly direction = new THREE.Vector3();
  #scene: THREE.Scene;
  #sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  #sunDisk: THREE.Mesh;
  #moonDisk: THREE.Mesh;
  #stars: THREE.Points;
  #rain: THREE.LineSegments;
  #snow: THREE.Points;
  #rainPositions: Float32Array;
  #snowPositions: Float32Array;
  #lanterns = new Set<THREE.MeshStandardMaterial>();
  #foliage = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  #clock = 0;
  #hour = 8.2;
  #weather = 'clear';
  #state: StateSnapshot | null = null;
  #shelter:RoofShelter;
  #roofTexture:THREE.DataTexture;
  #roofBounds:THREE.Vector4;
  #landscapeBounds:THREE.Vector4;
  #landscapeField=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
  #roofDirty=false;
  night = 0;

  constructor(scene: THREE.Scene,bounds:[number,number,number,number]) {
    this.#scene = scene;
    this.#landscapeBounds=new THREE.Vector4(bounds[0],-bounds[3],bounds[2]-bounds[0],bounds[3]-bounds[1]);
    this.#shelter=new RoofShelter([bounds[0],-bounds[3],bounds[2],-bounds[1]]);
    const roofGrid=this.#shelter.snapshot();
    this.#roofTexture=new THREE.DataTexture(roofGrid.heights,roofGrid.columns,roofGrid.rows,THREE.RedFormat,THREE.FloatType);
    this.#roofTexture.minFilter=this.#roofTexture.magFilter=THREE.NearestFilter;
    this.#roofTexture.needsUpdate=true;
    this.#roofBounds=new THREE.Vector4(roofGrid.origin[0],roofGrid.origin[1],roofGrid.extent[0],roofGrid.extent[1]);
    // A clear garden stays un-veiled at walking distances. Weather changes the
    // same fog's interval rather than switching shader variants at runtime.
    scene.fog = new THREE.Fog(outdoorSky.horizon, 160, 1600);
    scene.add(this.sun, this.sun.target, this.hemisphere);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = .5;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -.00015;
    this.sun.shadow.normalBias = .05;
    this.sun.shadow.radius = 2;
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(outdoorSky.zenith) }, bottom: { value: new THREE.Color(outdoorSky.horizon) },
        sunDirection: { value: this.direction }, sunGlow: { value: new THREE.Color('#f1d2a0') }, sunPower: { value: 1 },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec3 vDirection;
        uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDirection; uniform vec3 sunGlow; uniform float sunPower;
        void main() {
          float h = pow(clamp(normalize(vDirection).y,0.0,1.0),.45);
          vec3 col = mix(bottom,top,h);
          float glow = pow(max(0.0,dot(normalize(vDirection),normalize(sunDirection))),24.0);
          col += sunGlow*glow*.21*sunPower;
          gl_FragColor = vec4(col,1.0);
        }
      `,
    });
    this.#sky = new THREE.Mesh(new THREE.SphereGeometry(750, 32, 16), material);
    this.#sky.frustumCulled = false;
    scene.add(this.#sky);
    this.#sunDisk = new THREE.Mesh(new THREE.SphereGeometry(2.5, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.8, .9), fog: false, toneMapped: false }));
    this.#moonDisk = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xdce3d0, fog: false }));
    scene.add(this.#sunDisk, this.#moonDisk);
    const stars = new Float32Array(1600 * 3);
    for (let i = 0; i < 1600; i++) {
      const a = i * 2.399963, y = .08 + (i % 257) / 257 * .92;
      const r = Math.sqrt(1 - y * y) * 600;
      stars.set([Math.cos(a) * r, y * 600, Math.sin(a) * r], i * 3);
    }
    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.#stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xd3e1db, size: .7, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.#stars);
    this.#rainPositions = new Float32Array(3600 * 6);
    for (let i = 0; i < 3600; i++) {
      const x = (Math.random() - .5) * 75, y = Math.random() * 60, z = (Math.random() - .5) * 75;
      this.#rainPositions.set([x,y,z,x+.08,y-.7,z+.03],i*6);
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.#rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.#rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0xbdcdd0, transparent: true, opacity: .32, depthWrite: false }));
    this.#rain.frustumCulled = false;
    scene.add(this.#rain);
    this.#snowPositions = new Float32Array(1600 * 3);
    for (let i = 0; i < 1600; i++) this.#snowPositions.set([(Math.random()-.5)*65,Math.random()*45,(Math.random()-.5)*65],i*3);
    const snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(this.#snowPositions,3).setUsage(THREE.DynamicDrawUsage));
    const snowMaterial = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false,
      vertexShader:`void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_PointSize=clamp(70.0/max(1.0,-p.z),1.0,8.0);gl_Position=projectionMatrix*p;}`,
      fragmentShader:`void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.15,d);if(a<.03)discard;gl_FragColor=vec4(.91,.94,.94,a*.8);}`,
    });
    this.#snow = new THREE.Points(snowGeometry,snowMaterial);
    this.#snow.frustumCulled=false;
    scene.add(this.#snow);
  }

  addRoof(geometry:THREE.BufferGeometry,matrix:THREE.Matrix4){
    this.#roofDirty=true;
    const positions=geometry.attributes.position!;
    const indices=geometry.index;
    const count=indices?.count??positions.count;
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
    for(let i=0;i<count;i+=3){
      a.fromBufferAttribute(positions,indices?indices.getX(i):i).applyMatrix4(matrix);
      b.fromBufferAttribute(positions,indices?indices.getX(i+1):i+1).applyMatrix4(matrix);
      c.fromBufferAttribute(positions,indices?indices.getX(i+2):i+2).applyMatrix4(matrix);
      this.#shelter.addTriangle(a.toArray(),b.toArray(),c.toArray());
    }
  }

  configureLandscape(plan:Pick<Manifest,'bounds'|'landmarks'|'circulation'>){
    const field=createLandscapeField(plan);this.#landscapeField.dispose();
    this.#landscapeField=new THREE.DataTexture(field.data,field.size,field.size);
    this.#landscapeField.minFilter=this.#landscapeField.magFilter=THREE.LinearFilter;this.#landscapeField.needsUpdate=true;
  }

  prepareMaterial(material: THREE.MeshStandardMaterial, role: string) {
    const windScale=windAmplitude(role),windy=windScale>0;
    const thinLeaf=role==='grove_foliage',anchored=thinLeaf||role==='grass';
    if(role==='terrain')material.normalScale.multiplyScalar(.65);
    if(role==='surroundings')material.normalScale.multiplyScalar(.12);
    // Thin petals retain their colour in the snow; indoor cut flowers shed it.
    const snowRetention=role==='cut_flower'?0:role==='blossom'?.12:1;
    if (role === 'lantern_glow') {
      this.#lanterns.add(material);
      material.emissive.set('#ffb663');
    }
    if (role === 'tree_leaves'||role === 'grove_foliage') this.#foliage.set(material,material.color.clone());
    material.onBeforeCompile = shader => {
      shader.uniforms.uGardenTime=this.uniforms.time;
      shader.uniforms.uGardenWind=this.uniforms.wind;
      shader.uniforms.uGardenSnow=this.uniforms.snow;
      shader.uniforms.uGardenWet=this.uniforms.wet;
      shader.uniforms.uGardenRoofHeights={value:this.#roofTexture};
      shader.uniforms.uGardenRoofBounds={value:this.#roofBounds};
      shader.vertexShader=`uniform float uGardenTime; uniform float uGardenWind;
        varying vec3 vGardenNormal; varying vec3 vGardenPosition;\n`+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n'+(windy ? `
          float gardenPhase = position.x*.65+position.z*.4+uGardenTime*.75;
          float gardenAttachment = ${anchored?'clamp(uv.y,0.0,1.0)':'1.0'};
          transformed.x += sin(gardenPhase)*uGardenWind*.16*${windScale.toFixed(2)}*gardenAttachment;
          transformed.z += cos(gardenPhase*.8)*uGardenWind*.09*${windScale.toFixed(2)}*gardenAttachment;
        ` : ''));
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`
        #include <worldpos_vertex>
        #ifdef USE_BATCHING
          vGardenNormal = normalize(mat3(modelMatrix*batchingMatrix)*objectNormal);
          vGardenPosition = (modelMatrix*batchingMatrix*vec4(transformed,1.0)).xyz;
        #else
          vGardenNormal = normalize(mat3(modelMatrix)*objectNormal);
          vGardenPosition = (modelMatrix*vec4(transformed,1.0)).xyz;
        #endif
      `);
      shader.fragmentShader=`uniform float uGardenSnow; uniform float uGardenWet;
        uniform sampler2D uGardenRoofHeights; uniform vec4 uGardenRoofBounds;
        varying vec3 vGardenNormal; varying vec3 vGardenPosition;\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
        #include <color_fragment>
        float gardenExposure = 1.0;
        if (max(uGardenSnow,uGardenWet)>.001) {
          vec2 roofUV=(vGardenPosition.xz-uGardenRoofBounds.xy)/uGardenRoofBounds.zw;
          if(all(greaterThanEqual(roofUV,vec2(0.0)))&&all(lessThan(roofUV,vec2(1.0)))) {
            float roofHeight=texture2D(uGardenRoofHeights,roofUV).r;
            // The 0.5m grid needs a small slope allowance for the roof's own skin.
            gardenExposure=step(roofHeight-.35,vGardenPosition.y);
          }
        }
        float gardenWet=uGardenWet*gardenExposure;
        float gardenSnow = smoothstep(.35,.85,normalize(vGardenNormal).y)*uGardenSnow*gardenExposure*${snowRetention.toFixed(3)};
        float gardenNoise = .90 + .10*sin(vGardenPosition.x*7.0+sin(vGardenPosition.z*6.0));
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.78,.83,.84),gardenSnow*gardenNoise);
        diffuseColor.rgb *= 1.0-gardenWet*.12*(1.0-gardenSnow);
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
        #include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,max(.23,roughnessFactor*.58),gardenWet);
      `);
      if(thinLeaf){
        // Approximate transmission through a thin lamina. This uses the same
        // direct light after shadowing, so leaves never become emissive at night.
        const diffuse='reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
        const lighting=THREE.ShaderChunk.lights_physical_pars_fragment;
        if(!lighting.includes(diffuse))throw new Error('Three.js leaf lighting hook requires review');
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',lighting.replace(diffuse,diffuse+`
          float gardenBackLight = saturate(dot(-geometryNormal,directLight.direction));
          reflectedLight.directDiffuse += gardenBackLight*.38*directLight.color*BRDF_Lambert(material.diffuseContribution);
        `));
      }
      styleLandscapeShader(shader,role,this.#landscapeBounds,this.#landscapeField);
    };
    material.customProgramCacheKey=()=>`garden-landscape-3-${landscapeVariant(role)}-${snowRetention}-${windScale}-${thinLeaf}-${anchored}`;
    material.needsUpdate=true;
  }

  updateState(state: StateSnapshot) {
    this.#state=state;
    this.#hour=state.hour;
    this.#weather=state.weather;
    this.#rain.visible=state.weather==='rain';
    this.#snow.visible=state.weather==='snow';
    this.uniforms.wind.value=state.weather==='rain'?.85:state.weather==='snow'?.4:.25;
    this.uniforms.wet.value=state.weather==='rain'?1:0;
    this.uniforms.snow.value=state.weather==='snow'?.90:state.season==='winter'?.48:0;
    for (const [material,base] of this.#foliage) {
      material.color.copy(base);
      if (state.season==='autumn') material.color.lerp(new THREE.Color('#a3b35c'),.18);
    }
  }

  update(delta: number, camera: THREE.Camera, target: THREE.Vector3, shadowSpan: number) {
    if(this.#roofDirty){
      this.#roofTexture.image.data=this.#shelter.snapshot().heights;
      this.#roofTexture.needsUpdate=true;
      this.#roofDirty=false;
    }
    this.#clock+=delta;
    this.uniforms.time.value=this.#clock;
    // +X is east and +Z is south after the Blender-to-web axis conversion.
    // A 60-degree noon arc gives the south-facing halls oblique morning light;
    // the existing six-to-eighteen daylight cycle and opposite moon are retained.
    const hourAngle=(this.#hour-12)*Math.PI/12;
    const meridian=Math.cos(hourAngle);
    this.direction.set(-Math.sin(hourAngle),meridian*Math.sin(Math.PI/3),meridian*Math.cos(Math.PI/3));
    const daylight=THREE.MathUtils.smoothstep(this.direction.y,-.12,.28);
    const twilight=1-Math.min(1,Math.abs(this.direction.y)*3.8);
    const overcast=this.#weather==='rain'?.78:this.#weather==='snow'?.60:this.#weather==='mist'?.30:0;
    this.night=1-daylight;
    const top=mix('#061526',outdoorSky.zenith,daylight).lerp(new THREE.Color('#a9b3bc'),overcast*daylight);
    const bottom=mix('#192a3c',outdoorSky.horizon,daylight).lerp(new THREE.Color('#d7b49b'),twilight*daylight*(1-overcast)*.35);
    this.#sky.material.uniforms.top!.value.copy(top);
    this.#sky.material.uniforms.bottom!.value.copy(bottom);
    this.#sky.material.uniforms.sunPower!.value=daylight*(1-overcast);
    this.#sky.position.copy(camera.position);
    this.#stars.position.copy(camera.position);
    (this.#stars.material as THREE.PointsMaterial).opacity=this.night*.75*(1-overcast);
    this.#sunDisk.position.copy(camera.position).addScaledVector(this.direction,550);
    this.#moonDisk.position.copy(camera.position).addScaledVector(this.direction,-550);
    this.#sunDisk.visible=this.direction.y>-.02;
    this.#moonDisk.visible=this.direction.y<.1;
    this.sun.color.copy(mix('#a6c4e3','#ffe5bc',daylight)).lerp(new THREE.Color('#ffc594'),twilight*.42);
    this.sun.intensity=(.18+(2.9-.18)*daylight)*(1-overcast*.88);
    const lightDirection=this.direction.clone().multiplyScalar(this.direction.y<-.08?-1:1);
    this.sun.position.copy(target).addScaledVector(lightDirection,180);
    this.sun.target.position.copy(target);
    const shadow=this.sun.shadow.camera;
    shadow.left=-shadowSpan;shadow.right=shadowSpan;shadow.top=shadowSpan;shadow.bottom=-shadowSpan;
    shadow.updateProjectionMatrix();
    this.hemisphere.color.copy(mix('#536a83','#b8d6f0',daylight)).lerp(new THREE.Color('#cbd0d3'),overcast*daylight*.65);
    this.hemisphere.groundColor.copy(mix('#242a30',outdoorSky.ground,daylight));
    // PMREM carries the outdoor ambient lighting. This weak fill keeps the
    // realtime interiors readable without the former second, bright ambient source.
    this.hemisphere.intensity=.14+daylight*(.42+.10*overcast);
    this.#scene.environmentIntensity=.055+daylight*(.71-.10*overcast);
    const fog=this.#scene.fog as THREE.Fog;
    fog.color.copy(bottom);
    const fogRange=this.#weather==='mist'?[10,210]:this.#weather==='rain'?[18,300]:this.#weather==='snow'?[14,280]:[260,1800];
    fog.near=fogRange[0]!;
    fog.far=fogRange[1]!;
    for (const material of this.#lanterns) material.emissiveIntensity=(.18+this.night*2.2)*this.#presence;
    this.#rain.position.set(camera.position.x,Math.max(0,camera.position.y-25),camera.position.z);
    this.#snow.position.copy(this.#rain.position);
    if (this.#rain.visible) {
      for(let i=0;i<this.#rainPositions.length;i+=6) {
        this.#rainPositions[i+1]-=delta*19;
        const roof=this.#shelter.height(this.#rainPositions[i]!+this.#rain.position.x,this.#rainPositions[i+2]!+this.#rain.position.z);
        if(this.#rainPositions[i+1]!<0||this.#rainPositions[i+1]!+this.#rain.position.y<roof+.8)this.#rainPositions[i+1]=60;
        this.#rainPositions[i+4]=this.#rainPositions[i+1]!-.7;
      }
      this.#rain.geometry.attributes.position!.needsUpdate=true;
    }
    if (this.#snow.visible) {
      for(let i=0;i<this.#snowPositions.length;i+=3) {
        this.#snowPositions[i+1]-=delta*.9;
        this.#snowPositions[i]+=Math.sin(this.#clock+i)*delta*.12;
        const roof=this.#shelter.height(this.#snowPositions[i]!+this.#snow.position.x,this.#snowPositions[i+2]!+this.#snow.position.z);
        if(this.#snowPositions[i+1]!<0||this.#snowPositions[i+1]!+this.#snow.position.y<roof+.12)this.#snowPositions[i+1]=45;
      }
      this.#snow.geometry.attributes.position!.needsUpdate=true;
    }
  }
}
