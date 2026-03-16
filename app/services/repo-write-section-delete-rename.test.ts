import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import { NodeContext } from "@effect/platform-node";
import { CourseRepoWriteService } from "./course-repo-write-service";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

let tempDir: string;

const setupTempGitRepo = () => {
  tempDir = fs.mkdtempSync(path.join(tmpdir(), "repo-write-test-"));
  execSync("git init", { cwd: tempDir });
  execSync('git config user.email "test@test.com"', { cwd: tempDir });
  execSync('git config user.name "Test"', { cwd: tempDir });

  // Create initial commit so git is in a working state
  fs.writeFileSync(path.join(tempDir, ".gitkeep"), "");
  execSync("git add . && git commit -m 'init'", { cwd: tempDir });
};

const runEffect = <A, E>(effect: Effect.Effect<A, E, CourseRepoWriteService>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(CourseRepoWriteService.Default),
      Effect.provide(NodeContext.layer)
    )
  );

describe("renameSections (batch)", () => {
  beforeEach(() => {
    setupTempGitRepo();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createAndCommitSections = (sectionNames: string[]) => {
    for (const name of sectionNames) {
      const sectionDir = path.join(tempDir, name);
      const lessonDir = path.join(sectionDir, "01.01-example", "explainer");
      fs.mkdirSync(lessonDir, { recursive: true });
      fs.writeFileSync(path.join(lessonDir, "readme.md"), `# ${name}\n`);
    }
    execSync("git add . && git commit -m 'add sections'", { cwd: tempDir });
  };

  it("swaps two sections without path collision", async () => {
    createAndCommitSections(["01-intro", "02-advanced"]);

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameSections({
          repoPath: tempDir,
          renames: [
            { oldPath: "01-intro", newPath: "02-intro" },
            { oldPath: "02-advanced", newPath: "01-advanced" },
          ],
        });
      })
    );

    expect(fs.existsSync(path.join(tempDir, "01-advanced"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "02-intro"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "01-intro"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "02-advanced"))).toBe(false);
  });

  it("handles empty renames array (no-op)", async () => {
    createAndCommitSections(["01-intro"]);

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameSections({
          repoPath: tempDir,
          renames: [],
        });
      })
    );

    expect(fs.existsSync(path.join(tempDir, "01-intro"))).toBe(true);
  });

  it("renames are staged in git", async () => {
    createAndCommitSections(["01-intro", "02-advanced"]);

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameSections({
          repoPath: tempDir,
          renames: [
            { oldPath: "01-intro", newPath: "02-intro" },
            { oldPath: "02-advanced", newPath: "01-advanced" },
          ],
        });
      })
    );

    const status = execSync("git status --porcelain", { cwd: tempDir })
      .toString()
      .trim();
    expect(status).toContain("01-advanced");
    expect(status).toContain("02-intro");
  });

  it("preserves lesson contents through section rename", async () => {
    createAndCommitSections(["01-intro", "02-advanced"]);

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameSections({
          repoPath: tempDir,
          renames: [
            { oldPath: "01-intro", newPath: "02-intro" },
            { oldPath: "02-advanced", newPath: "01-advanced" },
          ],
        });
      })
    );

    // Lessons should have moved with their section
    expect(
      fs.existsSync(
        path.join(
          tempDir,
          "01-advanced",
          "01.01-example",
          "explainer",
          "readme.md"
        )
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          tempDir,
          "02-intro",
          "01.01-example",
          "explainer",
          "readme.md"
        )
      )
    ).toBe(true);
  });

  it("no temporary directories remain after rename", async () => {
    createAndCommitSections(["01-intro", "02-advanced"]);

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameSections({
          repoPath: tempDir,
          renames: [
            { oldPath: "01-intro", newPath: "02-intro" },
            { oldPath: "02-advanced", newPath: "01-advanced" },
          ],
        });
      })
    );

    const entries = fs.readdirSync(tempDir);
    const tempEntries = entries.filter((e) =>
      e.startsWith("__section_reorder_tmp_")
    );
    expect(tempEntries).toHaveLength(0);
  });

  it("cleans up leftover temp dirs from a previous failed rename", async () => {
    createAndCommitSections(["01-intro", "02-advanced"]);

    // Simulate leftover temp dirs from a previous crash
    const leftoverDir = path.join(
      tempDir,
      "__section_reorder_tmp_0_03-leftover"
    );
    fs.mkdirSync(path.join(leftoverDir, "01.01-example", "explainer"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(leftoverDir, "01.01-example", "explainer", "readme.md"),
      "# Leftover\n"
    );
    execSync("git add . && git commit -m 'leftover'", { cwd: tempDir });

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameSections({
          repoPath: tempDir,
          renames: [
            { oldPath: "01-intro", newPath: "02-intro" },
            { oldPath: "02-advanced", newPath: "01-advanced" },
          ],
        });
      })
    );

    const entries = fs.readdirSync(tempDir);
    const tempEntries = entries.filter((e) =>
      e.startsWith("__section_reorder_tmp_")
    );
    expect(tempEntries).toHaveLength(0);
    expect(fs.existsSync(path.join(tempDir, "01-advanced"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "02-intro"))).toBe(true);
  });

  it("does not leave temp dirs when pass 1 fails partway through", async () => {
    createAndCommitSections(["01-intro"]);

    const result = runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameSections({
          repoPath: tempDir,
          renames: [
            { oldPath: "01-intro", newPath: "02-intro" },
            { oldPath: "99-nonexistent", newPath: "01-nonexistent" },
          ],
        });
      })
    );

    await expect(result).rejects.toThrow();

    const entries = fs.readdirSync(tempDir);
    const tempEntries = entries.filter((e) =>
      e.startsWith("__section_reorder_tmp_")
    );
    expect(tempEntries).toHaveLength(0);
    // Original should be restored
    expect(fs.existsSync(path.join(tempDir, "01-intro"))).toBe(true);
  });

  it("handles three-way rotation", async () => {
    createAndCommitSections(["01-intro", "02-basics", "03-advanced"]);

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameSections({
          repoPath: tempDir,
          renames: [
            { oldPath: "01-intro", newPath: "03-intro" },
            { oldPath: "02-basics", newPath: "01-basics" },
            { oldPath: "03-advanced", newPath: "02-advanced" },
          ],
        });
      })
    );

    expect(fs.existsSync(path.join(tempDir, "01-basics"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "02-advanced"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "03-intro"))).toBe(true);
  });
});

describe("deleteLesson", () => {
  beforeEach(() => {
    setupTempGitRepo();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("removes an untracked lesson directory from disk", async () => {
    const sectionDir = path.join(tempDir, "01-intro");

    // Add a lesson (creates untracked directory)
    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.addLesson({
          repoPath: tempDir,
          sectionPath: "01-intro",
          sectionNumber: 1,
          slug: "my-lesson",
        });
      })
    );

    expect(fs.existsSync(path.join(sectionDir, "01.01-my-lesson"))).toBe(true);

    // Delete it
    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.deleteLesson({
          repoPath: tempDir,
          sectionPath: "01-intro",
          lessonDirName: "01.01-my-lesson",
        });
      })
    );

    expect(fs.existsSync(path.join(sectionDir, "01.01-my-lesson"))).toBe(false);
  });

  it("removes a committed lesson directory and stages deletion in git", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    const lessonDir = path.join(sectionDir, "01.01-committed", "explainer");
    fs.mkdirSync(lessonDir, { recursive: true });
    fs.writeFileSync(path.join(lessonDir, "readme.md"), "# Committed\n");
    execSync("git add . && git commit -m 'add lesson'", { cwd: tempDir });

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.deleteLesson({
          repoPath: tempDir,
          sectionPath: "01-intro",
          lessonDirName: "01.01-committed",
        });
      })
    );

    expect(fs.existsSync(path.join(sectionDir, "01.01-committed"))).toBe(false);

    // Deletion should be staged in git
    const status = execSync("git status --porcelain", { cwd: tempDir })
      .toString()
      .trim();
    expect(status).toContain("D");
    expect(status).toContain("01.01-committed");
  });

  it("removes a lesson with unstaged changes", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    const lessonDir = path.join(sectionDir, "01.01-modified", "explainer");
    fs.mkdirSync(lessonDir, { recursive: true });
    fs.writeFileSync(path.join(lessonDir, "readme.md"), "# Original\n");
    execSync("git add . && git commit -m 'add lesson'", { cwd: tempDir });

    // Modify file (unstaged change)
    fs.writeFileSync(path.join(lessonDir, "readme.md"), "# Modified\n");

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.deleteLesson({
          repoPath: tempDir,
          sectionPath: "01-intro",
          lessonDirName: "01.01-modified",
        });
      })
    );

    expect(fs.existsSync(path.join(sectionDir, "01.01-modified"))).toBe(false);
  });

  it("is a no-op when lesson directory does not exist", async () => {
    // Should not throw
    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.deleteLesson({
          repoPath: tempDir,
          sectionPath: "01-intro",
          lessonDirName: "01.99-nonexistent",
        });
      })
    );
  });
});

describe("renameLesson", () => {
  beforeEach(() => {
    setupTempGitRepo();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createAndCommitLesson = (sectionDir: string, lessonDirName: string) => {
    const lessonDir = path.join(sectionDir, lessonDirName, "explainer");
    fs.mkdirSync(lessonDir, { recursive: true });
    fs.writeFileSync(path.join(lessonDir, "readme.md"), "# Test\n");
    execSync("git add . && git commit -m 'add lesson'", { cwd: tempDir });
  };

  it("renames lesson directory via git mv, preserving lesson number", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLesson(sectionDir, "01.03-old-name");

    const result = await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        return yield* service.renameLesson({
          repoPath: tempDir,
          sectionPath: "01-intro",
          oldLessonDirName: "01.03-old-name",
          newSlug: "new-name",
        });
      })
    );

    expect(result.newLessonDirName).toBe("01.03-new-name");
    expect(
      fs.existsSync(
        path.join(sectionDir, "01.03-new-name", "explainer", "readme.md")
      )
    ).toBe(true);
    expect(fs.existsSync(path.join(sectionDir, "01.03-old-name"))).toBe(false);
  });

  it("rename is staged in git", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLesson(sectionDir, "01.01-original");

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLesson({
          repoPath: tempDir,
          sectionPath: "01-intro",
          oldLessonDirName: "01.01-original",
          newSlug: "renamed",
        });
      })
    );

    const status = execSync("git status --porcelain", { cwd: tempDir })
      .toString()
      .trim();
    // git mv produces rename entries in the staging area
    expect(status).toContain("01.01-renamed");
  });

  it("returns same name when slug is unchanged (no-op)", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLesson(sectionDir, "01.02-keep-this");

    const result = await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        return yield* service.renameLesson({
          repoPath: tempDir,
          sectionPath: "01-intro",
          oldLessonDirName: "01.02-keep-this",
          newSlug: "keep-this",
        });
      })
    );

    expect(result.newLessonDirName).toBe("01.02-keep-this");
    // Directory should still exist unchanged
    expect(
      fs.existsSync(
        path.join(sectionDir, "01.02-keep-this", "explainer", "readme.md")
      )
    ).toBe(true);
  });

  it("preserves unstaged changes through rename", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLesson(sectionDir, "01.01-has-changes");

    // Add unstaged modification
    fs.writeFileSync(
      path.join(sectionDir, "01.01-has-changes", "explainer", "readme.md"),
      "# Modified content\n"
    );

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLesson({
          repoPath: tempDir,
          sectionPath: "01-intro",
          oldLessonDirName: "01.01-has-changes",
          newSlug: "renamed-changes",
        });
      })
    );

    // File should exist at new location with modified content preserved
    const content = fs.readFileSync(
      path.join(sectionDir, "01.01-renamed-changes", "explainer", "readme.md"),
      "utf-8"
    );
    expect(content).toBe("# Modified content\n");
  });

  it("preserves untracked files through rename", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLesson(sectionDir, "01.01-has-untracked");

    // Add an untracked file
    fs.writeFileSync(
      path.join(sectionDir, "01.01-has-untracked", "notes.txt"),
      "my notes"
    );

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLesson({
          repoPath: tempDir,
          sectionPath: "01-intro",
          oldLessonDirName: "01.01-has-untracked",
          newSlug: "renamed-untracked",
        });
      })
    );

    // Untracked file should be carried along
    const content = fs.readFileSync(
      path.join(sectionDir, "01.01-renamed-untracked", "notes.txt"),
      "utf-8"
    );
    expect(content).toBe("my notes");
  });
});
