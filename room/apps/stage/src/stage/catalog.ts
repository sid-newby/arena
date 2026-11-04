import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import { shadcnComponentDefinitions } from '@json-render/shadcn/catalog';
import { z } from 'zod';
import { Transform } from './transform';

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
        kind: z.enum(['solid', 'gradient']),
        color: z.string().nullable(),
        stops: z.array(z.string()).nullable(),
        angle: z.number().min(0).max(360).nullable(),
      }),
      description:
        'Full-stage background, exactly one per scene. solid uses color; gradient uses stops and angle. Example: { "kind": "gradient", "stops": ["#05070d", "#1b1030"], "angle": 160 }',
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
    Card: shadcnComponentDefinitions.Card,
    Heading: shadcnComponentDefinitions.Heading,
    Badge: shadcnComponentDefinitions.Badge,
  },
  actions: {},
});

export type StageCatalog = typeof catalog;
