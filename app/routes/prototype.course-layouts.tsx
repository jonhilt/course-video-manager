import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  ChevronRight,
  Clock,
  FileVideo,
  Layers,
  VideoIcon,
} from "lucide-react";
import { useState } from "react";

// --- Mock Data: 5 sections, 5 lessons each, 2 videos per lesson ---

interface MockVideo {
  id: string;
  path: string;
  duration: string;
  hasExport: boolean;
}

interface MockLesson {
  id: string;
  path: string;
  videos: MockVideo[];
}

interface MockSection {
  id: string;
  path: string;
  lessons: MockLesson[];
}

function generateMockData(): MockSection[] {
  const sectionNames = [
    "01-introduction",
    "02-type-fundamentals",
    "03-generics",
    "04-advanced-patterns",
    "05-real-world-apps",
  ];

  const lessonNames = [
    [
      "01-welcome",
      "02-setup",
      "03-first-type",
      "04-type-inference",
      "05-config",
    ],
    [
      "01-primitives",
      "02-objects",
      "03-arrays",
      "04-unions",
      "05-intersections",
    ],
    [
      "01-intro-to-generics",
      "02-constraints",
      "03-default-types",
      "04-mapped-types",
      "05-conditional-types",
    ],
    [
      "01-branded-types",
      "02-builder-pattern",
      "03-type-predicates",
      "04-template-literals",
      "05-declaration-merging",
    ],
    [
      "01-api-layer",
      "02-form-validation",
      "03-state-machines",
      "04-error-handling",
      "05-testing-types",
    ],
  ];

  const durations = [
    "3:24",
    "5:12",
    "4:45",
    "6:30",
    "2:58",
    "7:15",
    "4:02",
    "5:48",
    "3:37",
    "6:11",
  ];

  return sectionNames.map((sectionName, si) => ({
    id: `s${si + 1}`,
    path: sectionName,
    lessons: lessonNames[si]!.map((lessonName, li) => ({
      id: `s${si + 1}-l${li + 1}`,
      path: lessonName,
      videos: [
        {
          id: `s${si + 1}-l${li + 1}-v1`,
          path: `${lessonName}.problem`,
          duration: durations[(si * 5 + li * 2) % durations.length]!,
          hasExport: Math.random() > 0.3,
        },
        {
          id: `s${si + 1}-l${li + 1}-v2`,
          path: `${lessonName}.solution`,
          duration: durations[(si * 5 + li * 2 + 1) % durations.length]!,
          hasExport: Math.random() > 0.3,
        },
      ],
    })),
  }));
}

const MOCK_SECTIONS = generateMockData();

// --- Layout 1: Accordion Sections (Collapsible Tree) ---

function Layout1() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            Total TypeScript Pro Essentials
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            25 lessons &middot; 50 videos
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {MOCK_SECTIONS.map((section) => (
          <Collapsible key={section.id} defaultOpen={section.id === "s1"}>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors group">
                <div className="flex items-center gap-3">
                  <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90 text-muted-foreground" />
                  <Layers className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{section.path}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {section.lessons.length} lessons
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {section.lessons.reduce((a, l) => a + l.videos.length, 0)}{" "}
                    videos
                  </Badge>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-4 border-l pl-4 mt-1 space-y-1">
                {section.lessons.map((lesson) => (
                  <Collapsible key={lesson.id} defaultOpen={false}>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50 transition-colors group text-sm">
                        <div className="flex items-center gap-2">
                          <ChevronRight className="w-3.5 h-3.5 transition-transform group-data-[state=open]:rotate-90 text-muted-foreground" />
                          <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{lesson.path}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {lesson.videos.length} videos
                        </span>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-6 space-y-0.5 py-1">
                        {lesson.videos.map((video) => (
                          <div
                            key={video.id}
                            className="flex items-center justify-between rounded px-3 py-1.5 hover:bg-muted/50 transition-colors text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <VideoIcon
                                className={cn(
                                  "w-3.5 h-3.5",
                                  video.hasExport
                                    ? "text-muted-foreground"
                                    : "text-red-500"
                                )}
                              />
                              <span className="text-muted-foreground">
                                {video.path}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground font-mono">
                              {video.duration}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

// --- Layout 2: Card Grid ---

function Layout2() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Total TypeScript Pro Essentials</h1>
        <p className="text-sm text-muted-foreground mt-1">
          25 lessons &middot; 50 videos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {MOCK_SECTIONS.map((section) => (
          <div key={section.id} className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-sm">{section.path}</h2>
                <Badge variant="secondary" className="text-[10px]">
                  {section.lessons.length} lessons
                </Badge>
              </div>
            </div>
            <div className="p-2">
              {section.lessons.map((lesson, li) => (
                <div key={lesson.id}>
                  {li > 0 && <Separator className="my-1" />}
                  <div className="rounded-md px-2 py-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {lesson.path}
                      </span>
                    </div>
                    <div className="ml-5 space-y-0.5">
                      {lesson.videos.map((video) => (
                        <div
                          key={video.id}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileVideo
                              className={cn(
                                "w-3 h-3 shrink-0",
                                video.hasExport
                                  ? "text-muted-foreground"
                                  : "text-red-500"
                              )}
                            />
                            <span className="truncate text-muted-foreground">
                              {video.path}
                            </span>
                          </div>
                          <span className="text-muted-foreground font-mono ml-2 shrink-0">
                            {video.duration}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Layout 3: Table of Contents Sidebar + Detail Panel ---

function Layout3() {
  const [selectedSectionId, setSelectedSectionId] = useState("s1");
  const selectedSection = MOCK_SECTIONS.find(
    (s) => s.id === selectedSectionId
  )!;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left TOC sidebar */}
      <div className="w-64 border-r bg-muted/20 flex flex-col">
        <div className="p-4 border-b">
          <h1 className="font-bold text-sm truncate">
            Total TypeScript Pro Essentials
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            25 lessons &middot; 50 videos
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            {MOCK_SECTIONS.map((section) => (
              <button
                key={section.id}
                className={cn(
                  "w-full text-left rounded-md px-3 py-2 text-sm transition-colors mb-0.5",
                  selectedSectionId === section.id
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
                onClick={() => setSelectedSectionId(section.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{section.path}</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] ml-2 shrink-0"
                  >
                    {section.lessons.length}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right detail panel */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Layers className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">{selectedSection.path}</h2>
            <Badge variant="secondary">
              {selectedSection.lessons.length} lessons
            </Badge>
            <Badge variant="secondary">
              {selectedSection.lessons.reduce((a, l) => a + l.videos.length, 0)}{" "}
              videos
            </Badge>
          </div>

          <div className="space-y-4">
            {selectedSection.lessons.map((lesson) => (
              <div key={lesson.id} className="rounded-lg border">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{lesson.path}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {lesson.videos.length} videos
                  </span>
                </div>
                <div className="divide-y">
                  {lesson.videos.map((video) => (
                    <div
                      key={video.id}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <VideoIcon
                          className={cn(
                            "w-4 h-4",
                            video.hasExport
                              ? "text-muted-foreground"
                              : "text-red-500"
                          )}
                        />
                        <span className="text-sm">{video.path}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-mono">
                          {video.duration}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Layout 4: Tabbed Sections with Compact Lesson Rows ---

function Layout4() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Total TypeScript Pro Essentials</h1>
        <p className="text-sm text-muted-foreground mt-1">
          25 lessons &middot; 50 videos
        </p>
      </div>

      <Tabs defaultValue="s1">
        <TabsList className="w-full justify-start overflow-x-auto bg-transparent border-b rounded-none h-auto p-0 gap-0">
          {MOCK_SECTIONS.map((section) => (
            <TabsTrigger
              key={section.id}
              value={section.id}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm whitespace-nowrap"
            >
              {section.path}
            </TabsTrigger>
          ))}
        </TabsList>

        {MOCK_SECTIONS.map((section) => (
          <TabsContent key={section.id} value={section.id} className="mt-6">
            <div className="rounded-lg border overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Lesson / Video</span>
                <span className="w-20 text-right">Duration</span>
                <span className="w-16 text-right">Status</span>
              </div>

              {section.lessons.map((lesson, li) => (
                <div key={lesson.id}>
                  {li > 0 && <Separator />}
                  {/* Lesson row */}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{lesson.path}</span>
                    </div>
                    <span className="w-20" />
                    <span className="w-16" />
                  </div>
                  {/* Video rows */}
                  {lesson.videos.map((video) => (
                    <div
                      key={video.id}
                      className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 ml-6">
                        <VideoIcon
                          className={cn(
                            "w-3.5 h-3.5 shrink-0",
                            video.hasExport
                              ? "text-muted-foreground"
                              : "text-red-500"
                          )}
                        />
                        <span className="text-sm text-muted-foreground">
                          {video.path}
                        </span>
                      </div>
                      <span className="w-20 text-right text-xs text-muted-foreground font-mono">
                        {video.duration}
                      </span>
                      <span className="w-16 text-right">
                        {video.hasExport ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5"
                          >
                            exported
                          </Badge>
                        ) : (
                          <Badge
                            variant="destructive"
                            className="text-[10px] px-1.5"
                          >
                            missing
                          </Badge>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// --- Layout 5: Horizontal Scroll Kanban Columns ---

function Layout5() {
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="p-6 pb-4">
        <h1 className="text-2xl font-bold">Total TypeScript Pro Essentials</h1>
        <p className="text-sm text-muted-foreground mt-1">
          25 lessons &middot; 50 videos
        </p>
      </div>

      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {MOCK_SECTIONS.map((section) => (
            <div
              key={section.id}
              className="w-80 flex flex-col rounded-lg border bg-muted/20"
            >
              {/* Column header */}
              <div className="px-4 py-3 border-b bg-muted/30 rounded-t-lg">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium text-sm truncate">
                    {section.path}
                  </h2>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {section.lessons.length}
                  </Badge>
                </div>
              </div>

              {/* Column body */}
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-2">
                  {section.lessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="rounded-md border bg-card p-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">
                          {lesson.path}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {lesson.videos.map((video) => (
                          <div
                            key={video.id}
                            className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-muted/30 hover:bg-muted/60 transition-colors"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <VideoIcon
                                className={cn(
                                  "w-3 h-3 shrink-0",
                                  video.hasExport
                                    ? "text-muted-foreground"
                                    : "text-red-500"
                                )}
                              />
                              <span className="truncate text-muted-foreground">
                                {video.path}
                              </span>
                            </div>
                            <span className="text-muted-foreground font-mono ml-2 shrink-0">
                              {video.duration}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Main Prototype Page ---

const LAYOUTS = [
  {
    id: "1",
    name: "Accordion Tree",
    description:
      "Nested collapsibles for sections and lessons. Compact — expand only what you need. Familiar file-tree pattern.",
    component: Layout1,
  },
  {
    id: "2",
    name: "Card Grid",
    description:
      "Each section as a bordered card in a responsive grid. Lessons and videos listed within. Good overview at a glance.",
    component: Layout2,
  },
  {
    id: "3",
    name: "Sidebar + Detail",
    description:
      "Fixed section list on the left, detailed lesson/video view on the right. One section visible at a time — less visual noise.",
    component: Layout3,
  },
  {
    id: "4",
    name: "Tabbed Table",
    description:
      "Tabs per section, table-style rows for lessons and videos. Shows duration and export status. Structured and scannable.",
    component: Layout4,
  },
  {
    id: "5",
    name: "Kanban Columns",
    description:
      "Horizontally scrollable columns per section, lesson cards stacked vertically. Good for comparing section progress side by side.",
    component: Layout5,
  },
];

export default function PrototypeCourseLayouts() {
  const [selected, setSelected] = useState("1");

  const current = LAYOUTS.find((l) => l.id === selected)!;
  const CurrentComponent = current.component;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Layout selector bar */}
      <div className="border-b px-6 py-4">
        <h1 className="text-lg font-bold mb-3">
          Course Page Layout Prototypes
        </h1>
        <div className="flex gap-2 flex-wrap">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              className={cn(
                "text-left border rounded-lg px-4 py-2 transition-colors text-sm",
                selected === layout.id
                  ? "border-foreground bg-accent"
                  : "border-border hover:border-foreground/50 hover:bg-accent/50"
              )}
              onClick={() => setSelected(layout.id)}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {layout.id}
                </span>
                <span className="font-medium">{layout.name}</span>
                {selected === layout.id && (
                  <Badge variant="secondary" className="text-[10px]">
                    Active
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                {layout.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-y-auto">
        <CurrentComponent />
      </div>
    </div>
  );
}
