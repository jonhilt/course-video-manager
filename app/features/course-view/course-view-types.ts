import type { Route } from "../../routes/+types/_index";

export type LoaderData = Route.ComponentProps["loaderData"];
export type Section = NonNullable<
  LoaderData["selectedCourse"]
>["sections"][number];
export type Lesson = Section["lessons"][number];
export type Video = Lesson["videos"][number];

/**
 * Returns a stable dnd-kit item ID for a lesson.
 *
 * `editorSectionsToLoaderSections` adds `frontendId` at runtime but casts the
 * result to `Section[]`, so TypeScript doesn't know about it.  This helper
 * centralises the cast so components don't repeat `as unknown as …` inline.
 *
 * When `frontendId` is present it stays constant even after the optimistic
 * lesson receives a database ID, keeping dnd-kit's drag tracking stable.
 */
export function getLessonDndId(lesson: Lesson): string {
  return (lesson as unknown as { frontendId?: string }).frontendId ?? lesson.id;
}
