import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const SERVER_BASE = 'http://127.0.0.1:3001';
const ACCOUNT_ID = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5'; // Page A: แก้บัคยาวๆๆ (Graph ID: 409347032254077)
const DRAFT_ID = 'draft-3d0788ac-d9f6-4382-85b6-b8a47f0f3fa2';
const OUTPUT_DIR = path.resolve('docs/content/assets/app-force-close-guide');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function getSlideHtml(slideNumber: number): string {
  const commonStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Kanit:wght@500;600;700;800&family=Prompt:wght@300;400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 1080px;
      height: 1350px;
      background: #0B0F17;
      color: #F8FAFC;
      font-family: 'Prompt', sans-serif;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 70px 65px;
      position: relative;
    }
    .bg-glow-1 {
      position: absolute;
      width: 600px;
      height: 600px;
      top: -150px;
      right: -100px;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.08) 0%, rgba(11, 15, 23, 0) 70%);
      pointer-events: none;
    }
    .bg-glow-2 {
      position: absolute;
      width: 500px;
      height: 500px;
      bottom: -100px;
      left: -100px;
      background: radial-gradient(circle, rgba(16, 185, 129, 0.06) 0%, rgba(11, 15, 23, 0) 70%);
      pointer-events: none;
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 35px;
    }
    .brand-pill {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(71, 85, 105, 0.6);
      padding: 10px 22px;
      border-radius: 9999px;
      font-size: 20px;
      font-weight: 500;
      color: #38BDF8;
      font-family: 'Kanit', sans-serif;
      letter-spacing: 0.5px;
    }
    .page-indicator {
      display: inline-flex;
      align-items: center;
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(71, 85, 105, 0.5);
      padding: 8px 20px;
      border-radius: 12px;
      font-size: 20px;
      font-weight: 600;
      color: #94A3B8;
      font-family: 'Inter', sans-serif;
    }
    .header-section {
      margin-bottom: 38px;
    }
    .main-title {
      font-family: 'Kanit', sans-serif;
      font-size: 44px;
      font-weight: 700;
      line-height: 1.25;
      color: #FFFFFF;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }
    .sub-title {
      font-size: 23px;
      font-weight: 400;
      color: #94A3B8;
      line-height: 1.4;
    }
    .card {
      background: rgba(17, 24, 39, 0.85);
      border: 1px solid rgba(51, 65, 85, 0.6);
      border-radius: 20px;
      padding: 28px 32px;
      backdrop-filter: blur(12px);
    }
    .footer-bar {
      margin-top: 30px;
      padding: 20px 28px;
      border-radius: 16px;
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(71, 85, 105, 0.4);
      font-size: 19px;
      color: #CBD5E1;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .footer-disclaimer {
      font-size: 15px;
      color: #64748B;
    }
  `;

  if (slideNumber === 1) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>${commonStyles}</style>
      </head>
      <body>
        <div class="bg-glow-1"></div>
        <div class="bg-glow-2"></div>
        <div>
          <div class="top-bar">
            <div class="brand-pill">แก้บัคยาวๆๆ • สาระไอทีใกล้ตัว</div>
            <div class="page-indicator">1 / 3</div>
          </div>
          <div class="header-section">
            <h1 class="main-title">ปัดแอปในมือถือทิ้งบ่อยๆ...<br>สรุปช่วยประหยัดแบตเตอรี่จริงไหม?</h1>
            <p class="sub-title">สิ่งที่ผู้พัฒนาทั้ง Apple และ Google แนะนำจริงๆ คืออะไร</p>
          </div>

          <div style="display: flex; flex-direction: column; gap: 24px;">
            <!-- Card 1: Common Misconception -->
            <div class="card" style="border-left: 6px solid #F59E0B;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-family: 'Kanit'; font-size: 22px; font-weight: 600; color: #FBBF24;">ความเข้าใจผิดยอดฮิต</span>
                <span style="font-size: 16px; color: #94A3B8; font-family: 'Inter'; background: rgba(245, 158, 11, 0.15); padding: 4px 12px; border-radius: 6px;">COMMON HABIT</span>
              </div>
              <p style="font-size: 22px; line-height: 1.5; color: #F1F5F9; font-weight: 400;">
                หลายคนติดนิสัยเปิดหน้า App Switcher แล้วคอยรูดปิดแอปทิ้งทุกครั้งหลังใช้งาน เพราะเชื่อว่าจะช่วยคืน RAM และช่วยให้แบตเตอรี่ใช้งานได้ยาวนานขึ้น
              </p>
            </div>

            <!-- Card 2: Official Documentation Reality -->
            <div class="card" style="border-left: 6px solid #10B981; background: rgba(16, 185, 129, 0.05);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-family: 'Kanit'; font-size: 22px; font-weight: 600; color: #34D399;">คำแนะนำจากคู่มือทางการ (Apple & Google)</span>
                <span style="font-size: 16px; color: #10B981; font-family: 'Inter'; background: rgba(16, 185, 129, 0.15); padding: 4px 12px; border-radius: 6px;">OFFICIAL FACT</span>
              </div>
              <p style="font-size: 22px; line-height: 1.5; color: #F8FAFC; font-weight: 400;">
                ผู้พัฒนาระบุตรงกันว่า <strong style="color: #38BDF8; font-weight: 600;">ไม่จำเป็นต้องคอยไล่ปิดแอปที่ทำงานปกติ</strong> เพราะระบบปฏิบัติการถูกออกแบบให้บริหารจัดการทรัพยากรและพักสถานะแอปให้อัตโนมัติอยู่แล้ว
              </p>
            </div>

            <!-- Official Quote Callout Box -->
            <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 16px; padding: 22px 28px;">
              <div style="font-family: 'Inter'; font-size: 15px; font-weight: 600; color: #38BDF8; margin-bottom: 6px; letter-spacing: 0.5px;">
                APPLE SUPPORT OFFICIAL GUIDANCE
              </div>
              <div style="font-size: 20px; color: #E2E8F0; line-height: 1.5; font-style: italic;">
                "คุณควรปิดแอปเฉพาะเมื่อแอปไม่ตอบสนองเท่านั้น" (You should only close an app if it's unresponsive)
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="footer-bar">
            <span>สรุป: การไล่ปัดแอปทิ้งเป็นประจำ ไม่ได้ช่วยประหยัดแบตเตอรี่ในการใช้งานทั่วไป</span>
            <span class="footer-disclaimer">* อ้างอิงตามเอกสาร Apple Support & Android Developers</span>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  if (slideNumber === 2) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>${commonStyles}</style>
      </head>
      <body>
        <div class="bg-glow-1"></div>
        <div class="bg-glow-2"></div>
        <div>
          <div class="top-bar">
            <div class="brand-pill">เบื้องหลังการทำงาน • System Architecture</div>
            <div class="page-indicator">2 / 3</div>
          </div>
          <div class="header-section">
            <h1 class="main-title">ระบบจัดการหน่วยความจำ<br>ทำงานอย่างไรในพื้นหลัง?</h1>
            <p class="sub-title">ทำไมระบบปฏิบัติการยุคนี้ ถึงไม่จำเป็นต้องให้ผู้ใช้คอยปิดแอป</p>
          </div>

          <div style="display: flex; flex-direction: column; gap: 20px;">
            <!-- Mechanism 1: Suspended State -->
            <div class="card" style="border-left: 6px solid #38BDF8;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-family: 'Kanit'; font-size: 21px; font-weight: 600; color: #38BDF8;">1. การระงับการทำงานอัตโนมัติ (Suspended / Cached)</span>
                <span style="font-family: 'Inter'; font-size: 15px; color: #94A3B8; background: #1E293B; padding: 4px 10px; border-radius: 6px;">RAM MANAGEMENT</span>
              </div>
              <p style="font-size: 20px; line-height: 1.5; color: #E2E8F0;">
                เวลาเราสลับหน้าจอออกจากแอป ระบบจะจำกัดหรือระงับการประมวลผลไว้ชั่วคราว ข้อมูลที่พักอยู่ใน RAM ไม่ได้สูบแบตเตอรี่อย่างต่อเนื่อง และเมื่อระบบต้องการพื้นที่ จะทยอยเคลียร์แอปเก่าออกเองโดยอัตโนมัติ
              </p>
            </div>

            <!-- Mechanism 2: Cold Start Overhead -->
            <div class="card" style="border-left: 6px solid #A855F7;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-family: 'Kanit'; font-size: 21px; font-weight: 600; color: #C084FC;">2. ภาระการโหลดใหม่เมื่อเปิดแอป (Cold Start Overhead)</span>
                <span style="font-family: 'Inter'; font-size: 15px; color: #C084FC; background: rgba(168, 85, 247, 0.15); padding: 4px 10px; border-radius: 6px;">CPU CYCLES</span>
              </div>
              <p style="font-size: 20px; line-height: 1.5; color: #E2E8F0;">
                การดึงแอปเดิมที่พักอยู่ในหน่วยความจำ จะพร้อมใช้งานได้เร็วกว่าและใช้พลังงานน้อยกว่าการเปิดแอปที่ถูกปิดสนิทไปแล้ว ซึ่งระบบต้องอ่านไฟล์จาก Storage และเริ่มประมวลผลใหม่ทั้งหมดตั้งแต่ต้น
              </p>
            </div>

            <!-- Mechanism 3: Real Way to Save Battery -->
            <div class="card" style="border-left: 6px solid #10B981; background: rgba(16, 185, 129, 0.04);">
              <div style="font-family: 'Kanit'; font-size: 21px; font-weight: 600; color: #34D399; margin-bottom: 8px;">
                วิธีประหยัดพลังงานที่ตรงจุดตามคำแนะนำของผู้ผลิต
              </div>
              <p style="font-size: 20px; line-height: 1.5; color: #CBD5E1;">
                หากต้องการประหยัดแบตเตอรี่ ให้เข้าไปเช็กที่เมนู <strong>Settings > Battery</strong> เพื่อดูว่าแอปไหนใช้พลังงานผิดปกติ และปรับปิด Background App Refresh หรือจำกัดสิทธิ์ Location ของแอปนั้น
              </p>
            </div>
          </div>
        </div>

        <div>
          <div class="footer-bar">
            <span>สรุป: การสลับแอปที่พักไว้ ใช้พลังงานน้อยกว่าการสั่งให้ระบบโหลดแอปใหม่ทั้งหมด</span>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Slide 3
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>${commonStyles}</style>
    </head>
    <body>
      <div class="bg-glow-1"></div>
      <div class="bg-glow-2"></div>
      <div>
        <div class="top-bar">
          <div class="brand-pill">คำแนะนำการใช้งาน • Best Practices</div>
          <div class="page-indicator">3 / 3</div>
        </div>
        <div class="header-section">
          <h1 class="main-title">แล้วเวลาไหนที่ควร<br>"ปัดปิดแอป" จริงๆ?</h1>
          <p class="sub-title">กรณีที่ผู้ผลิตระบบแนะนำให้สั่ง Force Close</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- Scenario 1 -->
          <div class="card" style="padding: 24px 28px; border-left: 6px solid #F43F5E;">
            <div style="font-family: 'Kanit'; font-size: 21px; font-weight: 600; color: #FB7185; margin-bottom: 6px;">
              1. แอปค้าง จอดำ หรือไม่ตอบสนอง (Unresponsive)
            </div>
            <p style="font-size: 19px; line-height: 1.5; color: #CBD5E1;">
              เมื่อแอปหยุดทำงาน กดปุ่มอะไรไม่ไป หรือค้างอยู่ในลูปที่แก้ไขไม่ได้ การปัดปิดเป็นขั้นตอนมาตรฐานเพื่อบังคับหยุดและเริ่มการทำงานใหม่
            </p>
          </div>

          <!-- Scenario 2 -->
          <div class="card" style="padding: 24px 28px; border-left: 6px solid #F59E0B;">
            <div style="font-family: 'Kanit'; font-size: 21px; font-weight: 600; color: #FBBF24; margin-bottom: 6px;">
              2. เกิดข้อผิดพลาด เช่น เสียงเพลงหรือภาพยังเล่นค้างอยู่
            </div>
            <p style="font-size: 19px; line-height: 1.5; color: #CBD5E1;">
              หากปิดหน้าต่างไปแล้วแต่ยังมีเสียงหรือกิจกรรมเบื้องหลังทำงานค้างผิดปกติ การปิดแอปจะช่วยตัดกระบวนการนั้นได้อย่างสมบูรณ์
            </p>
          </div>

          <!-- Scenario 3 -->
          <div class="card" style="padding: 24px 28px; border-left: 6px solid #10B981;">
            <div style="font-family: 'Kanit'; font-size: 21px; font-weight: 600; color: #34D399; margin-bottom: 6px;">
              3. สำหรับแอปทั่วไปที่ทำงานปกติดี
            </div>
            <p style="font-size: 19px; line-height: 1.5; color: #CBD5E1;">
              ปล่อยให้ระบบปฏิบัติการบริหารจัดการหน่วยความจำและรอบประมวลผลเอง เครื่องจะทำงานได้ลื่นไหลและตอบสนองได้เร็วที่สุด
            </p>
          </div>
        </div>
      </div>

      <div>
        <div class="card" style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(71, 85, 105, 0.4); margin-top: 22px; padding: 20px 26px;">
          <div style="font-size: 18px; line-height: 1.4; color: #94A3B8;">
            <strong style="color: #F8FAFC;">แหล่งข้อมูลอ้างอิง:</strong> คู่มือทางการจาก Apple Support (*Close an app on your iPhone*) และ Android Developers Documentation (*Processes and Application Lifecycle*)
          </div>
        </div>

        <div class="footer-bar" style="margin-top: 18px;">
          <span>เพจ แก้บัคยาวๆๆ • ติดตามเกร็ดไอทีและการแก้ปัญหาใกล้ตัว</span>
          <span class="footer-disclaimer">#แก้บัคยาวๆๆ #iOS #Android</span>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function renderVisuals() {
  console.log('--- 1. Rendering 3 Corrected Visuals with Headless Edge (1080x1350) ---');
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

  const slidePaths: string[] = [];

  for (let i = 1; i <= 3; i++) {
    const html = getSlideHtml(i);
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const filePath = path.join(OUTPUT_DIR, `slide_${i}.png`);
    await page.screenshot({ path: filePath, type: 'png' });
    const stat = fs.statSync(filePath);
    console.log(`Rendered Corrected Slide ${i}: ${filePath} (${stat.size} bytes)`);
    slidePaths.push(filePath);
  }

  await browser.close();
  return slidePaths;
}

async function uploadImages(slidePaths: string[]): Promise<any[]> {
  console.log('\n--- 2. Uploading Corrected Images (POST /api/publishing/images) ---');
  const uploadedMedia: any[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const filePath = slidePaths[i];
    const fileBytes = fs.readFileSync(filePath);
    const blob = new Blob([fileBytes], { type: 'image/png' });
    const form = new FormData();
    form.append('image', blob, path.basename(filePath));

    const res = await fetch(`${SERVER_BASE}/api/publishing/images`, {
      method: 'POST',
      body: form
    });

    const data = await res.json() as any;
    if (!res.ok) {
      throw new Error(`Upload failed for Slide ${i + 1}: ${JSON.stringify(data)}`);
    }

    console.log(`Uploaded Slide ${i + 1}: mediaId=${data.image.id}, sha256=${data.image.sha256}`);
    uploadedMedia.push(data.image);
  }

  return uploadedMedia;
}

async function updateDraftToRevision2(uploadedMedia: any[]) {
  console.log('\n--- 3. Updating Existing Draft to Revision 2 (PUT /api/publishing/drafts/:id) ---');

  const correctedCaption = `หลายคนมีนิสัยติดมือ เวลาเล่นมือถือเสร็จต้องเปิดหน้า App Switcher แล้วไล่ปัดปิดแอปทั้งหมดทิ้งรัวๆ เพราะคิดว่าจะช่วยประหยัดแบตเตอรี่และทำให้เครื่องลื่นขึ้น

แต่ในความเป็นจริง ทั้ง Apple และ Google ต่างระบุในเอกสารคู่มือทางการตรงกันว่า ผู้ใช้ "ไม่จำเป็นต้องคอยไล่ปิดแอป" ในการใช้งานปกติ

ในคู่มือ Apple Support ระบุคำแนะนำไว้อย่างชัดเจนว่า: "คุณควรปิดแอปเฉพาะเมื่อแอปไม่ตอบสนองเท่านั้น" (You should only close an app if it's unresponsive)

สาเหตุที่ระบบออกแบบมาแบบนี้:
1. ระบบจัดการ RAM อัตโนมัติ: เวลาเราสลับออกจากแอป ระบบปฏิบัติการจะจำกัดหรือระงับการทำงาน (Suspend) ของแอปไว้ชั่วคราว การมีข้อมูลแอปพักอยู่ใน RAM ไม่ได้แปลว่ามันกำลังสูบพลังงานตลอดเวลา และเมื่อมีแอปใหม่ต้องการพื้นที่ RAM ระบบจะจัดสรรและทยอยเคลียร์ข้อมูลเก่าออกเองโดยอัตโนมัติ
2. ลดภาระการโหลดใหม่: การสลับกลับเข้าแอปที่พักอยู่ในหน่วยความจำ จะพร้อมใช้งานได้เร็วกว่าและใช้การประมวลผลน้อยกว่าการเปิดแอปที่ถูกปิดสนิทไปแล้ว ซึ่งเครื่องต้องโหลดไฟล์และโค้ดทั้งหมดขึ้นมาจาก Storage ใหม่ตั้งแต่ต้น

แล้วเวลาไหนที่ควรปัดแอปทิ้งจริงๆ?
ควรทำเฉพาะเมื่อ:
- แอปค้าง จอดำ หมุนติ้ว หรือกดไม่ไป
- แอปมีบัคทำงานผิดปกติ เช่น เสียงหรือวิดีโอยังเล่นค้างอยู่

ถ้าอยากประหยัดแบตเตอรี่อย่างตรงจุดจริงๆ แนะนำให้เข้าไปดูที่เมนู Settings > Battery เพื่อเช็กว่าแอปไหนใช้พลังงานสูงผิดปกติ แล้วเลือกปิดสิทธิ์ Background App Refresh หรือจำกัดการเข้าถึง Location สำหรับแอปที่ไม่จำเป็น จะได้ผลตรงจุดกว่าการไล่ปัดแอปทิ้ง

#แก้บัคยาวๆๆ #iOS #Android`;

  const payload = {
    revision: 1, // Current revision to update from
    title: 'ปัดแอปในมือถือทิ้งบ่อยๆ ช่วยประหยัดแบตเตอรี่จริงไหม (เจาะลึกระบบ iOS & Android)',
    contentType: 'multi_image',
    destinations: [
      {
        accountId: ACCOUNT_ID,
        caption: correctedCaption,
        hashtags: '#แก้บัคยาวๆๆ #iOS #Android',
        attachments: [
          {
            mediaId: uploadedMedia[0].id,
            altText: 'สไลด์ 1: ปัดแอปในมือถือทิ้งบ่อยๆ ช่วยประหยัดแบตเตอรี่จริงไหม คำแนะนำจากผู้ผลิต Apple & Google'
          },
          {
            mediaId: uploadedMedia[1].id,
            altText: 'สไลด์ 2: ระบบจัดการหน่วยความจำทำงานอย่างไรในพื้นหลัง และวิธีประหยัดพลังงานที่ตรงจุด'
          },
          {
            mediaId: uploadedMedia[2].id,
            altText: 'สไลด์ 3: แล้วเวลาไหนที่ควรปัดปิดแอปจริงๆ กรณีที่คู่มือแนะนำให้สั่ง Force Close'
          }
        ],
        applyBranding: false
      }
    ]
  };

  const res = await fetch(`${SERVER_BASE}/api/publishing/drafts/${DRAFT_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(`Draft update failed: ${JSON.stringify(data)}`);
  }

  console.log('Draft Updated Successfully!');
  console.log(`Draft ID: ${data.draft.id}`);
  console.log(`New Revision: ${data.draft.revision}`);
  console.log(`Status: ${data.draft.status} (MUST BE "draft")`);
  console.log(`Approved Revision: ${data.draft.approved_revision || 'null'}`);
  console.log(`Queued Post ID: ${data.draft.queued_post_id || 'null'}`);
  return data.draft;
}

async function main() {
  const slidePaths = await renderVisuals();
  const uploadedMedia = await uploadImages(slidePaths);
  const draft = await updateDraftToRevision2(uploadedMedia);
  console.log('\n=== Revision 2 Complete: Preserved In Place as Unapproved Draft ===');
}

main().catch(err => {
  console.error('Error updating candidate:', err);
  process.exit(1);
});
