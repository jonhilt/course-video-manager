import { execFileSync } from "node:child_process";

export type GitStatus = {
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
  total: number;
};

export function getGitStatus(repoPath: string): GitStatus | null {
  try {
    const output = execFileSync("git", ["status", "--porcelain"], {
      cwd: repoPath,
      encoding: "utf-8",
    });
    const lines = output.split("\n").filter((l) => l.length > 0);
    let modified = 0;
    let added = 0;
    let deleted = 0;
    let untracked = 0;
    for (const line of lines) {
      const code = line.substring(0, 2);
      if (code === "??") {
        untracked++;
      } else if (code.includes("D")) {
        deleted++;
      } else if (code.includes("A")) {
        added++;
      } else {
        modified++;
      }
    }
    return { modified, added, deleted, untracked, total: lines.length };
  } catch {
    return null;
  }
}
