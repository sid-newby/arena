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

/** A hard-coded scene in json-render's flat spec shape, until the seats stream their own. */
export const demoScene = {
  root: 'stage',
  elements: {
    stage: {
      type: 'Stage',
      props: { name: 'Rainy, 3am' },
      children: ['backdrop', 'moon', 'rule', 'title', 'blurb', 'label'],
    },
    backdrop: {
      type: 'Backdrop',
      props: {
        kind: 'gradient',
        color: null,
        stops: ['#05070d', '#0f1a2b', '#1b1030'],
        angle: 160,
      },
      children: [],
    },
    moon: {
      type: 'Shape',
      props: {
        kind: 'circle',
        fill: '#f2a93b',
        stroke: null,
        strokeWidth: null,
        transform: at(1380, 160, { w: 200, h: 200, opacity: 0.9, enter: 'blur-in' }),
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
        text: 'A backdrop the seats paint on while they talk. This scene is hard-coded; nothing is streaming yet.',
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
      props: { text: 'demo scene · json-render 0.21.4', style: 'label', anchor: 'bottom' },
      children: [],
    },
  },
};
