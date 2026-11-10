import { expect, test, type Locator, type Page } from '@playwright/test';

// 탐색기 브라우저 검수(K17) — 쥔님이 손으로 하던 단순 검수. 각 테스트는 빈 저장소에서 시작한다.

const tree = (page: Page): Locator => page.getByRole('tree').first();
const row = (page: Page, name: string): Locator => tree(page).getByRole('treeitem').filter({ hasText: name });

/** 줄 안의 이름 바꾸는 입력 칸(검색 칸과 구분) */
const 이름칸 = (page: Page): Locator => tree(page).getByRole('treeitem').getByRole('textbox');

async function 빈저장소(page: Page): Promise<void> {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByRole('button', { name: '새로 만들기' })).toBeVisible();
}

async function 만들기(page: Page, 종류: '새 노트' | '새 폴더'): Promise<void> {
    // 🔴 앱이 뜨는 직후엔 저장소 로딩 리렌더가 메뉴를 닫는다 — 메뉴가 뜰 때까지 열기를 되풀이한다
    const 항목 = page.getByRole('menuitem', { name: 종류, exact: true });
    await expect(async () => {
        if (!(await 항목.isVisible())) await page.getByRole('button', { name: '새로 만들기' }).click();
        await 항목.click({ timeout: 1500 });
    }).toPass({ timeout: 10_000 });
}

/** 고른 줄의 이름을 F2 로 바꾼다 */
async function 이름바꾸기(page: Page, 줄: Locator, 새이름: string): Promise<void> {
    await 줄.click();
    await page.keyboard.press('F2');
    const input = 이름칸(page);
    await expect(input).toBeVisible();
    await input.fill(새이름);
    await input.press('Enter');
}

/** 새로 만들면 곧바로 이름 입력 칸이 열린다 — 이름을 주면 그 이름으로 확정, 없으면 기본 이름 그대로 확정 */
async function 만들고확정(page: Page, 종류: '새 노트' | '새 폴더', 이름?: string): Promise<void> {
    await 만들기(page, 종류);
    const input = 이름칸(page);
    await expect(input).toBeVisible();
    if (이름) await input.fill(이름);
    await input.press('Enter');
    await expect(input).toHaveCount(0);
}

/** 노트 「메모」 + 폴더 「자료」 */
async function 노트와폴더(page: Page): Promise<void> {
    await 만들고확정(page, '새 노트', '메모');
    await 만들고확정(page, '새 폴더', '자료');
    await expect(row(page, '메모')).toHaveCount(1);
    await expect(row(page, '자료')).toHaveCount(1);
}

test.beforeEach(async ({ page }) => { await 빈저장소(page); });

test('① 새로 만들기 — 노트·폴더', async ({ page }) => {
    await 만들고확정(page, '새 노트');
    await expect(row(page, '노트')).toHaveCount(1);
    await 만들고확정(page, '새 폴더');
    await expect(row(page, '폴더')).toHaveCount(1);
});

test('② 이름 바꾸기', async ({ page }) => {
    await 만들고확정(page, '새 노트');
    await 이름바꾸기(page, row(page, '노트'), '회의록');
    await expect(row(page, '회의록')).toHaveCount(1);
    await expect(row(page, '노트')).toHaveCount(0);
});

test('③ 끌어 옮기기 — 노트를 폴더로', async ({ page }) => {
    await 노트와폴더(page);
    const from = (await row(page, '메모').boundingBox())!;
    const to = (await row(page, '자료').boundingBox())!;
    // 폴더 줄 한가운데에 떨구면 「안으로」 — 포인터 이동을 여러 걸음으로 쪼개 끌기 문턱을 넘긴다
    await page.mouse.move(from.x + 40, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + from.height / 2 + 8, { steps: 4 });
    await page.mouse.move(to.x + 40, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();
    // 폴더가 펴져 있고 메모가 한 칸 안쪽(depth 1)으로 들어갔다 — 들여쓰기가 폴더 줄보다 크다
    const 폴더x = (await row(page, '자료').locator('span').first().boundingBox())!.x;
    const 메모x = (await row(page, '메모').locator('span').first().boundingBox())!.x;
    expect(메모x).toBeGreaterThan(폴더x);
});

test('④ 여러 개 고르기 — ⌘/Shift 클릭', async ({ page }) => {
    await 노트와폴더(page);
    await 만들고확정(page, '새 노트', '셋째');
    await row(page, '메모').click();
    await row(page, '셋째').click({ modifiers: ['Shift'] });
    const 선택 = tree(page).locator('[role=treeitem][aria-selected=true]');
    await expect(선택.count()).resolves.toBeGreaterThanOrEqual(2);
    // ⌘/Ctrl 클릭은 하나 더 얹는다
    await row(page, '메모').click();
    await expect(tree(page).locator('[role=treeitem][aria-selected=true]')).toHaveCount(1);
    // playwright.config 가 UA 를 맥으로 고정했다 — 앱의 Mod 는 ⌘(Meta)
    await row(page, '셋째').click({ modifiers: ['Meta'] });
    await expect(tree(page).locator('[role=treeitem][aria-selected=true]')).toHaveCount(2);
});

test('⑤ 휴지통 보내기·되살리기', async ({ page }) => {
    await 노트와폴더(page);
    await row(page, '메모').click();
    await page.keyboard.press('Delete');
    await expect(page.getByText('휴지통 (1)')).toBeVisible();
    await expect(row(page, '메모')).toHaveCount(0);
    await page.getByText('휴지통 (1)').click();
    const 휴지통줄 = page.getByRole('treeitem').filter({ hasText: '메모' });
    await 휴지통줄.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '복원' }).click();
    await expect(page.getByText('휴지통 (0)')).toBeVisible();
    await expect(row(page, '메모')).toHaveCount(1);
});

test('⑥ 새로고침(F5) 뒤에도 상태 유지', async ({ page }) => {
    await 노트와폴더(page);
    await row(page, '메모').click();
    await page.keyboard.press('Delete');
    await expect(page.getByText('휴지통 (1)')).toBeVisible();
    await page.waitForTimeout(800);   // 저장 디바운스
    await page.reload();
    await expect(row(page, '자료')).toHaveCount(1);
    await expect(page.getByText('휴지통 (1)')).toBeVisible();
});

test('⑦ 두 탭 동기화 — 한쪽에서 만든 노드가 다른 쪽에 보임', async ({ context, page }) => {
    const 둘째 = await context.newPage();
    await 둘째.goto('/');
    await expect(둘째.getByRole('button', { name: '새로 만들기' })).toBeVisible();
    await 만들고확정(page, '새 폴더', '공유폴더');
    await expect(row(둘째, '공유폴더')).toHaveCount(1, { timeout: 10_000 });
});

test('⑧ 설정에서 플러그인 껐다 켜기 — 리본에서 사라졌다 돌아옴', async ({ page }) => {
    // 「방 예약」은 다른 플러그인이 기대지 않는 끝가지라 끌 때 확인 단계가 없다
    const 리본 = page.getByRole('button', { name: '방 예약 열기', exact: true });
    await expect(리본).toBeVisible();
    await page.getByRole('button', { name: '설정 열기' }).click();
    await page.getByRole('button', { name: '설치된 플러그인' }).click();
    await page.getByRole('switch', { name: '방 예약 끄기' }).click();
    await expect(리본).toHaveCount(0);
    await page.getByRole('switch', { name: '방 예약 켜기' }).click();
    await expect(리본).toBeVisible();
});

test('⑨ 빈자리 우클릭 — 만들기가 「새로 만들기」 하위 메뉴로 접혀 있다', async ({ page }) => {
    await 노트와폴더(page);
    const 목록 = tree(page).locator('div.overflow-auto').first();
    const 상자 = (await 목록.boundingBox())!;
    await expect(async () => {
        await page.mouse.click(상자.x + 상자.width / 2, 상자.y + 상자.height - 8, { button: 'right' });
        await expect(page.getByRole('menuitem', { name: /^새로 만들기/ })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await expect(page.getByRole('menuitem', { name: '새 폴더', exact: true })).toHaveCount(0);
    await page.getByRole('menuitem', { name: /^새로 만들기/ }).hover();
    await expect(page.getByRole('menuitem', { name: '새 폴더', exact: true })).toBeVisible();
});
