# Ubiquitous Language

## Course structure

| Term              | Definition                                                                                                            | Aliases to avoid                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Course**        | The primary domain entity: a structured collection of versions, sections, lessons, and videos, stored in the database | Repo (as domain entity), Project         |
| **CourseRepo**    | The local git repository on disk that backs a course, referenced by the course's `repoPath`                           | Repo (ambiguous without "Course" prefix) |
| **CourseVersion** | A named snapshot of a course's section/lesson structure at a point in time                                            | Version (too vague), Revision            |
| **Section**       | A directory-backed grouping of lessons within a course version, ordered by fractional index                           | Module, Chapter, Unit                    |
| **Lesson**        | A single learning unit within a section, corresponding to a folder on disk                                            | Exercise, Tutorial, Step                 |

## Ghost entities

| Term              | Definition                                                                                 | Aliases to avoid             |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| **Ghost Lesson**  | A lesson that exists in the database but not yet on the file system (`fsStatus = "ghost"`) | Planned lesson, Draft lesson |
| **Ghost Section** | A section that exists in the database but not yet on the file system                       | Planned section              |

## Video and clips

| Term                 | Definition                                                                                               | Aliases to avoid             |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Video**            | A container of clips and clip sections that represents a single producible video output                  | Recording                    |
| **Standalone Video** | A video with no lesson association (`lessonId = NULL`), used for reference or temporary content          | Orphan video, Unlinked video |
| **Clip**             | A timestamped segment of source footage within a video, defined by start/end times and a source filename | Segment, Cut, Take           |
| **Effect Clip**      | A special clip for non-speech content (white noise, transitions) manually inserted into the timeline     | Filler, Spacer               |
| **ClipSection**      | A named marker/divider within a video's timeline that visually groups related clips                      | Clip group, Divider, Marker  |
| **Optimistic Clip**  | A clip added to the frontend state during recording before it is persisted to the database               | Pending clip, Temporary clip |

## Recording

| Term                  | Definition                                                                                                                   | Aliases to avoid      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Recording Session** | A time-bounded window during which clips are captured via OBS, grouping optimistic clips before persistence                  | Session, Take session |
| **Insertion Point**   | The position in a video timeline where new clips or clip sections will be added (start, after-clip, after-clip-section, end) | Cursor, Drop target   |
| **Transcription**     | The process of populating a clip's `text` field from its audio, tracked by `transcribedAt`                                   | Caption, Subtitle     |

## Planning

| Term            | Definition                                                                                     | Aliases to avoid  |
| --------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| **Plan**        | An independent (non-file-backed) structured course outline, separate from the course hierarchy | Outline, Syllabus |
| **PlanSection** | A grouping within a plan                                                                       | -                 |
| **PlanLesson**  | A learning objective within a plan section                                                     | -                 |

## Ordering and lifecycle

| Term                 | Definition                                                                                                   | Aliases to avoid     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| **Fractional Index** | A string-based ordering value that allows inserting items between existing items without reindexing siblings | Sort order, Position |
| **Archive**          | Soft-deletion: hiding an entity from active views while retaining it in the database                         | Delete, Remove       |
| **ARCHIVE Section**  | A special section directory whose name ends in `ARCHIVE`, filtered out of the default course view            | -                    |

## Relationships

- A **Course** is backed by a **CourseRepo** on disk, referenced via `repoPath`
- A **Course** contains one or more **CourseVersions**
- A **CourseVersion** contains ordered **Sections**
- A **Section** contains ordered **Lessons**
- A **Lesson** contains one or more **Videos**
- A **Video** contains ordered **Clips** and **ClipSections**, interleaved in a shared ordering space
- A **Standalone Video** belongs directly to a **Course** with no **Lesson** parent
- A **Recording Session** produces multiple **Optimistic Clips** that become **Clips** on persistence
- A **Plan** is independent of the **Course** hierarchy and contains **PlanSections** with **PlanLessons**

## Example dialogue

> **Dev:** "When a user creates a new **Lesson** inside a **Section**, does it always exist on disk?"

> **Domain expert:** "No. It starts as a **Ghost Lesson** -- it's in the database with `fsStatus = 'ghost'` but there's no directory yet. The user can plan titles, ordering, and dependencies before anything hits the file system."

> **Dev:** "And when they start recording, is the **Video** created at that point?"

> **Domain expert:** "The **Video** already exists once the **Lesson** is set up. When they hit record, a **Recording Session** begins. Each captured segment becomes an **Optimistic Clip** in the UI immediately, then gets persisted as a real **Clip** with `sourceStartTime` and `sourceEndTime` from the footage file."

> **Dev:** "What about videos that aren't part of any lesson?"

> **Domain expert:** "Those are **Standalone Videos**. They sit at the **Course** level with no `lessonId`. You can later move a **Standalone Video** into a **Lesson** through the UI."

> **Dev:** "What's the difference between a **Course** and a **CourseRepo**?"

> **Domain expert:** "A **Course** is the domain entity — it lives in the database with its versions, sections, lessons, and videos. The **CourseRepo** is the actual git repository on disk that backs it. The course's `repoPath` points to the **CourseRepo**. Services that read or write the file system (like `CourseRepoParserService` or `CourseRepoWriteService`) operate on the **CourseRepo**. Services that manage the domain data (like `CourseWriteService`) operate on the **Course**."

## Flagged ambiguities

- **"Version"** -- Used both for **CourseVersion** (structural snapshots) and implicitly for content history via `previousVersionLessonId`/`previousVersionSectionId` cross-references. These serve different purposes: one is a named milestone, the other is a migration link between versions.
- **Clips and ClipSections share an ordering space** -- Both use the same `order` field with fractional indexing. The UI must treat them as a single interleaved list, not two separate collections. This is a source of complexity when inserting or reordering.
- **"Plan" vs course structure** -- A **Plan** (`plans` table) is entirely disconnected from the **Course**/Section/Lesson hierarchy. There is no enforced link between a **PlanLesson** and an actual **Lesson**. The relationship is purely semantic.
