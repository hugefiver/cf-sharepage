import rootSkillMarkdown from "../SKILL.md?raw";

const genericBaseUrlLine =
  "- `baseUrl`: the deployed service origin, for example `https://share.example.com`.";
const genericBaseUrlVariableLine =
  "- `BASE_URL`: service origin, for example `https://share.example.com`.";

export function buildSkillMarkdown(origin: string): string {
  return rootSkillMarkdown
    .trimEnd()
    .replace(
      genericBaseUrlLine,
      `- \`baseUrl\`: the deployed service origin: \`${origin}\`.`,
    )
    .replaceAll("https://...", origin)
    .replace(
      genericBaseUrlVariableLine,
      `- Service origin: \`${origin}\`.`,
    )
    .replaceAll("$BASE_URL", origin);
}
