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
