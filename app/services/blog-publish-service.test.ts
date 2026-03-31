import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assembleMdx } from "./blog-publish-service";

describe("assembleMdx", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("assembles frontmatter and body for a standard post", () => {
    const result = assembleMdx({
      title: "Getting Started with Remix",
      slug: "getting-started-with-remix",
      body: "This is the body of the post.",
      description: "A guide to getting started with Remix.",
    });

    expect(result).toBe(`---
title: "Getting Started with Remix"
date: 2026-03-31
draft: false
url: getting-started-with-remix
description: "A guide to getting started with Remix."
---

This is the body of the post.
`);
  });

  it("escapes double quotes in the title", () => {
    const result = assembleMdx({
      title: 'Building "Real" Apps',
      slug: "building-real-apps",
      body: "Content here.",
      description: "How to build real apps.",
    });

    expect(result).toContain('title: "Building \\"Real\\" Apps"');
  });

  it("handles an empty description", () => {
    const result = assembleMdx({
      title: "No Description Post",
      slug: "no-description",
      body: "Some body content.",
      description: "",
    });

    expect(result).toContain('description: ""');
  });

  it("preserves MDX components in the body without modification", () => {
    const mdxBody = `Here is some code:

<CodeBlock lang="ts">
const x = 42;
</CodeBlock>

<Alert type="warning">Watch out!</Alert>`;

    const result = assembleMdx({
      title: "MDX Components Post",
      slug: "mdx-components",
      body: mdxBody,
      description: "A post with MDX components.",
    });

    expect(result).toContain(mdxBody);
  });
});
