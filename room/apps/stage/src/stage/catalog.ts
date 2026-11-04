import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { shadcnComponentDefinitions } from '@json-render/shadcn/catalog';
import { z } from 'zod';
import { Transform } from './transform';
import { shaderPresets } from './shaders';
import { sandboxAllow } from './sandbox';

export const textVariants = ['display', 'title', 'body', 'caption', 'mono'] as const;

export const catalog = defineCatalog(schema, {
  components: {
    Stage: {
      props: z.object({ name: z.string().nullable() }),
      slots: ['default'],
      description:
        'The root. A 1920x1080 space scaled to fit the window. Put exactly one Backdrop and any number of positioned nodes inside it.',
    },
    Backdrop: {
      props: z.object({
        kind: z.enum(['solid', 'gradient', 'shader']),
        color: z.string().nullable(),
        stops: z.array(z.string()).nullable(),
        angle: z.number().min(0).max(360).nullable(),
        shader: z.enum(shaderPresets).nullable(),
      }),
      description:
        'Full-stage background, exactly one per scene. solid uses color; gradient uses stops and angle; shader animates a preset (noise, aurora, scanlines, plasma) tinted by up to three hex stops. Example: { "kind": "shader", "shader": "noise", "stops": ["#05070d", "#1b2a44", "#f2a93b"] }',
    },
    Text: {
      props: z.object({
        text: z.string(),
        variant: z.enum(textVariants),
        align: z.enum(['left', 'center', 'right']).nullable(),
        color: z.string().nullable(),
        maxWidth: z.number().min(1).max(1920).nullable(),
        transform: Transform,
      }),
      description:
        'Positioned text on a typographic scale. display is huge, title is large, body reads, caption is small, mono is code. Example: { "text": "3am", "variant": "display", "transform": { "x": 140, "y": 420 } }',
    },
    Shape: {
      props: z.object({
        kind: z.enum(['rect', 'circle', 'line']),
        fill: z.string().nullable(),
        stroke: z.string().nullable(),
        strokeWidth: z.number().min(0).max(64).nullable(),
        transform: Transform,
      }),
      description:
        'A positioned rect, circle or line. A line is a rect with h as its thickness. Example: { "kind": "circle", "fill": "#f2a93b", "transform": { "x": 1380, "y": 180, "w": 180, "h": 180 } }',
    },
    Caption: {
      props: z.object({
        text: z.string(),
        style: z.enum(['subtitle', 'speech', 'label']).nullable(),
        anchor: z.enum(['top', 'bottom']).nullable(),
      }),
      description:
        'Full-width caption pinned to the top or bottom edge, above everything. Example: { "text": "Scene one", "style": "label", "anchor": "bottom" }',
    },
    Grain: {
      props: z.object({
        amount: z.number().min(0).max(1).nullable(),
        speed: z.number().min(0.5).max(12).nullable(),
      }),
      description:
        'Full-stage film grain in the ambient band. amount is opacity, speed is flickers per second. Example: { "amount": 0.25, "speed": 4 }',
    },
    Vignette: {
      props: z.object({
        amount: z.number().min(0).max(1).nullable(),
        color: z.string().nullable(),
      }),
      description:
        'Full-stage edge darkening in the ambient band. Example: { "amount": 0.7, "color": "#000" }',
    },
    Fog: {
      props: z.object({
        amount: z.number().min(0).max(1).nullable(),
        color: z.string().nullable(),
        speed: z.number().min(0.25).max(4).nullable(),
      }),
      description:
        'Two soft drifting banks of haze in the ambient band. amount is density, speed scales the drift. Example: { "amount": 0.35, "color": "#8fa3c7", "speed": 1 }',
    },
    SandboxFrame: {
      props: z.object({
        html: z.string(),
        css: z.string().nullable(),
        js: z.string().nullable(),
        allow: z.array(z.enum(sandboxAllow)).nullable(),
        transform: Transform,
      }),
      description:
        'The escape hatch: your own HTML, CSS and JS in a positioned iframe with sandbox="allow-scripts" only. No origin, no fetch, no parent access; inline code and https CDNs run. A whole HyperFrames composition drops in as html. Lives in the overlay band (z 90+). Example: { "html": "<canvas id=\\"c\\"></canvas>", "js": "/* draw on #c */", "css": null, "allow": null, "transform": { "x": 0, "y": 0, "w": 1920, "h": 1080 } }',
    },
    Card: shadcnComponentDefinitions.Card,
    Heading: shadcnComponentDefinitions.Heading,
    Badge: shadcnComponentDefinitions.Badge,
  },
  actions: {},
});

export type StageCatalog = typeof catalog;
