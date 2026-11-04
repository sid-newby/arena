"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Spec } from "@json-render/react";
import { Widget } from "./widget";

export interface SavedWidget {
  id: string;
  prompt: string;
  spec: Spec;
}

interface SortableWidgetProps {
  widget: SavedWidget;
  onDeleted: () => void;
}

export function SortableWidget({ widget, onDeleted }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Widget
        id={widget.id}
        initialPrompt={widget.prompt}
        initialSpec={widget.spec}
        onDeleted={onDeleted}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
