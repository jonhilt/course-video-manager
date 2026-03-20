/**
 * CourseEditorService
 *
 * Single RPC-style service for all course editor mutations, following the
 * ClipService pattern. Discriminated union events, transport abstraction,
 * HTTP transport for production, direct transport for tests.
 *
 * Phase 1: Section events only (create, update-name, delete, reorder).
 */

// ============================================================================
// Event Types
// ============================================================================

export type CourseEditorEvent =
  | {
      type: "create-section";
      repoVersionId: string;
      title: string;
      maxOrder: number;
    }
  | {
      type: "update-section-name";
      sectionId: string;
      title: string;
    }
  | {
      type: "delete-section";
      sectionId: string;
    }
  | {
      type: "reorder-sections";
      sectionIds: string[];
    };

// ============================================================================
// Transport Type
// ============================================================================

export type CourseEditorTransport = (
  event: CourseEditorEvent
) => Promise<unknown>;

// ============================================================================
// Service Interface
// ============================================================================

export interface CourseEditorService {
  createSection(
    repoVersionId: string,
    title: string,
    maxOrder: number
  ): Promise<{ success: true; sectionId: string }>;

  updateSectionName(sectionId: string, title: string): Promise<unknown>;

  deleteSection(sectionId: string): Promise<{ success: true }>;

  reorderSections(sectionIds: string[]): Promise<{ success: true }>;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCourseEditorService(
  send: CourseEditorTransport
): CourseEditorService {
  return {
    async createSection(repoVersionId, title, maxOrder) {
      return send({
        type: "create-section",
        repoVersionId,
        title,
        maxOrder,
      }) as Promise<{ success: true; sectionId: string }>;
    },

    async updateSectionName(sectionId, title) {
      return send({
        type: "update-section-name",
        sectionId,
        title,
      });
    },

    async deleteSection(sectionId) {
      return send({
        type: "delete-section",
        sectionId,
      }) as Promise<{ success: true }>;
    },

    async reorderSections(sectionIds) {
      return send({
        type: "reorder-sections",
        sectionIds,
      }) as Promise<{ success: true }>;
    },
  };
}

// ============================================================================
// HTTP Transport Factory (for frontend)
// ============================================================================

export function createHttpCourseEditorService(): CourseEditorService {
  const send = async (event: CourseEditorEvent): Promise<unknown> => {
    const response = await fetch("/api/course-editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `CourseEditorService request failed: ${response.status} ${text}`
      );
    }

    return response.json();
  };

  return createCourseEditorService(send);
}
