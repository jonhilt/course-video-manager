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

describe("renameLessons (batch)", () => {
  beforeEach(() => {
    setupTempGitRepo();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createAndCommitLessons = (
    sectionDir: string,
    lessonNames: string[]
  ) => {
    for (const name of lessonNames) {
      const lessonDir = path.join(sectionDir, name, "explainer");
      fs.mkdirSync(lessonDir, { recursive: true });
      fs.writeFileSync(path.join(lessonDir, "readme.md"), `# ${name}\n`);
    }
    execSync("git add . && git commit -m 'add lessons'", { cwd: tempDir });
  };

  it("swaps two lessons without path collision", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLessons(sectionDir, [
      "01.01-first",
      "01.02-second",
      "01.03-third",
    ]);

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames: [
            { oldPath: "01.01-first", newPath: "01.03-first" },
            { oldPath: "01.02-second", newPath: "01.01-second" },
            { oldPath: "01.03-third", newPath: "01.02-third" },
          ],
        });
      })
    );

    // Verify new structure
    expect(fs.existsSync(path.join(sectionDir, "01.01-second"))).toBe(true);
    expect(fs.existsSync(path.join(sectionDir, "01.02-third"))).toBe(true);
    expect(fs.existsSync(path.join(sectionDir, "01.03-first"))).toBe(true);
    // Old names should not exist
    expect(fs.existsSync(path.join(sectionDir, "01.01-first"))).toBe(false);
    expect(fs.existsSync(path.join(sectionDir, "01.02-second"))).toBe(false);
    expect(fs.existsSync(path.join(sectionDir, "01.03-third"))).toBe(false);
  });

  it("handles empty renames array (no-op)", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLessons(sectionDir, ["01.01-only"]);

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames: [],
        });
      })
    );

    expect(fs.existsSync(path.join(sectionDir, "01.01-only"))).toBe(true);
  });

  it("renames are staged in git", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLessons(sectionDir, ["01.01-aaa", "01.02-bbb"]);

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames: [
            { oldPath: "01.01-aaa", newPath: "01.02-aaa" },
            { oldPath: "01.02-bbb", newPath: "01.01-bbb" },
          ],
        });
      })
    );

    const status = execSync("git status --porcelain", { cwd: tempDir })
      .toString()
      .trim();
    expect(status).toContain("01.01-bbb");
    expect(status).toContain("01.02-aaa");
  });

  it("preserves unstaged changes through batch rename", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLessons(sectionDir, ["01.01-alpha", "01.02-beta"]);

    // Add unstaged modification to first lesson
    fs.writeFileSync(
      path.join(sectionDir, "01.01-alpha", "explainer", "readme.md"),
      "# Modified alpha\n"
    );

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames: [
            { oldPath: "01.01-alpha", newPath: "01.02-alpha" },
            { oldPath: "01.02-beta", newPath: "01.01-beta" },
          ],
        });
      })
    );

    const content = fs.readFileSync(
      path.join(sectionDir, "01.02-alpha", "explainer", "readme.md"),
      "utf-8"
    );
    expect(content).toBe("# Modified alpha\n");
  });

  it("preserves untracked files through batch rename", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLessons(sectionDir, ["01.01-one", "01.02-two"]);

    // Add untracked file
    fs.writeFileSync(
      path.join(sectionDir, "01.02-two", "notes.txt"),
      "my notes"
    );

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames: [
            { oldPath: "01.02-two", newPath: "01.01-two" },
            { oldPath: "01.01-one", newPath: "01.02-one" },
          ],
        });
      })
    );

    const content = fs.readFileSync(
      path.join(sectionDir, "01.01-two", "notes.txt"),
      "utf-8"
    );
    expect(content).toBe("my notes");
  });

  it("no temporary directories remain after rename", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLessons(sectionDir, ["01.01-x", "01.02-y"]);

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames: [
            { oldPath: "01.01-x", newPath: "01.02-x" },
            { oldPath: "01.02-y", newPath: "01.01-y" },
          ],
        });
      })
    );

    const entries = fs.readdirSync(sectionDir);
    const tempEntries = entries.filter((e) => e.startsWith("__reorder_tmp_"));
    expect(tempEntries).toHaveLength(0);
  });

  it("handles shift-down rename (all lessons shift by 1)", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLessons(sectionDir, [
      "01.01-first",
      "01.02-second",
      "01.03-third",
    ]);

    // Simulate insert at position 0: all lessons shift down by 1
    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames: [
            { oldPath: "01.01-first", newPath: "01.02-first" },
            { oldPath: "01.02-second", newPath: "01.03-second" },
            { oldPath: "01.03-third", newPath: "01.04-third" },
          ],
        });
      })
    );

    expect(fs.existsSync(path.join(sectionDir, "01.02-first"))).toBe(true);
    expect(fs.existsSync(path.join(sectionDir, "01.03-second"))).toBe(true);
    expect(fs.existsSync(path.join(sectionDir, "01.04-third"))).toBe(true);
    // Old paths should not exist
    expect(fs.existsSync(path.join(sectionDir, "01.01-first"))).toBe(false);
    // No temp dirs left
    const entries = fs.readdirSync(sectionDir);
    expect(entries.filter((e) => e.startsWith("__reorder_tmp_"))).toHaveLength(
      0
    );
  });

  it("handles partial rename (only some lessons change)", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLessons(sectionDir, [
      "01.01-stays",
      "01.02-moves",
      "01.03-also-stays",
    ]);

    // Only lesson 2 and 3 swap; lesson 1 stays
    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames: [
            { oldPath: "01.02-moves", newPath: "01.03-moves" },
            { oldPath: "01.03-also-stays", newPath: "01.02-also-stays" },
          ],
        });
      })
    );

    // Untouched lesson still there
    expect(fs.existsSync(path.join(sectionDir, "01.01-stays"))).toBe(true);
    // Swapped lessons in correct positions
    expect(fs.existsSync(path.join(sectionDir, "01.02-also-stays"))).toBe(true);
    expect(fs.existsSync(path.join(sectionDir, "01.03-moves"))).toBe(true);
  });

  it("cleans up leftover temp dirs from a previous failed rename", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLessons(sectionDir, ["01.01-aaa", "01.02-bbb"]);

    // Simulate leftover temp dirs from a previous crash
    const leftoverDir = path.join(
      sectionDir,
      "__reorder_tmp_0_01.02-old-stuff"
    );
    fs.mkdirSync(path.join(leftoverDir, "explainer"), { recursive: true });
    fs.writeFileSync(
      path.join(leftoverDir, "explainer", "readme.md"),
      "# Leftover\n"
    );
    execSync("git add . && git commit -m 'leftover'", { cwd: tempDir });

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames: [
            { oldPath: "01.01-aaa", newPath: "01.02-aaa" },
            { oldPath: "01.02-bbb", newPath: "01.01-bbb" },
          ],
        });
      })
    );

    const entries = fs.readdirSync(sectionDir);
    const tempEntries = entries.filter((e) => e.startsWith("__reorder_tmp_"));
    expect(tempEntries).toHaveLength(0);
    // Actual renames should have completed
    expect(fs.existsSync(path.join(sectionDir, "01.01-bbb"))).toBe(true);
    expect(fs.existsSync(path.join(sectionDir, "01.02-aaa"))).toBe(true);
  });

  it("does not leave temp dirs when pass 1 fails partway through", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    createAndCommitLessons(sectionDir, ["01.01-real"]);

    // Try to rename a path that doesn't exist — should fail
    // but should NOT leave temp files from earlier successful entries
    const result = runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames: [
            { oldPath: "01.01-real", newPath: "01.02-real" },
            { oldPath: "01.99-nonexistent", newPath: "01.01-nonexistent" },
          ],
        });
      })
    );

    await expect(result).rejects.toThrow();

    // The original lesson should be restored, not stuck in temp
    const entries = fs.readdirSync(sectionDir);
    const tempEntries = entries.filter((e) => e.startsWith("__reorder_tmp_"));
    expect(tempEntries).toHaveLength(0);
    // Original file should still be accessible (either at original or restored)
    expect(fs.existsSync(path.join(sectionDir, "01.01-real"))).toBe(true);
  });

  it("handles large reorder (10 lessons, reverse order)", async () => {
    const sectionDir = path.join(tempDir, "01-intro");
    const lessonNames = Array.from(
      { length: 10 },
      (_, i) =>
        `01.${String(i + 1).padStart(2, "0")}-lesson-${String.fromCharCode(97 + i)}`
    );
    createAndCommitLessons(sectionDir, lessonNames);

    // Reverse all 10 lessons
    const renames = lessonNames.map((name, i) => ({
      oldPath: name,
      newPath: `01.${String(10 - i).padStart(2, "0")}-lesson-${String.fromCharCode(97 + i)}`,
    }));

    await runEffect(
      Effect.gen(function* () {
        const service = yield* CourseRepoWriteService;
        yield* service.renameLessons({
          repoPath: tempDir,
          sectionPath: "01-intro",
          renames,
        });
      })
    );

    // Verify all 10 are in reversed positions
    for (let i = 0; i < 10; i++) {
      const expectedDir = `01.${String(10 - i).padStart(2, "0")}-lesson-${String.fromCharCode(97 + i)}`;
      expect(fs.existsSync(path.join(sectionDir, expectedDir))).toBe(true);
    }

    // No temp dirs
    const entries = fs.readdirSync(sectionDir);
    expect(entries.filter((e) => e.startsWith("__reorder_tmp_"))).toHaveLength(
      0
    );
  });
});
