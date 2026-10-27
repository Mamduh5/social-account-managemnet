import 'dotenv/config';

const SERVER_BASE = 'http://127.0.0.1:3001';
const ACCOUNT_ID = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';

async function main() {
  console.log('=== 1. Update Voice Profile with Confirmed Owner Voice Preferences ===');
  const voicePayload = {
    editorialPurpose: 'เพจเทคโนโลยีและงานแก้บัค เล่าเรื่องการพัฒนาซอฟต์แวร์ ปัญหาหน้างาน และเกร็ดเทคนิค ด้วยภาษาพูดที่เป็นธรรมชาติ ผสมคำทับศัพท์ภาษาอังกฤษตามการใช้งานจริงของโปรแกรมเมอร์',
    editorialSubjects: [
      'ปัญหาทางเทคนิคและการแก้บัค (Debugging & Tech Issues)',
      'ข้อสังเกตและเรื่องเล่าเบื้องหลังงานเดฟ (Behind the Scenes Dev)',
      'การออกแบบระบบและเครื่องมืออัตโนมัติ (Architecture & Automation)'
    ],
    language: 'Thai with natural English technical loanwords',
    tone: 'ภาษาพูดที่เป็นธรรมชาติ เหมือนคุยกับคนในวงการ ไม่เป็นทางการเหมือนเอกสารคู่มือ ใช้คำศัพท์เทคนิคภาษาอังกฤษ (เช่น port, browser, API, server, error, deploy, bug) และคำไทยระดับภาษาพูด (เช่น ลองเช็ค, มัน error, โพสต์ไม่ขึ้น, คนอื่น) ไม่ใส่ความตื่นเต้นหรือมุกตลกฝืน',
    typicalLength: 'สั้นกระชับ ปรับเปลี่ยนตามเนื้อหา ไม่บังคับโครงสร้างตายตัว',
    humor: 'Low to Medium (ข้อสังเกตจริงในงาน ไม่ใส่ 555 หรือสแลงพร่ำเพรื่อ)',
    emojiPreference: 'ไม่มีอิโมจิโดยค่าเริ่มต้น (ใช้เฉพาะเมื่อเจ้าของร้องขอเป็นรายเนื้อหา)',
    hashtagPreference: 'ไม่ใส่แฮชแท็กโดยค่าเริ่มต้น',
    preferredPhrases: [],
    prohibitedPhrases: [
      'ทดสอบระบบ Social Command Center V1.12',
      'Live Acceptance Test',
      'ยินดีต้อนรับสู่การทดสอบระบบ',
      'อย่าลืมกดไลก์กดแชร์กดติดตาม',
      'ระบบอัจฉริยะที่จะเปลี่ยนชีวิตคุณตลอดกาล',
      'อ้างประสบการณ์หรือสถิติที่ไม่มีหลักฐาน',
      'ปลอดภัย 100%'
    ],
    approvedExamples: [],
    approvedFacts: [
      'เพจ แก้บัคยาวๆๆ มุ่งเน้นถ่ายทอดเรื่องราวด้านเทคโนโลยี การเขียนโปรแกรม และการพัฒนาซอฟต์แวร์จริง',
      'เนื้อหาอิงจากประสบการณ์พัฒนาและแก้ปัญหาจริงในโครงการ Social Command Center (เช่น Meta OAuth Graph ID vs Vanity ID, การคำนวณ Safe Area ลายน้ำบนวิดีโอ 9:16, คิวงาน Polling และ SQLite Resilience)',
      'ไม่แต่งเรื่องความสำเร็จ ยอดวิว หรือคำชมจากลูกค้าที่ไม่มีอยู่จริง',
      'แยกเนื้อหาทดสอบระบบ (QA Content) ออกจากเนื้อหาเผยแพร่สู่ผู้ติดตาม (Audience-facing Content) อย่างเด็ดขาด',
      'แนวทางการเขียน: ภาษาพูดธรรมชาติ ผสมคำศัพท์อังกฤษที่โปรแกรมเมอร์ใช้ทั่วไป ไม่เขียนแบบคู่มือหรือวิชาการ ไม่ใส่อิโมจิ ไม่ใส่แฮชแท็ก และไม่ใส่คำถามชวนคุยโดยค่าเริ่มต้น'
    ],
    faqAnswers: [],
    provisional: true,
    confirmOwnerApproved: true
  };

  const profileRes = await fetch(`${SERVER_BASE}/api/assistant/profiles/${ACCOUNT_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(voicePayload)
  });
  const profileData = await profileRes.json();
  if (!profileRes.ok) throw new Error(`Profile update failed: ${JSON.stringify(profileData)}`);
  console.log('Voice Profile updated. Provisional:', profileData.profile?.provisional);

  console.log('\n=== 2. Revise Existing 5 Drafts to Revision 3 (Natural Thai-English) ===');

  const revisions = [
    {
      id: 'draft-7256a37e-44b6-4201-b7e2-d6f52b38f794',
      payload: {
        revision: 2,
        title: 'เรื่อง Graph ID กับ Page ID ในการเชื่อมต่อ Facebook Page',
        contentType: 'text',
        destinations: [
          {
            accountId: ACCOUNT_ID,
            caption: `เพิ่งเจอเคสแปลกๆ ตอนทำระบบต่อ Facebook Page ผ่าน OAuth

เลข Page ID ที่เห็นบน URL ใน browser มันเป็นเลขชุดหนึ่ง แต่พอแลก token เสร็จแล้วดึงข้อมูลผ่าน Graph API /me ตัว API ดันส่ง Graph Scoped ID ที่เป็นเลขอีกชุดกลับมา

ถ้าเขียนระบบให้เช็ค ID แบบตรงตัว ระบบจะมองว่าไม่ใช่เพจเดียวกันแล้วดีดออกทันที ทั้งที่เป็นเพจเดียวกันแท้ๆ สุดท้ายเลยต้องทำตาราง map ระหว่าง Page ID บนหน้าเว็บ กับ Graph ID ฝั่ง API ไว้ด้วย`,
            hashtags: '',
            attachments: []
          }
        ]
      }
    },
    {
      id: 'draft-5da1165c-a760-4fd9-814a-569c4f1b7dae',
      payload: {
        revision: 2,
        title: 'แก้โค้ดแล้วไม่เปลี่ยนเพราะดูผิด port',
        contentType: 'text',
        destinations: [
          {
            accountId: ACCOUNT_ID,
            caption: `เคยแก้โค้ดแล้วรีเฟรชหน้าจอยังไงก็ไม่เปลี่ยนไหม

นั่งไล่ดูตั้งนาน นึกว่าติด cache หรือ compile ไม่ผ่าน ที่ไหนได้ เปิด browser ค้างไว้ที่ port ทดสอบตัวเก่า ส่วน server ที่แก้โค้ดอยู่รันอยู่อีก port หนึ่ง

ปัญหาบางอย่างไม่ได้อยู่ที่โค้ด แต่อยู่ที่ดูผิดแท็บ`,
            hashtags: '',
            attachments: []
          }
        ]
      }
    },
    {
      id: 'draft-7b55fada-a05b-4828-a3f4-83ef3341d2c9',
      payload: {
        revision: 2,
        title: 'ทำไม API บอกว่าโพสต์เสร็จแล้ว แต่วิดีโอยังไม่ขึ้น',
        contentType: 'text',
        destinations: [
          {
            accountId: ACCOUNT_ID,
            caption: `เวลาทำระบบโพสต์คลิปหรือ Reels ผ่าน API แล้วเซิร์ฟเวอร์ตอบกลับมาเป็น 200 OK อย่าเพิ่งรีบขึ้นสถานะว่าโพสต์สำเร็จ

เพราะนั่นแปลว่าแค่ฝั่งเขารับไฟล์ไปเฉยๆ วิดีโอยังต้องรอคิว process แปลงไฟล์ ตรวจสอบสเปก และรอเปิดเผยแพร่อีกที ซึ่งช่วงนี้แหละที่อาจจะ error เงียบๆ ได้

ถ้าอยากให้ระบบชัวร์ ควรถือว่างานยังอยู่ในสถานะ uploading แล้วให้ worker คอยเช็คสถานะเป็นระยะ จนกว่าจะได้ permalink จริงกลับมา ถึงค่อยนับว่าโพสต์เรียบร้อย`,
            hashtags: '',
            attachments: []
          }
        ]
      }
    },
    {
      id: 'draft-1dc15bda-02ee-4dad-9d9e-4ba4031623db',
      payload: {
        revision: 2,
        title: 'วาง watermark บนวิดีโอ 9:16 ไม่ง่ายอย่างที่คิด',
        contentType: 'text',
        destinations: [
          {
            accountId: ACCOUNT_ID,
            caption: `วิดีโอแนวตั้ง 9:16 พื้นที่ที่วางพวก watermark หรือข้อความได้จริงแคบกว่าที่คิดเยอะ

ถ้าขยับไปชิดขวาก็ติดปุ่มกด like กับเมนูแชร์ ขยับลงล่างก็โดนแคปชันบัง เลื่อนขึ้นบนก็ชนขอบจออีก

ตอนทำระบบ render เลยต้องล็อค safe area ไว้เลย เช่น เว้นขอบบนอย่างน้อย 120px ขอบล่าง 280px แล้วใส่เงาใต้ตัวหนังสือไว้ด้วย ไม่งั้นถ้าคลิปเปลี่ยนไปเจอพื้นหลังสว่าง ตัวหนังสือจะกลืนจนอ่านไม่ออก`,
            hashtags: '',
            attachments: []
          }
        ]
      }
    },
    {
      id: 'draft-6c13f2e1-b858-46dc-9204-cb14d87185bd',
      payload: {
        revision: 2,
        title: 'รันระบบบน PC ตัวเองเทียบกับเช่า cloud',
        contentType: 'text',
        destinations: [
          {
            accountId: ACCOUNT_ID,
            caption: `รัน server บน PC ตัวเองก็สะดวกดี ไม่เสียค่า cloud รายเดือน จัดการไฟล์วิดีโอใหญ่ๆ ในเครื่องได้เลย

แต่พอปิดคอมหรือ Windows แอบ restart ตอนกลางคืน งานที่ตั้งเวลาไว้ก็หยุดหมด

พอย้ายมาแนว self-hosted เลยต้องออกแบบคิวให้มีระบบเช็คสถานะตอนเปิดเครื่องใหม่ด้วย งานที่ค้างจะได้ไม่หาย แล้วไม่เผลอยิงโพสต์ซ้ำออกไป`,
            hashtags: '',
            attachments: []
          }
        ]
      }
    }
  ];

  for (const item of revisions) {
    const res = await fetch(`${SERVER_BASE}/api/publishing/drafts/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item.payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Draft update failed for ${item.id}: ${JSON.stringify(data)}`);
    console.log(`Updated ${item.id}: Revision ${data.draft.revision}, Title: "${data.draft.title}"`);
  }

  console.log('\n=== All 5 drafts updated to Revision 3 successfully! ===');
}

main().catch(e => {
  console.error('Error applying natural revision:', e);
  process.exit(1);
});
