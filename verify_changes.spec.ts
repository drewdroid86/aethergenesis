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

  // Verify touch support class is present on the mount point
  // Better: look for the div with cursor-crosshair
  const canvasContainer = page.locator('div.cursor-crosshair');
  await expect(canvasContainer).toHaveClass(/touch-none/);

  // Attempt to click the center to trigger interaction (though hitting a star is not guaranteed)
  const viewportSize = page.viewportSize();
  if (viewportSize) {
    await page.mouse.click(viewportSize.width / 2, viewportSize.height / 2);
  }

  // Wait a bit for the simulation to run and grain to animate
  await page.waitForTimeout(2000);

  // Take a screenshot
  await page.screenshot({ path: 'final_verification.png' });
});
