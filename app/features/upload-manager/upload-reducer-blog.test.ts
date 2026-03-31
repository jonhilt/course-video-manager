import { describe, expect, it } from "vitest";
import { uploadReducer, createInitialUploadState } from "./upload-reducer";

const reduce = (state: uploadReducer.State, action: uploadReducer.Action) =>
  uploadReducer(state, action);

const createState = (
  overrides: Partial<uploadReducer.State> = {}
): uploadReducer.State => ({
  ...createInitialUploadState(),
  ...overrides,
});

const createBlogEntry = (
  overrides: Partial<Omit<uploadReducer.BlogUploadEntry, "uploadType">> = {}
): uploadReducer.BlogUploadEntry => ({
  uploadId: "upload-1",
  videoId: "video-1",
  title: "Test Blog Post",
  progress: 0,
  status: "uploading",
  uploadType: "blog",
  blogSlug: null,
  errorMessage: null,
  retryCount: 0,
  dependsOn: null,
  ...overrides,
});

describe("blog upload: start → progress → success", () => {
  it("should create a BlogUploadEntry with blogSlug null and status uploading", () => {
    const state = reduce(createState(), {
      type: "START_UPLOAD",
      uploadId: "upload-1",
      videoId: "video-1",
      title: "Test Blog Post",
      uploadType: "blog",
    });

    expect(state.uploads["upload-1"]).toEqual({
      uploadId: "upload-1",
      videoId: "video-1",
      title: "Test Blog Post",
      progress: 0,
      status: "uploading",
      uploadType: "blog",
      blogSlug: null,
      errorMessage: null,
      retryCount: 0,
      dependsOn: null,
    });
  });

  it("should update progress for a blog upload", () => {
    const state = reduce(
      createState({
        uploads: { "upload-1": createBlogEntry() },
      }),
      { type: "UPDATE_PROGRESS", uploadId: "upload-1", progress: 55 }
    );

    expect(state.uploads["upload-1"]!.progress).toBe(55);
  });

  it("should set status to success, progress to 100, and store blogSlug", () => {
    const state = reduce(
      createState({
        uploads: { "upload-1": createBlogEntry({ progress: 80 }) },
      }),
      {
        type: "UPLOAD_SUCCESS",
        uploadId: "upload-1",
        blogSlug: "my-blog-post-slug",
      }
    );

    const upload = state.uploads["upload-1"]!;
    expect(upload.status).toBe("success");
    expect(upload.progress).toBe(100);
    expect(upload.uploadType === "blog" && upload.blogSlug).toBe(
      "my-blog-post-slug"
    );
    expect(upload.errorMessage).toBeNull();
  });

  it("should progress through full start → progress → success lifecycle", () => {
    let state = createState();

    state = reduce(state, {
      type: "START_UPLOAD",
      uploadId: "blog-1",
      videoId: "video-1",
      title: "My Blog Post",
      uploadType: "blog",
    });
    expect(state.uploads["blog-1"]!.status).toBe("uploading");
    expect(state.uploads["blog-1"]!.uploadType).toBe("blog");

    state = reduce(state, {
      type: "UPDATE_PROGRESS",
      uploadId: "blog-1",
      progress: 50,
    });
    expect(state.uploads["blog-1"]!.progress).toBe(50);

    state = reduce(state, {
      type: "UPDATE_PROGRESS",
      uploadId: "blog-1",
      progress: 90,
    });
    expect(state.uploads["blog-1"]!.progress).toBe(90);

    state = reduce(state, {
      type: "UPLOAD_SUCCESS",
      uploadId: "blog-1",
      blogSlug: "final-slug",
    });

    const upload = state.uploads["blog-1"]!;
    expect(upload.status).toBe("success");
    expect(upload.progress).toBe(100);
    expect(upload.uploadType === "blog" && upload.blogSlug).toBe("final-slug");
  });
});

describe("blog upload: start → error", () => {
  it("should set status to retrying on first error (retryCount < 3)", () => {
    const state = reduce(
      createState({
        uploads: { "upload-1": createBlogEntry({ retryCount: 0 }) },
      }),
      {
        type: "UPLOAD_ERROR",
        uploadId: "upload-1",
        errorMessage: "Network error",
      }
    );

    const upload = state.uploads["upload-1"]!;
    expect(upload.status).toBe("retrying");
    expect(upload.retryCount).toBe(1);
    expect(upload.errorMessage).toBe("Network error");
  });

  it("should set status to retrying on second error", () => {
    const state = reduce(
      createState({
        uploads: { "upload-1": createBlogEntry({ retryCount: 1 }) },
      }),
      {
        type: "UPLOAD_ERROR",
        uploadId: "upload-1",
        errorMessage: "Network error again",
      }
    );

    const upload = state.uploads["upload-1"]!;
    expect(upload.status).toBe("retrying");
    expect(upload.retryCount).toBe(2);
  });

  it("should set status to error after 3 errors", () => {
    const state = reduce(
      createState({
        uploads: { "upload-1": createBlogEntry({ retryCount: 2 }) },
      }),
      {
        type: "UPLOAD_ERROR",
        uploadId: "upload-1",
        errorMessage: "Final failure",
      }
    );

    const upload = state.uploads["upload-1"]!;
    expect(upload.status).toBe("error");
    expect(upload.retryCount).toBe(3);
    expect(upload.errorMessage).toBe("Final failure");
  });
});

describe("blog upload: retry", () => {
  it("should reset progress to 0, status to uploading, and blogSlug to null", () => {
    const state = reduce(
      createState({
        uploads: {
          "upload-1": createBlogEntry({
            status: "retrying",
            retryCount: 1,
            progress: 60,
            blogSlug: "old-slug",
          }),
        },
      }),
      { type: "RETRY", uploadId: "upload-1" }
    );

    const upload = state.uploads["upload-1"]!;
    expect(upload.status).toBe("uploading");
    expect(upload.progress).toBe(0);
    expect(upload.uploadType === "blog" && upload.blogSlug).toBeNull();
    expect(upload.retryCount).toBe(1);
  });

  it("should go through full retry lifecycle for blog upload", () => {
    let state = reduce(createState(), {
      type: "START_UPLOAD",
      uploadId: "blog-1",
      videoId: "video-1",
      title: "Flaky Blog",
      uploadType: "blog",
    });

    // First error → retrying
    state = reduce(state, {
      type: "UPLOAD_ERROR",
      uploadId: "blog-1",
      errorMessage: "Error 1",
    });
    expect(state.uploads["blog-1"]!.status).toBe("retrying");
    expect(state.uploads["blog-1"]!.retryCount).toBe(1);

    // Retry resets
    state = reduce(state, { type: "RETRY", uploadId: "blog-1" });
    expect(state.uploads["blog-1"]!.status).toBe("uploading");
    expect(state.uploads["blog-1"]!.progress).toBe(0);

    // Second error → retrying
    state = reduce(state, {
      type: "UPLOAD_ERROR",
      uploadId: "blog-1",
      errorMessage: "Error 2",
    });
    expect(state.uploads["blog-1"]!.status).toBe("retrying");

    state = reduce(state, { type: "RETRY", uploadId: "blog-1" });

    // Third error → final error
    state = reduce(state, {
      type: "UPLOAD_ERROR",
      uploadId: "blog-1",
      errorMessage: "Error 3",
    });
    expect(state.uploads["blog-1"]!.status).toBe("error");
    expect(state.uploads["blog-1"]!.retryCount).toBe(3);
  });
});

describe("blog upload: dismiss", () => {
  it("should remove the blog upload entry from state", () => {
    const state = reduce(
      createState({
        uploads: {
          "upload-1": createBlogEntry({ status: "success", blogSlug: "done" }),
        },
      }),
      { type: "DISMISS", uploadId: "upload-1" }
    );

    expect(state.uploads["upload-1"]).toBeUndefined();
    expect(Object.keys(state.uploads)).toHaveLength(0);
  });

  it("should not affect other uploads when dismissing a blog upload", () => {
    const blogEntry = createBlogEntry({
      uploadId: "blog-1",
      status: "success",
    });
    const state = reduce(
      createState({
        uploads: {
          "blog-1": blogEntry,
          "upload-2": {
            uploadId: "upload-2",
            videoId: "video-2",
            title: "Other Upload",
            progress: 50,
            status: "uploading",
            uploadType: "youtube",
            youtubeVideoId: null,
            errorMessage: null,
            retryCount: 0,
            dependsOn: null,
          },
        },
      }),
      { type: "DISMISS", uploadId: "blog-1" }
    );

    expect(state.uploads["blog-1"]).toBeUndefined();
    expect(state.uploads["upload-2"]).toBeDefined();
  });
});
