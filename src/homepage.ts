import homepageTemplate from "./homepage.html?raw";

export function buildHomepageHtml(origin: string): string {
  return homepageTemplate.trimEnd().replaceAll("{{origin}}", origin);
}
