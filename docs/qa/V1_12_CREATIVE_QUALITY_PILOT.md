# V1.12 Creative Quality & Group Discovery Pilot — Delivery & Acceptance Report

**Date**: 27 October 2026, Asia/Bangkok  
**Account**: Facebook Page **แก้บัคยาวๆๆ** (`acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5`)  
**Verified Graph Page ID**: `409347032254077`  
**Operating Role**: Gemini (via Antigravity) as External Creative Operator  
**Application Gemini API Quota Consumed**: Zero (0) calls consumed  
**Live Social Publications**: Zero (0) live actions dispatched (100% held in unapproved draft status)  

---

## 1. Owner Preferences & Provisional Voice Profile

The persistent voice profile in `owner_voice_profiles` for `acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5` is recorded at **Revision 4** with `provisional: true`:

- **Confirmed Preferences**:
  - Natural conversational Thai with standard English technical loanwords (e.g., `port`, `browser`, `API`, `server`, `error`, `deploy`, `bug`, `OAuth`, `upload`).
  - Everyday informal Thai vocabulary (e.g., `ลองเช็ค`, `มัน error`, `โพสต์ไม่ขึ้น`, `คนอื่น`, `ที่ไหนได้`).
  - No documentation-style formatting: no formal introductions, no numbered instructional steps, no academic summaries, and no moral lessons.
  - No emojis by default.
  - No automatic hashtags or forced audience engagement questions.
  - Distinct narrative structures and varying post lengths.
  - Overall voice remains **provisional** pending explicit owner approval of actual writing samples.

---

## 2. Revised Candidate Posts (Revision 3, Status: draft)

All five original drafts were updated in place to **Revision 3** (preserving IDs, with prior revisions recorded in the audit trail). All remain unapproved and unscheduled.

### Draft 1
- **Draft ID**: `draft-7256a37e-44b6-4201-b7e2-d6f52b38f794` (Revision 3, Status: `draft`)
- **Title**: เรื่อง Graph ID กับ Page ID ในการเชื่อมต่อ Facebook Page
- **Caption**:
```text
เพิ่งเจอเคสแปลกๆ ตอนทำระบบต่อ Facebook Page ผ่าน OAuth

เลข Page ID ที่เห็นบน URL ใน browser มันเป็นเลขชุดหนึ่ง แต่พอแลก token เสร็จแล้วดึงข้อมูลผ่าน Graph API /me ตัว API ดันส่ง Graph Scoped ID ที่เป็นเลขอีกชุดกลับมา

ถ้าเขียนระบบให้เช็ค ID แบบตรงตัว ระบบจะมองว่าไม่ใช่เพจเดียวกันแล้วดีดออกทันที ทั้งที่เป็นเพจเดียวกันแท้ๆ สุดท้ายเลยต้องทำตาราง map ระหว่าง Page ID บนหน้าเว็บ กับ Graph ID ฝั่ง API ไว้ด้วย
```
- **Factual Caveat**: Based on actual Meta Graph API v26.0 token exchange behavior observed while connecting Facebook Page แก้บัคยาวๆๆ.

### Draft 2
- **Draft ID**: `draft-5da1165c-a760-4fd9-814a-569c4f1b7dae` (Revision 3, Status: `draft`)
- **Title**: แก้โค้ดแล้วไม่เปลี่ยนเพราะดูผิด port
- **Caption**:
```text
เคยแก้โค้ดแล้วรีเฟรชหน้าจอยังไงก็ไม่เปลี่ยนไหม

นั่งไล่ดูตั้งนาน นึกว่าติด cache หรือ compile ไม่ผ่าน ที่ไหนได้ เปิด browser ค้างไว้ที่ port ทดสอบตัวเก่า ส่วน server ที่แก้โค้ดอยู่รันอยู่อีก port หนึ่ง

ปัญหาบางอย่างไม่ได้อยู่ที่โค้ด แต่อยู่ที่ดูผิดแท็บ
```
- **Factual Caveat**: Grounded in real developer confusion when reviewing isolated test instances on alternate local ports (e.g., port 3195 vs 3001).

### Draft 3
- **Draft ID**: `draft-7b55fada-a05b-4828-a3f4-83ef3341d2c9` (Revision 3, Status: `draft`)
- **Title**: ทำไม API บอกว่าโพสต์เสร็จแล้ว แต่วิดีโอยังไม่ขึ้น
- **Caption**:
```text
เวลาทำระบบโพสต์คลิปหรือ Reels ผ่าน API แล้วเซิร์ฟเวอร์ตอบกลับมาเป็น 200 OK อย่าเพิ่งรีบขึ้นสถานะว่าโพสต์สำเร็จ

เพราะนั่นแปลว่าแค่ฝั่งเขารับไฟล์ไปเฉยๆ วิดีโอยังต้องรอคิว process แปลงไฟล์ ตรวจสอบสเปก และรอเปิดเผยแพร่อีกที ซึ่งช่วงนี้แหละที่อาจจะ error เงียบๆ ได้

ถ้าอยากให้ระบบชัวร์ ควรถือว่างานยังอยู่ในสถานะ uploading แล้วให้ worker คอยเช็คสถานะเป็นระยะ จนกว่าจะได้ permalink จริงกลับมา ถึงค่อยนับว่าโพสต์เรียบร้อย
```
- **Factual Caveat**: Accurately describes Meta Graph API's asynchronous Reels publishing pipeline requiring video processing completion before public availability.

### Draft 4
- **Draft ID**: `draft-1dc15bda-02ee-4dad-9d9e-4ba4031623db` (Revision 3, Status: `draft`)
- **Title**: วาง watermark บนวิดีโอ 9:16 ไม่ง่ายอย่างที่คิด
- **Caption**:
```text
วิดีโอแนวตั้ง 9:16 พื้นที่ที่วางพวก watermark หรือข้อความได้จริงแคบกว่าที่คิดเยอะ

ถ้าขยับไปชิดขวาก็ติดปุ่มกด like กับเมนูแชร์ ขยับลงล่างก็โดนแคปชันบัง เลื่อนขึ้นบนก็ชนขอบจออีก

ตอนทำระบบ render เลยต้องล็อค safe area ไว้เลย เช่น เว้นขอบบนอย่างน้อย 120px ขอบล่าง 280px แล้วใส่เงาใต้ตัวหนังสือไว้ด้วย ไม่งั้นถ้าคลิปเปลี่ยนไปเจอพื้นหลังสว่าง ตัวหนังสือจะกลืนจนอ่านไม่ออก
```
- **Factual Caveat**: Safe area pixel margins (top 120px, bottom 280px) are internal parameters configured in Social Command Center's branding renderer, not universal platform specifications.

### Draft 5
- **Draft ID**: `draft-6c13f2e1-b858-46dc-9204-cb14d87185bd` (Revision 3, Status: `draft`)
- **Title**: รันระบบบน PC ตัวเองเทียบกับเช่า cloud
- **Caption**:
```text
รัน server บน PC ตัวเองก็สะดวกดี ไม่เสียค่า cloud รายเดือน จัดการไฟล์วิดีโอใหญ่ๆ ในเครื่องได้เลย

แต่พอปิดคอมหรือ Windows แอบ restart ตอนกลางคืน งานที่ตั้งเวลาไว้ก็หยุดหมด

พอย้ายมาแนว self-hosted เลยต้องออกแบบคิวให้มีระบบเช็คสถานะตอนเปิดเครื่องใหม่ด้วย งานที่ค้างจะได้ไม่หาย แล้วไม่เผลอยิงโพสต์ซ้ำออกไป
```
- **Factual Caveat**: Grounded in the self-hosted architecture and startup recovery design of the Command Center running on local hardware.

---

## 3. Preservation & Runtime Verification

- **Page B (โลกจริงหลุดบท)**: Preserved (7 original drafts untouched)
- **TikTok**: Preserved (zero operations)
- **Protected Destinations**: All 3 destinations (`dest-mvf5hdwf-19hi`, `dest-mvf5j24q-ub0y`, `dest-mvf5j24r-rw4x`) remain in `awaiting_confirmation`
- **Application Gemini API Allowance**: Untouched (0 requests used)
- **Database Status**: Integrity `ok`, Foreign Keys clean, Zero live posts dispatched.
