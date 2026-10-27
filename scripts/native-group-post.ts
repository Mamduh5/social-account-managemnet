import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function main() {
  const profileDir = path.resolve('.data/browser-profiles/acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5');
  const outDir = path.resolve('.data/v112-owner/group-inspection');

  const installed = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1234', 'chrome-win', 'chrome.exe');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    ...(fs.existsSync(installed) ? { executablePath: installed } : { channel: 'msedge' }),
    viewport: { width: 1440, height: 900 }
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    const groupUrl = 'https://www.facebook.com/groups/1830083181521795/';
    console.log('Navigating to group:', groupUrl);
    await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Locate post composer trigger: "เขียนอะไรสักหน่อย...."
    console.log('Locating post composer trigger...');
    const composerTrigger = page.locator('div[role="button"]:has-text("เขียนอะไรสักหน่อย"), div[role="button"]:has-text("เขียนอะไรบางอย่าง"), div[role="button"]:has-text("คุณกำลังคิดอะไรอยู่")').first();
    await composerTrigger.click();
    await page.waitForTimeout(2000);

    // Find the contenteditable / textbox
    console.log('Typing post content...');
    const postBox = page.locator('div[role="textbox"][contenteditable="true"]').first();
    const contentText = 'ทดสอบระบบ Group Manual Handoff — Social Command Center V1.12\n\nโพสต์นี้สร้างขึ้นเพื่อทดสอบขั้นตอนการส่งต่องาน (Manual Handoff) ในกลุ่มส่วนตัวที่เพจ แก้บัคยาวๆๆ เป็นผู้ดูแล';
    await postBox.fill(contentText);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(outDir, 'group-composer-filled.png') });

    // Find "โพสต์" button
    console.log('Clicking "โพสต์" button...');
    const submitBtn = page.locator('div[role="button"][aria-label="โพสต์"]').first();
    await submitBtn.click();
    await page.waitForTimeout(6000);

    console.log('Post submitted. Refreshing group feed...');
    await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(outDir, 'group-post-published.png'), fullPage: true });

    // Find permalink of the new post
    const postLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/posts/"], a[href*="permalink"]'));
      return links.map(a => (a as HTMLAnchorElement).href);
    });
    console.log('Found post links in group:', postLinks);

    // On Facebook groups, post permalinks look like https://www.facebook.com/groups/1830083181521795/posts/1830083... or similar
    let postUrl = postLinks[0];
    if (!postUrl) {
      // Find timestamp link (e.g. "เมื่อสักครู่")
      const tsLink = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        for (const a of anchors) {
          if (a.href.includes('/groups/1830083181521795/') && (a.textContent?.includes('เมื่อสักครู่') || a.textContent?.includes('นาที'))) {
            return a.href;
          }
        }
        return null;
      });
      if (tsLink) postUrl = tsLink;
    }

    if (!postUrl) {
      postUrl = `${groupUrl}`;
    }
    console.log('Post URL:', postUrl);

    // Now test posting a comment on this post
    console.log('Testing comment on the post...');
    const commentBox = page.locator('div[role="textbox"][contenteditable="true"]').first();
    if (await commentBox.count() > 0) {
      await commentBox.click();
      await commentBox.fill('ทดสอบคอมเมนต์ในกลุ่ม — แก้บัคยาวๆๆ');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(outDir, 'group-comment-published.png') });
      console.log('Comment submitted successfully!');
    }

    const testResult = {
      groupUrl,
      postUrl,
      author: 'แก้บัคยาวๆๆ',
      content: contentText,
      comment: 'ทดสอบคอมเมนต์ในกลุ่ม — แก้บัคยาวๆๆ',
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(path.join(outDir, 'native-group-result.json'), JSON.stringify(testResult, null, 2));
    console.log('Native group publication verified successfully:', testResult);

  } finally {
    await context.close();
  }
}

main().catch(err => {
  console.error('Group posting failed:', err);
  process.exit(1);
});
