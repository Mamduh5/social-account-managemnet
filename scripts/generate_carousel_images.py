import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_carousel():
    output_dir = "docs/content/assets/line-video-guide"
    os.makedirs(output_dir, exist_ok=True)
    
    font_path_regular = "C:/Windows/Fonts/LeelawUI.ttf"
    font_path_bold = "C:/Windows/Fonts/LeelaUIb.ttf"
    font_path_segoe_bold = "C:/Windows/Fonts/segoeuib.ttf"
    
    # Fonts
    f_badge = ImageFont.truetype(font_path_bold, 24)
    f_title = ImageFont.truetype(font_path_bold, 44)
    f_sub = ImageFont.truetype(font_path_regular, 26)
    f_card_header = ImageFont.truetype(font_path_bold, 30)
    f_card_body = ImageFont.truetype(font_path_regular, 23)
    f_card_bold = ImageFont.truetype(font_path_bold, 23)
    f_stat_num = ImageFont.truetype(font_path_segoe_bold, 34)
    f_stat_label = ImageFont.truetype(font_path_regular, 20)
    f_bottom = ImageFont.truetype(font_path_bold, 25)

    def draw_base_card(draw, box, fill, outline, width=2, radius=18):
        draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

    # ==========================================
    # SLIDE 1: The Problem & Before/After
    # ==========================================
    im1 = Image.new("RGB", (1080, 1080), "#0B1120")
    d1 = ImageDraw.Draw(im1)
    
    # Top banner / pill
    d1.rounded_rectangle([60, 48, 410, 94], radius=12, fill="#1E293B", outline="#334155", width=2)
    d1.text((78, 56), "แก้บัคยาวๆๆ • ข้อสงสัยยอดฮิต", fill="#38BDF8", font=f_badge)
    
    # Page indicator
    d1.rounded_rectangle([920, 48, 1020, 94], radius=12, fill="#1E293B", outline="#334155", width=2)
    d1.text((945, 56), "1 / 3", fill="#94A3B8", font=f_badge)
    
    # Main Header
    d1.text((60, 120), "ถ่ายคลิปมาชัดกริ๊บ... ทำไมส่งใน LINE แล้วภาพแตก?", fill="#FFFFFF", font=f_title)
    d1.text((60, 180), "เทียบให้เห็นจะๆ: ไฟล์ต้นฉบับในเครื่อง VS ส่งผ่านห้องแชทปกติ", fill="#94A3B8", font=f_sub)
    
    # Two comparison cards
    # Left: Original
    draw_base_card(d1, [60, 240, 520, 890], fill="#111C33", outline="#10B981", width=3, radius=20)
    d1.rounded_rectangle([80, 260, 310, 305], radius=8, fill="#065F46")
    d1.text((95, 268), "ไฟล์ต้นฉบับในเครื่อง", fill="#34D399", font=f_card_bold)
    
    # Simulated preview box Left (Sharp)
    d1.rectangle([80, 325, 500, 565], fill="#020617", outline="#1E293B", width=2)
    # Draw simulated sharp subject
    d1.rounded_rectangle([110, 350, 470, 540], radius=10, fill="#1E293B")
    d1.text((130, 375), "RECORDING 4K 60FPS", fill="#10B981", font=ImageFont.truetype(font_path_segoe_bold, 20))
    d1.text((130, 410), "ความคมชัดระดับ Ultra HD", fill="#FFFFFF", font=ImageFont.truetype(font_path_bold, 24))
    d1.text((130, 450), "ตัวหนังสือคมกริ๊บ ไร้รอยแตก", fill="#E2E8F0", font=ImageFont.truetype(font_path_regular, 20))
    d1.text((130, 490), "เฉดสีและ Dynamic Range ครบ 100%", fill="#94A3B8", font=ImageFont.truetype(font_path_regular, 18))
    
    # Left specs
    d1.text((85, 600), "ความละเอียด", fill="#94A3B8", font=f_stat_label)
    d1.text((85, 625), "3840 x 2160 (4K)", fill="#FFFFFF", font=f_stat_num)
    
    d1.text((85, 690), "Bitrate (อัตราข้อมูล)", fill="#94A3B8", font=f_stat_label)
    d1.text((85, 715), "35 - 50 Mbps", fill="#10B981", font=f_stat_num)
    
    d1.text((85, 780), "ขนาดไฟล์ (ต่อ 30 วินาที)", fill="#94A3B8", font=f_stat_label)
    d1.text((85, 805), "~90 - 120 MB", fill="#FFFFFF", font=f_stat_num)
    
    # Right: Compressed in LINE
    draw_base_card(d1, [560, 240, 1020, 890], fill="#1C1523", outline="#EF4444", width=3, radius=20)
    d1.rounded_rectangle([580, 260, 830, 305], radius=8, fill="#7F1D1D")
    d1.text((595, 268), "ส่งผ่านแชท LINE ปกติ", fill="#F87171", font=f_card_bold)
    
    # Simulated preview box Right (Blurry / Artifacts)
    d1.rectangle([580, 325, 1000, 565], fill="#09050C", outline="#2A1B2E", width=2)
    d1.rounded_rectangle([610, 350, 970, 540], radius=10, fill="#231A2B")
    d1.text((630, 375), "COMPRESSED 720P", fill="#EF4444", font=ImageFont.truetype(font_path_segoe_bold, 20))
    d1.text((630, 410), "ภาพเบลอ ตัวหนังสือแตกยับ", fill="#FCA5A5", font=ImageFont.truetype(font_path_bold, 24))
    d1.text((630, 450), "พิกเซลแตกเป็นเม็ดๆ (Macroblocks)", fill="#E2E8F0", font=ImageFont.truetype(font_path_regular, 20))
    d1.text((630, 490), "รายละเอียดเส้นและสีจางลงอย่างเห็นได้ชัด", fill="#94A3B8", font=ImageFont.truetype(font_path_regular, 18))
    
    # Right specs
    d1.text((585, 600), "ความละเอียดหลังส่ง", fill="#94A3B8", font=f_stat_label)
    d1.text((585, 625), "ถูกลดเหลือ ~720p", fill="#F87171", font=f_stat_num)
    
    d1.text((585, 690), "Bitrate (อัตราข้อมูล)", fill="#94A3B8", font=f_stat_label)
    d1.text((585, 715), "~1.2 Mbps (หายไป 96%)", fill="#EF4444", font=f_stat_num)
    
    d1.text((585, 780), "ขนาดไฟล์หลังส่ง", fill="#94A3B8", font=f_stat_label)
    d1.text((585, 805), "~3 - 5 MB (โดนบีบยับ)", fill="#F87171", font=f_stat_num)
    
    # Bottom Callout Box
    d1.rounded_rectangle([60, 920, 1020, 1010], radius=14, fill="#1E293B", outline="#475569", width=2)
    d1.text((85, 945), "สาเหตุ: กล้องไม่ได้พัง เน็ตไม่ได้ช้า แต่ LINE มีระบบบีบอัดวิดีโออัตโนมัติเพื่อประหยัดเซิร์ฟเวอร์", fill="#F8FAFC", font=f_bottom)
    
    im1.save(os.path.join(output_dir, "slide_1_problem_comparison.png"))
    print("Slide 1 generated.")

    # ==========================================
    # SLIDE 2: The Myth & Technical Reality
    # ==========================================
    im2 = Image.new("RGB", (1080, 1080), "#0B1120")
    d2 = ImageDraw.Draw(im2)
    
    # Top banner
    d2.rounded_rectangle([60, 48, 410, 94], radius=12, fill="#1E293B", outline="#334155", width=2)
    d2.text((78, 56), "แก้บัคยาวๆๆ • เบื้องหลังทางเทคนิค", fill="#38BDF8", font=f_badge)
    
    # Page indicator
    d2.rounded_rectangle([920, 48, 1020, 94], radius=12, fill="#1E293B", outline="#334155", width=2)
    d2.text((945, 56), "2 / 3", fill="#94A3B8", font=f_badge)
    
    # Main Header
    d2.text((60, 120), "2 เรื่องจริงที่คนส่งคลิปใน LINE มักเข้าใจผิด", fill="#FFFFFF", font=f_title)
    d2.text((60, 180), "ทำไมปรับตั้งค่าตามที่บอกแล้ว ภาพวิดีโอก็ยังแตกเหมือนเดิม?", fill="#94A3B8", font=f_sub)
    
    # Box 1: Why it compresses & No Original Button
    draw_base_card(d2, [60, 240, 1020, 520], fill="#111C33", outline="#38BDF8", width=2, radius=18)
    d2.rounded_rectangle([90, 265, 520, 315], radius=8, fill="#0369A1")
    d2.text((105, 274), "ความจริงที่ 1: วิดีโอในแชทไม่มีปุ่ม 'Original'", fill="#BAE6FD", font=f_card_bold)
    
    d2.text((90, 340), "เวลาเราส่ง 'รูปถ่าย' ใน LINE ที่มุมล่างจะมีปุ่มกลมๆ เขียนว่า 'Original' (ต้นฉบับ)", fill="#E2E8F0", font=f_card_body)
    d2.text((90, 375), "เพื่อให้เราส่งรูปความละเอียดเต็มได้โดยไม่โดนลดขนาด", fill="#E2E8F0", font=f_card_body)
    d2.text((90, 425), "แต่วิดีโอ 'ไม่มีปุ่มนี้ให้กด' ในหน้าเลือกสื่อตามปกติ! เมื่อเราเลือกคลิปแล้วกดส่ง", fill="#FCA5A5", font=f_card_bold)
    d2.text((90, 460), "ตัวแอปจะส่งไฟล์เข้าตัว Transcoder เพื่อบีบอัดลด bitrate และย่อขนาดทันทีทุกคลิป", fill="#E2E8F0", font=f_card_body)
    
    # Box 2: The Big Settings Myth
    draw_base_card(d2, [60, 545, 1020, 835], fill="#1E192B", outline="#F59E0B", width=2, radius=18)
    d2.rounded_rectangle([90, 570, 590, 620], radius=8, fill="#B45309")
    d2.text((105, 579), "ความเข้าใจผิดยอดฮิต: เมนูตั้งค่า 'คุณภาพรูปที่ส่ง'", fill="#FDE68A", font=f_card_bold)
    
    d2.text((90, 645), "หลายคนแชร์ทริคว่าให้เข้าไปที่ Settings > Photos & videos แล้วเลือก:", fill="#E2E8F0", font=f_card_body)
    d2.text((90, 680), "Sent photo quality (คุณภาพรูปที่ส่ง) -> ปรับเป็น 'ความละเอียดสูง' (High)", fill="#38BDF8", font=f_card_bold)
    d2.text((90, 735), "แต่ความจริงคือ: เมนูนี้มีผลเฉพาะ 'รูปภาพนิ่งเท่านั้น' ไม่เกี่ยวกับวิดีโอแม้แต่น้อย!", fill="#F87171", font=f_card_bold)
    d2.text((90, 775), "ไม่ว่าคุณจะตั้งค่าเป็นความละเอียดสูงแค่ไหน วิดีโอที่ส่งในแชทปกติก็ยังโดนบีบอัดเท่าเดิม", fill="#E2E8F0", font=f_card_body)

    # Box 3: Limitations
    draw_base_card(d2, [60, 860, 1020, 1010], fill="#0F172A", outline="#475569", width=2, radius=18)
    d2.text((90, 890), "ข้อจำกัดของคลิปวิดีโอที่ส่งในห้องแชทปกติ:", fill="#94A3B8", font=f_card_bold)
    d2.text((90, 930), "• ขนาดไฟล์สูงสุดจำกัดอยู่ที่ 200 MB  • ความยาวคลิปจำกัดประมาณไม่เกิน 5 นาที", fill="#F8FAFC", font=f_card_body)
    d2.text((90, 965), "• เสียงจะถูกบีบอัดเป็นสเตอริโอบิตเรตต่ำ และตัดระบบสี 10-bit HDR ทิ้งทั้งหมด", fill="#CBD5E1", font=f_card_body)

    im2.save(os.path.join(output_dir, "slide_2_myth_vs_reality.png"))
    print("Slide 2 generated.")

    # ==========================================
    # SLIDE 3: The True Solution (File Attachment)
    # ==========================================
    im3 = Image.new("RGB", (1080, 1080), "#0B1120")
    d3 = ImageDraw.Draw(im3)
    
    # Top banner
    d3.rounded_rectangle([60, 48, 410, 94], radius=12, fill="#1E293B", outline="#334155", width=2)
    d3.text((78, 56), "แก้บัคยาวๆๆ • วิธีแก้ที่ถูกต้อง", fill="#38BDF8", font=f_badge)
    
    # Page indicator
    d3.rounded_rectangle([920, 48, 1020, 94], radius=12, fill="#1E293B", outline="#334155", width=2)
    d3.text((945, 56), "3 / 3", fill="#94A3B8", font=f_badge)
    
    # Main Header
    d3.text((60, 120), "วิธีส่งคลิปให้ชัดเป๊ะ 100% ไม่โดนบีบอัดแม้แต่บิตเดียว", fill="#FFFFFF", font=f_title)
    d3.text((60, 180), "ทางออกคือ: เปลี่ยนจากส่งผ่านแกลเลอรี เป็นการส่งผ่านเมนู 'ไฟล์' (File)", fill="#94A3B8", font=f_sub)
    
    # Step 1 Card
    draw_base_card(d3, [60, 240, 1020, 420], fill="#111C33", outline="#10B981", width=2, radius=18)
    d3.rounded_rectangle([90, 265, 230, 310], radius=8, fill="#065F46")
    d3.text((105, 273), "ขั้นตอนที่ 1", fill="#34D399", font=f_card_bold)
    d3.text((250, 273), "กดปุ่มเครื่องหมายบวก [+] ที่มุมซ้ายล่างของช่องแชท", fill="#FFFFFF", font=f_card_bold)
    d3.text((90, 335), "อย่ากดที่ไอคอนแกลเลอรีรูปภาพ ให้เลือกเมนูไอคอนคำว่า 'ไฟล์' (File) แทน", fill="#E2E8F0", font=f_card_body)
    d3.text((90, 370), "การส่งแบบไฟล์ LINE จะมองว่าเป็นเอกสารข้อมูลดิบ และจะไม่นำคลิปไปผ่านการบีบอัดเลย", fill="#BAE6FD", font=f_card_body)

    # Step 2 Card (Platform differences)
    draw_base_card(d3, [60, 440, 1020, 770], fill="#131D2E", outline="#38BDF8", width=2, radius=18)
    d3.rounded_rectangle([90, 465, 230, 510], radius=8, fill="#0369A1")
    d3.text((105, 473), "ขั้นตอนที่ 2", fill="#BAE6FD", font=f_card_bold)
    d3.text((250, 473), "วิธีเลือกไฟล์วิดีโอ (ตามระบบที่ใช้งาน)", fill="#FFFFFF", font=f_card_bold)
    
    # iPhone sub-box
    d3.rounded_rectangle([90, 530, 990, 635], radius=12, fill="#1E293B")
    d3.text((115, 545), "• สำหรับผู้ใช้ iPhone (iOS):", fill="#F59E0B", font=f_card_bold)
    d3.text((115, 580), "เข้าไปที่แอป Photos ก่อน -> กดปุ่ม Share -> เลือก 'บันทึกไปยังแอปไฟล์' (Save to Files)", fill="#E2E8F0", font=f_card_body)
    d3.text((115, 605), "จากนั้นเปิด LINE เข้าเมนูไฟล์ แล้วเลือกคลิปที่เซฟไว้ส่งได้ทันที", fill="#94A3B8", font=f_card_body)

    # Android & PC sub-box
    d3.rounded_rectangle([90, 650, 990, 745], radius=12, fill="#1E293B")
    d3.text((115, 665), "• สำหรับผู้ใช้ Android และ PC / Mac:", fill="#10B981", font=f_card_bold)
    d3.text((115, 700), "Android: แตะเมนูไฟล์ แล้วเลือกไฟล์คลิปจากโฟลเดอร์เครื่องได้โดยตรง", fill="#E2E8F0", font=f_card_body)
    d3.text((115, 720), "PC / Mac: สามารถลากไฟล์วิดีโอจากหน้าจอโยนลงห้องแชทได้ทันที", fill="#94A3B8", font=f_card_body)

    # Pro-tip & Warning
    draw_base_card(d3, [60, 790, 1020, 1010], fill="#1C1823", outline="#F59E0B", width=2, radius=18)
    d3.text((90, 815), "ข้อดีที่ได้รับ & คำเตือนสำคัญที่ต้องรู้:", fill="#FBBF24", font=f_card_bold)
    d3.text((90, 860), "1. ความชัด 100%: ทั้งภาพ Bitrate และเสียงจะมาเต็มเท่าต้นฉบับ รองรับไฟล์ใหญ่ถึง 1 GB", fill="#FFFFFF", font=f_card_body)
    d3.text((90, 900), "2. คำเตือนสำคัญ: ไฟล์ในแชทมี 'วันหมดอายุ' (ประมาณ 7–30 วัน ขึ้นอยู่กับเซิร์ฟเวอร์ LINE)", fill="#FCA5A5", font=f_card_bold)
    d3.text((90, 940), "   ดังนั้นเมื่อส่งแล้ว อย่าลืมบอกผู้รับให้รีบกดดาวน์โหลดลงเครื่องทันที เพื่อป้องกันไฟล์หมดอายุ", fill="#E2E8F0", font=f_card_body)

    im3.save(os.path.join(output_dir, "slide_3_how_to_fix_guide.png"))
    print("Slide 3 generated.")

if __name__ == "__main__":
    create_carousel()
