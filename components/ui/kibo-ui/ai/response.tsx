"use client";

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";
import { memo, useMemo } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { GlobeIcon, HardDriveIcon } from "lucide-react";
import {
  type BundledLanguage,
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockFiles,
  CodeBlockHeader,
  CodeBlockItem,
  type CodeBlockProps,
  CodeBlockSelect,
  CodeBlockSelectContent,
  CodeBlockSelectItem,
  CodeBlockSelectTrigger,
  CodeBlockSelectValue,
} from "../code-block";

export type AIResponseProps = HTMLAttributes<HTMLDivElement> & {
  options?: Options;
  children: Options["children"];
  imageBasePath: string;
  extraComponents?: Options["components"];
  preprocessMarkdown?: (md: string) => string;
};

/**
 * Remark plugin that preserves code fence meta strings (e.g. `title="Program.cs"`)
 * by copying them to `data.hProperties`, which remark-rehype passes through as
 * HTML attributes on the `<code>` element.
 */
function remarkCodeMeta() {
  return (tree: { type: string; children?: unknown[] }) => {
    function visit(node: Record<string, unknown>) {
      if (node.type === "code" && typeof node.meta === "string") {
        const data = (node.data ?? {}) as Record<string, unknown>;
        data.hProperties = {
          ...(data.hProperties as Record<string, unknown>),
          "data-meta": node.meta,
        };
        node.data = data;
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    }
    visit(tree as Record<string, unknown>);
  };
}

function parseTitleFromMeta(meta: string): string | undefined {
  const match = meta.match(/title=["']([^"']+)["']/);
  return match?.[1];
}

const languageToFilename = (language: string): string => {
  const map: Record<string, string> = {
    csharp: "Example.cs",
    razor: "Example.razor",
    cshtml: "Example.cshtml",
    html: "index.html",
    css: "styles.css",
    javascript: "index.js",
    js: "index.js",
    typescript: "index.ts",
    ts: "index.ts",
    jsx: "index.jsx",
    tsx: "index.tsx",
    json: "data.json",
    xml: "document.xml",
    sql: "query.sql",
    bash: "script.sh",
    sh: "script.sh",
    shell: "script.sh",
    powershell: "script.ps1",
    yaml: "config.yaml",
    yml: "config.yaml",
    python: "main.py",
    py: "main.py",
    go: "main.go",
    rust: "main.rs",
    java: "Main.java",
    markdown: "document.md",
    md: "document.md",
    scss: "styles.scss",
    sass: "styles.sass",
    less: "styles.less",
    dockerfile: "Dockerfile",
    docker: "Dockerfile",
    graphql: "schema.graphql",
    toml: "config.toml",
    vue: "Component.vue",
    svelte: "Component.svelte",
  };

  return map[language] ?? `example.${language}`;
};

const getComponents = (imageBasePath: string): Options["components"] => ({
  p: ({ node, children, className, ...props }) => (
    <p className={cn("mb-4", className)} {...props}>
      {children}
    </p>
  ),
  ol: ({ node, children, className, ...props }) => (
    <ol className={cn("ml-4 list-outside list-decimal", className)} {...props}>
      {children}
    </ol>
  ),
  li: ({ node, children, className, ...props }) => (
    <li className={cn("py-1", className)} {...props}>
      {children}
    </li>
  ),
  ul: ({ node, children, className, ...props }) => (
    <ul className={cn("ml-4 list-outside list-decimal", className)} {...props}>
      {children}
    </ul>
  ),
  strong: ({ node, children, className, ...props }) => (
    <span className={cn("font-semibold", className)} {...props}>
      {children}
    </span>
  ),
  a: ({ node, children, className, ...props }) => (
    <a
      className={cn("font-medium text-primary underline", className)}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  ),
  h1: ({ node, children, className, ...props }) => (
    <h1
      className={cn("mt-6 mb-2 font-semibold text-3xl", className)}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ node, children, className, ...props }) => (
    <h2
      className={cn("mt-6 mb-2 font-semibold text-2xl", className)}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ node, children, className, ...props }) => (
    <h3 className={cn("mt-6 mb-2 font-semibold text-xl", className)} {...props}>
      {children}
    </h3>
  ),
  h4: ({ node, children, className, ...props }) => (
    <h4 className={cn("mt-6 mb-2 font-semibold text-lg", className)} {...props}>
      {children}
    </h4>
  ),
  h5: ({ node, children, className, ...props }) => (
    <h5
      className={cn("mt-6 mb-2 font-semibold text-base", className)}
      {...props}
    >
      {children}
    </h5>
  ),
  h6: ({ node, children, className, ...props }) => (
    <h6 className={cn("mt-6 mb-2 font-semibold text-sm", className)} {...props}>
      {children}
    </h6>
  ),
  pre: ({ className, children }) => {
    const childrenIsCode =
      typeof children === "object" &&
      children !== null &&
      "type" in children &&
      children.type === "code";

    if (!childrenIsCode) {
      return <pre>{children}</pre>;
    }

    const codeProps = children.props as {
      children: string;
      className?: string;
      "data-meta"?: string;
    };

    let language = "javascript";
    const codeClassName = codeProps.className ?? "";
    const langMatch = codeClassName.match(/language-(\S+)/);
    if (langMatch) {
      language = langMatch[1]!;
    }

    const meta = codeProps["data-meta"];
    const filename =
      (meta ? parseTitleFromMeta(meta) : undefined) ??
      languageToFilename(language);

    const data: CodeBlockProps["data"] = [
      {
        language,
        filename,
        code: codeProps.children,
      },
    ];

    return (
      <CodeBlock
        className={cn("my-4 h-auto", className)}
        data={data}
        defaultValue={data[0]!.language}
      >
        <CodeBlockHeader>
          <CodeBlockFiles>
            {(item) => (
              <CodeBlockFilename key={item.language} value={item.language}>
                {item.filename}
              </CodeBlockFilename>
            )}
          </CodeBlockFiles>
          <CodeBlockSelect>
            <CodeBlockSelectTrigger>
              <CodeBlockSelectValue />
            </CodeBlockSelectTrigger>
            <CodeBlockSelectContent>
              {(item) => (
                <CodeBlockSelectItem key={item.language} value={item.language}>
                  {item.language}
                </CodeBlockSelectItem>
              )}
            </CodeBlockSelectContent>
          </CodeBlockSelect>
          <CodeBlockCopyButton
            onCopy={() => console.log("Copied code to clipboard")}
            onError={() => console.error("Failed to copy code to clipboard")}
          />
        </CodeBlockHeader>
        <CodeBlockBody>
          {(item) => (
            <CodeBlockItem key={item.language} value={item.language}>
              <CodeBlockContent language={item.language as BundledLanguage}>
                {item.code}
              </CodeBlockContent>
            </CodeBlockItem>
          )}
        </CodeBlockBody>
      </CodeBlock>
    );
  },
  img: ({ node, children, className, ...props }) => {
    const isExternalUrl =
      props.src?.startsWith("http://") || props.src?.startsWith("https://");
    const src = isExternalUrl
      ? props.src
      : `/view-image?imagePath=${imageBasePath}/${props.src}`;
    return (
      <div className="relative my-6 aspect-video">
        <img
          {...props}
          className={cn("w-full h-full object-contain", className)}
          src={src}
        />
        <div
          className={cn(
            "absolute top-2 right-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium shadow-sm",
            isExternalUrl
              ? "bg-blue-500/80 text-white"
              : "bg-amber-500/80 text-white"
          )}
          title={isExternalUrl ? "External image (web)" : "Local image"}
        >
          {isExternalUrl ? (
            <>
              <GlobeIcon className="size-3" />
              <span>Web</span>
            </>
          ) : (
            <>
              <HardDriveIcon className="size-3" />
              <span>Local</span>
            </>
          )}
        </div>
      </div>
    );
  },
});

export const AIResponse = memo(
  ({
    className,
    options,
    children,
    extraComponents,
    preprocessMarkdown,
    ...props
  }: AIResponseProps) => {
    const baseComponents = useMemo(
      () => getComponents(props.imageBasePath),
      [props.imageBasePath]
    );

    const components = useMemo(
      () =>
        extraComponents
          ? { ...baseComponents, ...extraComponents }
          : baseComponents,
      [baseComponents, extraComponents]
    );

    const processedChildren = useMemo(
      () =>
        preprocessMarkdown && typeof children === "string"
          ? preprocessMarkdown(children)
          : children,
      [children, preprocessMarkdown]
    );

    const rehypePlugins = extraComponents ? [rehypeRaw] : [];

    return (
      <div
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 relative group",
          className
        )}
        {...props}
      >
        <ReactMarkdown
          components={components}
          remarkPlugins={[remarkGfm, remarkCodeMeta]}
          rehypePlugins={rehypePlugins}
          {...options}
        >
          {processedChildren}
        </ReactMarkdown>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.extraComponents === nextProps.extraComponents
);
