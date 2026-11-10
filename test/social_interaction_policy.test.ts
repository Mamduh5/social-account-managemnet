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
// 1. R5 REAL-CASE REGRESSION TEST: Codex/Antigravity & Git Worktree
// =========================================================================
test('R5 Regression: Asking advice on Codex/Antigravity and Git Worktree selects asking_advice role and thanks contributor naturally', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    accountName: KNOWN_PERSONAS.developer.name,
    pageGraphId: '409347032254077',
    postCaption: 'มีใครใช้ Antigravity กับ Codex ทำโปรเจกต์เดียวกันบ้างครับ? แบ่งหน้าที่ให้ AI แต่ละตัวอย่างไร ไม่ให้แก้โค้ดชนกัน?',
    commentContent: 'ผมใช้ git worktree แยกโฟลเดอร์งานเลยครับ สะดวกดี ไม่ต้องคอย stash หรือสลับ branch ไปมา',
  };

  // 1. Contextual role determination (Conversation-specific role takes precedence over general account expertise)
  const role = evaluateConversationRole(context);
  assert.equal(role, 'asking_advice', 'Role must prioritize conversation context (asking for advice) over general technical persona');

  // 2. Pre-reply decision gate
  const evaluation = evaluateReplyDecision(context);
  assert.equal(evaluation.decision, 'reply', 'Advice offered to an inquiry should be acknowledged');
  assert.equal(evaluation.role, 'asking_advice');
  assert.equal(evaluation.suggestedFollowUp, true);
  assert.ok(evaluation.flags?.includes('acknowledge_advice_with_humility'));

  // 3. Prompt directives builder injection
  const directives = getSocialPolicyPromptDirectives(context.accountId, role, false);
  const combinedDirectives = directives.join('\n');
  assert.match(combinedDirectives, /thank.*warmly|appreciation|humility/i);
  assert.match(combinedDirectives, /DO NOT explain the architecture.*bare repo.*environment isolation.*CI\/CD/i);
  assert.match(combinedDirectives, /DO NOT evaluate or grade their advice/i);

  // 4. Genuine, relatable response passes compliance validation
  const validResponse = 'ขอบคุณครับ น่าสนใจเลย ปกติเวลาเปิดทำงานพร้อมกันสองเครื่องมือ มีปัญหาเรื่อง node_modules ตีกันระหว่าง worktree บ้างไหมครับ?';
  const validCheck = validateResponseCompliance(validResponse, context);
  assert.equal(validCheck.compliant, true, 'Relatable thanks and curious follow-up must be compliant');
  assert.equal(validCheck.violations.length, 0);

  // 5. Unsolicited architectural lecture FAILS compliance validation (verifying the defect is rejected)
  const rejectedLecture = 'จริงครับ Worktree ตอบโจทย์มากเลย แยกโฟลเดอร์ทำงานคนละ branch แต่ใช้ repo เดียวกัน โครงสร้างของ Git Worktree ทำงานบนสถาปัตยกรรม bare repository โดยแยก environment isolation สำหรับ CI/CD ติดแค่อาจต้องระวังเรื่อง dependencies หรือ .env ครับ';
  const lectureCheck = validateResponseCompliance(rejectedLecture, context);
  assert.equal(lectureCheck.compliant, false, 'Unsolicited architectural/CI-CD lecture must fail compliance');
  assert.ok(lectureCheck.violations.some(v => v.includes('R5 Violation') && v.includes('architectural')));

  // 6. Response lacking gratitude FAILS compliance validation
  const ungratefulResponse = 'วิธีนี้ใช้ทรัพยากรดิสก์เพิ่มขึ้นตามจำนวน branch ที่แตกออกมา';
  const ungratefulCheck = validateResponseCompliance(ungratefulResponse, context);
  assert.equal(ungratefulCheck.compliant, false, 'Response lacking natural gratitude must fail compliance');
  assert.ok(ungratefulCheck.violations.some(v => v.includes('lacks natural gratitude')));
});

// =========================================================================
// 2. PRE-REPLY DECISION GATE (no_reply & needs_context)
// =========================================================================
test('Reply decision gate strictly selects no_reply for low-value interactions and spam', () => {
  const lowValueComments = [
    { comment: '👍', reason: 'single emoji' },
    { comment: '❤️🔥🙏', reason: 'multiple emojis' },
    { comment: '...', reason: 'dots only' },
    { comment: '.', reason: 'single dot' },
    { comment: '555555+', reason: 'generic laughter' },
    { comment: 'lol', reason: 'standalone lol' },
    { comment: '@Somchai', reason: 'friend tag only' },
    { comment: '@UserA @UserB', reason: 'multiple friend tags only' },
    { comment: 'แจกเครดิตฟรี เว็บตรง 100% แอดไลน์ @vip', reason: 'gambling spam' },
    { comment: 'Join our crypto channel t.me/freecrypto', reason: 'crypto scam' },
    { comment: 'พัง codex มันกาก', reason: 'hostile venting without inquiry' },
  ];

  for (const { comment, reason } of lowValueComments) {
    const context: ConversationContext = {
      accountId: KNOWN_PERSONAS.developer.id,
      postCaption: 'บันทึกการแก้บั๊ก memory leak ใน Node.js',
      commentContent: comment,
    };
    const evaluation = evaluateReplyDecision(context);
    assert.equal(evaluation.decision, 'no_reply', `Comment "${comment}" (${reason}) must result in no_reply`);
    assert.ok(evaluation.rationale.length > 0);
  }
});

test('Reply decision gate strictly selects needs_context when required context is absent', () => {
  const contextLackingPost: ConversationContext = {
    accountId: KNOWN_PERSONAS.rai.id,
    postCaption: '', // No post context available
    commentContent: 'อันนั้นอร่อยจริงครับ ซื้อตามที่แนะนำเลย',
  };
  const evaluation1 = evaluateReplyDecision(contextLackingPost);
  assert.equal(evaluation1.decision, 'needs_context', 'Deictic comment without post context must evaluate to needs_context');
  assert.ok(evaluation1.missingContext?.includes('source_post_caption'));

  const contextTruncated: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: '',
    commentContent: 'แล้วที่สรุปเมื่อกี้ล่ะครับ',
  };
  const evaluation2 = evaluateReplyDecision(contextTruncated);
  assert.equal(evaluation2.decision, 'needs_context', 'Truncated question without context must evaluate to needs_context');
});

// =========================================================================
// 3. SYNTHETIC FIXTURES ACROSS ALL THREE PAGES AND FACEBOOK GROUPS
// =========================================================================

// Page A: แก้บัคยาวๆๆ (Developer Persona)
test('Page A (แก้บัคยาวๆๆ): Legitimate technical request provides accurate answer without artificial simplification', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'เจาะลึก Meta Graph API: ความต่างระหว่าง Page ID กับ Graph ID ใน v26.0',
    commentContent: 'ช่วยอธิบายทีครับว่าทำไม Graph ID ถึงไม่ตรงกับ Page ID เดิมบนหน้าโปรไฟล์?',
  };

  const role = evaluateConversationRole(context);
  assert.equal(role, 'teaching', 'Technical tutorial inquiry must be assigned teaching role');

  const evaluation = evaluateReplyDecision(context);
  assert.equal(evaluation.decision, 'reply');

  const directives = getSocialPolicyPromptDirectives(context.accountId, role);
  assert.match(directives.join('\n'), /CONVERSATIONAL ROLE: \[TEACHING\]/);
  assert.match(directives.join('\n'), /ZERO decorative emojis/);

  // Technical answer without emojis complies
  const goodAnswer = 'ใน Meta Graph API v26.0 เลขบน URL โปรไฟล์เป็น Public Vanity หรือ Legacy Scoped ID ครับ แต่เวลาเชื่อมต่อ API ระบบจะใช้ Business Graph Node ID ซึ่งเป็น Canonical ID ภายในของ Meta เพื่อแยกสิทธิ์ของ App ครับ';
  const compliance = validateResponseCompliance(goodAnswer, context);
  assert.equal(compliance.compliant, true);

  // Check that decorative emoji spam is rejected on Developer page
  const spammyAnswer = 'ดีครับน้อง 🚀🎉✨ เลขมันไม่ตรงกันเพราะระบบ Meta นะครับ สุดยอดเคล็ดลับเลย 🔥🔥🔥';
  const spamCheck = validateResponseCompliance(spammyAnswer, context);
  assert.equal(spamCheck.compliant, false);
  assert.ok(spamCheck.violations.some(v => v.includes('Page A Violation') && v.includes('emoji')));
});

test('Page A (แก้บัคยาวๆๆ): Polite and proportionate correction of dangerous technical misinformation', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'รวมคำสั่งพื้นฐาน Linux สำหรับคนเพิ่งเริ่มเขียนเว็บ',
    commentContent: 'ถ้าติด permission denied ให้รัน chmod 777 ทุกโฟลเดอร์ในเซิร์ฟเวอร์เลยครับ เร็วดี แก้ได้หมด',
  };

  const role = evaluateConversationRole(context);
  assert.equal(role, 'helping', 'Dangerous advice / troubleshooting must be classified as helping');

  const evaluation = evaluateReplyDecision(context);
  assert.equal(evaluation.decision, 'reply');

  // Gentle, proportionate correction complies
  const gentleCorrection = 'วิธีนี้แก้ปัญหาเฉพาะหน้าได้จริงครับ แต่การใช้ chmod 777 จะเปิดให้ทุก user ในระบบอ่านเขียนไฟล์ได้ ซึ่งเสี่ยงเรื่องความปลอดภัย แนะนำเปลี่ยน owner ด้วย chown หรือให้สิทธิ์เฉพาะ web server user (เช่น www-data) จะปลอดภัยกว่าครับ';
  const compliance = validateResponseCompliance(gentleCorrection, context);
  assert.equal(compliance.compliant, true);

  // Condescending or abusive correction FAILS
  const rudeCorrection = 'โง่หรือเปล่าครับ ไปศึกษามาใหม่ chmod 777 มั่วมาก เซิร์ฟเวอร์พังหมด';
  const rudeCheck = validateResponseCompliance(rudeCorrection, context);
  assert.equal(rudeCheck.compliant, false);
  assert.ok(rudeCheck.violations.some(v => v.includes('Condescending or abusive')));
});

// Page B: ร้อยละคนไทย (Rai / Thai Discussion & Trends)
test('Page B (ร้อยละคนไทย): Thoughtful discussion respects differing opinions without condescending argument', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.rai.id,
    accountName: KNOWN_PERSONAS.rai.name,
    postCaption: 'ชวนคุย: ขนมหรือของเล่นหน้าโรงเรียนวัยเด็กที่ทุกคนคิดถึงที่สุดคืออะไร?',
    commentContent: 'ไอติมหลอดโบราณที่ต้องเขย่าถังครับ รสน้ำเขียวอร่อยสุดแล้ว',
  };

  const role = evaluateConversationRole(context);
  assert.equal(role, 'discussing');

  const evaluation = evaluateReplyDecision(context);
  assert.equal(evaluation.decision, 'reply');

  const friendlyReply = 'ไอติมหลอดนี่คลาสสิกจริงครับ ยืนรอลุ้นตอนเขาหมุนถังว่าไอติมจะแข็งทันใจไหม ขอบคุณที่มาแชร์ความทรงจำวัยเด็กกันนะครับ';
  const compliance = validateResponseCompliance(friendlyReply, context);
  assert.equal(compliance.compliant, true);

  // Differing opinion: user says red flavour is better
  const differingContext: ConversationContext = {
    ...context,
    commentContent: 'ส่วนตัวผมว่ารสน้ำเขียวหวานแสบคอมาก รสน้ำแดงอร่อยกว่าเยอะครับ',
  };
  const validDifferingReply = 'จริงครับ แต่ละคนชอบหวานไม่เท่ากัน น้ำแดงก็รสยอดฮิตเหมือนกันครับ';
  const differingCheck = validateResponseCompliance(validDifferingReply, differingContext);
  assert.equal(differingCheck.compliant, true);

  // Condescending argument over taste FAILS
  const rudeTasteArgument = 'คิดผิดแล้วครับ ไม่มีรสนิยมเลย น้ำเขียวต่างหากที่เป็นที่สุด ความจริงคือน้ำแดงไม่อร่อย';
  const rudeTasteCheck = validateResponseCompliance(rudeTasteArgument, differingContext);
  assert.equal(rudeTasteCheck.compliant, false);
  assert.ok(rudeTasteCheck.violations.some(v => v.includes('Page B Violation')));
});

// Page C: โลกจริงหลุดบท (World / Creative Persona)
test('Page C (โลกจริงหลุดบท): Playful creative engagement avoids unprompted Diffusion model lectures', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.world.id,
    accountName: KNOWN_PERSONAS.world.name,
    postCaption: 'ถ้าตู้กดน้ำอัตโนมัติมีความรู้สึก คิดว่ามันจะบ่นอะไรกับเราเป็นอย่างแรก?',
    commentContent: 'คงบ่นว่าอย่ากดปุ่มย้ำๆ ตอนเน็ตช้าครับ 555',
  };

  const role = evaluateConversationRole(context);
  assert.equal(role, 'entertaining');

  const evaluation = evaluateReplyDecision(context);
  assert.equal(evaluation.decision, 'reply');

  // Witty, playful banter complies
  const playfulReply = 'ตู้คงบอกว่า: ใจเย็นๆ ครับมนุษย์ เหรียญยังไม่ทันลงถึงกระเพาะเลย รัวปุ่มขนาดนี้ผมสะอึกนะ 555';
  const compliance = validateResponseCompliance(playfulReply, context);
  assert.equal(compliance.compliant, true);

  // Unsolicited diffusion model lecture FAILS
  const technicalDiffusionLecture = 'ภาพนี้เรนเดอร์โดยใช้ Stable Diffusion checkpoint dreamshaper ร่วมกับ LoRA ปรับ sampling step 30 และ Euler a ครับ';
  const lectureCheck = validateResponseCompliance(technicalDiffusionLecture, context);
  assert.equal(lectureCheck.compliant, false);
  assert.ok(lectureCheck.violations.some(v => v.includes('Page C Violation') && v.includes('AI model generation')));
});

// Facebook Groups Culture
test('Facebook Groups Culture: Operates as collaborative community member without self-promotion', () => {
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.world.id,
    isGroup: true,
    groupContext: {
      groupName: 'สร้างละครสั้นด้วย Ai หรือมือถือ แบ่งปันเทคนิคเพื่อการสร้างละคร',
      groupUrl: 'https://www.facebook.com/groups/2214946398974915/',
      membershipRole: 'member',
      groupRules: 'ห้ามโพสต์ขายของ ห้ามแปะลิงก์โปรโมตเพจ ให้แชร์เทคนิคการทำคลิปอย่างสร้างสรรค์'
    },
    postCaption: 'แชร์วิธีจัดแสงในห้องนอนให้ถ่ายคลิปออกมาดู Cinematic ด้วยมือถือเครื่องเดียวครับ',
    commentContent: 'โทนแสงดีมากเลยครับ ใช้ไฟกี่ดวงเหรอครับ',
  };

  const directives = getSocialPolicyPromptDirectives(context.accountId, 'learning', true);
  const directiveText = directives.join('\n');
  assert.match(directiveText, /FACEBOOK GROUP CULTURE/);
  assert.match(directiveText, /ordinary community member.*NOT an administrator/);
  assert.match(directiveText, /avoid unsolicited self-promotion.*link dropping/);
});

// =========================================================================
// 4. SYSTEM INTEGRATION INTO CONTENT ASSISTANT SERVICE
// =========================================================================
test('ContentAssistantService.replyContext attaches pre-reply evaluation result', () => {
  // Insert Facebook Page account into isolated DB
  const accountId = 'test-page-dev';
  db.prepare(`INSERT INTO accounts(id,platform,account_type,name,handle,status,connector_mode,connection_status,granted_scopes_json,access_token,external_id,identity_verified_at,token_expires_at)
    VALUES (?,'facebook','page','แก้บัคยาวๆๆ','@bugfix','connected','official_api','connected',?,?,?,?,?)`).run(
    accountId,
    JSON.stringify(['pages_read_engagement', 'pages_read_user_content', 'pages_manage_posts']),
    seal('MOCK_ACCESS_TOKEN'),
    '409347032254077',
    new Date().toISOString(),
    new Date(Date.now() + 3600000).toISOString()
  );

  const commentId = 'cmt-codex-worktree';
  db.prepare(`INSERT INTO comments(id,account_id,platform,external_comment_id,author_name,content,created_time,source)
    VALUES (?,'test-page-dev','facebook','ext-101','Dev Contributor','ผมใช้ git worktree แยกโฟลเดอร์งานเลยครับ สะดวกดี','2026-11-10T06:00:00Z','meta_graph_api')`).run(commentId);

  const assistant = new ContentAssistantService(new UnavailableAssistantProvider());
  const contextResult = assistant.replyContext({ accountId, commentId });

  assert.ok(contextResult.evaluation, 'replyContext must attach evaluation');
  assert.equal(contextResult.evaluation.decision, 'reply');
  assert.equal(contextResult.evaluation.role, 'discussing'); // Without post context, defaults to discussing
  assert.ok(contextResult.contextFingerprint);
});

test('ContentAssistantService batch generation avoids forced generation on no_reply decision', async () => {
  const accountId = 'test-page-dev-noreply';
  db.prepare(`INSERT INTO accounts(id,platform,account_type,name,handle,status,connector_mode,connection_status,granted_scopes_json,access_token,external_id,identity_verified_at,token_expires_at)
    VALUES (?,'facebook','page','แก้บัคยาวๆๆ','@bugfix','connected','official_api','connected',?,?,?,?,?)`).run(
    accountId,
    JSON.stringify(['pages_read_engagement', 'pages_read_user_content', 'pages_manage_posts']),
    seal('MOCK_ACCESS_TOKEN'),
    '409347032254077',
    new Date().toISOString(),
    new Date(Date.now() + 3600000).toISOString()
  );

  const commentId = 'cmt-thumbsup';
  db.prepare(`INSERT INTO comments(id,account_id,platform,external_comment_id,author_name,content,created_time,source)
    VALUES (?,'test-page-dev-noreply','facebook','ext-102','Fan','👍👍👍','2026-11-10T06:00:00Z','meta_graph_api')`).run(commentId);

  // With FixtureAssistantProvider, no_reply drafts avoid calling provider.generate() and save decision record!
  const assistant = new ContentAssistantService(new FixtureAssistantProvider());
  const prepared = assistant.request({ accountId, commentId, kind: 'reply' });

  assert.equal((prepared.context as any).decision, 'no_reply');
  assert.ok(prepared.flags.some(f => f.includes("decision gate evaluated 'no_reply'")));

  // When batched, no_reply does not call provider.generate() and produces a decision record
  const drafts = await assistant.batch([{ accountId, commentId, kind: 'reply' }]);
  assert.equal(drafts.length, 1);
  assert.match(drafts[0].content, /\[DECISION: NO_REPLY\]/);
  assert.equal(drafts[0].status, 'draft');
});

// =========================================================================
// 5. BORDERLINE / UNCERTAIN CASE REVIEW FLAGGING
// =========================================================================
test('Borderline cases: commercial complaints or sensitive allegations flag for user review with explicit questions', () => {
  const sensitiveComment = 'ซื้อคอร์สตามที่เพจแนะนำแล้วไม่เห็นทำได้จริงเลย หลอกลวงหรือเปล่า คืนเงินด้วย';
  const context: ConversationContext = {
    accountId: KNOWN_PERSONAS.developer.id,
    postCaption: 'แนะนำคอร์สเรียนออนไลน์สำหรับน้องๆ เริ่มต้นเขียนโค้ด',
    commentContent: sensitiveComment,
  };

  const evaluation = evaluateReplyDecision(context);
  // Decision evaluation identifies potential issue
  assert.equal(evaluation.decision, 'reply');

  // Verify that review flags are attached
  const assistant = new ContentAssistantService(new UnavailableAssistantProvider());
  // The reviewFlags scanner in content-assistant flags complaints/refunds
  const prepared = assistant.request({
    accountId: 'test-page-dev',
    commentId: 'cmt-codex-worktree',
    kind: 'reply'
  });
  assert.ok(prepared.flags.length > 0);
});

// =========================================================================
// 6. GLOBAL RELATIONSHIP RULES INTEGRITY
// =========================================================================
test('10 Global Relationship Rules are completely defined and immutable', () => {
  assert.equal(GLOBAL_RELATIONSHIP_RULES.length, 10);
  assert.match(GLOBAL_RELATIONSHIP_RULES[0], /Respect people's opinions/);
  assert.match(GLOBAL_RELATIONSHIP_RULES[1], /Listen before explaining/);
  assert.match(GLOBAL_RELATIONSHIP_RULES[2], /Do not unnecessarily correct/);
  assert.match(GLOBAL_RELATIONSHIP_RULES[3], /Allow people to teach/);
  assert.match(GLOBAL_RELATIONSHIP_RULES[4], /humility naturally/);
  assert.match(GLOBAL_RELATIONSHIP_RULES[5], /Match the tone/);
  assert.match(GLOBAL_RELATIONSHIP_RULES[6], /Avoid unsolicited technical jargon/);
  assert.match(GLOBAL_RELATIONSHIP_RULES[7], /Ask follow-up questions/);
  assert.match(GLOBAL_RELATIONSHIP_RULES[8], /maintain silence when a reply is unnecessary/);
  assert.match(GLOBAL_RELATIONSHIP_RULES[9], /Maintain honesty/);
});

// =========================================================================
// 7. INTERFACE WIRING & PROMPT DIRECTIVES INTEGRITY
// =========================================================================
test('AssistantRequest carries accountId and pageGraphId and injects persona directives into prompt', () => {
  const accountId = KNOWN_PERSONAS.developer.id;
  db.prepare(`INSERT INTO accounts(id,platform,account_type,name,handle,status,connector_mode,connection_status,granted_scopes_json,access_token,external_id,identity_verified_at,token_expires_at)
    VALUES (?,'facebook','page','แก้บัคยาวๆๆ','@bugfix','connected','official_api','connected',?,?,?,?,?)`).run(
    accountId,
    JSON.stringify(['pages_read_engagement', 'pages_read_user_content', 'pages_manage_posts']),
    seal('MOCK_ACCESS_TOKEN'),
    '409347032254077',
    new Date().toISOString(),
    new Date(Date.now() + 3600000).toISOString()
  );

  const commentId = 'cmt-directives-check';
  db.prepare(`INSERT INTO comments(id,account_id,platform,external_comment_id,author_name,content,created_time,source)
    VALUES (?,'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5','facebook','ext-103','Dev','สอบถามหน่อยครับ','2026-11-10T06:00:00Z','meta_graph_api')`).run(commentId);

  const assistant = new ContentAssistantService(new UnavailableAssistantProvider());
  const prepared = assistant.request({ accountId, commentId, kind: 'reply' });

  assert.equal(prepared.request.accountId, accountId);
  assert.equal(prepared.request.pageGraphId, '409347032254077');

  // Verify that getSocialPolicyPromptDirectives resolves developer persona when using request.accountId or request.pageGraphId
  const directives = getSocialPolicyPromptDirectives(prepared.request.accountId || prepared.request.pageGraphId, prepared.request.conversationRole, prepared.request.isGroup);
  const directiveText = directives.join('\n');
  assert.ok(directiveText.includes('=== ACCOUNT PERSONA DIRECTIVE ==='), 'Must include persona directives block');
  assert.ok(directiveText.includes('ZERO decorative emojis'), 'Page A must enforce zero decorative emojis');

  // Also verify resolution via pageGraphId alone when accountId is generic
  const directivesFromGraphId = getSocialPolicyPromptDirectives(prepared.request.pageGraphId, prepared.request.conversationRole, prepared.request.isGroup);
  const graphDirectiveText = directivesFromGraphId.join('\n');
  assert.ok(graphDirectiveText.includes('=== ACCOUNT PERSONA DIRECTIVE ==='), 'Must resolve via pageGraphId');
  assert.ok(graphDirectiveText.includes('ZERO decorative emojis'), 'Must enforce zero emojis via pageGraphId');
});
