import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  resolveParentPostStatus,
  canRetryDestination,
  canCancelDestination,
} from '../server/src/domain/publishing.js';
import {
  calculateWatermarkPosition,
  resolveSafeArea,
} from '../server/src/domain/branding.js';

describe('Domain Rules & Calculations - Unit Tests', () => {
  // 1. Publishing Parent Status Resolution
  test('resolveParentPostStatus: correctly evaluates composite publication states', () => {
    // All published => completed
    assert.strictEqual(resolveParentPostStatus(['published', 'published']), 'completed');

    // All failed => failed
    assert.strictEqual(resolveParentPostStatus(['failed', 'failed']), 'failed');

    // Mixed: 1 published, 1 failed, 0 in progress => partial_failure
    assert.strictEqual(resolveParentPostStatus(['published', 'failed']), 'partial_failure');

    // Mixed with ongoing job => processing (not yet resolved)
    assert.strictEqual(resolveParentPostStatus(['published', 'failed', 'uploading']), 'processing');
    assert.strictEqual(resolveParentPostStatus(['published', 'failed', 'preparing']), 'processing');
    assert.strictEqual(resolveParentPostStatus(['published', 'failed', 'branding']), 'processing');

    // Empty => processing
    assert.strictEqual(resolveParentPostStatus([]), 'processing');
  });

  // 2. Retry Eligibility Rules
  test('canRetryDestination: enforces retry limits and prevents retrying published items', () => {
    // Published destination cannot be retried
    assert.strictEqual(canRetryDestination('published', 0, 3), false);

    // Failed destination with retries remaining can be retried
    assert.strictEqual(canRetryDestination('failed', 0, 3), true);
    assert.strictEqual(canRetryDestination('failed', 2, 3), true);
    assert.strictEqual(canRetryDestination('failed', 3, 3), true);

    // Failed destination exceeding max retries cannot be retried
    assert.strictEqual(canRetryDestination('failed', 4, 3), false);
  });

  // 3. Cancellation Rules
  test('canCancelDestination: only allows cancellation before upload begins', () => {
    assert.strictEqual(canCancelDestination('scheduled'), true);
    assert.strictEqual(canCancelDestination('preparing'), true);
    assert.strictEqual(canCancelDestination('branding'), true);

    assert.strictEqual(canCancelDestination('uploading'), false);
    assert.strictEqual(canCancelDestination('published'), false);
    assert.strictEqual(canCancelDestination('failed'), false);
  });

  // 4. Safe Area Resolution
  test('resolveSafeArea: defaults to platform specifications for 9:16 and 16:9', () => {
    const safe916 = resolveSafeArea('9:16');
    assert.strictEqual(safe916.top, 120);
    assert.strictEqual(safe916.bottom, 280);
    assert.strictEqual(safe916.left, 40);
    assert.strictEqual(safe916.right, 80);

    const safe169 = resolveSafeArea('16:9');
    assert.strictEqual(safe169.top, 60);
    assert.strictEqual(safe169.bottom, 80);

    // Custom overrides merge properly
    const custom = resolveSafeArea('9:16', { top: 150 });
    assert.strictEqual(custom.top, 150);
    assert.strictEqual(custom.bottom, 280);
  });

  // 5. Watermark Motion Formulas
  test('calculateWatermarkPosition: keeps watermark strictly within safe bounds across presets', () => {
    const safeArea = { top: 120, bottom: 280, left: 40, right: 80 };
    const width = 1080;
    const height = 1920;
    const textW = 200;
    const textH = 40;

    const minX = safeArea.left; // 40
    const maxX = width - textW - safeArea.right; // 1080 - 200 - 80 = 800
    const minY = safeArea.top; // 120
    const maxY = height - textH - safeArea.bottom; // 1920 - 40 - 280 = 1600

    // Test smooth sine at multiple timestamps
    for (let t = 0; t <= 14; t += 0.5) {
      const pos = calculateWatermarkPosition({
        t,
        containerWidth: width,
        containerHeight: height,
        textWidth: textW,
        textHeight: textH,
        preset: 'smooth_sine',
        safeArea,
        speedSeconds: 14,
      });

      assert.ok(pos.x >= minX - 0.01 && pos.x <= maxX + 0.01, `x (${pos.x}) must be between ${minX} and ${maxX}`);
      assert.ok(pos.y >= minY - 0.01 && pos.y <= maxY + 0.01, `y (${pos.y}) must be between ${minY} and ${maxY}`);
    }

    // Test corner jump quadrant hopping
    const pos0 = calculateWatermarkPosition({
      t: 1, containerWidth: width, containerHeight: height, textWidth: textW, textHeight: textH,
      preset: 'corner_jump', safeArea, intervalSeconds: 5,
    });
    assert.strictEqual(pos0.x, minX);
    assert.strictEqual(pos0.y, minY);

    const pos1 = calculateWatermarkPosition({
      t: 6, containerWidth: width, containerHeight: height, textWidth: textW, textHeight: textH,
      preset: 'corner_jump', safeArea, intervalSeconds: 5,
    });
    assert.strictEqual(pos1.x, maxX);
    assert.strictEqual(pos1.y, minY);
  });
});
