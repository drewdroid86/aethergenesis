import { test, expect } from '@playwright/test';

test('verify ÆTHERGENESIS rendering and HUD', async ({ page }) => {
  // Go to the app
  await page.goto('/');

  // Wait for the canvas or mount point to be visible
  await page.waitForSelector('canvas');

  // Check HUD Title
  await expect(page.locator('h1')).toContainText('ÆTHERGENESIS');

  // Check for the Cosmic Age section
  await expect(page.getByText('Cosmic Age (Gyr)')).toBeVisible();

  // Check for the Coordinates section
  await expect(page.getByText('GAL_X:')).toBeVisible();
  await expect(page.getByText('GAL_Y:')).toBeVisible();
  await expect(page.getByText('GAL_Z:')).toBeVisible();

  // Wait a bit for the simulation to run and grain to animate
  await page.waitForTimeout(2000);

  // Take a screenshot
  await page.screenshot({ path: 'final_verification.png' });
});
