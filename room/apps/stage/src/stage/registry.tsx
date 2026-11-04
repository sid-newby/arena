import { defineRegistry } from '@json-render/react';
import { shadcnComponents } from '@json-render/shadcn';
import { catalog } from './catalog';
import { Stage } from './Stage';
import { Backdrop } from './components/Backdrop';
import { Text } from './components/Text';
import { Shape } from './components/Shape';
import { Caption } from './components/Caption';

export const { registry } = defineRegistry(catalog, {
  components: {
    Stage: ({ props, children }) => <Stage name={props.name}>{children}</Stage>,
    Backdrop: ({ props }) => <Backdrop {...props} />,
    Text: ({ props }) => <Text {...props} />,
    Shape: ({ props }) => <Shape {...props} />,
    Caption: ({ props }) => <Caption {...props} />,
    Card: shadcnComponents.Card,
    Heading: shadcnComponents.Heading,
    Badge: shadcnComponents.Badge,
  },
});
