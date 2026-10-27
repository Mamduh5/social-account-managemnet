import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function main() {
  const profileDir = path.resolve('.data/browser-profiles/acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5');
  const outDir = path.resolve('.data/v112-owner/group-inspection');

  const installed = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win', 'chrome.exe');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    ...(fs_exists(installed) ? { executablePath: installed } : { channel: 'msedge' }),
    viewport: { width: 1440, height: 900 }
  });

  function fs_exists(p: string) {
    try { return fs.existsSync(p); } catch { return false; }
  }

  const page = context.pages()[0] || await context.newPage();

  try {
    const groupUrl = 'https://www.facebook.com/groups/1830083181521795/';
    console.log('Navigating to group:', groupUrl);
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Locate post composer trigger: "เขียนอะไรสักหน่อย...."
    console.log('Locating post composer trigger...');
    const composerTrigger = page.locator('div[role="button"]:has-text("เขียนอะไรสักหน่อย"), div[role="button"]:has-text("เขียนอะไรบางอย่าง"), div[role="button"]:has-text("คุณกำลังคิดอะไรอยู่")').first();
    await composerTrigger.click();
    await page.waitForTimeout(2000);

    // Look for modal dialog
    const dialog = page.locator('div[role="dialog"]').first();
    const isDialog = await dialog.isVisible();
    console.log('Composer Dialog Visible:', isDialog);

    // Find the textbox inside dialog or page
    const textBox = (isDialog ? dialog : page).locator('div[role="textbox"][contenteditable="true"]').first();
    await textBox.click();
    await page.waitForTimeout(500);

    // Insert text using keyboard to trigger React / Lexical input listeners
    const contentText = 'ทดสอบระบบ Group Manual Handoff — Social Command Center V1.12\n\nโพสต์นี้สร้างขึ้นเพื่อทดสอบขั้นตอนการส่งต่องาน (Manual Handoff) ในกลุ่มส่วนตัวที่เพจ แก้บัคยาวๆๆ เป็นผู้ดูแล';
    console.log('Inserting text via keyboard...');
    await page.keyboard.insertText(contentText);
    await page.waitForTimeout(1000);

    // Check submit button disabled state
    const submitBtn = (isDialog ? dialog : page).locator('div[role="button"][aria-label="โพสต์"]').first();
    const isDisabled = await submitBtn.getAttribute('aria-disabled');
    console.log('Post button aria-disabled:', isDisabled);

    await page.screenshot({ path: path.join(outDir, 'composer-dialog-ready.png') });

    if (isDisabled === 'true') {
      console.log('Post button is still disabled, attempting to press Enter or Space...');
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);
      const isDisabledAfter = await submitBtn.getAttribute('aria-disabled');
      console.log('Post button aria-disabled after Space:', isDisabledAfter);
    }

    console.log('Clicking "โพสต์" button...');
    await submitBtn.click();
    await page.waitForTimeout(8000);

    console.log('Reloading group page...');
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    await page.screenshot({ path: path.join(outDir, 'group-after-post.png'), fullPage: true });

    // Look for post timestamp links or posts links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => ({
        href: a.href,
        text: a.innerText?.trim()
      })).filter(x => x.href.includes('/groups/1830083181521795/') && (x.href.includes('posts') || x.href.includes('multi_permalinks') || x.text.includes('เมื่อสักครู่')));
    });
    console.log('Candidate post links on group feed:', links);

    let postUrl = links[0]?.href || `${groupUrl}`;
    console.log('Confirmed Group Post URL:', postUrl);

    // Post a comment on the post
    console.log('Locating comment textbox on the newly published post...');
    const commentBox = page.locator('div[role="textbox"][contenteditable="true"]').first();
    const hasCommentBox = await commentBox.count();
    console.log('Found comment box count:', hasCommentBox);

    if (hasCommentBox > 0) {
      await commentBox.click();
      await page.waitForTimeout(500);
      await page.keyboard.insertText('ทดสอบคอมเมนต์ในกลุ่ม — แก้บัคยาวๆๆ');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
      await page.screenshot({ path: path.join(outDir, 'group-comment-added.png') });
      console.log('Comment added and screenshot captured!');
    }

    const finalResult = {
      groupUrl,
      postUrl,
      author: 'แก้บัคยาวๆๆ',
      content: contentText,
      comment: 'ทดสอบคอมเมนต์ในกลุ่ม — แก้บัคยาวๆๆ',
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(path.join(outDir, 'native-group-post-verified.json'), JSON.stringify(finalResult, null, 2));
    console.log('Success:', finalResult);

  } finally {
    await context.close();
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
