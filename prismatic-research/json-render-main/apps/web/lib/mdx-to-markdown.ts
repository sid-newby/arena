/**
 * Converts raw MDX content to clean Markdown suitable for AI agents.
 *
 * Transformations:
 * - Remove `export` statements (metadata, etc.)
 * - Remove `import` statements
 * - Replace `<PackageInstall packages="x y" />` with a fenced bash code block
 * - Strip standalone JSX callout divs (the amber concept boxes)
 * - Pass everything else through as-is (already valid Markdown)
 */
export function mdxToCleanMarkdown(raw: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  let inJsxBlock = false;
  let jsxDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip export and import statements
    if (trimmed.startsWith("export ") || trimmed.startsWith("import ")) {
      continue;
    }

    // Handle PackageInstall component
    const pkgMatch = trimmed.match(
      /<PackageInstall\s+packages="([^"]+)"\s*\/>/,
    );
    if (pkgMatch) {
      const packages = pkgMatch[1];
      out.push("```bash");
      out.push(`pnpm add ${packages}`);
      out.push("```");
      out.push("");
      continue;
    }

    // Track JSX blocks (like the callout divs) and skip them
    if (
      !inJsxBlock &&
      trimmed.startsWith("<div ") &&
      trimmed.includes("className=")
    ) {
      inJsxBlock = true;
      jsxDepth = 1;
      continue;
    }

    if (inJsxBlock) {
      // Count opening/closing div tags to handle nesting
      const opens = (line.match(/<div[\s>]/g) || []).length;
      const closes = (line.match(/<\/div>/g) || []).length;
      jsxDepth += opens - closes;
      if (jsxDepth <= 0) {
        inJsxBlock = false;
        jsxDepth = 0;
      }
      continue;
    }

    out.push(line);
  }

  // Clean up leading blank lines
  let result = out.join("\n");
  result = result.replace(/^\n+/, "\n").trim();
  return result;
}
