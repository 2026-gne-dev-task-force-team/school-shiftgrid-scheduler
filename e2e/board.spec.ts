import { expect, test, type Locator, type Page } from '@playwright/test';

// 작업현황판 막대·서랍 핵심 동작. 각 테스트는 빈 저장소(서랍 닫힘)에서 시작한다.

const 서랍 = (page: Page): Locator => page.locator('.sgb-drawer');
const 막대 = (page: Page): Locator => page.locator('.sgb-toggle');

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(막대(page)).toBeVisible();
    await expect(서랍(page)).not.toHaveClass(/open/);
});

test('막대를 누르면 서랍이 열리고 앱 본문은 밀리지 않는다(덮기)', async ({ page }) => {
    const 본문 = page.locator('#root');
    const 전 = await 본문.boundingBox();
    await 막대(page).click();
    await expect(서랍(page)).toHaveClass(/open/);
    await expect(서랍(page)).toBeVisible();
    const 후 = await 본문.boundingBox();
    expect(후!.y).toBe(전!.y);
});

test('닫기 셋 — 막대 · Esc · scrim 각각으로 닫힌다', async ({ page }) => {
    const 열기 = async () => { await 막대(page).click(); await expect(서랍(page)).toHaveClass(/open/); };
    await 열기();
    await 막대(page).click();
    await expect(서랍(page)).not.toHaveClass(/open/);

    await 열기();
    await page.keyboard.press('Escape');
    await expect(서랍(page)).not.toHaveClass(/open/);

    await 열기();
    // 서랍은 높이 85% — 그 아래 맨 밑 줄은 scrim 이 받는다
    const 높이 = page.viewportSize()!.height;
    await page.mouse.click(10, 높이 - 10);
    await expect(서랍(page)).not.toHaveClass(/open/);
});

test('열고 새로고침하면 열린 채 복원된다', async ({ page }) => {
    await 막대(page).click();
    await expect(서랍(page)).toHaveClass(/open/);
    await page.reload();
    await expect(서랍(page)).toHaveClass(/open/);
    await expect(서랍(page)).toBeVisible();
});

test('메뉴가 열려 있으면 Esc 는 메뉴만 닫고, 닫힌 서랍에서 불편 접수는 서랍을 연다', async ({ page }) => {
    await 막대(page).click();
    await expect(서랍(page)).toHaveClass(/open/);
    await page.locator('.sgb').getByRole('button', { name: '더 보기', exact: true }).click();
    const 메뉴 = page.locator('.sgb .menu');
    await expect(메뉴).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(메뉴).toBeHidden();
    await expect(서랍(page)).toHaveClass(/open/);

    // 닫은 뒤 불편 접수
    await page.keyboard.press('Escape');
    await expect(서랍(page)).not.toHaveClass(/open/);
    await page.locator('.sgb-bar').getByRole('button', { name: '불편 접수' }).click();
    await expect(서랍(page)).toHaveClass(/open/);
    await expect(서랍(page).getByRole('textbox').first()).toBeVisible();
});
