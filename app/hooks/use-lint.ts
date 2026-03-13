import { useMemo } from "react";
import {
  LINT_RULES,
  getLintRulesWithPhrases,
  type LintViolation,
  type BannedPhrase,
} from "@/features/article-writer/lint-rules";
import type { Mode } from "@/features/article-writer/types";

/**
 * Hook to check text for lint rule violations and compose fix messages.
 *
 * @param text - The text to check for violations
 * @param mode - The current writing mode (determines which rules apply)
 * @param customPhrases - Optional custom banned phrases (if provided, replaces defaults)
 * @returns Object containing violations array and fix message composer
 *
 * @example
 * ```tsx
 * const { violations, composeFixMessage } = useLint(lastAssistantMessage, mode, customPhrases);
 *
 * if (violations.length > 0) {
 *   const fixMessage = composeFixMessage();
 *   // Send fixMessage to LLM
 * }
 * ```
 */
export function useLint(
  text: string | null,
  mode: Mode,
  customPhrases?: BannedPhrase[]
) {
  const rules = useMemo(() => {
    if (customPhrases) {
      return getLintRulesWithPhrases(customPhrases);
    }
    return LINT_RULES;
  }, [customPhrases]);

  const violations = useMemo(() => {
    if (!text) return [];

    const results: LintViolation[] = [];

    for (const rule of rules) {
      // Skip rules that don't apply to this mode
      if (rule.modes !== null && !rule.modes.includes(mode)) {
        continue;
      }

      // Check for matches
      const matches = text.match(rule.pattern);

      if (rule.required) {
        // Required rules: violation if pattern is NOT present
        if (!matches || matches.length === 0) {
          results.push({
            rule,
            count: 1,
            matches: [],
          });
        }
      } else {
        // Default rules: violation if pattern IS present
        if (matches && matches.length > 0) {
          results.push({
            rule,
            count: matches.length,
            matches: [...matches],
          });
        }
      }
    }

    return results;
  }, [text, mode, rules]);

  const composeFixMessage = useMemo(() => {
    return () => {
      if (violations.length === 0) return "";

      const instructions = violations
        .map((v) => {
          const instruction =
            typeof v.rule.fixInstruction === "function"
              ? v.rule.fixInstruction(v.matches)
              : v.rule.fixInstruction;
          return `- ${instruction}`;
        })
        .join("\n");

      return `Please fix the following issues in your response:\n${instructions}\n\nOutput the corrected version.`;
    };
  }, [violations]);

  return {
    violations,
    composeFixMessage,
  };
}
