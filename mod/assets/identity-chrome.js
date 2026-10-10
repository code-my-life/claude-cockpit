(function (root) {
  'use strict';

  // Famille chrome : le rendu WebGL (sphères métalliques fondues autour d'un anneau), séparé d'identity.js.
  // Chargé après identity.js, dont il utilise chromeAnglesOf pour que la vue et la pose de face concordent.
  const VIRTUAL = 100;
  const CHROME_BLEED = 6;
  const GL_SIZE = 112;

  const CHROME_FRAGMENT = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'uniform vec2 uRes;uniform mat3 uM;uniform vec3 uS[6];uniform float uSr[6];uniform float uT;uniform float uBob;uniform vec3 uRing;',
    'float smin(float a,float b,float k){float h=max(k-abs(a-b),0.0)/k;return min(a,b)-h*h*k*0.25;}',
    'float ringD(vec3 l){vec3 q=vec3(l.x/uRing.z,l.y,l.z);float r=length(q.xz)-uRing.x;return (length(vec2(r,q.y))-uRing.y)*min(1.0,uRing.z);}',
    'float map(vec3 p){vec3 l=uM*p;float d=ringD(l);',
    ' for(int i=0;i<6;i++){float s=length(l-uS[i])-uSr[i];if(i<3){d=smin(d,s,0.14);}else{d=min(d,s);}}return d;}',
    'float bx(float x,float a,float b,float s){return smoothstep(a-s,a+s,x)*(1.0-smoothstep(b-s,b+s,x));}',
    'float room(vec3 d){float L;if(d.y>=0.0){float e=d.y/0.025;L=0.04+0.85*pow(smoothstep(0.0,1.0,d.y),1.4)+0.7*exp(-e*e);',
    ' float az=atan(d.z,d.x)-uT*0.12;L+=1.9*bx(az,0.3,1.2,0.07)*bx(d.y,0.22,0.85,0.1);L+=1.1*bx(az,-2.35,-2.1,0.04)*bx(d.y,0.05,1.0,0.1);',
    ' L+=0.9*bx(az,2.4,2.62,0.05)*bx(d.y,0.1,0.8,0.1);}else{L=0.1+0.62*smoothstep(0.0,0.7,-d.y);}return L;}',
    'void main(){vec2 fc=gl_FragCoord.xy;float u=fc.x/uRes.x*2.0-1.0;float v=(fc.y/uRes.y*2.0-1.0)*uRes.y/uRes.x;',
    ' vec3 rd=normalize(vec3(u*0.36,v*0.36,1.0));vec3 ro=vec3(0.0,-uBob,-5.0);',
    ' float b=dot(ro,rd);float cc=dot(ro,ro)-6.25;float disc=b*b-cc;',
    ' vec4 col=vec4(0.0);',
    ' if(disc>0.0){float t=-b-sqrt(disc);bool hit=false;vec3 p=ro;',
    '  for(int i=0;i<72;i++){p=ro+rd*t;float d=map(p);if(d<0.0015){hit=true;break;}t+=d*0.85;if(t>8.0)break;}',
    '  if(hit){float e=0.0015;vec3 n=normalize(vec3(1.,-1.,-1.)*map(p+vec3(e,-e,-e))+vec3(-1.,-1.,1.)*map(p+vec3(-e,-e,e))+vec3(-1.,1.,-1.)*map(p+vec3(-e,e,-e))+vec3(1.,1.,1.)*map(p+vec3(e,e,e)));',
    '   float dt=dot(rd,n);vec3 r=rd-2.0*dt*n;float L=room(r)*0.94;float fr=pow(1.0-abs(dt),4.0);L=clamp(L*(1.0-0.3*fr),0.0,1.0);',
    '   col=vec4(vec3(L*0.98,L*0.99,L*1.02),1.0);}}',
    ' gl_FragColor=col;}',
  ].join('\n');

  const multiplyMatrices = (left, right) => {
    const product = new Array(9);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        product[row * 3 + column] = left[row * 3] * right[column] + left[row * 3 + 1] * right[3 + column] + left[row * 3 + 2] * right[6 + column];
      }
    }
    return product;
  };

  const compileShader = (gl, type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };

  let chromeGl;

  const createChromeGl = () => {
    const canvas = root.document.createElement('canvas');
    canvas.width = GL_SIZE;
    canvas.height = GL_SIZE;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}');
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, CHROME_FRAGMENT);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniform = name => gl.getUniformLocation(program, name);
    gl.viewport(0, 0, GL_SIZE, GL_SIZE);
    gl.uniform2f(uniform('uRes'), GL_SIZE, GL_SIZE);
    const locations = { matrix: uniform('uM'), spheres: uniform('uS[0]'), radii: uniform('uSr[0]'), time: uniform('uT'), bob: uniform('uBob'), ring: uniform('uRing') };
    return { canvas, gl, locations, spheres: new Float32Array(18), radii: new Float32Array(6) };
  };

  const chromeOf = () => {
    if (chromeGl === undefined) chromeGl = createChromeGl();
    return chromeGl;
  };

  const fraction = value => value - Math.floor(value);

  const renderChrome = (identity, phase, pose) => {
    const shared = chromeOf();
    if (!shared || shared.gl.isContextLost()) return null;
    const { gl, locations, spheres, radii } = shared;
    const { ringRadius, thickness, stretch, roll, dropCount, dropSize, dropSeed } = identity.params;
    const t = phase * 0.9;
    const angles = root.CockpitIdentity.chromeAnglesOf(identity.params, phase);
    const ax = angles.tilt + pose.tilt;
    const ay = angles.yaw + pose.yaw;
    const az = roll + 0.2 * Math.sin(t * 0.21);
    const turnX = [1, 0, 0, 0, Math.cos(ax), -Math.sin(ax), 0, Math.sin(ax), Math.cos(ax)];
    const turnY = [Math.cos(ay), 0, Math.sin(ay), 0, 1, 0, -Math.sin(ay), 0, Math.cos(ay)];
    const turnZ = [Math.cos(az), -Math.sin(az), 0, Math.sin(az), Math.cos(az), 0, 0, 0, 1];
    const turnXY = multiplyMatrices(turnX, turnY);
    const matrix = multiplyMatrices(turnZ, turnXY);
    gl.uniformMatrix3fv(locations.matrix, false, new Float32Array(matrix));
    const scale = ringRadius / 1.05;
    const shift = dropSeed * Math.PI * 2;
    const baseAngles = [0.85, 3.55, 5.3];
    const baseHeights = [0.02, -0.04, 0.06];
    const baseRadii = [0.44, 0.4, 0.34, 0.3, 0.17, 0.1];
    const centres = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [(0.05 + 0.25 * Math.sin(t * 0.7)) * scale, 0.12 + 0.15 * Math.sin(t * 0.9), (0.05 + 0.25 * Math.cos(t * 0.6)) * scale],
      [(0.15 + 0.45 * Math.sin(t * 0.5)) * scale, 1.02 + 0.15 * Math.sin(t * 0.8), (0.3 + 0.35 * Math.cos(t * 0.5)) * scale],
      [(-0.72 + 0.15 * Math.sin(t * 0.6)) * scale, -0.95 + 0.1 * Math.cos(t * 0.7), (0.2 + 0.2 * Math.sin(t * 0.4)) * scale],
    ];
    for (let index = 0; index < 3; index++) {
      const angle = baseAngles[index] + shift + t * (0.28 + 0.09 * index);
      centres[index] = [ringRadius * stretch * Math.cos(angle), baseHeights[index] + 0.05 * Math.sin(t + index), ringRadius * Math.sin(angle)];
    }
    for (let index = 0; index < 6; index++) {
      const isActive = index < dropCount;
      const variation = 0.7 + 0.6 * fraction(Math.sin((index + 1) * 12.9898 + dropSeed * 78.233) * 43758.5453);
      const breathing = 1 + 0.15 * Math.sin(t * 0.9 + index * 2.1);
      const centre = isActive ? centres[index] : [0, 0, 9];
      spheres[index * 3] = centre[0];
      spheres[index * 3 + 1] = centre[1];
      spheres[index * 3 + 2] = centre[2];
      radii[index] = isActive ? baseRadii[index] * (dropSize / 0.35) * variation * breathing : 0.001;
    }
    gl.uniform3fv(locations.spheres, spheres);
    gl.uniform1fv(locations.radii, radii);
    gl.uniform1f(locations.time, t);
    gl.uniform1f(locations.bob, 0.07 * Math.sin(t * 0.8));
    gl.uniform3f(locations.ring, ringRadius, thickness, stretch);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return shared.canvas;
  };

  // Le rendu WebGL est opaque à l'encre : un voile sur les pixels dessinés l'assombrit, un effacement l'allège.
  const tintInk = (context, inkBias) => {
    if (inkBias === 0) return;
    context.save();
    context.globalCompositeOperation = inkBias > 0 ? 'source-atop' : 'destination-out';
    context.globalAlpha = Math.min(1, Math.abs(inkBias));
    context.fillStyle = root.CockpitIdentity.INK;
    context.fillRect(0, 0, VIRTUAL, VIRTUAL);
    context.restore();
  };

  const drawChrome = (context, identity, phase, pose, inkBias) => {
    const source = renderChrome(identity, phase, pose);
    if (source === null) return;
    context.imageSmoothingEnabled = true;
    context.drawImage(source, -CHROME_BLEED, -CHROME_BLEED, VIRTUAL + 2 * CHROME_BLEED, VIRTUAL + 2 * CHROME_BLEED);
    tintInk(context, inkBias);
  };


  root.CockpitIdentityChrome = { draw: drawChrome };
})(typeof window !== 'undefined' ? window : globalThis);
