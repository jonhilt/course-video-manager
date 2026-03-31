import { Config, ConfigProvider, Data, Effect } from "effect";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export class BlogPublishError extends Data.TaggedError("BlogPublishError")<{
  message: string;
  code?: string;
}> {}

/**
 * Assemble a full MDX string with frontmatter.
 * Pure function — no side effects.
 */
export function assembleMdx(params: {
  title: string;
  slug: string;
  body: string;
  description: string;
}): string {
  const date = new Date().toISOString().split("T")[0];
  const escapedTitle = params.title.replace(/"/g, '\\"');
  const escapedDescription = params.description.replace(/"/g, '\\"');

  return `---
title: "${escapedTitle}"
date: ${date}
draft: false
url: ${params.slug}
description: "${escapedDescription}"
---

${params.body}
`;
}

/**
 * Publish an MDX blog post to the blog-astro repo:
 * 1. Write MDX file to {BLOG_REPO_PATH}/src/content/blog/{year}/{slug}.mdx
 * 2. git add, commit, push
 */
export const publishToBlog = (opts: {
  title: string;
  slug: string;
  body: string;
  description: string;
  onProgress?: (percentage: number) => void;
}) =>
  Effect.gen(function* () {
    const blogRepoPath = yield* Config.string("BLOG_REPO_PATH");
    const currentYear = new Date().getFullYear().toString();

    const mdxContent = assembleMdx({
      title: opts.title,
      slug: opts.slug,
      body: opts.body,
      description: opts.description,
    });

    const yearDir = path.join(
      blogRepoPath,
      "src",
      "content",
      "blog",
      currentYear
    );
    const filePath = path.join(yearDir, `${opts.slug}.mdx`);

    // Create year directory if needed and write the MDX file
    yield* Effect.try({
      try: () => {
        mkdirSync(yearDir, { recursive: true });
        writeFileSync(filePath, mdxContent, "utf-8");
      },
      catch: (cause) =>
        new BlogPublishError({
          message: `Failed to write MDX file: ${cause instanceof Error ? cause.message : String(cause)}`,
          code: "file_write_failed",
        }),
    });

    opts.onProgress?.(20);

    // git add + commit
    yield* Effect.try({
      try: () =>
        execFileSync("git", ["add", filePath], {
          cwd: blogRepoPath,
          encoding: "utf-8",
        }),
      catch: (cause) =>
        new BlogPublishError({
          message: `git add failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          code: "git_add_failed",
        }),
    });

    yield* Effect.try({
      try: () =>
        execFileSync("git", ["commit", "-m", `Add blog post: ${opts.title}`], {
          cwd: blogRepoPath,
          encoding: "utf-8",
        }),
      catch: (cause) =>
        new BlogPublishError({
          message: `git commit failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          code: "git_commit_failed",
        }),
    });

    opts.onProgress?.(60);

    // git push
    yield* Effect.try({
      try: () =>
        execFileSync("git", ["push", "origin", "main"], {
          cwd: blogRepoPath,
          encoding: "utf-8",
        }),
      catch: (cause) =>
        new BlogPublishError({
          message: `git push failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          code: "git_push_failed",
        }),
    });

    opts.onProgress?.(100);

    yield* Effect.logInfo(`Blog post published: ${opts.slug}`);

    return { slug: opts.slug, filePath };
  }).pipe(Effect.withConfigProvider(ConfigProvider.fromEnv()));
