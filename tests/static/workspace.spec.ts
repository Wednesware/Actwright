import { expect, test } from '@playwright/test';

test('catalogue groups the revised blocks in both levels and panels resize with pointer and keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Component graph' })).toBeVisible();
  const library = page.getByRole('separator', { name: 'Resize library', exact: true });
  const initialWidth = Number(await library.getAttribute('aria-valuenow'));
  await library.press('ArrowRight');
  await expect(library).toHaveAttribute('aria-valuenow', String(initialWidth + 16));
  const inspector = page.getByRole('separator', { name: 'Resize inspector', exact: true });
  const inspectorWidth = Number(await inspector.getAttribute('aria-valuenow'));
  await inspector.press('ArrowLeft');
  await expect(inspector).toHaveAttribute('aria-valuenow', String(inspectorWidth + 16));
  const terminal = page.getByRole('separator', { name: 'Resize terminal', exact: true });
  const rect = (await terminal.boundingBox())!;
  const height = Number(await terminal.getAttribute('aria-valuenow'));
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y - 48, { steps: 5 });
  await page.mouse.up();
  await expect(terminal).toHaveAttribute('aria-valuenow', String(height + 50));
  await expect(page.locator('.console')).toHaveCSS('height', `${height + 50}px`);
  await page.reload();
  await expect(library).toHaveAttribute('aria-valuenow', String(initialWidth + 16));
  await expect(inspector).toHaveAttribute('aria-valuenow', String(inspectorWidth + 16));
  await expect(terminal).toHaveAttribute('aria-valuenow', String(height + 50));

  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await page.getByRole('button', { name: 'Script', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Script', exact: true }).click();
  const flyout = page.locator('.blocklyToolboxFlyout');
  for (const level of ['1 · Descriptive blocks', '2 · Python blocks']) {
    await page.getByRole('button', { name: level, exact: true }).click();
    await page.getByRole('treeitem', { name: 'Values', exact: true }).click();
    await expect(flyout).not.toContainText('Value:');
    await expect(flyout).toContainText(level.startsWith('1') ? 'Integer:' : 'int');
    await expect(flyout).toContainText(level.startsWith('1') ? 'Decimal:' : 'float');
    await page.getByRole('treeitem', { name: 'Messages', exact: true }).click();
    await expect(flyout).toContainText(level.startsWith('1') ? 'Show a warning:' : 'warning (');
    await expect(flyout).not.toContainText(level.startsWith('1') ? 'Send output' : 'emit (');
    await page.getByRole('treeitem', { name: 'Components', exact: true }).click();
    await expect(flyout).toContainText(level.startsWith('1') ? 'Send output' : 'emit (');
    await page.getByRole('treeitem', { name: 'Control flow', exact: true }).click();
    await expect(flyout).toContainText(level.startsWith('1') ? 'Match value' : 'match');
    await page.getByRole('treeitem', { name: 'Modules', exact: true }).click();
    await expect(flyout).toContainText('si');
    expect(await flyout.locator('.blocklyDraggable').count()).toBeGreaterThanOrEqual(5);
  }
  await page.screenshot({ path: 'test-results/revised-blockly.png' });
  await page.setViewportSize({ width: 1000, height: 800 });
  const left = (await page.locator('.library').boundingBox())!;
  const right = (await page.locator('.inspector').boundingBox())!;
  expect(left.width + right.width).toBeLessThanOrEqual(690);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('separator', { name: 'Resize library', exact: true })).toBeVisible();
});
