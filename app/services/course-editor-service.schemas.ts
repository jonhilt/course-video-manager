/**
 * Schema definitions for CourseEditorService RPC events.
 * Used by the route handler to validate incoming requests.
 */

import { Schema } from "effect";

export const CourseEditorEventSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("create-section"),
    repoVersionId: Schema.String.pipe(Schema.minLength(1)),
    title: Schema.String.pipe(Schema.minLength(1)),
    maxOrder: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("update-section-name"),
    sectionId: Schema.String.pipe(Schema.minLength(1)),
    title: Schema.String.pipe(Schema.minLength(1)),
  }),
  Schema.Struct({
    type: Schema.Literal("delete-section"),
    sectionId: Schema.String.pipe(Schema.minLength(1)),
  }),
  Schema.Struct({
    type: Schema.Literal("reorder-sections"),
    sectionIds: Schema.Array(Schema.String.pipe(Schema.minLength(1))),
  })
);
