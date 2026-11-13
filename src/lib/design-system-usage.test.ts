import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function runtimeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return file.endsWith(join("components", "ui")) ? [] : runtimeFiles(file);
    return file.endsWith(".tsx") && !file.includes(".test.") ? [file] : [];
  });
}

const canvasButtons = new Set([
  "src/components/app-shell/maintenance-search.tsx",
  "src/features/scheduler/ui/maintenance-entry-block.tsx",
  "src/features/scheduler/ui/timeline-slot.tsx",
]);

describe("application design-system usage", () => {
  it("keeps native page regions from introducing independent width caps or centering", () => {
    const violations: string[] = [];
    for (const file of runtimeFiles(join(process.cwd(), "src"))) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          if (["div", "section", "article"].includes(tag)) {
            const classes = node.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === "className")?.getText(source) ?? "";
            if (/\b(?:mx-auto|max-w-)/.test(classes)) {
              let ancestor: ts.Node | undefined = node.parent;
              while (ancestor && !(ts.isJsxElement(ancestor) && ancestor.openingElement.tagName.getText(source) === "PageBody")) ancestor = ancestor.parent;
              if (ancestor) {
                violations.push(`${relative(process.cwd(), file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} use PageRegion for constrained page content`);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it("uses variants instead of page-specific badge, control and table geometry", () => {
    const violations: string[] = [];
    for (const file of runtimeFiles(join(process.cwd(), "src"))) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const path = relative(process.cwd(), file).replaceAll("\\", "/");
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          const attribute = node.attributes.properties.find((prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === "className");
          const classes = attribute?.getText(source) ?? "";
          const geometry = /\b(?:rounded(?:-|["\s])|(?:min-h|h|size|p|px|py|pt|pb|pl|pr)-)/;
          const badgeStyle = /\b(?:rounded-|(?:min-h|h|size|p|px|py|gap|font|bg|border)-|text-(?!left|right|center)|leading-|tracking-)/;
          if (tag === "SheetContent"
            && (/\b(?:rounded-|overflow-|(?:p|px|py|pt|pb|pl|pr|inset|inset-x|inset-y|top|right|bottom|left)-)/.test(classes)
              || node.attributes.properties.some((prop) => ts.isJsxAttribute(prop)
                && prop.name.getText(source) === "variant"
                && prop.initializer?.getText(source) === '"default"'))) {
            violations.push(`${path}: SheetContent must inherit shared inset geometry and use SheetBody for scrolling`);
          }
          if ((tag === "Badge" && badgeStyle.test(classes))
            || (["Input", "Textarea", "SelectTrigger", "Table", "TableCell", "TableHead", "TableRow", "TableHeader"].includes(tag) && geometry.test(classes))
            || (tag === "Button" && !canvasButtons.has(path) && geometry.test(classes))) {
            violations.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${tag}: ${classes}`);
          }
          if (tag === "Table") {
            let ancestor: ts.Node | undefined = node.parent;
            while (ancestor && !(ts.isJsxElement(ancestor) && ancestor.openingElement.tagName.getText(source) === "TableSurface")) ancestor = ancestor.parent;
            if (!ancestor) violations.push(`${path}: Table must be composed inside TableSurface`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});
