import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const htmlContent = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Prompt:wght@300;400;500;600;700&display=swap');

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    width: 1080px;
    height: 1350px;
    background-color: #070B14;
    color: #F1F5F9;
    font-family: 'Prompt', 'Leelawadee UI', sans-serif;
    padding: 64px 56px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }

  /* Header Section */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(14, 165, 233, 0.12);
    border: 1px solid rgba(14, 165, 233, 0.35);
    color: #38BDF8;
    padding: 6px 18px;
    border-radius: 999px;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.5px;
    margin-bottom: 24px;
    width: fit-content;
  }

  .title-group h1 {
    font-size: 46px;
    font-weight: 700;
    line-height: 1.22;
    color: #FFFFFF;
    margin-bottom: 12px;
    letter-spacing: -0.5px;
  }

  .title-group h1 .accent-502 {
    color: #F87171;
  }

  .title-group h1 .accent-504 {
    color: #FBBF24;
  }

  .title-group p {
    font-size: 23px;
    color: #94A3B8;
    line-height: 1.45;
  }

  /* Architecture Flow Diagram */
  .diagram-container {
    background: #0E1626;
    border: 1px solid #1E293B;
    border-radius: 20px;
    padding: 24px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 24px 0;
    position: relative;
  }

  .node {
    background: #162032;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 16px 20px;
    text-align: center;
    min-width: 190px;
  }

  .node.proxy {
    background: #112240;
    border-color: #0284C7;
    box-shadow: 0 0 25px rgba(2, 132, 199, 0.15);
  }

  .node-role {
    font-size: 14px;
    font-weight: 600;
    color: #38BDF8;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  .node-name {
    font-size: 20px;
    font-weight: 700;
    color: #FFFFFF;
  }

  .node-sub {
    font-size: 13px;
    color: #64748B;
    margin-top: 2px;
  }

  .arrow {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: #64748B;
    font-size: 14px;
    font-weight: 500;
  }

  .arrow-line {
    width: 60px;
    height: 2px;
    background: #334155;
    position: relative;
  }

  .arrow-line::after {
    content: '';
    position: absolute;
    right: 0;
    top: -4px;
    width: 0;
    height: 0;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-left: 7px solid #334155;
  }

  /* Comparison Cards Grid */
  .cards-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
  }

  .card {
    border-radius: 20px;
    padding: 28px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .card-502 {
    background: linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%);
    border: 1.5px solid rgba(239, 68, 68, 0.4);
  }

  .card-504 {
    background: linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%);
    border: 1.5px solid rgba(245, 158, 11, 0.4);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .status-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 26px;
    font-weight: 700;
    padding: 4px 14px;
    border-radius: 8px;
  }

  .card-502 .status-tag {
    background: rgba(239, 68, 68, 0.2);
    color: #F87171;
    border: 1px solid rgba(239, 68, 68, 0.5);
  }

  .card-504 .status-tag {
    background: rgba(245, 158, 11, 0.2);
    color: #FBBF24;
    border: 1px solid rgba(245, 158, 11, 0.5);
  }

  .card-label {
    font-size: 15px;
    font-weight: 600;
    color: #94A3B8;
  }

  .card-title {
    font-size: 25px;
    font-weight: 700;
    color: #FFFFFF;
    margin-bottom: 10px;
    line-height: 1.3;
  }

  .card-summary {
    font-size: 18px;
    color: #CBD5E1;
    line-height: 1.5;
    margin-bottom: 18px;
  }

  .log-box {
    background: #050811;
    border: 1px solid #1E293B;
    border-radius: 10px;
    padding: 12px 14px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.45;
    margin-bottom: 18px;
  }

  .card-502 .log-box {
    color: #FCA5A5;
    border-left: 3px solid #EF4444;
  }

  .card-504 .log-box {
    color: #FDE68A;
    border-left: 3px solid #F59E0B;
  }

  .root-causes {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .root-causes li {
    font-size: 16px;
    color: #94A3B8;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    line-height: 1.35;
  }

  .root-causes li strong {
    color: #E2E8F0;
  }

  .bullet-502 {
    color: #EF4444;
    font-weight: bold;
  }

  .bullet-504 {
    color: #F59E0B;
    font-weight: bold;
  }

  /* Bottom Takeaway Matrix */
  .takeaway-box {
    background: #0E1626;
    border: 1px solid #1E293B;
    border-radius: 16px;
    padding: 22px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .takeaway-col {
    flex: 1;
  }

  .takeaway-col:first-child {
    border-right: 1px solid #1E293B;
    padding-right: 28px;
  }

  .takeaway-col:last-child {
    padding-left: 28px;
  }

  .takeaway-label {
    font-size: 14px;
    font-weight: 600;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 6px;
  }

  .takeaway-text {
    font-size: 17px;
    color: #E2E8F0;
    line-height: 1.45;
  }

  .takeaway-text strong {
    color: #38BDF8;
  }
</style>
</head>
<body>

  <!-- Top Header -->
  <div>
    <div class="badge">แก้บัคยาวๆๆ • Architecture & Debugging</div>
    <div class="title-group">
      <h1><span class="accent-502">502 Bad Gateway</span> VS <span class="accent-504">504 Gateway Timeout</span></h1>
      <p>เมื่อระบบแจ้งว่าพัง... สองโค้ดนี้บอกต้นเหตุของปัญหาต่างกันอย่างสิ้นเชิง</p>
    </div>
  </div>

  <!-- Architecture Flow -->
  <div class="diagram-container">
    <div class="node">
      <div class="node-role">Client</div>
      <div class="node-name">Browser / App</div>
      <div class="node-sub">ส่ง HTTP Request</div>
    </div>

    <div class="arrow">
      <span>1. Request</span>
      <div class="arrow-line"></div>
    </div>

    <div class="node proxy">
      <div class="node-role">Reverse Proxy</div>
      <div class="node-name">Nginx / ALB / Ingress</div>
      <div class="node-sub">ด่านหน้าตรวจจับ Error</div>
    </div>

    <div class="arrow">
      <span>2. Forward</span>
      <div class="arrow-line"></div>
    </div>

    <div class="node">
      <div class="node-role">Upstream Backend</div>
      <div class="node-name">App Server / Service</div>
      <div class="node-sub">Node.js, Go, Python, DB</div>
    </div>
  </div>

  <!-- Cards Grid -->
  <div class="cards-grid">
    <!-- 502 Card -->
    <div class="card card-502">
      <div>
        <div class="card-header">
          <span class="status-tag">502</span>
          <span class="card-label">Bad Gateway</span>
        </div>
        <div class="card-title">คุยไม่รู้เรื่อง หรือโปรเซสตาย</div>
        <div class="card-summary">Proxy พยายามต่อหาหลังบ้าน แต่โดนปฏิเสธ (RST), โปรเซสดับ หรือตอบกลับมาเป็นขยะ</div>

        <div class="log-box">
          [error] connect() failed (111: Connection refused) while connecting to upstream
        </div>

        <ul class="root-causes">
          <li><span class="bullet-502">•</span> <strong>App Process Crash:</strong> โดน OOMKilled หรือ Syntax Error ตาย</li>
          <li><span class="bullet-502">•</span> <strong>Port Mismatch:</strong> Proxy ยิงไปพอร์ตที่ไม่มีใครเปิดฟัง</li>
          <li><span class="bullet-502">•</span> <strong>Socket Closed:</strong> Backend ตัดสายทิ้งกลางคันก่อนส่ง Header</li>
        </ul>
      </div>
    </div>

    <!-- 504 Card -->
    <div class="card card-504">
      <div>
        <div class="card-header">
          <span class="status-tag">504</span>
          <span class="card-label">Gateway Timeout</span>
        </div>
        <div class="card-title">หลังบ้านยังอยู่ แต่ตอบช้าเกินรอ</div>
        <div class="card-summary">Proxy ส่งงานไปถึงแล้ว แต่รอจนหมดเวลา (Timeout) หลังบ้านก็ยังประมวลผลไม่เสร็จ</div>

        <div class="log-box">
          [error] upstream timed out (110: Connection timed out) while reading response header
        </div>

        <ul class="root-causes">
          <li><span class="bullet-504">•</span> <strong>Slow Database Query:</strong> ขาด Index หรือเจอ Table Lock</li>
          <li><span class="bullet-504">•</span> <strong>Event Loop Blocked:</strong> CPU รันงานหนักจนไม่ยอมตอบ Network</li>
          <li><span class="bullet-504">•</span> <strong>External API Hang:</strong> รอ Third-party API ภายนอกจนหลับ</li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Bottom Takeaway -->
  <div class="takeaway-box">
    <div class="takeaway-col">
      <div class="takeaway-label">สูตรเช็คเมื่อเจอ 502</div>
      <div class="takeaway-text">เช็คทันทีว่า <strong>Process หลังบ้านยังรันอยู่ไหม</strong> ดู Docker/K8s restarts, PM2 logs หรือเช็คว่าพอร์ตตรงกันหรือเปล่า</div>
    </div>
    <div class="takeaway-col">
      <div class="takeaway-label">สูตรเช็คเมื่อเจอ 504</div>
      <div class="takeaway-text">เช็คทันทีว่า <strong>มี Query หรือ Task ไหนกำลังค้าง</strong> ตรวจ Slow Query log, DB connection pool และปรับ proxy timeout ให้สมเหตุสมผล</div>
    </div>
  </div>

</body>
</html>`;

async function main() {
  const outputDir = path.resolve('.data/uploads');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'infographic-502-vs-504.png');

  console.log('Launching browser to render infographic...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 2 // Crisp 2x retina screenshot
  });

  await page.setContent(htmlContent, { waitUntil: 'networkidle' });
  // Wait a moment for fonts to render
  await page.waitForTimeout(1000);

  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();

  const stats = fs.statSync(outputPath);
  console.log(`Infographic rendered successfully: ${outputPath} (${Math.round(stats.size / 1024)} KB)`);
}

main().catch(err => {
  console.error('Rendering error:', err);
  process.exit(1);
});
