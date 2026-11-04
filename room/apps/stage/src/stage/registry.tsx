import { defineRegistry } from '@json-render/react';
import { shadcnComponents } from '@json-render/shadcn';
import { catalog } from './catalog';
import { Stage } from './Stage';
import { Backdrop } from './components/Backdrop';
import { Text } from './components/Text';
import { Shape } from './components/Shape';
import { Caption } from './components/Caption';
import { Grain } from './components/Grain';
import { Vignette } from './components/Vignette';
import { Fog } from './components/Fog';
import { SandboxFrame } from './components/SandboxFrame';

export const { registry } = defineRegistry(catalog, {
  components: {
    Stage: ({ props, children }) => <Stage name={props.name}>{children}</Stage>,
    Backdrop: ({ props }) => <Backdrop {...props} />,
    Text: ({ props }) => <Text {...props} />,
    Shape: ({ props }) => <Shape {...props} />,
    Caption: ({ props }) => <Caption {...props} />,
    Grain: ({ props }) => <Grain {...props} />,
    Vignette: ({ props }) => <Vignette {...props} />,
    Fog: ({ props }) => <Fog {...props} />,
    SandboxFrame: ({ props }) => <SandboxFrame {...props} />,
    Card: shadcnComponents.Card,
    Heading: shadcnComponents.Heading,
    Badge: shadcnComponents.Badge,
  },
});
