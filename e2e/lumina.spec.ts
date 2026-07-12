import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const appFile = path.resolve("test-sites/lumina-atelier/src/App.tsx");
const originalSource = fs.readFileSync(appFile, "utf8");
const settingsFile = path.resolve("test-sites/lumina-atelier/.intent/settings.json");
const originalSettings = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, "utf8") : null;

async function ensureEditor(page: Page): Promise<void> {
  const panel = page.locator("[data-intent-overlay-root]");
  await expect(panel).toBeVisible();
  if ((await panel.getAttribute("data-intent-collapsed")) === "true") {
    await panel.locator('[data-intent-action="collapse"]').click();
  }
  const save = panel.locator('[data-intent-action="save-settings"]');
  if (await save.isVisible().catch(() => false)) await save.click();
  await expect(panel.locator('[data-intent-action="pick"]')).toBeVisible();
}

test.afterAll(() => {
  if (fs.readFileSync(appFile, "utf8") !== originalSource) fs.writeFileSync(appFile, originalSource, "utf8");
  if (originalSettings === null) fs.rmSync(settingsFile, { force: true });
  else fs.writeFileSync(settingsFile, originalSettings, "utf8");
});

test("configures, edits an asymmetric grid, verifies HMR, and undoes exactly", async ({ page }) => {
  expect(originalSource).toContain("md:grid-cols-[1.2fr_0.8fr]");
  await page.goto("/");
  await ensureEditor(page);
  const panel = page.locator("[data-intent-overlay-root]");

  await panel.locator('[data-intent-action="pick"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-intent-layer-picking", "true");
  await page.locator("#top > div.grid").click({ position: { x: 220, y: 120 } });
  const composer = panel.locator('[data-intent-layout-composer="true"]');
  await expect(composer).toBeVisible();
  await composer.locator('[data-intent-breakpoint="md"]').click();
  const firstTrack = composer.locator('[data-intent-grid-track="1"]');
  await expect(firstTrack).toHaveValue("1.2");
  await firstTrack.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "0.8";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await composer.locator('[data-intent-action="grid-preview"]').click();
  const apply = composer.locator('[data-intent-action="grid-apply"]');
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toContain(
    "md:grid-cols-[0.8fr_0.8fr]"
  );
  await expect(panel.locator('[data-intent-action="pick"]')).toBeVisible();

  await panel.locator('[data-intent-action="undo"]').click();
  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toBe(originalSource);

  await panel.locator('[data-intent-action="pick"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-intent-layer-picking", "true");
  await page.locator("#top").evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  const colorRow = panel.locator('[data-intent-token="bg-ink"]');
  await expect(colorRow).toBeVisible();
  await expect(colorRow.locator("option", { hasText: "bg-copper" })).toHaveCount(1);
});

test("keeps the overlay inside a mobile viewport and preserves collapse controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await ensureEditor(page);
  const panel = page.locator("[data-intent-overlay-root]");
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);

  await panel.locator('[data-intent-action="collapse"]').click();
  await expect(panel).toHaveAttribute("data-intent-collapsed", "true");
  await panel.locator('[data-intent-action="collapse"]').click();
  await expect(panel).toHaveAttribute("data-intent-collapsed", "false");
});

test("persists panel settings and applies a project color with exact undo", async ({ page }) => {
  await page.goto("/");
  await ensureEditor(page);
  const panel = page.locator("[data-intent-overlay-root]");

  await panel.locator('[data-intent-action="setup"]').click();
  await panel.getByRole("button", { name: "English", exact: true }).click();
  await panel.getByRole("button", { name: "Left", exact: true }).click();
  await expect(panel).toHaveAttribute("data-intent-dock", "left");
  await panel.getByRole("button", { name: "Compact", exact: true }).click();
  await expect(panel).toHaveAttribute("data-intent-density", "compact");

  await panel.getByRole("button", { name: "Korean", exact: true }).click();
  await panel.getByRole("button", { name: "오른쪽", exact: true }).click();
  await expect(panel).toHaveAttribute("data-intent-dock", "right");
  await panel.getByRole("button", { name: "기본", exact: true }).click();
  await expect(panel).toHaveAttribute("data-intent-density", "comfortable");
  await panel.locator('[data-intent-action="save-settings"]').click();

  await panel.locator('[data-intent-action="setup"]').click();
  await panel.locator('[data-intent-action="pick"]').click();
  await page.locator("#top").evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  const colorRow = panel.locator('[data-intent-token="bg-ink"]');
  await expect(colorRow).toBeVisible();
  await expect(colorRow.locator('option[value="bg-copper"]')).toHaveCount(1);
  await colorRow.locator("select").selectOption("bg-copper");
  await colorRow.getByRole("button", { name: "미리보기", exact: true }).click();
  const apply = colorRow.getByRole("button", { name: "적용", exact: true });
  await expect(apply).toBeEnabled();
  await apply.click();

  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toContain("bg-copper");
  await expect(page.locator("#top")).toHaveClass(/bg-copper/);
  await panel.locator('[data-intent-action="undo"]').click();
  await expect.poll(() => fs.readFileSync(appFile, "utf8")).toBe(originalSource);
  await expect(page.locator("#top")).toHaveClass(/bg-ink/);
});
