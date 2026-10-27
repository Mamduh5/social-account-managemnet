import 'dotenv/config';

const SERVER_BASE = 'http://127.0.0.1:3001';
const ACCOUNT_ID = 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5';

async function main() {
  console.log('=== 1. Update Voice Profile to Record Confirmed Preferences (Provisional: true) ===');
  const voicePayload = {
    editorialPurpose: 'เพจแบ่งปันเรื่องราวชีวิตจริงของคนทำซอฟต์แวร์และงานแก้บัค เล่าเรื่องการเขียนโปรแกรมและการพัฒนาเครื่องมืออัตโนมัติอย่างตรงไปตรงมา มีสาระ และเข้าใจง่าย',
    editorialSubjects: [
      'การแก้ปัญหาทางเทคนิคจริง (Technical Troubleshooting)',
      'ข้อสังเกตและมุมมองในงานพัฒนาซอฟต์แวร์ (Developer Observations)',
      'เบื้องหลังการพัฒนาและสถาปัตยกรรมระบบ (Behind the Scenes Architecture)'
    ],
    language: 'Thai',
    tone: 'ภาษาไทยกระชับ ตรงไปตรงมา เป็นกันเองแบบสุภาพ ไม่ใช้คำศัพท์เกินความจำเป็น ไม่ใส่ความตื่นเต้นเกินจริง และไม่ใส่คำลงท้ายซ้ำซาก',
    typicalLength: 'สั้นถึงปานกลาง ตามความจำเป็นของเนื้อหา',
    humor: 'Low to Medium (ข้อสังเกตจริงในงานเดฟ ไม่ใช้สแลงหรือมุกตลกฝืน)',
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
      'เจ้าของยืนยันความต้องการ: ไม่ใส่อิโมจิ ไม่ใส่แฮชแท็กอัตโนมัติ และไม่ใส่คำถามชวนคุยโดยค่าเริ่มต้น'
    ],
    faqAnswers: [],
    confirmOwnerApproved: true
  };

  const profileRes = await fetch(`${SERVER_BASE}/api/assistant/profiles/${ACCOUNT_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(voicePayload)
  });
  const profileData = await profileRes.json();
  if (!profileRes.ok) throw new Error(`Profile update failed: ${JSON.stringify(profileData)}`);
  console.log('Voice Profile updated successfully.');
  console.log('Provisional status:', profileData.profile?.provisional);

  console.log('\n=== 2. Revise Existing 5 Drafts (Preserving IDs, Incrementing Revision) ===');

  const revisions = [
    {
      id: 'draft-7256a37e-44b6-4201-b7e2-d6f52b38f794',
      currentRevision: 1,
      payload: {
        revision: 1,
        title: 'เรื่อง Graph ID กับ Page ID ในการเชื่อมต่อ Facebook Page',
        contentType: 'text',
        destinations: [
          {
            accountId: ACCOUNT_ID,
            caption: `ในการเชื่อมต่อ Facebook Page ผ่านระบบล็อกอิน บัญชีเพจเดียวกันอาจมีหมายเลขระบุตัวตนไม่ตรงกันระหว่างสิ่งที่ปรากฏบนหน้าเบราว์เซอร์กับข้อมูลที่ได้รับจาก Meta Graph API

หมายเลขที่ปรากฏบน URL หน้าเพจมักเป็นหมายเลขสาธารณะหรือ Vanity ID แต่เมื่อเรียกข้อมูลผ่าน Graph API ค่าที่ส่งกลับมาเป็น Graph Scoped ID

หากระบบตรวจสอบความถูกต้องโดยเปรียบเทียบข้อความของ ID ตรงๆ ระบบจะมองว่าเป็นคนละบัญชีและปฏิเสธการเชื่อมต่อ การออกแบบระบบจึงต้องบันทึกหมายเลขทั้งสองรูปแบบและทำ Alias เชื่อมโยงกัน ไม่ใช่เปรียบเทียบเฉพาะค่าจากหน้าเว็บ`,
            hashtags: '',
            attachments: []
          }
        ]
      }
    },
    {
      id: 'draft-5da1165c-a760-4fd9-814a-569c4f1b7dae',
      currentRevision: 1,
      payload: {
        revision: 1,
        title: 'ข้อสังเกตทั่วไปเกี่ยวกับความสับสนในการพัฒนาโปรแกรม',
        contentType: 'text',
        destinations: [
          {
            accountId: ACCOUNT_ID,
            caption: `ข้อสังเกตทั่วไปที่มักเกิดขึ้นบ่อยในการเขียนโปรแกรม:

1. การดูผลลัพธ์ผิดพอร์ต
เปิดเบราว์เซอร์ดูหน้าเว็บที่รันจากพอร์ตทดสอบหนึ่ง แต่โค้ดที่กำลังแก้อยู่รันอยู่อีกพอร์ตหนึ่ง ทำให้ผลลัพธ์บนหน้าจอไม่เปลี่ยนแปลงตามการแก้ไข

2. การตอบกลับเร็วเกินจริงของระบบ
บางระบบแสดงข้อความว่าทำงานสำเร็จทันทีที่ส่งไฟล์ไปยังเซิร์ฟเวอร์เสร็จ แต่ขั้นตอนการประมวลผลจริงยังไม่เริ่มต้น

3. ปัญหาที่หายไปเมื่อมีคนร่วมตรวจสอบ
เกิดข้อผิดพลาดขึ้นซ้ำๆ แต่เมื่อเริ่มบันทึกหน้าจอหรือให้ผู้อื่นช่วยดู ระบบกลับทำงานได้ตามปกติ

4. การแก้ไขหนึ่งจุดกระทบจุดอื่น
การปรับแก้ตรรกะในส่วนหนึ่งเพื่อแก้ปัญหาเฉพาะหน้า ส่งผลให้การทำงานในส่วนอื่นที่เชื่อมโยงกันทำงานผิดพลาด

5. สภาพแวดล้อมทำงานไม่ตรงกัน
โค้ดทำงานได้สมบูรณ์ในเครื่องพัฒนาส่วนตัว แต่ล้มเหลวเมื่อนำไปรันในสภาพแวดล้อมจริงเนื่องจากการตั้งค่าหรือตัวแปรระบบที่ต่างกัน`,
            hashtags: '',
            attachments: []
          }
        ]
      }
    },
    {
      id: 'draft-7b55fada-a05b-4828-a3f4-83ef3341d2c9',
      currentRevision: 1,
      payload: {
        revision: 1,
        title: 'การยืนยันสถานะการเผยแพร่วิดีโอผ่าน API',
        contentType: 'text',
        destinations: [
          {
            accountId: ACCOUNT_ID,
            caption: `การเผยแพร่วิดีโอหรือคลิปสั้นไปยังแพลตฟอร์มผ่าน API มักประกอบด้วยสามขั้นตอนหลัก:

ขั้นตอนแรกคือการอัปโหลดไฟล์ (Binary Upload) เมื่อส่งข้อมูลไฟล์เสร็จสิ้น เซิร์ฟเวอร์ปลายทางจะตอบกลับ HTTP 200 แต่ขั้นตอนนี้เป็นการยืนยันว่าได้รับไฟล์แล้วเท่านั้น ยังไม่ได้เริ่มเผยแพร่

ขั้นตอนที่สองคือการประมวลผล (Remote Processing) แพลตฟอร์มจะนำไฟล์เข้าคิวเพื่อแปลงรหัสและตรวจสอบคุณสมบัติ ขั้นตอนนี้อาจใช้เวลาและมีโอกาสล้มเหลวได้ เช่น รูปแบบเสียงหรือความละเอียดไม่รองรับ

ขั้นตอนที่สามคือการเผยแพร่จริง วิดีโอจะสมบูรณ์เมื่อสถานะในระบบปลายทางเปลี่ยนเป็นพร้อมใช้งานและมีลิงก์สาธารณะ (Permalink) เกิดขึ้น

ในการพัฒนาระบบ การบันทึกรหัสวิดีโอเพื่อตรวจสอบสถานะเป็นระยะจนกว่าจะได้รับการยืนยันลิงก์จริง จะช่วยลดปัญหาการแสดงสถานะสำเร็จล่วงหน้าก่อนที่เนื้อหาจะปรากฏบนหน้าเพจ`,
            hashtags: '',
            attachments: []
          }
        ]
      }
    },
    {
      id: 'draft-1dc15bda-02ee-4dad-9d9e-4ba4031623db',
      currentRevision: 1,
      payload: {
        revision: 1,
        title: 'ข้อจำกัดของพื้นที่ปลอดภัยในการวางองค์ประกอบบนวิดีโอแนวตั้ง',
        contentType: 'text',
        destinations: [
          {
            accountId: ACCOUNT_ID,
            caption: `ในวิดีโอแนวตั้งอัตราส่วน 9:16 หน้าจอของแอปพลิเคชันมักมีองค์ประกอบส่วนติดต่อผู้ใช้ เช่น แถบข้อมูลด้านล่าง ไอคอนการโต้ตอบด้านขวา และรอยบากของหน้าจออุปกรณ์ด้านบน

เมื่อจำเป็นต้องวางข้อความหรือโลโก้แบบเคลื่อนไหวบนวิดีโอ จึงต้องกำหนดขอบเขตพื้นที่ปลอดภัย (Safe Area) เพื่อไม่ให้องค์ประกอบเคลื่อนที่ไปบดบังหรือถูกส่วนติดต่อผู้ใช้ของแอปพลิเคชันบดบัง

ตัวอย่างค่าขอบเขตที่ระบบ Social Command Center ใช้ในการคำนวณพิกัด ได้แก่ การเว้นระยะจากขอบบนอย่างน้อย 120 พิกเซล ขอบล่างอย่างน้อย 280 พิกเซล และขอบขวาอย่างน้อย 120 พิกเซล พร้อมทั้งใส่เงาเพื่อให้มองเห็นได้ทั้งบนพื้นหลังโทนสว่างและโทนมืด`,
            hashtags: '',
            attachments: []
          }
        ]
      }
    },
    {
      id: 'draft-6c13f2e1-b858-46dc-9204-cb14d87185bd',
      currentRevision: 1,
      payload: {
        revision: 1,
        title: 'ข้อดีและข้อจำกัดของการรันระบบอัตโนมัติบนเครื่องส่วนตัวเทียบกับคลาวด์',
        contentType: 'text',
        destinations: [
          {
            accountId: ACCOUNT_ID,
            caption: `การรันระบบอัตโนมัติหรือเครื่องมือจัดการส่วนตัวมีสองแนวทางหลักที่มีข้อดีและข้อจำกัดต่างกัน:

การใช้คลาวด์เซิร์ฟเวอร์มีข้อดีด้านความต่อเนื่องของระบบ ไม่ขึ้นอยู่กับไฟฟ้าหรือการเชื่อมต่ออินเทอร์เน็ตที่บ้าน แต่มีค่าใช้จ่ายต่อเนื่องตามการใช้งาน และต้องจัดการการส่งไฟล์ขนาดใหญ่ผ่านเครือข่ายภายนอก

การรันบนเครื่องส่วนตัว (Self-hosted) ประหยัดค่าบริการเซิร์ฟเวอร์ และจัดการไฟล์ขนาดใหญ่บนเครื่องได้โดยตรง แต่มีข้อจำกัดเรื่องความพร้อมของเครื่อง เช่น การปิดเครื่อง การพักหน้าจอ การอัปเดตระบบปฏิบัติการ หรือปัญหาไฟฟ้าดับ ซึ่งอาจทำให้งานที่ตั้งเวลาไว้หยุดชะงัก

การออกแบบระบบที่รันบนเครื่องส่วนตัวจึงจำเป็นต้องมีขั้นตอนตรวจสอบงานที่ค้างเมื่อระบบเริ่มทำงานใหม่ เพื่อป้องกันการรันงานซ้ำโดยไม่ตั้งใจ`,
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
    console.log(`Updated Draft ${item.id}: Revision ${data.draft.revision}, Status: ${data.draft.status}, Title: "${data.draft.title}"`);
  }

  console.log('\n=== All revisions successfully applied! ===');
}

main().catch(e => {
  console.error('Execution error:', e);
  process.exit(1);
});
