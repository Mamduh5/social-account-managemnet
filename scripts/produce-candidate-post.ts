import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const SERVER_BASE = 'http://127.0.0.1:3001';
const ACCOUNT_ID = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5'; // Page A: แก้บัคยาวๆๆ
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
      margin-bottom: 40px;
    }
    .main-title {
      font-family: 'Kanit', sans-serif;
      font-size: 44px;
      font-weight: 700;
      line-height: 1.25;
      color: #FFFFFF;
      margin-bottom: 14px;
      letter-spacing: -0.5px;
    }
    .sub-title {
      font-size: 24px;
      font-weight: 400;
      color: #94A3B8;
      line-height: 1.4;
    }
    .card {
      background: rgba(17, 24, 39, 0.85);
      border: 1px solid rgba(51, 65, 85, 0.6);
      border-radius: 20px;
      padding: 32px 34px;
      backdrop-filter: blur(12px);
    }
    .footer-bar {
      margin-top: 35px;
      padding: 22px 30px;
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
            <h1 class="main-title">ปัดแอปทิ้งบ่อยๆ...<br>สรุปช่วยประหยัดแบตเตอรี่จริงไหม?</h1>
            <p class="sub-title">เจาะลึกความเชื่อยอดฮิตที่หลายคนทำติดเป็นนิสัยทุกวัน</p>
          </div>

          <div style="display: flex; flex-direction: column; gap: 24px;">
            <!-- Comparison Card 1: Belief -->
            <div class="card" style="border-left: 6px solid #EF4444;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <span style="font-family: 'Kanit'; font-size: 22px; font-weight: 600; color: #F87171;">ความเชื่อทั่วไป</span>
                <span style="font-size: 18px; color: #94A3B8; font-family: 'Inter';">MYTH</span>
              </div>
              <p style="font-size: 24px; line-height: 1.5; color: #F1F5F9; font-weight: 500;">
                "เปิดแอปค้างไว้เยอะๆ เครื่องจะช้าและเปลืองแบตเตอรี่ ว่างเมื่อไหร่ต้องรูดปิดแอปทิ้งให้หมดหน้าจอเพื่อคืน RAM"
              </p>
            </div>

            <!-- Comparison Card 2: Technical Reality -->
            <div class="card" style="border-left: 6px solid #10B981; background: rgba(16, 185, 129, 0.05);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <span style="font-family: 'Kanit'; font-size: 22px; font-weight: 600; color: #34D399;">ความจริงจากผู้ผลิตระบบ (Apple & Google)</span>
                <span style="font-size: 18px; color: #10B981; font-family: 'Inter';">FACT</span>
              </div>
              <p style="font-size: 24px; line-height: 1.5; color: #F8FAFC; font-weight: 400;">
                วิศวกรยืนยันตรงกันว่า การไล่ปัดปิดแอปพื้นหลังทิ้งรัวๆ <strong style="color: #38BDF8; font-weight: 600;">ยิ่งทำให้สิ้นเปลืองพลังงานแบตเตอรี่มากขึ้น</strong> เพราะระบบถูกออกแบบให้จัดการทรัพยากรเองอย่างอัตโนมัติ
              </p>
            </div>

            <!-- Data Box -->
            <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(71, 85, 105, 0.4); border-radius: 16px; padding: 24px 28px;">
              <div style="display: flex; gap: 20px; align-items: center;">
                <div style="font-family: 'Inter'; font-size: 38px; font-weight: 700; color: #F59E0B;">0%</div>
                <div style="font-size: 20px; color: #CBD5E1; line-height: 1.4;">
                  อัตราการใช้พลังงาน CPU ของแอปส่วนใหญ่ที่อยู่ในสถานะ Background Suspended บนสมาร์ตโฟนยุคปัจจุบัน
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="footer-bar">
            <span>สรุป: ระบบปฏิบัติการมือถือยุคนี้ ฉลาดพอที่จะจัดการตัวเอง</span>
            <span class="footer-disclaimer">* อ้างอิงตามเอกสารทางการของ iOS และ Android</span>
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
            <h1 class="main-title">ทำไมแอปในพื้นหลัง<br>ถึงแทบไม่กินแบตเตอรี่?</h1>
            <p class="sub-title">เปรียบเทียบวงจรชีวิต: Frozen in RAM VS Cold Start</p>
          </div>

          <div style="display: flex; flex-direction: column; gap: 22px;">
            <!-- State 1: Frozen -->
            <div class="card" style="border-left: 6px solid #38BDF8;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-family: 'Kanit'; font-size: 22px; font-weight: 600; color: #38BDF8;">1. สถานะ Frozen (แช่แข็งใน RAM)</span>
                <span style="font-family: 'Inter'; font-size: 16px; color: #94A3B8; background: #1E293B; padding: 4px 12px; border-radius: 6px;">ประหยัดพลังงาน</span>
              </div>
              <p style="font-size: 21px; line-height: 1.5; color: #E2E8F0;">
                เวลาเราสลับหน้าจอออกจากแอป ตัวระบบจะทำการพักการทำงาน (Suspend) ข้อมูลค้างไว้ใน RAM โดยไม่มีคำสั่งประมวลผลบน CPU การที่ RAM มีข้อมูลอยู่ไม่ได้กินไฟเพิ่มขึ้นไปกว่า RAM ที่ว่างเปล่า
              </p>
            </div>

            <!-- State 2: Cold Start -->
            <div class="card" style="border-left: 6px solid #F59E0B;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-family: 'Kanit'; font-size: 22px; font-weight: 600; color: #FBBF24;">2. สถานะ Cold Start (เริ่มใหม่จากศูนย์)</span>
                <span style="font-family: 'Inter'; font-size: 16px; color: #F59E0B; background: rgba(245, 158, 11, 0.1); padding: 4px 12px; border-radius: 6px;">กินพลังงานสูงสุด</span>
              </div>
              <p style="font-size: 21px; line-height: 1.5; color: #E2E8F0;">
                พอเราปัดปิดแอป ข้อมูลใน RAM จะถูกล้าง เมื่อเปิดแอปเดิมขึ้นมาใหม่ เครื่องต้องเริ่มกระบวนการ Cold Start: อ่านข้อมูลจาก Flash Storage, โหลดโค้ด, และเร่งความเร็ว CPU เพื่อเปิดแอปขึ้นมาใหม่
              </p>
            </div>

            <!-- Real-World Analogy Card -->
            <div class="card" style="background: rgba(30, 41, 59, 0.4); border: 1px dashed rgba(148, 163, 184, 0.4);">
              <div style="font-family: 'Kanit'; font-size: 21px; font-weight: 600; color: #A7F3D0; margin-bottom: 10px;">
                เปรียบเสมือนเครื่องยนต์รถที่ติดไฟแดง
              </div>
              <p style="font-size: 20px; line-height: 1.5; color: #CBD5E1;">
                การปล่อยให้รถติดเครื่องเดินเบา (Idling) สิ้นเปลืองน้ำมันน้อยกว่าการดับเครื่องยนต์ทุกครั้งที่เจอไฟแดง แล้วบิดกุญแจสตาร์ทไดสตาร์ทใหม่ซ้ำๆ
              </p>
            </div>
          </div>
        </div>

        <div>
          <div class="footer-bar">
            <span>สรุป: การเปิดแอปใหม่จากศูนย์ ต้องใช้กำลังประมวลผลสูงกว่าการดึงแอปเดิมที่พักไว้</span>
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
          <h1 class="main-title">แล้วเวลาไหนที่ควร<br>"ปัดแอปทิ้ง" จริงๆ?</h1>
          <p class="sub-title">3 สถานการณ์ที่ควรบังคับปิดแอปเพื่อแก้ปัญหา</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- Scenario 1 -->
          <div class="card" style="padding: 26px 30px;">
            <div style="font-family: 'Kanit'; font-size: 22px; font-weight: 600; color: #38BDF8; margin-bottom: 8px;">
              1. แอปค้าง หมุนติ้ว หรือไม่ตอบสนอง
            </div>
            <p style="font-size: 20px; line-height: 1.5; color: #CBD5E1;">
              ถ้าแอปจอดำ กดอะไรไม่ไป หรือค้างอยู่ในลูปที่แก้ไม่ได้ การปัดทิ้งคือการสั่ง Force Quit ที่ถูกต้อง เพื่อรีเซ็ตสถานะกระบวนการใหม่
            </p>
          </div>

          <!-- Scenario 2 -->
          <div class="card" style="padding: 26px 30px;">
            <div style="font-family: 'Kanit'; font-size: 22px; font-weight: 600; color: #38BDF8; margin-bottom: 8px;">
              2. ทำงานผิดปกติ เสียงหรือภาพยังเล่นค้างอยู่
            </div>
            <p style="font-size: 20px; line-height: 1.5; color: #CBD5E1;">
              ปิดหน้าต่างไปแล้วแต่เสียงเพลง วิดีโอ หรือการแจ้งเตือนยังดังวนซ้ำๆ บ่งบอกว่า Background Thread มีบัค ควรปัดปิดเพื่อคืนสถานะ
            </p>
          </div>

          <!-- Scenario 3 -->
          <div class="card" style="padding: 26px 30px;">
            <div style="font-family: 'Kanit'; font-size: 22px; font-weight: 600; color: #38BDF8; margin-bottom: 8px;">
              3. แอปที่ดึง GPS หรือ Background Location ค้าง
            </div>
            <p style="font-size: 20px; line-height: 1.5; color: #CBD5E1;">
              แอปแผนที่หรือเรียกรถบางตัวอาจยังเปิดเสารับสัญญาณตำแหน่งค้างไว้ ถ้าใช้เสร็จแล้วการปิดแอปจะช่วยตัดการทำงานของฮาร์ดแวร์ GPS ได้
            </p>
          </div>
        </div>
      </div>

      <div>
        <div class="card" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); margin-top: 25px; padding: 24px 28px;">
          <div style="font-family: 'Kanit'; font-size: 21px; font-weight: 600; color: #34D399; margin-bottom: 6px;">
            กฎเหล็กสำหรับคนใช้สมาร์ตโฟน
          </div>
          <p style="font-size: 19px; line-height: 1.4; color: #E2E8F0;">
            ถ้าแอปทำงานปกติดี ปล่อยให้ระบบปฏิบัติการจัดการ RAM ของมันเองตามธรรมชาติ เครื่องจะลื่นและประหยัดแบตเตอรี่ที่สุด
          </p>
        </div>

        <div class="footer-bar" style="margin-top: 20px;">
          <span>เพจ แก้บัคยาวๆๆ • ติดตามเกร็ดไอทีและการแก้ปัญหาใกล้ตัว</span>
          <span class="footer-disclaimer">#แก้บัคยาวๆๆ #iOS #Android</span>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function renderVisuals() {
  console.log('--- 1. Launching Headless Edge to Render 3 High-Quality Visuals (1080x1350) ---');
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

  const slidePaths: string[] = [];

  for (let i = 1; i <= 3; i++) {
    const html = getSlideHtml(i);
    await page.setContent(html, { waitUntil: 'networkidle' });
    // wait a moment for google fonts
    await page.waitForTimeout(1000);
    const filePath = path.join(OUTPUT_DIR, `slide_${i}.png`);
    await page.screenshot({ path: filePath, type: 'png' });
    const stat = fs.statSync(filePath);
    console.log(`Rendered Slide ${i}: ${filePath} (${stat.size} bytes)`);
    slidePaths.push(filePath);
  }

  await browser.close();
  return slidePaths;
}

async function uploadImages(slidePaths: string[]): Promise<any[]> {
  console.log('\n--- 2. Uploading Images to Social Command Center API (POST /api/publishing/images) ---');
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

    console.log(`Uploaded Slide ${i + 1}: mediaId=${data.image.id}, sha256=${data.image.sha256}, size=${data.image.fileSize}`);
    uploadedMedia.push(data.image);
  }

  return uploadedMedia;
}

async function createUnapprovedDraft(uploadedMedia: any[]) {
  console.log('\n--- 3. Creating Unapproved Candidate Draft (POST /api/publishing/drafts) ---');

  const caption = `หลายคนมีนิสัยติดมือ เวลาเล่นมือถือเสร็จต้องเปิดหน้า App Switcher แล้วไล่ปัดปิดแอปทั้งหมดทิ้งรัวๆ เพราะคิดว่าจะช่วยประหยัดแบตเตอรี่และทำให้เครื่องเร็วขึ้น

แต่ในความเป็นจริง วิศวกรของทั้ง Apple และ Android เคยยืนยันตรงกันตั้งนานแล้วว่า การทำแบบนั้นยิ่งทำให้เครื่องเปลืองแบตเตอรี่มากกว่าเดิม

สาเหตุเป็นเพราะระบบจัดการหน่วยความจำของสมาร์ตโฟนยุคนี้ฉลาดมาก เวลาเราสลับออกจากแอป ตัวระบบจะทำการ "แช่แข็ง" (Freeze) แอปนั้นไว้ใน RAM ชั่วคราว ซึ่งในสถานะนี้ แอปจะไม่ถูกส่งไปประมวลผลบน CPU เลย และแทบไม่กินแบตเตอรี่เพิ่มขึ้น

แต่พอเราไปไล่ปัดแอปทิ้งทั้งหมด ตัวระบบจะต้องล้างข้อมูลแอปนั้นออกจาก RAM และเมื่อเรากดเปิดแอปนั้นใหม่อีกครั้ง เครื่องจะต้องเริ่มกระบวนการ Cold Start ดึงไฟล์จาก Storage โหลดโค้ด และสั่ง CPU เร่งความเร็วเพื่อรันทุกอย่างขึ้นมาใหม่ตั้งแต่ต้น จังหวะนี้แหละที่ดึงพลังงานจากแบตเตอรี่ไปมากที่สุด

ถ้าจะให้เห็นภาพง่ายๆ มันเหมือนเราขับรถไปติดไฟแดง การปล่อยให้รถจอดนิ่งๆ อยู่เฉยๆ ย่อมใช้น้ำมันน้อยกว่าการดับเครื่องยนต์ทุกครั้งที่เจอไฟแดง แล้วบิดกุญแจสตาร์ทเครื่องใหม่ซ้ำๆ

แล้วเวลาไหนที่ควรปัดแอปทิ้งจริงๆ?
มีแค่ 2-3 กรณีเท่านั้น:
1. แอปค้าง จอดำ หมุนติ้ว หรือกดอะไรไม่ไป
2. เสียงหรือเพลงจากแอปยังเล่นค้างอยู่ ทั้งที่ปิดไปแล้ว
3. แอปมีปัญหาเรื่อง Background Process ที่ทำงานผิดปกติจนเครื่องร้อน

ถ้าแอปทำงานปกติดี ปล่อยให้ระบบปฏิบัติการจัดการ RAM ของมันเองตามธรรมชาติได้เลย ไม่ต้องเสียเวลามานั่งไล่ปัดทิ้งทั้งวัน`;

  const payload = {
    title: 'ปัดแอปในมือถือทิ้งบ่อยๆ ช่วยประหยัดแบตเตอรี่จริงไหม (เจาะลึกระบบ iOS & Android)',
    contentType: 'multi_image',
    destinations: [
      {
        accountId: ACCOUNT_ID,
        caption: caption,
        hashtags: '#แก้บัคยาวๆๆ #iOS #Android',
        attachments: [
          {
            mediaId: uploadedMedia[0].id,
            altText: 'สไลด์ 1: ปัดแอปทิ้งบ่อยๆ สรุปช่วยประหยัดแบตเตอรี่จริงไหม เปรียบเทียบความเชื่อกับความจริง'
          },
          {
            mediaId: uploadedMedia[1].id,
            altText: 'สไลด์ 2: ทำไมแอปในพื้นหลังถึงไม่กินแบตเตอรี่ เปรียบเทียบ Frozen in RAM vs Cold Start'
          },
          {
            mediaId: uploadedMedia[2].id,
            altText: 'สไลด์ 3: แล้วเวลาไหนที่ควรปัดแอปทิ้งจริงๆ 3 สถานการณ์ที่ควรบังคับปิดแอป'
          }
        ],
        applyBranding: false
      }
    ]
  };

  const res = await fetch(`${SERVER_BASE}/api/publishing/drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(`Draft creation failed: ${JSON.stringify(data)}`);
  }

  console.log('Candidate Draft Created Successfully!');
  console.log(`Draft ID: ${data.draft.id}`);
  console.log(`Revision: ${data.draft.revision}`);
  console.log(`Status: ${data.draft.status} (MUST BE "draft")`);
  console.log(`Queued Post ID: ${data.draft.queued_post_id || 'null'}`);
  console.log(`Approved Revision: ${data.draft.approved_revision || 'null'}`);
  return data.draft;
}

async function main() {
  const slidePaths = await renderVisuals();
  const uploadedMedia = await uploadImages(slidePaths);
  const draft = await createUnapprovedDraft(uploadedMedia);
  console.log('\n=== Workflow Completed Successfully! STRICTLY UNAPPROVED DRAFT SAVED ===');
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
