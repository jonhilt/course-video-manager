import { describe, expect, it, vi } from "vitest";
import { createLessonDragHandler } from "./course-editor-helpers";
import type { courseEditorReducer } from "@/features/course-editor/course-editor-reducer";
import type { DragEndEvent } from "@dnd-kit/core";

// Helper to create a fake DragEndEvent
function makeDragEndEvent(activeId: string, overId: string): DragEndEvent {
  return {
    active: {
      id: activeId,
      data: { current: undefined },
      rect: { current: { initial: null, translated: null } },
    },
    over: {
      id: overId,
      data: { current: undefined },
      rect: { left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 },
    },
    activatorEvent: {} as Event,
    collisions: null,
    delta: { x: 0, y: 0 },
  } as unknown as DragEndEvent;
}

describe("createLessonDragHandler", () => {
  it("reorders when active/over IDs are databaseIds (pre-existing lessons)", () => {
    const dispatch = vi.fn();
    const handler = createLessonDragHandler(dispatch);

    const lessons = [
      { id: "db-1", frontendId: "db-1", path: "first", title: "First" },
      { id: "db-2", frontendId: "db-2", path: "second", title: "Second" },
      { id: "db-3", frontendId: "db-3", path: "third", title: "Third" },
    ];

    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("db-1", "db-3"));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "reorder-lessons",
        sectionFrontendId: "section-1",
      })
    );
  });

  it("reorders when active/over IDs are frontendIds (reconciled optimistic lessons)", () => {
    // This is the bug scenario:
    // - lesson was created optimistically: frontendId = "fe-1", databaseId = null
    // - dnd-kit assigned drag ID = "fe-1" (via getLessonDndId)
    // - lesson-created fires: databaseId = "db-1"
    // - editorSectionsToLoaderSections now exposes lesson.id = "db-1"
    // - but dnd-kit still tracks drag with active.id = "fe-1" (frontendId)
    // - createLessonDragHandler must still find the lesson
    const dispatch = vi.fn();
    const handler = createLessonDragHandler(dispatch);

    // lessons array as produced by editorSectionsToLoaderSections after reconciliation:
    // id = databaseId, frontendId = original frontendId
    const lessons = [
      { id: "db-1", frontendId: "fe-1", path: "first", title: "First" },
      { id: "db-2", frontendId: "fe-2", path: "second", title: "Second" },
      { id: "db-3", frontendId: "fe-3", path: "third", title: "Third" },
    ];

    // DND active/over IDs are frontendIds (since getLessonDndId returns frontendId)
    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("fe-1", "fe-3"));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "reorder-lessons",
        sectionFrontendId: "section-1",
      })
    );
  });

  it("dispatches correct new lesson order when using frontendIds as drag IDs", () => {
    const dispatch = vi.fn();
    const handler = createLessonDragHandler(dispatch);

    const lessons = [
      { id: "db-1", frontendId: "fe-1", path: "first", title: "First" },
      { id: "db-2", frontendId: "fe-2", path: "second", title: "Second" },
      { id: "db-3", frontendId: "fe-3", path: "third", title: "Third" },
    ];

    // Drag "fe-1" to position of "fe-3" → results in [second, third, first]
    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("fe-1", "fe-3"));

    const action = dispatch.mock.calls[0]![0] as courseEditorReducer.Action & {
      type: "reorder-lessons";
      lessonFrontendIds: string[];
    };
    expect(action.type).toBe("reorder-lessons");
    // second, third, first (db IDs since l.id = databaseId)
    expect(action.lessonFrontendIds).toEqual(["db-2", "db-3", "db-1"]);
  });

  it("returns without dispatching when active and over are the same", () => {
    const dispatch = vi.fn();
    const handler = createLessonDragHandler(dispatch);
    const lessons = [
      { id: "db-1", frontendId: "fe-1", path: "first", title: "First" },
    ];

    const dragEnd = handler("section-1", lessons);
    dragEnd(makeDragEndEvent("fe-1", "fe-1"));

    expect(dispatch).not.toHaveBeenCalled();
  });
});
