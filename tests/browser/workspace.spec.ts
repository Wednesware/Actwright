import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Component graph' })).toBeVisible();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
});
async function example(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: /Untitled Act/ }).click();
  await page.getByRole('button', { name: 'Explore example', exact: true }).click();
  await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(5);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
}

async function createScript(page: Page, focused = true) {
  if (focused) await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await page.getByRole('button', { name: 'Script', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Script', exact: true }).click();
  await expect(page.locator('.script-card')).toHaveCount(1);
}

test('add, edit, drag, undo, autosave and recover a real graph', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Add a Stage2D', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Add Stage2D' })).toBeVisible();
  await dialog.getByLabel('Constructor width').fill('12');
  await dialog.getByLabel('Constructor height').fill('8');
  await dialog.getByRole('button', { name: 'Add component', exact: true }).click();
  await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(2);
  await expect(page.getByLabel('width', { exact: true })).toHaveValue('12');
  await page.getByLabel('Display name').fill('Main board');
  await page.getByLabel('Display name').press('Tab');
  await expect(page.locator('.node-heading strong', { hasText: 'Main board' })).toBeVisible();
  const heading = page.locator('.act-node').filter({ has: page.locator('strong', { hasText: 'Main board' }) }).locator('.node-heading');
  const rect = await heading.boundingBox();
  if (!rect) throw new Error('Rendered node has no bounding box');
  await page.mouse.move(rect.x + 100, rect.y + 30); await page.mouse.down();
  await page.mouse.move(rect.x + 180, rect.y + 90, { steps: 10 }); await page.mouse.up();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.node-heading strong', { hasText: 'Main board' })).toBeVisible();
  await page.getByRole('button', { name: 'Act tree' }).click();
  await page.getByRole('button', { name: /Main board.*stage2d0/ }).click();
  await page.getByLabel('Display name').fill('Changed'); await page.getByLabel('Display name').press('Tab');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Display name')).toHaveValue('Main board');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('example renders real signal/trigger relationships and links preserve node identity', async ({ page }) => {
  await example(page);
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(1);
  await expect(page.locator('svg.graph-wire.trigger')).toHaveCount(1);
  await expect(page.locator('svg.graph-wire.link')).toHaveCount(1);
  await page.getByRole('button', { name: 'Act tree' }).click();
  await page.locator('.tree-item').filter({ hasText: 'player, hero' }).click();
  await page.getByText('Add a link', { exact: true }).click();
  await page.getByLabel('Link alias', { exact: true }).fill('shortcut');
  await page.getByRole('button', { name: 'Create shortcut link' }).click();
  await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(5);
  await expect(page.locator('svg.graph-wire.link')).toHaveCount(2);
  await expect(page.locator('.tree-item').filter({ hasText: 'shortcut' })).toBeVisible();
  await page.getByRole('button', { name: 'Unlink shortcut', exact: true }).click();
  await expect(page.locator('svg.graph-wire.link')).toHaveCount(1);
  await page.getByRole('button', { name: 'Signals', exact: true }).click();
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Signals', exact: true }).click();
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(1);
});

test('keyboard-accessible connection dialog creates a Silicon signal', async ({ page }) => {
  await example(page);
  await page.getByRole('button', { name: 'Act tree' }).click();
  await page.locator('.tree-item').filter({ hasText: 'InputMap' }).click();
  await page.getByRole('button', { name: 'Remove signal action' }).click();
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (const name of ['Source component', 'Source member', 'Target component', 'Target member']) {
    await expect(dialog.getByLabel(name, { exact: true })).toHaveAccessibleName(name);
  }
  await dialog.getByLabel('Source component', { exact: true }).selectOption({ label: 'InputMap · keys' });
  await dialog.getByLabel('Source member', { exact: true }).selectOption('action');
  await dialog.getByLabel('Target component', { exact: true }).selectOption({ label: 'GridMovement · movement' });
  await dialog.getByLabel('Target member', { exact: true }).selectOption('command');
  await dialog.getByRole('button', { name: 'Create connection' }).click();
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(1);
  await page.getByRole('button', { name: /Problems/ }).click();
  await expect(page.getByText('No project validation problems.')).toBeVisible();
});

test('portable .act save/import restores editable relationships as a new local Act', async ({ page }, testInfo) => {
  await example(page);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save .act' }).click();
  const download = await downloadEvent;
  const path = testInfo.outputPath('sample.act'); await download.saveAs(path);
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(5);
  await expect(page.getByText(/Imported.*Internal identities/)).toBeVisible();
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(1);
  await expect(page.locator('svg.graph-wire.trigger')).toHaveCount(1);
  await expect(page.locator('svg.graph-wire.link')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(5);
});

test('concurrent tabs cannot silently overwrite one another and can preserve a recovery copy', async ({ page, context }) => {
  const other = await context.newPage(); await other.goto('/');
  await expect(other.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect Game', exact: true }).click();
  await page.getByLabel('Act name', { exact: true }).fill('First tab'); await page.getByLabel('Act name', { exact: true }).press('Tab');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await other.getByRole('button', { name: 'Inspect Game', exact: true }).click();
  await other.getByLabel('Act name', { exact: true }).fill('Second tab'); await other.getByLabel('Act name', { exact: true }).press('Tab');
  await expect(other.getByRole('alert')).toContainText('changed in another tab');
  await other.getByRole('button', { name: 'Save edits as new Act' }).click();
  await expect(other.getByText('Saved locally', { exact: true })).toBeVisible();
  await other.getByRole('button', { name: 'Inspect Game', exact: true }).click();
  await expect(other.getByLabel('Act name', { exact: true })).toHaveValue('Second tab recovered');
  await page.reload(); await page.getByRole('button', { name: 'Inspect Game', exact: true }).click();
  // Recent points at the recovered copy, but the original also remains in Projects.
  await page.getByRole('banner').getByRole('button', { name: /Second tab recovered/ }).click();
  await expect(page.locator('.project-open strong').filter({ hasText: 'First tab' })).toBeVisible();
  await other.close();
});

test('workspace remains usable on a compact screen with both themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Hide library' }).click();
  await page.getByRole('button', { name: 'Hide inspector' }).click();
  await expect(page.getByRole('heading', { name: 'Component graph' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/compact-light.png' });
});

test('skipping the tutorial persists across reloads and new Acts and the top-bar button restarts it', async ({ page }) => {
  const tutorial = page.getByRole('region', { name: 'Workspace tutorial', exact: true });
  await expect(tutorial.getByRole('button', { name: 'Add a Stage2D', exact: true })).toBeVisible();
  await tutorial.getByRole('button', { name: 'Skip tutorial', exact: true }).click();
  await expect(tutorial).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Component graph' })).toBeVisible();
  await expect(tutorial).toHaveCount(0);
  await page.getByRole('banner').getByRole('button', { name: /Untitled Act/ }).click();
  await page.getByRole('button', { name: 'Create Act', exact: true }).click();
  await page.getByRole('textbox', { name: 'Act name', exact: true }).fill('A quiet workspace');
  await page.getByRole('button', { name: 'Create Act', exact: true }).click();
  await expect(page.getByRole('banner').getByRole('button', { name: /A quiet workspace/ })).toBeVisible();
  await expect(tutorial).toHaveCount(0);
  await page.getByRole('button', { name: 'Start tutorial', exact: true }).click();
  await expect(tutorial.getByRole('button', { name: 'Add a Stage2D', exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(1);
});

test('completing the tutorial hides it permanently until manually restarted', async ({ page }) => {
  const tutorial = page.getByRole('region', { name: 'Workspace tutorial', exact: true });
  await tutorial.getByRole('button', { name: 'Add a Stage2D', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add component', exact: true }).click();
  await tutorial.getByRole('button', { name: 'Inspect your stage' }).click();
  await expect(page.getByRole('heading', { name: 'Stage2D', exact: true })).toBeVisible();
  await tutorial.getByRole('button', { name: 'Finish tutorial', exact: true }).click();
  await expect(tutorial).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(2);
  await expect(tutorial).toHaveCount(0);
  await page.getByRole('button', { name: 'Start tutorial', exact: true }).click();
  await tutorial.getByRole('button', { name: 'Continue with the existing stage' }).click();
  await expect(tutorial.getByRole('button', { name: 'Inspect your stage' })).toBeVisible();
  await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(2);
});

test('scripting runs hello on game start, supports pause/restart, and distinguishes save from Python export', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await createScript(page);
  await expect(page.locator('.blocklySvg')).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.console-line p', { hasText: /^hello$/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await expect(page.locator('.runtime-status')).toContainText('paused');
  await page.getByRole('button', { name: 'Resume game', exact: true }).click();
  await expect(page.locator('.runtime-status')).toContainText('running');
  await page.getByRole('button', { name: 'Restart game', exact: true }).click();
  await expect(page.locator('.console-line p', { hasText: /^hello$/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Stop game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  const pythonEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .py', exact: true }).click();
  const python = await pythonEvent;
  expect(python.suggestedFilename()).toMatch(/\.py$/);
  await python.saveAs(testInfo.outputPath('hello.py'));
  const actEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save .act', exact: true }).click();
  const act = await actEvent;
  expect(act.suggestedFilename()).toMatch(/\.act$/);
  const path = testInfo.outputPath('hello.act'); await act.saveAs(path);
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByText(/Imported.*Internal identities/)).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.console-line p', { hasText: /^hello$/ })).toHaveCount(3);
  await page.getByRole('button', { name: 'Stop game', exact: true }).click();
  expect(errors).toEqual([]);
});

test('Python editor preserves invalid drafts, checks errors, and round-trips opaque source through blocks', async ({ page }) => {
  await createScript(page);
  await page.getByRole('button', { name: '3 · Python', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Python script', exact: true });
  await expect(input).toBeVisible();
  await input.press('ControlOrMeta+A'); await page.keyboard.insertText('if True print("hello")');
  await page.getByRole('button', { name: 'Check Python', exact: true }).click();
  await expect(page.locator('.script-feedback')).toContainText('Line 1');
  await expect(page.locator('.monaco-editor .squiggly-error')).toBeVisible();
  await page.getByRole('button', { name: '1 · Descriptive blocks', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Python errors' })).toContainText('Line 1');
  await page.getByRole('button', { name: 'Collapse script On game start', exact: true }).click();
  await page.getByRole('button', { name: /Line 1:.*View in Python/ }).click();
  await expect(input).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/Fix the Python draft/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop game' })).toHaveCount(0);
  const source = '# Keep this comment\nfor value in range(2):\n    print("custom", value)';
  await input.press('ControlOrMeta+A'); await page.keyboard.insertText(source);
  await page.getByRole('button', { name: '2 · Python blocks', exact: true }).click();
  await expect(page.locator('.blocklySvg')).toBeVisible();
  await page.getByRole('button', { name: '3 · Python', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('Keep this comment');
  await page.getByRole('button', { name: 'Check Python', exact: true }).click();
  await expect(page.locator('.script-feedback')).toContainText('Ready to run');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.console-line p', { hasText: /^custom 0$/ })).toBeVisible();
  await expect(page.locator('.console-line p', { hasText: /^custom 1$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Stop game', exact: true }).click();
});

test('visual script edits survive reload in both blocks and Python', async ({ page }) => {
  await createScript(page);
  const printField = page.locator('.blocks-editor .blocklyEditableField').filter({ hasText: 'hello' }).first();
  await printField.dblclick();
  const field = page.locator('.blocklyHtmlInput');
  await field.fill('edited in blocks'); await field.press('Enter');
  await page.getByRole('button', { name: '3 · Python', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('edited in blocks');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('edited in blocks');
  await page.getByRole('button', { name: '1 · Descriptive blocks', exact: true }).click();
  await expect(page.locator('.blocks-editor .blocklyBlockCanvas').filter({ hasText: 'edited in blocks' })).toHaveCount(1);
});

test('compact script graph cards edit descriptions, open Scripts, and preserve identity and source', async ({ page }) => {
  await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click();
  await createScript(page, false);
  const node = page.locator('.script-graph-node');
  await expect(node.locator('.blocklySvg,.monaco-editor')).toHaveCount(0);
  const scriptId = await node.getAttribute('data-node-id');
  await node.getByRole('textbox', { name: /Description for/ }).fill('Places the player and prints the board.');
  await node.getByRole('textbox', { name: /Description for/ }).press('Tab');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await node.getByRole('button', { name: 'Edit Script', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Scripts', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.blocklySvg')).toBeVisible();
  await page.locator('.blocklyEditableField').filter({ hasText: 'hello' }).first().dblclick();
  await page.locator('.blocklyHtmlInput').fill('hello from Scripts'); await page.locator('.blocklyHtmlInput').press('Enter');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.blocklySvg')).toHaveCSS('background-color', 'rgb(237, 240, 246)');
  await page.getByRole('button', { name: 'Component workspace', exact: true }).click();
  await expect(node.locator('.blocklySvg,.monaco-editor')).toHaveCount(0);
  await expect(node.getByRole('textbox', { name: /Description for/ })).toHaveValue('Places the player and prints the board.');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(node).toHaveAttribute('data-node-id', scriptId!);
  await expect(node.getByRole('textbox', { name: /Description for/ })).toHaveValue('Places the player and prints the board.');
  await node.getByRole('button', { name: 'Edit Script', exact: true }).click();
  await expect(page.locator('.blocklyBlockCanvas').filter({ hasText: 'hello from Scripts' })).toHaveCount(1);
});

test('workspace tabs keep their widths and only the active tab has an underline; sockets remain unclipped', async ({ page }) => {
  const components = page.getByRole('button', { name: 'Component workspace', exact: true }), scripts = page.getByRole('button', { name: 'Scripts', exact: true });
  const before = await scripts.boundingBox();
  await expect(scripts).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');
  const sockets = page.locator('.node-port.output .output-socket');
  await expect(sockets.first()).toHaveCSS('overflow', 'visible');
  await expect(sockets.first()).toHaveCSS('flex-shrink', '0');
  await scripts.click();
  const after = await scripts.boundingBox();
  expect(after?.width).toBe(before?.width); expect(after?.x).toBe(before?.x);
  await expect(components).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');
  await expect(scripts).toHaveCSS('border-bottom-color', 'rgb(168, 154, 255)');
});

test('both block levels offer the same syntax and Python converts to editable blocks without a raw-code toolbox entry', async ({ page }) => {
  await createScript(page);
  await page.getByRole('button', { name: '3 · Python', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Python script', exact: true });
  await input.press('ControlOrMeta+A');
  await page.keyboard.insertText('score = 0\nfor item in [1, 2, 3]:\n    score += item\nprint(score)');
  await page.getByRole('button', { name: '1 · Descriptive blocks', exact: true }).click();
  await expect(page.locator('.blocklyBlockCanvas').filter({ hasText: 'For each' })).toHaveCount(1);
  await expect(page.locator('.blocklyBlockCanvas').filter({ hasText: 'Show a message:' })).toHaveCount(1);
  const firstCategories = await page.locator('.blocklyTreeLabel').allTextContents();
  await page.getByRole('button', { name: '2 · Python blocks', exact: true }).click();
  await expect(page.locator('.blocklyBlockCanvas').filter({ hasText: 'for' })).toHaveCount(1);
  expect(await page.locator('.blocklyTreeLabel').allTextContents()).toEqual(firstCategories);
  await page.getByRole('treeitem', { name: /Control flow/ }).click();
  await expect(page.locator('.blocklyToolboxFlyout')).toContainText('while');
  await expect(page.locator('.blocklyToolboxFlyout')).not.toContainText('Preserved source');
});

test('Modules offers Nitrogen require in both levels and the renamed categories are visible', async ({ page }) => {
  await createScript(page);
  await expect(page.getByRole('treeitem', { name: 'Functions & Classes', exact: true })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Errors', exact: true })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Functions', exact: true })).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: 'Errors & resources', exact: true })).toHaveCount(0);
  await page.getByRole('treeitem', { name: 'Modules', exact: true }).click();
  await expect(page.locator('.blocklyToolboxFlyout')).toContainText('Load publication');
  await expect(page.locator('.blocklyToolboxFlyout')).toContainText('si');
  await page.getByRole('button', { name: '2 · Python blocks', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Modules', exact: true }).click();
  await expect(page.locator('.blocklyToolboxFlyout')).toContainText('require (');
});

test('Typed values and Components toolbox entries are available in both levels with component types and icons', async ({ page }) => {
  await example(page);
  await createScript(page);
  for (const level of ['1 · Descriptive blocks', '2 · Python blocks']) {
    await page.getByRole('button', { name: level, exact: true }).click();
    await page.getByRole('treeitem', { name: 'Values', exact: true }).click();
    await expect(page.locator('.blocklyToolboxFlyout')).not.toContainText('Value:');
    await expect(page.locator('.blocklyToolboxFlyout')).toContainText(level.startsWith('1') ? 'Integer:' : 'int');
    await page.getByRole('treeitem', { name: 'Components', exact: true }).click();
    const flyout = page.locator('.blocklyToolboxFlyout');
    await expect(flyout).toContainText(level.startsWith('1') ? 'New instance of' : 'new_instance(');
    await expect(flyout).toContainText(level.startsWith('1') ? 'New singleton' : 'new_singleton(');
    for (const name of ['game · First Act', 'parent', 'Stage2D', 'Entity', 'InputMap', 'GridMovement']) await expect(flyout).toContainText(name);
    expect(await flyout.locator('image:visible').count()).toBeGreaterThanOrEqual(6);
  }
});

test('Remove relationship deletes real signal, trigger and link connections and supports Undo', async ({ page }) => {
  await example(page);
  for (const kind of ['signal', 'trigger', 'link']) {
    const wire = page.locator(`svg.graph-wire.${kind}`);
    await expect(wire).toHaveCount(1);
    // Dispatch the native context menu on the path; the click on its menu item is a real pointer interaction.
    await wire.locator('.wire-hit').evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { clientX: 700, clientY: 420, bubbles: true })));
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Remove relationship', exact: true }).click();

    await expect(wire).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(wire).toHaveCount(1);
  }
});

test('script Output sockets stay on graph edges while editing happens only in Scripts', async ({ page }) => {
  await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click();
  await page.getByRole('button', { name: 'Add Score', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add component', exact: true }).click();
  await createScript(page, false);
  const node = page.locator('.script-graph-node');
  await node.getByRole('button', { name: 'Edit Script', exact: true }).click();
  await page.getByRole('button', { name: '3 · Python', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Python script', exact: true });
  await input.press('ControlOrMeta+A'); await page.keyboard.insertText('assert parent is game\nemit("points", 7)\nprint("sent")');
  await page.getByRole('button', { name: 'Check Python', exact: true }).click();
  await page.getByRole('button', { name: 'Component workspace', exact: true }).click();
  const socket = node.locator('[data-port="output:out:points"] .act-socket');
  await expect(socket).toBeVisible();
  const box = await node.boundingBox(), point = await socket.boundingBox();
  expect(Math.abs(point!.x + point!.width / 2 - box!.x - box!.width)).toBeLessThan(8);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Source component', { exact: true }).selectOption({ label: 'Script · On game start' });
  await dialog.getByLabel('Source member', { exact: true }).selectOption('points');
  await dialog.getByLabel('Target component', { exact: true }).selectOption({ label: 'Score · score0' });
  await dialog.getByLabel('Target member', { exact: true }).selectOption('add');
  await dialog.getByRole('button', { name: 'Create connection', exact: true }).click();
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(1);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.console-line p', { hasText: /^sent$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Stop game', exact: true }).click();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible(); await page.reload();
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(1);
  await node.getByRole('button', { name: 'Edit Script', exact: true }).click();
  await page.getByRole('button', { name: '1 · Descriptive blocks', exact: true }).click();
  await page.locator('.script-card .blocklyBlockCanvas .blocklyEditableField').filter({ hasText: /^points$/ }).dblclick();
  await page.locator('.blocklyHtmlInput').fill('renamed'); await page.locator('.blocklyHtmlInput').press('Enter');
  await page.getByRole('button', { name: 'Component workspace', exact: true }).click();
  await expect(node.locator('[data-port="output:out:renamed"]')).toBeVisible();
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(0);
});

test('Blockly drag follows the pointer at different zoom levels in Scripts', async ({ page }) => {
  await createScript(page);
  const card = page.locator('.script-card');
  await expect(card.locator('.blocklySvg')).toBeVisible();
  for (const zoom of ['Zoom out', 'Zoom in']) {
    await card.getByRole('button', { name: zoom, exact: true }).press('Enter');
    const block = card.locator('.blocklyBlockCanvas > g').filter({ hasText: 'Show a message:' }).first();
    const label = block.locator('text').filter({ hasText: 'Show a message:' }).first();
    const before = await block.boundingBox(), handle = await label.boundingBox();
    if (!before || !handle) throw new Error('Blockly block is not rendered');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2 + 35, { steps: 12 });
    const during = await page.locator('.blocklyDragging').filter({ hasText: 'Show a message:' }).first().boundingBox();
    await page.mouse.up();
    expect(Math.abs(during!.x - before.x - 60)).toBeLessThan(5);
    expect(Math.abs(during!.y - before.y - 35)).toBeLessThan(5);
  }
});

test('component references and variable expressions survive dragging from the toolbox and switching levels', async ({ page }) => {
  await example(page);
  await createScript(page);
  const editor = page.locator('.blocks-editor');
  async function dragFlyout(text: string) {
    const block = page.locator('.blocklyToolboxFlyout .blocklyBlockCanvas > g').filter({ hasText: text }).first();
    const source = await block.boundingBox(), target = await editor.locator('.blocklyMainBackground').first().boundingBox();
    if (!source || !target) throw new Error('Blockly toolbox or canvas is missing');
    await page.mouse.move(source.x + 25, source.y + 15); await page.mouse.down();
    await page.mouse.move(target.x + target.width - 190, target.y + target.height - 160, { steps: 15 }); await page.mouse.up();
    await page.getByRole('treeitem', { name: /Variables|Values|Components/ }).first().press('Escape');
  }
  await page.getByRole('treeitem', { name: 'Components', exact: true }).click();
  await dragFlyout('Stage2D');
  await page.getByRole('button', { name: '2 · Python blocks', exact: true }).click();
  await expect(editor.locator('.blocklyBlockCanvas').filter({ hasText: 'Stage2D' })).toHaveCount(1);
  await page.getByRole('button', { name: '1 · Descriptive blocks', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Variables', exact: true }).click();
  await dragFlyout('Value named');
  const code = editor.getByRole('button', { name: /Edit text: empty/ }).first();
  await code.dblclick();
  await page.locator('.blocklyHtmlInput').fill('"hello".upper()'); await page.locator('.blocklyHtmlInput').press('Enter');
  await page.getByRole('button', { name: '3 · Python', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('100d306b-5d0b-44f9-a1c6-d11d6155722a');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('"hello".upper()');
  await page.getByRole('button', { name: 'Check Python', exact: true }).click();
  await expect(page.locator('.script-feedback')).toContainText('Ready to run');
});

test('terminal prompts create a named entity on the board, survive reload, and cancel on Stop', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles('examples/interactive-player-board.act');
  await expect(page.getByText(/Imported interactive-player-board.act/)).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const prompt = page.getByRole('form', { name: 'Python input prompt' });
  await expect(prompt).toContainText('New entity ID:');
  await expect(page.locator('.console-line p', { hasText: /^\|\.\.@\.\.\.\|$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Terminal input', exact: true }).fill('player');
  await prompt.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.locator('.console-line p', { hasText: /player is already taken/ })).toBeVisible();
  await expect(prompt).toContainText('New entity ID:');
  await page.getByRole('textbox', { name: 'Terminal input', exact: true }).fill('friend');
  await prompt.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(prompt).toContainText('New entity name:');
  await page.reload();
  await expect(prompt).toContainText('New entity name:');
  await page.getByRole('textbox', { name: 'Terminal input', exact: true }).fill('Nova');
  await prompt.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.locator('.console-line p', { hasText: 'Created entity ID: friend | name: Nova' })).toBeVisible();
  await expect(page.locator('.console-line p', { hasText: /^\|\.\.N\.\.\.\|$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Restart game', exact: true }).click();
  await expect(prompt).toContainText('New entity ID:');
  await page.getByRole('button', { name: 'Stop game', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
  await expect(page.locator('.console-line.error')).toHaveCount(0);
});

test('graph nodes resize at graph zoom, keep sockets on edges, and retain dimensions after reload', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles('examples/player-on-a-board.act');
  await expect(page.getByText(/Imported player-on-a-board.act/)).toBeVisible();
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  const node = page.locator('.script-graph-node');
  const before = await node.boundingBox(), grip = await node.getByRole('button', { name: /Resize/ }).boundingBox();
  if (!before || !grip) throw new Error('Resize handle is missing');
  const logicalBefore = await node.evaluate(element => ({ width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight }));
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 55, grip.y + grip.height / 2 + 35, { steps: 12 }); await page.mouse.up();
  const after = await node.boundingBox();
  expect(Math.abs(after!.width - before.width - 55)).toBeLessThan(3);
  expect(Math.abs(after!.height - before.height - 35)).toBeLessThan(3);
  const logicalAfter = await node.evaluate(element => ({ width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight }));
  expect(logicalAfter.width).toBeGreaterThan(logicalBefore.width);
  for (const socket of await node.locator('.node-port.output .act-socket').all()) {
    const point = await socket.boundingBox(); expect(Math.abs(point!.x + point!.width / 2 - after!.x - after!.width)).toBeLessThan(8);
  }
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(2);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible(); await page.reload();
  expect(await node.evaluate(element => ({ width: (element as HTMLElement).offsetWidth, height: (element as HTMLElement).offsetHeight }))).toEqual(logicalAfter);
  await node.getByRole('button', { name: /Resize/ }).press('ArrowRight');
  await expect.poll(() => node.evaluate(element => (element as HTMLElement).offsetWidth)).toBe(logicalAfter.width + 10);
  const board = page.locator('[data-testid="graph-node"]').filter({ has: page.locator('.node-heading strong', { hasText: /^Board$/ }) });
  const width = await board.evaluate(element => (element as HTMLElement).offsetWidth);
  await board.getByRole('button', { name: 'Resize Board', exact: true }).press('ArrowRight');
  await expect.poll(() => board.evaluate(element => (element as HTMLElement).offsetWidth)).toBe(width + 10);
  await page.screenshot({ path: '/tmp/actwright-compact-scripts.png' });
});

test('UI sounds play on controls and mute and volume persist; hover motion respects reduced motion', async ({ page }) => {
  await page.evaluate(() => {
    const scope = window as unknown as { toneCount: number }; scope.toneCount = 0;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { scope.toneCount++; return create.call(this); };
  });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { toneCount: number }).toneCount)).toBeGreaterThan(0);
  const volume = page.getByRole('slider', { name: 'UI sound volume', exact: true });
  await volume.press('Home');
  for (let index = 0; index < 5; index++) await volume.press('ArrowRight');
  await expect(volume).toHaveValue('5');
  await page.getByRole('button', { name: 'Test sound', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Mute UI sounds', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Test sound', exact: true })).toBeDisabled();
  const count = await page.evaluate(() => (window as unknown as { toneCount: number }).toneCount);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { toneCount: number }).toneCount)).toBe(count);
  await page.getByRole('button', { name: 'Done', exact: true }).click(); await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Mute UI sounds', exact: true })).toBeChecked();
  await expect(volume).toHaveValue('5');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.act-node').first()).toHaveCSS('transition-duration', '0s');
});

async function pointNearConnection(page: Page, kind: string, distance = 6) {
  let stable: { x: number; y: number } | null = null;
  await expect.poll(async () => {
    const candidates = page.locator(`svg.graph-wire.${kind}`);
    const point = await (kind === 'hierarchy' ? candidates.last() : candidates.first()).locator('.wire-hit').evaluate((element, offset) => {
      const path = element as SVGPathElement, svg = path.closest('svg')!, length = path.getTotalLength(), matrix = path.getScreenCTM()!;
      for (const ratio of [.5, .35, .65, .2, .8, .1, .9]) {
        const first = path.getPointAtLength(length * ratio).matrixTransform(matrix), next = path.getPointAtLength(length * ratio + 1).matrixTransform(matrix);
        const dx = next.x - first.x, dy = next.y - first.y, magnitude = Math.hypot(dx, dy);
        const x = first.x - dy / magnitude * offset, y = first.y + dx / magnitude * offset;
        if (document.elementFromPoint(x, y)?.closest('svg')?.getAttribute('data-edge-id') === svg.getAttribute('data-edge-id')) return { x, y };
      }
      return null;
    }, distance);
    const ready = point && stable && Math.hypot(point.x - stable.x, point.y - stable.y) < .2;
    stable = point; return !!ready;
  }).toBe(true);
  return stable!;
}

test('widened connections select off the visible stroke and delete by button or keyboard at different zooms', async ({ page }) => {
  await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click();
  await example(page);
  const wire = page.locator('svg.graph-wire.signal');
  const selected = page.getByRole('region', { name: 'Selected connection', exact: true });
  for (const method of ['Delete', 'button', 'Backspace']) {
    if (method === 'button') { await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); }
    const point = await pointNearConnection(page, 'signal');
    await page.mouse.move(point.x, point.y);
    await expect.poll(() => wire.locator('.wire-line').evaluate(element => { const path = element as SVGPathElement, matrix = path.getScreenCTM()!; return parseFloat(getComputedStyle(path).strokeWidth) * Math.hypot(matrix.a, matrix.b); })).toBeCloseTo(3, 1);
    await page.mouse.click(point.x, point.y);
    await expect(selected).toContainText('InputMap.action → GridMovement.command');
    await expect(wire).toHaveClass(/selected/);
    if (method === 'button') await selected.getByRole('button', { name: 'Delete connection', exact: true }).click();
    else await page.keyboard.press(method);
    await expect(wire).toHaveCount(0);
    await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(5);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(wire).toHaveCount(1);
  }
});

test('wide connection targets support right-click deletion and hierarchy selection preserves components', async ({ page }) => {
  await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click();
  await example(page);
  const signal = await pointNearConnection(page, 'signal');
  await page.mouse.click(signal.x, signal.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove relationship', exact: true }).click();
  await expect(page.locator('svg.graph-wire.signal')).toHaveCount(0);
  const hierarchyCount = await page.locator('svg.graph-wire.hierarchy').count();
  const hierarchy = await pointNearConnection(page, 'hierarchy');
  await page.mouse.click(hierarchy.x, hierarchy.y);
  await expect(page.getByRole('region', { name: 'Selected connection', exact: true })).toContainText('Canonical parent');
  await page.keyboard.press('Delete');
  await expect(page.locator('svg.graph-wire.hierarchy')).toHaveCount(hierarchyCount);
  await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(5);
  await page.getByRole('region', { name: 'Selected connection', exact: true }).getByRole('button', { name: 'Edit parent', exact: true }).click();
  await expect(page.getByLabel('Canonical parent', { exact: true })).toBeVisible();
});


test('Python editor matches both themes and favorite icons are centered', async ({ page }) => {
  const card = page.locator('.library-card').filter({ hasText: 'Entity' }).first();
  await card.hover();
  const centered = await card.evaluate(element => {
    const card = element.getBoundingClientRect();
    const button = element.querySelector('.favorite-button')!.getBoundingClientRect();
    const icon = element.querySelector('.favorite-button svg')!.getBoundingClientRect();
    return [Math.abs((card.top + card.bottom - button.top - button.bottom) / 2), Math.abs((button.top + button.bottom - icon.top - icon.bottom) / 2), Math.abs((button.left + button.right - icon.left - icon.right) / 2)];
  });
  for (const offset of centered) expect(offset).toBeLessThan(1);
  await createScript(page);
  await page.getByRole('button', { name: '3 · Python', exact: true }).click();
  await expect(page.locator('.monaco-editor-background').first()).toHaveCSS('background-color', 'rgb(16, 19, 28)');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.monaco-editor-background').first()).toHaveCSS('background-color', 'rgb(237, 240, 246)');
});

test('long Python scripts check, save visual layouts, and create game-bound components on startup', async ({ page }) => {
  await createScript(page);
  await page.getByRole('button', { name: '3 · Python', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Python script', exact: true });
  const source = [...Array.from({ length: 60 }, (_, i) => `value_${i} = ${i}`),
    'board = new_instance("silicon.Stage2D", "board", game, 6, 4)',
    'player = new_instance("silicon.Entity", "player", board, name="Nova")',
    'score = new_singleton("silicon.Score", player)',
    'score.ins.add(7)',
    'print(player.name, score.value)',
  ].join('\n');
  await input.press('ControlOrMeta+A'); await page.keyboard.insertText(source);
  await page.getByRole('button', { name: 'Check Python', exact: true }).click();
  await expect(page.locator('.script-feedback')).toContainText('Ready to run');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '2 · Python blocks', exact: true }).click();
  await expect(page.locator('.blocklySvg')).toBeVisible();
  await expect(page.locator('.blocklyWorkspace .blocklyText').filter({ hasText: 'new_instance(' }).first()).toBeAttached();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.console-line p', { hasText: /^Nova 7$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Stop game', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await page.getByRole('button', { name: '3 · Python', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('value_0');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.console-line p', { hasText: /^Nova 7$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Stop game', exact: true }).click();
});
