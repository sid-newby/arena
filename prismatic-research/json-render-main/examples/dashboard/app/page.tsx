"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { Widget } from "@/components/widget";
import { Header } from "@/components/header";
import { AddWidgetCard } from "@/components/add-widget-card";
import { SortableWidget, type SavedWidget } from "@/components/sortable-widget";

function DashboardContent() {
  const [savedWidgets, setSavedWidgets] = useState<SavedWidget[]>([]);
  const [newWidgetCount, setNewWidgetCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Load saved widgets on mount
  useEffect(() => {
    async function loadWidgets() {
      try {
        const res = await fetch("/api/v1/widgets");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSavedWidgets(data.data || []);
      } catch (err) {
        console.error("Failed to load widgets:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadWidgets();
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleWidgetSaved = useCallback((_id: string) => {
    // Reload saved widgets to get the new one
    fetch("/api/v1/widgets")
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        setSavedWidgets(data.data || []);
        // Remove the new widget slot since it's now saved
        setNewWidgetCount((prev) => Math.max(0, prev - 1));
      });
  }, []);

  const handleAddWidget = useCallback(() => {
    setNewWidgetCount((prev) => prev + 1);
  }, []);

  const handleClearWidget = useCallback(async (id?: string) => {
    if (id) {
      // Delete from database
      await fetch(`/api/v1/widgets/${id}`, { method: "DELETE" });
      setSavedWidgets((prev) => prev.filter((w) => w.id !== id));
    } else {
      // Just remove the new widget slot
      setNewWidgetCount((prev) => Math.max(0, prev - 1));
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSavedWidgets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Persist the new order to the server
        fetch("/api/v1/widgets/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds: newItems.map((w) => w.id) }),
        }).catch((err) => console.error("Failed to save widget order:", err));

        return newItems;
      });
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={savedWidgets.map((w) => w.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Saved widgets */}
              {savedWidgets.map((widget) => (
                <SortableWidget
                  key={widget.id}
                  widget={widget}
                  onDeleted={() => handleClearWidget(widget.id)}
                />
              ))}

              {/* New empty widgets */}
              {Array.from({ length: newWidgetCount }).map((_, i) => (
                <Widget
                  key={`new-${i}`}
                  onSaved={handleWidgetSaved}
                  onDeleted={() => handleClearWidget()}
                />
              ))}

              {/* Add widget card */}
              <AddWidgetCard onClick={handleAddWidget} />
            </div>
          </SortableContext>
        </DndContext>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
