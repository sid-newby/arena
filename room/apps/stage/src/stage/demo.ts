import type { Transform } from './transform';

const at = (x: number, y: number, rest: Partial<Omit<Transform, 'x' | 'y'>> = {}): Transform => ({
  x,
  y,
  w: null,
  h: null,
  rotate: null,
  opacity: null,
  z: null,
  enter: null,
  exit: null,
  ...rest,
});

/** "Rainy, 3am": the plan's reference scene, in json-render's flat spec shape. */
export const demoScene = {
  root: 'stage',
  elements: {
    stage: {
      type: 'Stage',
      props: { name: 'Rainy, 3am' },
      children: [
        'backdrop',
        'fog',
        'grain',
        'vignette',
        'moon',
        'rule',
        'title',
        'blurb',
        'label',
        'rain',
      ],
    },
    backdrop: {
      type: 'Backdrop',
      props: {
        kind: 'shader',
        shader: 'noise',
        color: null,
        stops: ['#05070d', '#13203a', '#2a1b4a'],
        angle: null,
      },
      children: [],
    },
    fog: {
      type: 'Fog',
      props: { amount: 0.3, color: '#7f93bd', speed: 0.8 },
      children: [],
    },
    grain: {
      type: 'Grain',
      props: { amount: 0.22, speed: 4 },
      children: [],
    },
    vignette: {
      type: 'Vignette',
      props: { amount: 0.75, color: '#02030a' },
      children: [],
    },
    moon: {
      type: 'Shape',
      props: {
        kind: 'circle',
        fill: '#f2a93b',
        stroke: null,
        strokeWidth: null,
        transform: at(1380, 160, { w: 200, h: 200, opacity: 0.85, enter: 'blur-in' }),
      },
      children: [],
    },
    rule: {
      type: 'Shape',
      props: {
        kind: 'line',
        fill: 'rgba(255,255,255,0.25)',
        stroke: null,
        strokeWidth: null,
        transform: at(140, 400, { w: 520, h: 2, enter: 'drift-in' }),
      },
      children: [],
    },
    title: {
      type: 'Text',
      props: {
        text: 'Prismatic\nResearch Center',
        variant: 'display',
        align: 'left',
        color: null,
        maxWidth: 1200,
        transform: at(140, 440, { z: 30, enter: 'drift-up' }),
      },
      children: [],
    },
    blurb: {
      type: 'Text',
      props: {
        text: 'A backdrop the seats paint on while they talk. This scene streams from a mock agent.',
        variant: 'body',
        align: 'left',
        color: '#9aa3b2',
        maxWidth: 760,
        transform: at(140, 760, { z: 30, enter: 'fade' }),
      },
      children: [],
    },
    label: {
      type: 'Caption',
      props: { text: 'rainy, 3am · json-render 0.21.4', style: 'label', anchor: 'bottom' },
      children: [],
    },
    rain: {
      type: 'SandboxFrame',
      props: {
        html: '<canvas id="rain" width="1920" height="1080"></canvas>',
        css: 'html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block;width:100%;height:100%}',
        js: [
          "const c=document.getElementById('rain'),x=c.getContext('2d');",
          'const drops=Array.from({length:220},()=>({x:Math.random()*1920,y:Math.random()*1080,l:12+Math.random()*18,v:14+Math.random()*10}));',
          "function tick(){x.clearRect(0,0,1920,1080);x.strokeStyle='rgba(180,200,255,0.35)';x.lineWidth=1.5;",
          'for(const d of drops){x.beginPath();x.moveTo(d.x,d.y);x.lineTo(d.x-2,d.y+d.l);x.stroke();d.y+=d.v;d.x-=0.6;if(d.y>1080){d.y=-20;d.x=Math.random()*1920;}}',
          'requestAnimationFrame(tick);}tick();',
        ].join(''),
        allow: null,
        transform: at(0, 0, { w: 1920, h: 1080, z: 95, opacity: 0.8, enter: 'fade' }),
      },
      children: [],
    },
  },
};
