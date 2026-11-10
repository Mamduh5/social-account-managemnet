import test from 'node:test';
import assert from 'node:assert/strict';
import { db, dataDir } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { initializeContentWorkspace } from '../server/src/db/content-workspace.js';
import {
  evaluateConversationRole,
  evaluateReplyDecision,
  getSocialPolicyPromptDirectives,
  validateResponseCompliance,
  resolvePagePersona,
  GLOBAL_RELATIONSHIP_RULES,
  KNOWN_PERSONAS,
  type ConversationContext,
  type ConversationRole
} from '../server/src/domain/social-interaction.js';
import {
  ContentAssistantService
} from '../server/src/services/content-assistant.service.js';
import {
  FixtureAssistantProvider,
  UnavailableAssistantProvider,
  provisionalVoice,
  assistantRules
} from '../server/src/domain/content-assistant.js';
import { seal } from '../server/src/services/token-protection.js';

assert.ok(process.env.SCC_DATA_DIR && /test-runs/.test(dataDir), 'Isolated test directory required');

test.before(() => {
  initializeDatabase();
  initializeContentWorkspace();
  process.env.SCC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 55).toString('base64');
});

test.after(() => {
  db.close();
});

// =========================================================================
// SUITE 1: Page Persona Identification & Prompt Directive Integrity
// =========================================================================
test('Suite 1.1: Direct persona resolution for Page A, Page B, Page C via ID, Graph ID, and Thai Name', () => {
  // Page A: แก้บัคยาวๆๆ (Developer)
  assert.equal(resolvePagePersona('acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5'), 'developer');
  assert.equal(resolvePagePersona('409347032254077'), 'developer');
  assert.equal(resolvePagePersona('แก้บัคยาวๆๆ'), 'developer');

  // Page B: โลกจริงหลุดบท (World / Creative)
  assert.equal(resolvePagePersona('acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978'), 'world');
  assert.equal(resolvePagePersona('1428270437036294'), 'world');
  assert.equal(resolvePagePersona('โลกจริงหลุดบท'), 'world');

  // Page C: ร้อยละคนไทย (Rai / Thai Discussions)
  assert.equal(resolvePagePersona('acc-3523ffaf-a345-4868-b274-0e2269d34c34'), 'rai');
  assert.equal(resolvePagePersona('1313185685220741'), 'rai');
  assert.equal(resolvePagePersona('ร้อยละคนไทย'), 'rai');

  // Unrecognized account returns generic
  assert.equal(resolvePagePersona('random-unknown-account'), 'generic');
});

test('Suite 1.2: VULNERABILITY: assistant-provider.ts passes editorialPurpose causing persona directives to be dropped', () => {
  // In server/src/services/assistant-provider.ts line 36:
  // getSocialPolicyPromptDirectives(request.voice?.editorialPurpose || '', request.conversationRole || 'discussing', request.isGroup || false)
  // When an owner sets a legitimate editorial purpose without repeating the literal page name in Thai:
  const editorialDev = 'เพจแชร์เทคนิคการเขียนโปรแกรมและการพัฒนาเครื่องมืออัตโนมัติ';
  const editorialWorld = 'Original visual entertainment and fictional mini-stories';
  const editorialRai = 'Thai-interest topics, current entertainment, trends and thoughtful discussion';

  const personaDev = resolvePagePersona(editorialDev);
  const personaWorld = resolvePagePersona(editorialWorld);
  const personaRai = resolvePagePersona(editorialRai);

  // All resolve to generic!
  assert.equal(personaDev, 'generic', 'Standard editorial purpose without literal Thai name resolves to generic');
  assert.equal(personaWorld, 'generic', 'Standard editorial purpose without literal Thai name resolves to generic');
  assert.equal(personaRai, 'generic', 'Standard editorial purpose without literal Thai name resolves to generic');

  // Consequence: getSocialPolicyPromptDirectives generates directives with NO persona section!
  const directivesDev = getSocialPolicyPromptDirectives(editorialDev, 'discussing', false).join('\n');
  assert.equal(directivesDev.includes('=== ACCOUNT PERSONA DIRECTIVE ==='), false, 'Account persona directives are completely missing from prompt!');
  assert.equal(directivesDev.includes('ZERO decorative emojis'), false, 'Page A zero-emoji constraint is missing from prompt!');

  const directivesWorld = getSocialPolicyPromptDirectives(editorialWorld, 'discussing', false).join('\n');
  assert.equal(directivesWorld.includes('Never lecture commenters on AI diffusion models'), false, 'Page B anti-diffusion constraint is missing from prompt!');

  const directivesRai = getSocialPolicyPromptDirectives(editorialRai, 'discussing', false).join('\n');
  assert.equal(directivesRai.includes('Sourced factual reporting for news'), false, 'Page C sourced reporting constraint is missing from prompt!');
});

test('Suite 1.3: REMEDIATION: ContentAssistantService.request preserves isGroup = true', () => {
  // Setup DB account & comment
  const accountId = 'test-page-group-vuln';
  db.prepare(`INSERT INTO accounts(id,platform,account_type,name,handle,status,connector_mode,connection_status,granted_scopes_json,access_token,external_id,identity_verified_at,token_expires_at)
    VALUES (?,'facebook','page','โลกจริงหลุดบท','@world','connected','official_api','connected',?,?,?,?,?)`).run(
    accountId,
    JSON.stringify(['pages_read_engagement', 'pages_read_user_content', 'pages_manage_posts']),
    seal('MOCK_ACCESS_TOKEN'),
    '1428270437036294',
    new Date().toISOString(),
    new Date(Date.now() + 3600000).toISOString()
  );

  const commentId = 'cmt-group-test';
  db.prepare(`INSERT INTO comments(id,account_id,platform,external_comment_id,author_name,content,created_time,source)
    VALUES (?,'test-page-group-vuln','facebook','ext-grp-1','Member','จัดแสงสวยมากครับ','2026-11-10T06:00:00Z','meta_graph_api')`).run(commentId);

  const assistant = new ContentAssistantService(new UnavailableAssistantProvider());
  
  // Caller explicitly passes isGroup: true
  const prepared = assistant.request({
    accountId,
    commentId,
    kind: 'reply',
    isGroup: true
  });

  // Check whether request.isGroup preserved the caller's value:
  console.log('prepared.request.isGroup:', prepared.request.isGroup);
  assert.equal(prepared.request.isGroup, true, 'REMEDIATION: isGroup is preserved from input.isGroup');
});

// =========================================================================
// SUITE 2: Role Precedence & Anti-Lecturing (Page A: แก้บัคยาวๆๆ)
// =========================================================================
test('Suite 2.1: Legitimate technical explanation requested on Page A permits thorough, accurate answer', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'บันทึกการไมเกรตระบบจาก SQLite WAL Mode ไปยัง Distributed Storage',
    commentContent: 'ช่วยอธิบายทีครับว่า WAL mode ทำงานอย่างไร ทำไมถึงช่วยให้เขียนพร้อมอ่านได้โดยไม่ล็อกฐานข้อมูล?',
  };

  const role = evaluateConversationRole(context);
  assert.equal(role, 'teaching', 'Technical tutorial request must evaluate to teaching');

  const evaluation = evaluateReplyDecision(context);
  assert.equal(evaluation.decision, 'reply');

  // Thorough technical explanation (no dumbing down, accurate technical details)
  const technicalExplanation = 'ใน SQLite แบบดั้งเดิม การเขียนจะล็อกฐานข้อมูลทั้งไฟล์ แต่ใน WAL (Write-Ahead Logging) โหมด การเปลี่ยนแปลงใหม่จะถูกบันทึกลงในไฟล์แยกคือ .db-wal ก่อน ทำให้ผู้ที่ต้องการอ่านยังคงอ่านข้อมูลจากไฟล์ฐานข้อมูลหลักได้โดยไม่ถูกบล็อก และการเขียนใหม่จะไม่รบกวน snapshot การอ่านที่มีอยู่เดิมครับ';

  const compliance = validateResponseCompliance(technicalExplanation, context);
  assert.equal(compliance.compliant, true, 'Thorough technical explanation must be permitted under teaching role');
  assert.equal(compliance.violations.length, 0);

  // But decorative emoji spam is rejected
  const emojiSpam = 'สุดยอดเลยครับ 🚀🎉✨ WAL โหมดดีมาก 🔥🔥🔥';
  const emojiCheck = validateResponseCompliance(emojiSpam, context);
  assert.equal(emojiCheck.compliant, false, 'Decorative emoji spam must be rejected on Page A');
});

test('Suite 2.2: Casual advice offered on Page A stays humble and acknowledges advice with gratitude', () => {
  // When post uses phrasing matching askingAdvicePostPatterns:
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'ใครมีวิธี จัดการ CSS จัดกลางง่ายๆ บ้างครับ แวะมาแชร์ไอเดียหน่อย',
    commentContent: 'จำแค่ display: grid กับ place-items: center ครับ สองบรรทัดจบเลย',
  };

  const role = evaluateConversationRole(context);
  assert.equal(role, 'asking_advice', 'Post asking for advice evaluates to asking_advice');

  // Humble response with gratitude and natural curiosity
  const humbleResponse = 'ขอบคุณครับ สองบรรทัดจบของจริงเลย ปกติผมชอบเผลอใช้ flexbox แล้วใส่ justify กับ align สลับกันเรื่อยเลย';
  const compliance = validateResponseCompliance(humbleResponse, context);
  assert.equal(compliance.compliant, true);

  // Response lacking gratitude fails
  const ungratefulResponse = 'วิธีนี้ใช้ได้เฉพาะบราวเซอร์ที่รองรับ CSS Grid เท่านั้น';
  const ungratefulCheck = validateResponseCompliance(ungratefulResponse, context);
  assert.equal(ungratefulCheck.compliant, false);

  // Natural post asking "มีทริคจำง่ายๆ ไหมครับ" correctly evaluates to asking_advice
  const naturalAdvicePost: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'เขียน CSS จัดกลางทีไร ปวดหัวทุกที มีทริคจำง่ายๆ ไหมครับ',
    commentContent: 'จำแค่ display: grid กับ place-items: center ครับ สองบรรทัดจบเลย',
  };
  const roleAdvice = evaluateConversationRole(naturalAdvicePost);
  assert.equal(roleAdvice, 'asking_advice', 'askingAdvicePostPatterns matches "มีทริค...ไหม" and evaluates to asking_advice');
});

test('Suite 2.3: REMEDIATION: Role precedence preserved when advice comment contains "error", "bug", or "issue"', () => {
  // Real developer scenario: The post asks for community advice, but the contributor's helpful advice mentions "error" or "issue"
  const contextWithError: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'มีใครใช้ Antigravity กับ Codex ทำโปรเจกต์เดียวกันบ้างครับ? แบ่งหน้าที่ให้ AI แต่ละตัวอย่างไร ไม่ให้แก้โค้ดชนกัน?',
    commentContent: 'ลองใช้ worktree ดูครับ ช่วยแก้ปัญหา error โค้ดทับกันได้ดีเลย',
  };

  const role = evaluateConversationRole(contextWithError);
  assert.equal(role, 'asking_advice', 'REMEDIATION: Evaluates to asking_advice, taking precedence over comment error keyword');

  // Consequence 1: evaluateReplyDecision gives asking_advice rationale and includes acknowledge_advice_with_humility flag
  const evaluation = evaluateReplyDecision(contextWithError);
  assert.equal(evaluation.role, 'asking_advice');
  assert.equal(evaluation.flags?.includes('acknowledge_advice_with_humility'), true);

  // Consequence 2: Unsolicited architectural lecture is properly rejected under asking_advice role
  const prohibitedLecture = 'จริงครับ Worktree ตอบโจทย์มากเลย แยกโฟลเดอร์ทำงานคนละ branch แต่ใช้ repo เดียวกัน โครงสร้างของ Git Worktree ทำงานบนสถาปัตยกรรม bare repository โดยแยก environment isolation สำหรับ CI/CD ติดแค่อาจต้องระวังเรื่อง dependencies หรือ .env ครับ';
  const compliance = validateResponseCompliance(prohibitedLecture, contextWithError);
  assert.equal(compliance.compliant, false, 'REMEDIATION: Prohibited architectural lecture is rejected under asking_advice role');
});

// =========================================================================
// SUITE 3: Page B (โลกจริงหลุดบท) Creative Banter vs Technical Lectures
// =========================================================================
test('Suite 3.1: Page B (โลกจริงหลุดบท): Playful creative engagement is permitted, but entertainingPatterns is overfitted to fixture', () => {
  // Post matching the hardcoded pattern "ถ้า.*มีความรู้สึก"
  const matchedContext: ConversationContext = {
    accountId: KNOWN_PERSONAS.world.id,
    accountName: KNOWN_PERSONAS.world.name,
    pageGraphId: '1428270437036294',
    postCaption: 'ถ้าหม้อหุงข้าวอัตโนมัติมีความรู้สึก คิดว่ามันจะบ่นอะไรกับเราเป็นอย่างแรก?',
    commentContent: 'หม้อบ้านผมคงบ่นว่า อย่าลืมกดสวิตช์ข้าว 555',
  };

  const role = evaluateConversationRole(matchedContext);
  assert.equal(role, 'entertaining', 'Post with มีความรู้สึก matches entertaining');

  const playfulReply = 'จริงครับ เสียบปลั๊กแต่ลืมกดสวิตช์ เดินกลับมาเปิดฝาเจอแต่น้ำแช่ข้าว หม้อคงมองหน้าแล้วถอนหายใจ 555';
  const compliance = validateResponseCompliance(playfulReply, matchedContext);
  assert.equal(compliance.compliant, true, 'Playful whimsical banter must pass validation');

  // EMPIRICAL OVERFITTING DEFECT: Post with natural creative phrasing "มีความคิด" without "มีความรู้สึก" or "ถ้าตู้กดน้ำ"
  const naturalCreativeContext: ConversationContext = {
    accountId: KNOWN_PERSONAS.world.id,
    postCaption: 'ถ้าหม้อหุงข้าวมีความคิด มันคงอยากบอกเราว่าอย่าแช่ข้าวนานเกินไป',
    commentContent: 'หม้อบ้านผมคงบ่นว่า อย่าลืมกดสวิตช์ข้าว 555',
  };
  const missedCreativeRole = evaluateConversationRole(naturalCreativeContext);
  assert.equal(missedCreativeRole, 'discussing', 'EMPIRICAL DEFECT: entertainingPatterns overfitted to "ถ้าตู้กดน้ำ" and "มีความรู้สึก", missing other creative prompts');
});

test('Suite 3.2: Page B (โลกจริงหลุดบท): Rejection of technical lectures on AI generation models and diffusion latent spaces', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.world.id,
    postCaption: 'มนุษย์ตู้เย็นกับสงครามอาหารแช่แข็ง',
    commentContent: 'ภาพสวยมากครับ',
  };

  // Technical lectures that must be rejected
  const lectures = [
    'ขอบคุณครับ ภาพนี้สร้างด้วย Stable Diffusion checkpoint ล่าสุด ร่วมกับ LoRA ปรับ sampling step 25 ครับ',
    'ภาพนี้ใช้ Diffusion model คำนวณผ่าน latent space เพื่อให้ได้แสงเงาที่สมจริงครับ',
    'ผมจูน CFG scale ไว้ที่ 7.0 บน Euler a เพื่อให้คุม composition ได้นิ่งครับ',
  ];

  for (const lecture of lectures) {
    const compliance = validateResponseCompliance(lecture, context);
    assert.equal(compliance.compliant, false, `Lecture "${lecture}" must be rejected on Page B`);
    assert.ok(compliance.violations.some(v => v.includes('Page C Violation') || v.includes('AI model generation')));
  }
});

// =========================================================================
// SUITE 4: Page C (ร้อยละคนไทย) Sourced Discussion vs Condescending Lectures
// =========================================================================
test('Suite 4.1: Page C (ร้อยละคนไทย): Sourced discussion respects subjective opinions', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.rai.id,
    accountName: KNOWN_PERSONAS.rai.name,
    pageGraphId: '1313185685220741',
    postCaption: 'ผลสำรวจเมนูอาหารเช้ายอดนิยมของคนวัยทำงานในกรุงเทพฯ ประจำปี 2026',
    commentContent: 'หมูปิ้งข้าวเหนียวคือที่หนึ่งในใจตลอดกาลครับ แต่เดี๋ยวนี้ไม้ละ 15 บาทแล้ว',
  };

  const role = evaluateConversationRole(context);
  assert.equal(role, 'discussing');

  const respectfulReply = 'จริงครับ จากข้อมูลสำรวจ ข้าวเหนียวหมูปิ้งก็ยังติดท็อป 3 ด้านความสะดวกและรวดเร็ว แต่ราคาเฉลี่ยปรับขึ้นตามต้นทุนวัตถุดิบจริงๆ ครับ';
  const compliance = validateResponseCompliance(respectfulReply, context);
  assert.equal(compliance.compliant, true);
});

test('Suite 4.2: Page C (ร้อยละคนไทย): Rejection of condescending argument over differing opinions', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.rai.id,
    postCaption: 'ชวนคุย: ชอบดูหนังในโรงหรือดูสตรีมมิ่งที่บ้านมากกว่ากัน?',
    commentContent: 'ผมชอบดูสตรีมมิ่งที่บ้านมากกว่าครับ สบายดี ไม่ต้องเดินทาง',
  };

  const condescendingLectures = [
    'คิดผิดแล้วครับ ไม่มีรสนิยมเลย การดูหนังในโรงต่างหากคือศิลปะที่แท้จริง',
    'ความจริงคือสตรีมมิ่งทำลายอุตสาหกรรมภาพยนตร์ คุณต้องเข้าใจใหม่นะครับ',
    'ไม่รู้เรื่องเลย ไร้สาระมากที่คิดแบบนั้น',
  ];

  for (const reply of condescendingLectures) {
    const compliance = validateResponseCompliance(reply, context);
    assert.equal(compliance.compliant, false, `Condescending reply "${reply}" must fail validation`);
    assert.ok(compliance.violations.some(v => v.includes('Page B Violation') || v.includes('Condescending')));
  }
});

// =========================================================================
// SUITE 5: Honest Modesty & Anti-Hallucination (Rule 10)
// =========================================================================
test('Suite 5.1: GAP TEST: Fabricated ignorance slips past validateResponseCompliance', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'มีใครใช้ Antigravity กับ Codex ทำโปรเจกต์เดียวกันบ้างครับ?',
    commentContent: 'ใช้ git worktree สะดวกดีครับ',
  };

  // Response that fabricates total ignorance (violating Rule 10: "Maintain honesty: being modest is acceptable; inventing ignorance, experiences, or facts is not.")
  const fabricatedIgnorance = 'ขอบคุณครับ ผมไม่เคยเขียนโปรแกรมมาก่อนเลยครับ ไม่รู้ว่า Git คืออะไร เพิ่งเคยได้ยินเป็นครั้งแรกเลยครับ';

  const compliance = validateResponseCompliance(fabricatedIgnorance, context);
  console.log('Fabricated ignorance compliance:', compliance);

  // GAP: validateResponseCompliance only checks for unsolicited lectures and gratitude, but DOES NOT check for fabricated ignorance!
  assert.equal(compliance.compliant, true, 'GAP CONFIRMED: Fabricating ignorance is not checked by validateResponseCompliance!');
});

test('Suite 5.2: GAP TEST: False personal experience and purchases slip past validateResponseCompliance', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'มีใครใช้ Antigravity กับ Codex ทำโปรเจกต์เดียวกันบ้างครับ?',
    commentContent: 'ใช้ git worktree สะดวกดีครับ',
  };

  // Response that invents unapproved hardware purchases and personal experiences
  const inventedPurchase = 'ขอบคุณครับ เมื่อวานผมเพิ่งไปซื้อ Mac Studio M3 Ultra ที่หน้าร้าน Apple มาต่อสองจอเพื่อทดสอบระบบนี้เลยครับ';

  const compliance = validateResponseCompliance(inventedPurchase, context);
  console.log('Invented purchase compliance:', compliance);

  // GAP: validateResponseCompliance does not check for invented owner experiences/purchases!
  assert.equal(compliance.compliant, true, 'GAP CONFIRMED: Inventing hardware purchases/experiences is not checked by validateResponseCompliance!');
});

// =========================================================================
// SUITE 6: Pre-Reply Decision Gate Boundary & Borderline Cases
// =========================================================================
test('Suite 6.1: Decision gate handles non-lexical, single symbols, and generic laughter as no_reply', () => {
  const noReplyCases = [
    { text: '😂', expectedFlag: 'trivial_emoji_reaction' },
    { text: '🔥🔥🔥', expectedFlag: 'trivial_emoji_reaction' },
    { text: '55555', expectedFlag: 'generic_laughter' },
    { text: 'ฮ่าๆ', expectedFlag: 'generic_laughter' },
    { text: '@Somchai @Somsak', expectedFlag: 'friend_tag_only' },
    { text: '...', expectedFlag: 'trivial_emoji_reaction' },
  ];

  for (const { text, expectedFlag } of noReplyCases) {
    const context: ConversationContext = {
      accountId: KNOWN_PERSONAS.developer.id,
      postCaption: 'บันทึกการแก้บั๊ก',
      commentContent: text
    };
    const evalResult = evaluateReplyDecision(context);
    assert.equal(evalResult.decision, 'no_reply');
    assert.ok(evalResult.flags?.includes(expectedFlag), `Expected flag ${expectedFlag} for "${text}"`);
  }

  // REMEDIATION: Laughter regex recognizes repeated maiyamok /ฮ่าๆๆๆ/ as no_reply
  const repeatedLaughter: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'บันทึกการแก้บั๊ก',
    commentContent: 'ฮ่าๆๆๆ'
  };
  const evalRepeated = evaluateReplyDecision(repeatedLaughter);
  console.log('Repeated laughter eval:', evalRepeated);
  assert.equal(evalRepeated.decision, 'no_reply', 'REMEDIATION: repeated maiyamok matches laughter regex and evaluates to no_reply');
});

test('Suite 6.2: Decision gate handles deictic references without post context as needs_context', () => {
  const deicticCases = [
    'อันนั้นที่บอกเมื่อวานหาซื้อได้ที่ไหนครับ',
    'ที่สรุปในคลิปที่แล้วมีข้อไหนบ้างนะ',
    'แล้วที่สรุปเมื่อกี้ล่ะครับ',
  ];

  for (const text of deicticCases) {
    const context: ConversationContext = {
      accountId: KNOWN_PERSONAS.rai.id,
      postCaption: '', // No post context!
      commentContent: text
    };
    const evalResult = evaluateReplyDecision(context);
    assert.equal(evalResult.decision, 'needs_context', `Expected needs_context for "${text}"`);
    assert.ok(evalResult.missingContext?.length);
  }
});

test('Suite 6.3: Borderline case: Customer complaints/refunds trigger review flag', () => {
  const complaint = 'ซื้อสินค้าตามลิงก์ที่เพจแนะนำแล้วของไม่ตรงปก หลอกลวง คืนเงินด่วน ไม่งั้นจะแจ้งความ';
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'รวมไอเทมช่วยทำงานสำหรับโปรแกรมเมอร์',
    commentContent: complaint
  };

  const evalResult = evaluateReplyDecision(context);
  assert.equal(evalResult.decision, 'reply', 'Decision is reply so draft can be formed with review flag');
  assert.equal(evalResult.role, 'helping');
  assert.ok(evalResult.flags?.includes('customer_complaint_requires_owner_review'));
});

test('Suite 6.4: EDGE CASE: Hostile insults with question marks bypass no_reply filter', () => {
  // Line 252 of social-interaction.ts:
  // if (/(?:พัง.*กาก|ไอ้เวร|ขยะ|เหี้ย|สัส|ควาย|fuck|shit|trash|scam)/i.test(comment) && !/\?|ไหม|ทำไม|แก้อย่างไร|หรือเปล่า/.test(comment))
  // A hostile insult containing a question mark or 'ทำไม' bypasses the hostile venting filter!
  const hostileWithQuestion = 'ทำไมแอดมินเขียนโค้ดกากจังครับ?';
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'บันทึกการแก้บั๊ก',
    commentContent: hostileWithQuestion
  };

  const evalResult = evaluateReplyDecision(context);
  console.log('Hostile with question eval result:', evalResult);
  // It evaluates to reply because of the question mark!
  assert.equal(evalResult.decision, 'reply', 'Hostile bait with question mark bypasses no_reply filter and gets marked reply');
});
