import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const fixtureRoot = path.resolve("test-sites/modern-tailwind-v4");
const appFile = path.join(fixtureRoot, "src/App.tsx");
const settingsFile = path.join(fixtureRoot, ".intent/settings.json");
const selectionFile = path.join(fixtureRoot, ".intent/runtime/selection.json");
const originalSource = fs.readFileSync(appFile, "utf8");
const originalSettings = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, "utf8") : null;

async function ensureEditor(page: Page): Promise<void> {
  const panel = page.locator("[data-intent-overlay-root]");
  await expect(panel).toBeVisible();
  if ((await panel.getAttribute("data-intent-collapsed")) === "true") {
    await panel.locator('[data-intent-action="collapse"]').click();
  }
  const save = panel.locator('[data-intent-action="save-settings"]');
  const setupVisible = await save
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (setupVisible) {
    await save.click();
    await expect(save).toBeHidden();
  }
  await expect(panel.locator('[data-intent-action="pick"]')).toBeVisible();
}

async function pickModernCard(page: Page): Promise<void> {
  const panel = page.locator("[data-intent-overlay-root]");
  await panel.locator('[data-intent-action="pick"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-intent-layer-picking", "true");
  await page.locator('[data-testid="modern-card"]').evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

test("composes instrumentation through Vite back to the original TSX source", async ({ request }) => {
  const response = await request.get("/src/App.tsx");
  expect(response.ok()).toBe(true);
  const transformed = await response.text();
  const encodedMap = transformed.match(
    /sourceMappingURL=data:application\/json;base64,([^\r\n]+)/
  )?.[1];
  expect(encodedMap).toBeTruthy();
  const sourceMap = JSON.parse(Buffer.from(encodedMap!, "base64").toString("utf8")) as {
    sourcesContent?: string[];
  };

  expect(sourceMap.sourcesContent).toContain(originalSource);
  expect(sourceMap.sourcesContent?.join("\n")).not.toContain("data-intent-id");
  expect(sourceMap.sourcesContent?.join("\n")).not.toContain("initIntentOverlay");
});

test("previews, applies, and undoes one guarded literal JSX text edit", async ({ page }) => {
  const originalText = "Edit the rendered branch, not a dormant token.";
  const nextText = "Edit the active branch with confidence.";
  expect(originalSource).toContain(`>${originalText}</h2>`);
  await page.goto("/");
  await ensureEditor(page);
  const panel = page.locator("[data-intent-overlay-root]");
  await panel.locator('[data-intent-action="pick"]').click();
  await page.getByRole("heading", { name: originalText }).evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  const editor = panel.locator("[data-intent-text-editor]");
  await expect(editor).toBeVisible();
  const input = editor.locator("[data-intent-text-input]");
  const apply = editor.locator('[data-intent-action="text-apply"]');
  await input.fill(nextText);
  await expect(apply).toBeDisabled();
  await editor.locator('[data-intent-action="text-preview"]').click();
  await expect(apply).toBeEnabled();
  expect(fs.readFileSync(appFile, "utf8")).toBe(originalSource);

  await apply.click();
  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toContain(`>${nextText}</h2>`);
  await expect(page.getByRole("heading", { name: nextText })).toBeVisible();
  await panel.locator('[data-intent-action="undo"]').click();
  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toBe(originalSource);
  await expect(page.getByRole("heading", { name: originalText })).toBeVisible();
});

test("composes a same-file flex layout through visual controls and exact undo", async ({ page }) => {
  expect(originalSource).toContain(
    'className="mx-auto flex max-w-6xl items-center justify-between border-b border-zinc-800 pb-6"'
  );
  await page.goto("/");
  await ensureEditor(page);
  const panel = page.locator("[data-intent-overlay-root]");
  await panel.locator('[data-intent-action="pick"]').click();
  await page.locator("header").evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  const composer = panel.locator('[data-intent-flex-composer="true"]');
  await expect(composer).toBeVisible();
  await expect
    .poll(() => {
      if (!fs.existsSync(selectionFile)) return null;
      const selection = JSON.parse(fs.readFileSync(selectionFile, "utf8")) as {
        selection?: { layout?: { kind?: string; childIds?: string[]; renderedParentCount?: number } | null };
      };
      return selection.selection?.layout ?? null;
    })
    .toMatchObject({ kind: "flex", childIds: expect.any(Array), renderedParentCount: 1 });
  await expect(panel.locator('[data-intent-token="flex"]')).toHaveCount(0);
  await expect(panel.locator('[data-intent-token="items-center"]')).toHaveCount(0);
  await expect(panel.locator('[data-intent-token="justify-between"]')).toHaveCount(0);
  await expect(panel.locator('[data-intent-token="max-w-6xl"]')).toBeVisible();
  await composer.locator('[data-intent-breakpoint="base"]').click();
  await composer.locator('[data-intent-flex-property="direction"][data-intent-flex-value="col"]').click();
  await composer.locator('[data-intent-flex-property="wrap"][data-intent-flex-value="wrap"]').click();
  await composer.locator('select[data-intent-flex-property="justify"]').selectOption("center");
  await composer.locator('select[data-intent-flex-property="align"]').selectOption("start");
  await composer.locator('select[data-intent-flex-property="gap"]').selectOption("gap-6");
  await composer.locator('select[data-intent-flex-property="align-self"]').first().selectOption("center");
  const canvas = composer.locator('[data-intent-flex-canvas="true"]');
  await expect(canvas).toHaveAttribute("data-intent-gap-exact", "true");
  await expect.poll(() => canvas.evaluate((element) => getComputedStyle(element).gap)).toBe("24px");

  await composer.locator('[data-intent-action="flex-preview"]').click();
  const apply = composer.locator('[data-intent-action="flex-apply"]');
  await expect(apply).toBeEnabled();
  expect(fs.readFileSync(appFile, "utf8")).toBe(originalSource);
  await apply.click();
  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toContain(
    "items-start justify-center border-b border-zinc-800 pb-6 flex-col flex-wrap gap-6"
  );
  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toContain('className="min-w-0 self-center"');
  await expect(page.locator("header")).toHaveClass(/\bflex-col\b/);

  await panel.locator('[data-intent-action="undo"]').click();
  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toBe(originalSource);
  await expect(page.locator("header")).not.toHaveClass(/\bflex-col\b/);
});

test.afterAll(() => {
  if (fs.readFileSync(appFile, "utf8") !== originalSource) fs.writeFileSync(appFile, originalSource, "utf8");
  if (originalSettings === null) fs.rmSync(settingsFile, { force: true });
  else fs.writeFileSync(settingsFile, originalSettings, "utf8");
});

test("filters dormant cn tokens and keeps DOM previews source-free until apply", async ({ page }) => {
  expect(originalSource).toContain('"grid min-h-80 gap-6 rounded-lg p-8 shadow-xl transition-colors"');
  await page.goto("/");
  await ensureEditor(page);
  await pickModernCard(page);

  const panel = page.locator("[data-intent-overlay-root]");
  const card = page.locator('[data-testid="modern-card"]');
  const primaryColor = panel.locator('[data-intent-token="bg-brand"]');
  await expect(primaryColor).toBeVisible();
  await expect(panel.locator('[data-intent-token="bg-accent"]')).toHaveCount(0);
  const inactiveNote = panel.locator("[data-intent-runtime-inactive-count]");
  await expect(inactiveNote).toBeVisible();
  expect(Number(await inactiveNote.getAttribute("data-intent-runtime-inactive-count"))).toBeGreaterThanOrEqual(2);

  await expect.poll(() => fs.existsSync(selectionFile)).toBe(true);
  const selection = JSON.parse(fs.readFileSync(selectionFile, "utf8")) as {
    selection: { classTokens: string[] };
  };
  expect(selection.selection.classTokens).toEqual(expect.arrayContaining(["gap-6", "bg-brand", "text-white"]));
  expect(selection.selection.classTokens).not.toContain("bg-accent");

  const originalBackground = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
  const accentSwatch = primaryColor.locator('[data-intent-candidate="bg-accent"]');
  await expect(accentSwatch).toBeVisible();
  await accentSwatch.click();
  await expect(card).toHaveClass(/\bbg-accent\b/);
  await expect(card).not.toHaveClass(/\bbg-brand\b/);
  expect(fs.readFileSync(appFile, "utf8")).toBe(originalSource);
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    originalBackground
  );

  await primaryColor.locator('[data-intent-action="reset-dom-preview"]').click();
  await expect(card).toHaveClass(/\bbg-brand\b/);
  await expect(card).not.toHaveClass(/\bbg-accent\b/);
  expect(fs.readFileSync(appFile, "utf8")).toBe(originalSource);

  const gapRow = panel.locator('[data-intent-token="gap-6"]');
  await expect(gapRow).toBeVisible();
  await gapRow.locator('[data-intent-action="candidate-next"]').click();
  await expect(gapRow.locator("select")).toHaveValue("gap-7");
  await expect(card).toHaveClass(/\bgap-7\b/);
  expect(fs.readFileSync(appFile, "utf8")).toBe(originalSource);

  const apply = gapRow.locator('[data-intent-action="token-apply"]');
  await expect(apply).toBeDisabled();
  await gapRow.locator('[data-intent-action="token-preview"]').click();
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toContain(
    '"grid min-h-80 gap-7 rounded-lg p-8 shadow-xl transition-colors"'
  );
  await expect(card).toHaveClass(/\bgap-7\b/);

  await panel.locator('[data-intent-action="undo"]').click();
  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toBe(originalSource);
  await expect(card).toHaveClass(/\bgap-6\b/);

  await page.locator('[data-testid="mode-toggle"]').evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await pickModernCard(page);
  await expect(panel.locator('[data-intent-token="bg-accent"]')).toBeVisible();
  await expect(panel.locator('[data-intent-token="bg-brand"]')).toHaveCount(0);
});
