/**
 * CourseEditorService Handler
 *
 * Processes CourseEditorEvents by delegating to CourseWriteService.
 * Also provides the direct transport factory for testing.
 */

import { Effect } from "effect";
import { CourseWriteService } from "./course-write-service";
import { toSlug } from "./lesson-path-service";
import {
  createCourseEditorService,
  type CourseEditorEvent,
  type CourseEditorService,
} from "./course-editor-service";

// ============================================================================
// Handler
// ============================================================================

export const handleCourseEditorEvent = Effect.fn("handleCourseEditorEvent")(
  function* (event: CourseEditorEvent) {
    const service = yield* CourseWriteService;

    switch (event.type) {
      case "create-section": {
        return yield* service.addGhostSection(
          event.repoVersionId,
          event.title,
          event.maxOrder
        );
      }

      case "update-section-name": {
        const newSlug = toSlug(event.title.trim()) || "untitled";
        return yield* service.renameSection(event.sectionId, newSlug);
      }

      case "delete-section": {
        return yield* service.deleteSection(event.sectionId);
      }

      case "reorder-sections": {
        return yield* service.reorderSections(event.sectionIds);
      }

      default: {
        const _exhaustive: never = event;
        throw new Error(`Unknown event type: ${(_exhaustive as any).type}`);
      }
    }
  }
);

// ============================================================================
// Direct Transport Factory (for tests)
// ============================================================================

export function createDirectCourseEditorService(
  runtimePromise: (effect: Effect.Effect<any, any, any>) => Promise<any>
): CourseEditorService {
  const send = (event: CourseEditorEvent): Promise<unknown> => {
    return runtimePromise(handleCourseEditorEvent(event));
  };

  return createCourseEditorService(send);
}
