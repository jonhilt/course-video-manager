"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const BLOG_TITLE_STORAGE_KEY = (videoId: string) => `blog-title-${videoId}`;
const BLOG_BODY_STORAGE_KEY = (videoId: string) => `blog-body-${videoId}`;
const BLOG_SEO_DESCRIPTION_STORAGE_KEY = (videoId: string) =>
  `blog-seo-description-${videoId}`;
const BLOG_SLUG_STORAGE_KEY = (videoId: string) => `blog-slug-${videoId}`;

const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

export function BlogPage({ videoId }: { videoId: string }) {
  // Title with localStorage persistence
  const [title, setTitle] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(BLOG_TITLE_STORAGE_KEY(videoId)) ?? "";
    }
    return "";
  });

  // Slug with localStorage persistence
  const slugInputTouched = useRef(false);
  const [slug, setSlug] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(BLOG_SLUG_STORAGE_KEY(videoId));
      if (stored) {
        slugInputTouched.current = true;
        return stored;
      }
    }
    return slugify(title);
  });

  // Auto-derive slug from title when user hasn't manually edited it
  useEffect(() => {
    if (!slugInputTouched.current) {
      setSlug(slugify(title));
    }
  }, [title]);

  // Body with localStorage persistence
  const [body, setBody] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(BLOG_BODY_STORAGE_KEY(videoId)) ?? "";
    }
    return "";
  });

  // SEO description with localStorage persistence
  const [seoDescription, setSeoDescription] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        localStorage.getItem(BLOG_SEO_DESCRIPTION_STORAGE_KEY(videoId)) ?? ""
      );
    }
    return "";
  });

  // Auto-save to localStorage
  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(BLOG_TITLE_STORAGE_KEY(videoId), title);
    }
  }, [title, videoId]);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(BLOG_BODY_STORAGE_KEY(videoId), body);
    }
  }, [body, videoId]);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        BLOG_SEO_DESCRIPTION_STORAGE_KEY(videoId),
        seoDescription
      );
    }
  }, [seoDescription, videoId]);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(BLOG_SLUG_STORAGE_KEY(videoId), slug);
    }
  }, [slug, videoId]);

  const isSeoDescriptionTooLong = seoDescription.length > 160;

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="blog-title">Title</Label>
        <Input
          id="blog-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter post title..."
          className="text-lg"
        />
      </div>

      {/* Slug */}
      <div className="space-y-2">
        <Label htmlFor="blog-slug">Slug</Label>
        <Input
          id="blog-slug"
          value={slug}
          onChange={(e) => {
            slugInputTouched.current = true;
            setSlug(e.target.value);
          }}
          placeholder="post-slug"
          className="font-mono text-sm"
        />
      </div>

      {/* Body */}
      <div className="space-y-2">
        <Label htmlFor="blog-body">Body (Markdown)</Label>
        <Textarea
          id="blog-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your post body in markdown..."
          className="min-h-[300px] resize-y font-mono"
        />
      </div>

      {/* SEO Description */}
      <div className="space-y-2">
        <Label htmlFor="blog-seo">SEO Description</Label>
        <Textarea
          id="blog-seo"
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          placeholder="SEO description (160 characters max)..."
          className={`min-h-[80px] resize-y ${isSeoDescriptionTooLong ? "border-red-500 focus-visible:ring-red-500" : ""}`}
        />
        <p
          className={`text-xs text-right ${isSeoDescriptionTooLong ? "text-red-500" : "text-muted-foreground"}`}
        >
          {seoDescription.length}/160
        </p>
      </div>
    </div>
  );
}
