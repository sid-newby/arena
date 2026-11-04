"use client";

import { Plus } from "lucide-react";

interface AddWidgetCardProps {
  onClick: () => void;
}

export function AddWidgetCard({ onClick }: AddWidgetCardProps) {
  return (
    <button
      onClick={onClick}
      className="aspect-[4/3] flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors cursor-pointer"
    >
      <Plus className="h-8 w-8 text-muted-foreground/50" />
      <span className="mt-2 text-sm text-muted-foreground/50">Add Widget</span>
    </button>
  );
}
