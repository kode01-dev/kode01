import { test, expect } from '@playwright/test';

test.describe('Smoke Test - Critical User Flows', () => {
  
  test.beforeEach(async () => {
    // Increase default timeout for slow dev server compilation
    test.setTimeout(60000);
  });

  test('should load the homepage (or lockscreen)', async ({ page }) => {
    // 1. Load Homepage
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // 2. Check for Logo (exists on both home and lockscreen)
    const logo = page.locator('img[alt="KODE01"]').first();
    await expect(logo).toBeVisible({ timeout: 30000 });

    // 3. Check if we are on the lockscreen or home
    const lockIcon = page.locator('svg.lucide-lock');
    if (await lockIcon.isVisible()) {
        console.log('Site is currently LOCKED. Smoke test verified lockscreen accessibility.');
    } else {
        console.log('Site is UNLOCKED. Proceeding with home check.');
        // Verify we see some main content
        const marketLink = page.locator('a[href*="/market"]').first();
        await expect(marketLink).toBeVisible();
    }
  });

  test('should verify API health (Stress Test script baseline)', async ({ page }) => {
    // Basic API check to ensure backend is alive
    const response = await page.request.get('/api/news/list?locale=en&limit=1');
    expect(response.ok()).toBeTruthy();
  });

});
