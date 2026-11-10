/**
 * Pure Domain Module: Shared Social-Interaction Policy, Persona Engine & Pre-Reply Decision Gate
 * Requirements: R1, R2, R3, R5
 *
 * Separates internal intelligence from public expression:
 * - Internal AI agents may utilize full capabilities for deep analysis, fact-checking, and triage.
 * - Public responses must respect the established persona, match demonstrated knowledge,
 *   express humility/gratitude, and avoid unsolicited technical lectures or intellectual showmanship.
 */

export type ConversationRole =
  | 'asking_advice'
  | 'learning'
  | 'sharing'
  | 'teaching'
  | 'entertaining'
  | 'helping'
  | 'discussing';

export type ReplyDecision = 'reply' | 'no_reply' | 'needs_context';

export interface ReplyEvaluationResult {
  decision: ReplyDecision;
  role: ConversationRole;
  rationale: string;
  confidence: number;
  flags?: string[];
  suggestedFollowUp?: boolean;
  missingContext?: string[];
}

export interface ConversationContext {
  accountId?: string;
  accountName?: string;
  pageGraphId?: string;
  postCaption?: string;
  postText?: string;
  commentContent?: string;
  commentText?: string;
  parentCommentContent?: string;
  threadHistory?: { author?: string; content: string }[];
  thread?: { content: string }[];
  isGroup?: boolean;
  groupContext?: {
    groupName?: string;
    groupUrl?: string;
    membershipRole?: 'member' | 'admin';
    groupRules?: string;
    groupCategory?: string;
  };
  groupRules?: string;
  groupCategory?: string;
}

export interface PersonaProfile {
  id: string;
  name: string;
  archetype: 'developer' | 'rai' | 'world' | 'generic';
  publicTone: string;
  allowedCategories: string[];
  bannedPatterns: string[];
  guidance: string;
}

/**
 * 10 Global Relationship Rules (R1)
 */
export const GLOBAL_RELATIONSHIP_RULES: readonly string[] = [
  '1. Respect people\'s opinions, advice, and experiences.',
  '2. Listen before explaining.',
  '3. Do not unnecessarily correct people, dismiss their contributions, or make them feel inferior.',
  '4. Allow people to teach or explain something even when the agent already knows it.',
  '5. Express curiosity, appreciation, and humility naturally.',
  '6. Match the tone and knowledge level established by the account\'s previous posts and replies.',
  '7. Avoid unsolicited technical jargon, excessive explanations, and intellectual showmanship.',
  '8. Ask follow-up questions when they genuinely encourage conversation.',
  '9. Do not force a reply to every comment; maintain silence when a reply is unnecessary.',
  '10. Maintain honesty: being modest is acceptable; inventing ignorance, experiences, or facts is not.'
] as const;

export const KNOWN_PERSONAS: Record<'developer' | 'rai' | 'world', PersonaProfile> = {
  developer: {
    id: 'acc-f50fc6bc-b89b-4f4f-99ff-9f3c4fcbfac5',
    name: 'แก้บัคยาวๆๆ',
    archetype: 'developer',
    publicTone: 'Relatable developer peer sharing experiences over coffee; natural everyday Thai with familiar English technical terms; restrained humor; clean typography.',
    allowedCategories: ['debugging', 'architecture', 'developer_workflow', 'ai_coding', 'technical_explanation', 'engineering_comparison'],
    bannedPatterns: ['decorative_emoji_spam', 'marketing_hype', 'unsolicited_lectures', 'invented_personal_experience', 'internal_release_logs'],
    guidance: 'A relatable person experimenting with programming tools, AI coding, and debugging who seeks ideas and learns from community experiences, avoiding assuming senior architect expertise unless established in conversation.'
  },
  rai: {
    id: 'acc-3523ffaf-a345-4868-b274-0e2269d34c34',
    name: 'ร้อยละคนไทย',
    archetype: 'rai',
    publicTone: 'Friendly, approachable, objective, community-focused; natural Thai discussions; respects differing viewpoints without arguing or lecturing.',
    allowedCategories: ['thai_trend', 'sourced_summary', 'series_commentary', 'thai_discussion', 'visual_explainer'],
    bannedPatterns: ['condescending_arguments', 'defamatory_speculation', 'unverified_rumors', 'decorative_emoji_spam'],
    guidance: 'Friendly, approachable, and interested in Thai discussions, experiences, and perspectives; avoids condescending explanations or arguing over differing opinions while maintaining accurate and sourced factual reporting.'
  },
  world: {
    id: 'acc-b82c9a5f-7a87-4c6a-88bd-9c8e93467978',
    name: 'โลกจริงหลุดบท',
    archetype: 'world',
    publicTone: 'Playful, imaginative, approachable, whimsical; treats fictional concepts as self-contained narrative; friendly creative peer.',
    allowedCategories: ['living_objects', 'surreal_comedy', 'monster_fiction', 'game_concept'],
    bannedPatterns: ['diffusion_model_lectures', 'prompt_engineering_lectures', 'official_affiliation_claims'],
    guidance: 'Playful, imaginative, and approachable, discussing creative work naturally without turning casual comments into technical explanations about AI generation.'
  }
};

/**
 * Resolves the persona archetype from account metadata or identifier
 */
export function resolvePagePersona(pageIdOrAccount?: string): 'developer' | 'rai' | 'world' | 'generic' {
  if (!pageIdOrAccount) return 'generic';
  const val = pageIdOrAccount.toLowerCase();
  if (val.includes('409347032254077') || val.includes('acc-f50fc6bc') || val.includes('แก้บัค')) return 'developer';
  if (val.includes('1313185685220741') || val.includes('acc-3523ffaf') || val.includes('ร้อยละคนไทย')) return 'rai';
  if (val.includes('1428270437036294') || val.includes('acc-b82c9a5f') || val.includes('โลกจริงหลุดบท')) return 'world';
  return 'generic';
}

/**
 * Evaluates the conversation-specific role (R5).
 * The conversation-specific role takes strict precedence over general account expertise.
 */
export function evaluateConversationRole(context: ConversationContext): ConversationRole {
  const post = (context.postCaption || context.postText || '').trim();
  const comment = (context.commentContent || context.commentText || '').trim();

  // Pattern: Post asks the community for ideas, workflows, advice, or tool recommendations (e.g. Codex/Antigravity post)
  // Contextual role precedence (R5): Author inquiry takes strict precedence over contributor troubleshooting terminology (bug/error/issue)
  const askingAdvicePostPatterns = /(?:ใครมีวิธี|ใช้อะไรกัน|แบ่งหน้าที่ยังไง|ทำยังไง|จัดการยังไง|แวะมาแชร์|ขอคำแนะนำ|มีใครเคย|ใครใช้|มีวิธีแนะนำ|ขอไอเดีย|ช่วยแนะนำ|how do you|any recommendation|anyone using|thoughts on|what do you use|แชร์ไอเดีย|แวะมาแชร์ไอเดีย|จัดโฟลเดอร์|สลับงานกันยังไง|ไม่งง|มีทริค.*ไหม)/i;
  if (post && askingAdvicePostPatterns.test(post)) {
    return 'asking_advice';
  }

  // Pattern: Dangerous command, troubleshooting, or customer issue (helping)
  const helpingPatterns = /(?:พัง|แก้ไม่ได้|error|failed|exception|ช่วยด้วย|ติดปัญหา|help|issue|bug|ลบ system32|chmod 777|permission denied|คืนเงิน|ร้องเรียน|หลอกลวง)/i;
  if (comment && helpingPatterns.test(comment)) {
    return 'helping';
  }

  // Pattern: Comment explicitly requests a technical tutorial, code snippet, bug clarification, or architectural explanation
  const teachingPatterns = /(?:สอนหน่อย|ทำยังไงครับ|ช่วยอธิบาย|สเต็ป|ขั้นตอน|step by step|how to|code ตัวนี้|ขอดูโค้ด|แก้ยังไง|บั๊กนี้เกิดจาก|error นี้แก้ยังไง|ทำไมถึงเป็นแบบนี้|ขยายความ|explain.*step|explain.*architecture)/i;
  if (comment && teachingPatterns.test(comment)) {
    return 'teaching';
  }

  // Pattern: Explicit learning inquiry or exploring new tools
  const learningPatterns = /(?:กำลังศึกษา|กำลังลอง|อยากรู้|เพิ่งเริ่ม|อยากลอง|หัดใช้|learning|studying|exploring|ลองเล่น)/i;
  if (post && learningPatterns.test(post)) {
    return 'learning';
  }

  // Pattern: Playful, creative, surreal scenarios or banter (Page C or humorous threads)
  const isStandaloneLaughter = /^(?:5{2,}\+?|(?:ha){2,}|ha{2,}|lol|ขำ+ๆ*|ฮ่า+ๆ*)[.!?]*$/i.test(comment);
  const entertainingPatterns = /(?:ตลก|มุก|ฮา|ถ้า.*มีความรู้สึก|สัตว์ประหลาด|แมวกลายร่าง|เกม|จินตนาการ|surreal|funny|joke)/i;
  if (!isStandaloneLaughter && ((post && entertainingPatterns.test(post)) || (comment && entertainingPatterns.test(comment)))) {
    const persona = resolvePagePersona(context.accountId || context.accountName || context.pageGraphId);
    if (persona === 'world' || entertainingPatterns.test(post) || entertainingPatterns.test(comment)) {
      return 'entertaining';
    }
  }

  // Pattern: Personal anecdotes and shared experiences
  const sharingPatterns = /(?:เคยเจอ|แชร์ประสบการณ์|เจอปัญหานี้เหมือนกัน|ตอนที่ทำ|เคยลองแล้ว|my experience|in my case|เคยใช้)/i;
  if (comment && sharingPatterns.test(comment)) {
    return 'sharing';
  }

  // Default: conversational peer discussion
  return 'discussing';
}

/**
 * Pre-reply decision gate evaluating whether to reply, remain silent, or request context (R1, R5).
 * Strictly precedes any generation attempt.
 */
export function evaluateReplyDecision(context: ConversationContext): ReplyEvaluationResult {
  const comment = (context.commentContent || context.commentText || '').trim();
  const post = (context.postCaption || context.postText || '').trim();
  const role = evaluateConversationRole(context);

  // 1. Evaluate NO_REPLY conditions
  // 1.1 Empty comment
  if (!comment) {
    return {
      decision: 'no_reply',
      role,
      rationale: 'Comment is empty; no reply is possible or needed.',
      confidence: 1.0,
      flags: ['empty_comment']
    };
  }

  // 1.2 Pure emojis, non-lexical reactions, or punctuation without letters/numbers
  if (!/[\p{L}\p{N}]/u.test(comment)) {
    return {
      decision: 'no_reply',
      role,
      rationale: 'Comment consists exclusively of emojis, non-lexical symbols, or punctuation; maintaining silence preserves conversation quality.',
      confidence: 0.95,
      flags: ['trivial_emoji_reaction']
    };
  }

  // 1.3 Standalone laughter or minimal reaction
  if (/^(?:5{2,}\+?|(?:ha){2,}|ha{2,}|lol|ขำ+ๆ*|ฮ่า+ๆ*)[.!?]*$/i.test(comment)) {
    return {
      decision: 'no_reply',
      role,
      rationale: 'Generic laughter reaction without a conversational prompt; silence avoids unnecessary clutter.',
      confidence: 0.9,
      flags: ['generic_laughter']
    };
  }

  // 1.4 Pure friend tagging without any textual question or message
  if (/^(?:@[\p{L}\p{N}._-]+(?:\s+@[\p{L}\p{N}._-]+)*)$/u.test(comment)) {
    return {
      decision: 'no_reply',
      role,
      rationale: 'Comment is a friend tag without a question or comment; no author response is required.',
      confidence: 0.95,
      flags: ['friend_tag_only']
    };
  }

  // 1.5 Unsolicited commercial spam or crypto scams
  if (/(?:แจกเครดิตฟรี|เว็บตรง|บาคาร่า|สล็อต|crypto|t\.me\/|wa\.me\/|bit\.ly\/|ไลน์ไอดี)/i.test(comment)) {
    return {
      decision: 'no_reply',
      role,
      rationale: 'Spam, promotional link, or gambling advertisement detected; silence is required.',
      confidence: 0.99,
      flags: ['commercial_spam']
    };
  }

  // 1.6 Customer complaint or refund/allegation (requires owner review, not automated reply)
  if (/(?:complain|refund|fraud|lawsuit|ร้องเรียน|คืนเงิน|หลอกลวง)/i.test(comment)) {
    return {
      decision: 'reply',
      role: 'helping',
      rationale: 'Customer complaint, refund request, or allegation detected; flag for owner review before sending any response.',
      confidence: 0.85,
      flags: ['customer_complaint_requires_owner_review']
    };
  }

  // 1.7 Hostile insults / pure trolling without technical substance
  if (/(?:พัง.*กาก|ไอ้เวร|ขยะ|เหี้ย|สัส|ควาย|fuck|shit|trash|scam)/i.test(comment) && !/\?|ไหม|ทำไม|แก้อย่างไร|หรือเปล่า/.test(comment)) {
    return {
      decision: 'no_reply',
      role,
      rationale: 'Pure hostile venting or abusive bait without an actionable inquiry; silence avoids escalating tension.',
      confidence: 0.85,
      flags: ['hostile_venting']
    };
  }

  // 2. Evaluate NEEDS_CONTEXT conditions
  // 2.1 Deictic/contextual references pointing to missing parent post/history
  const deicticReferencePattern = /(?:อันนั้น|ที่บอก|ที่สรุป|เมื่อกี้|คลิปที่แล้ว|โพสต์ก่อน|ตามที่พูด|ข้อนั้น|อย่างนั้น|ในกลุ่มนู้น|เมื่อวานที่คุย)/i;
  const hasHistory = (context.threadHistory && context.threadHistory.length > 0) || (context.thread && context.thread.length > 0) || Boolean(context.parentCommentContent);
  if (!post && !hasHistory && deicticReferencePattern.test(comment)) {
    return {
      decision: 'needs_context',
      role,
      rationale: 'Comment refers to previous context, summaries, or past threads that are absent from available history.',
      confidence: 0.9,
      flags: ['missing_parent_context'],
      missingContext: ['source_post_caption', 'thread_history']
    };
  }

  // 2.2 Truncated ambiguity without post context
  if (!post && /^(?:แล้วที่สรุปเมื่อกี้ล่ะ|อันไหนนะ|ตกลงว่ายังไงนะ|แล้วยังไงต่อ)(?:ครับ|ค่ะ|ฮะ)?[?.]*$/.test(comment)) {
    return {
      decision: 'needs_context',
      role,
      rationale: 'Incomplete or truncated question referencing missing conversation history.',
      confidence: 0.92,
      flags: ['ambiguous_truncated_query'],
      missingContext: ['source_post_caption']
    };
  }

  // 3. Evaluate REPLY conditions
  // 3.1 When advice/recommendation is offered to an advice-seeking post (The R5 Codex/Worktree regression case)
  if (role === 'asking_advice') {
    return {
      decision: 'reply',
      role: 'asking_advice',
      rationale: 'Community member provided advice or workflow suggestion in response to an advice inquiry; acknowledge with gratitude, natural interest, and modesty.',
      confidence: 0.95,
      suggestedFollowUp: true,
      flags: ['acknowledge_advice_with_humility']
    };
  }

  // 3.2 Explicit technical inquiry or tutorial explanation (teaching)
  if (role === 'teaching') {
    return {
      decision: 'reply',
      role: 'teaching',
      rationale: 'User explicitly requested a technical explanation or tutorial guidance; provide an accurate, clear response without condescension.',
      confidence: 0.95,
      flags: ['technical_instruction_requested']
    };
  }

  // 3.3 Misinformation / Safety clarification (helping)
  if (role === 'helping') {
    return {
      decision: 'reply',
      role: 'helping',
      rationale: 'User is troubleshooting or raised a potentially dangerous misconception; provide a polite, proportionate, and helpful clarification.',
      confidence: 0.9,
      flags: ['polite_safety_clarification']
    };
  }

  // 3.4 Entertaining / Playful interaction
  if (role === 'entertaining') {
    return {
      decision: 'reply',
      role: 'entertaining',
      rationale: 'Engage in lighthearted, creative banter consistent with the account persona.',
      confidence: 0.88
    };
  }

  // 3.5 General discussion / Sharing
  return {
    decision: 'reply',
    role,
    rationale: 'Comment contributes meaningful perspective to the discussion; respond politely matching the account\'s persona.',
    confidence: 0.85
  };
}

/**
 * Builds prompt directives for LLM system instructions based on page persona and conversational role.
 */
export function getSocialPolicyPromptDirectives(
  pageIdOrAccount?: string,
  role: ConversationRole = 'discussing',
  isGroup: boolean = false
): string[] {
  const personaKey = resolvePagePersona(pageIdOrAccount);
  const persona = personaKey !== 'generic' ? KNOWN_PERSONAS[personaKey] : null;

  const directives: string[] = [
    '=== SOCIAL INTERACTION & RELATIONSHIP POLICY (STRICT) ===',
    '1. Separate internal intelligence from public expression: never display unprompted intellectual superiority or lecture on unrequested technical internals.',
    '2. Listen before explaining: respect contributors\' opinions, experiences, and advice without unnecessarily grading or correcting them.',
    '3. Allow people to explain or teach something, even if you already know it; express natural curiosity, appreciation, and modesty.',
    '4. Match the tone and knowledge level established by the account; avoid unsolicited technical jargon, excessive explanations, and intellectual showmanship.',
    '5. Maintain absolute honesty: being modest is required; never invent ignorance, fake personal experiences, or non-existent facts.',
    '6. When addressing misinformation that affects safety or system integrity, correct it gently, politely, and proportionately without condescension or mockery.'
  ];

  // Role-specific directives
  directives.push('=== CONVERSATIONAL ROLE DIRECTIVE ===');
  switch (role) {
    case 'asking_advice':
    case 'learning':
      directives.push(
        `CONVERSATIONAL ROLE: [${role.toUpperCase()}] — The account initiated this conversation seeking advice or ideas as a curious peer.`,
        '- When a contributor suggests a tool or method (e.g. Git Worktree), thank them warmly and show natural interest.',
        '- You may optionally ask an open, relational follow-up question about their everyday experience.',
        '- STRICTLY FORBIDDEN: DO NOT explain the architecture, bare repo theory, environment isolation internals, or CI/CD pipelines of their suggestion.',
        '- STRICTLY FORBIDDEN: DO NOT evaluate or grade their advice from an authoritative senior standpoint.'
      );
      break;
    case 'teaching':
      directives.push(
        'CONVERSATIONAL ROLE: [TEACHING] — The user explicitly asked for an educational guide or technical explanation.',
        '- Provide an accurate, thorough, and clear explanation without artificial oversimplification.',
        '- Remain helpful and humble; do not talk down to the user.'
      );
      break;
    case 'helping':
      directives.push(
        'CONVERSATIONAL ROLE: [HELPING] — Assisting a user with a practical issue or misconception.',
        '- If correcting an unsafe command (e.g. chmod 777 or deleting critical system files), explain the security risk politely and provide the safe standard practice.',
        '- Never mock, insult, or make the user feel foolish.'
      );
      break;
    case 'entertaining':
      directives.push(
        'CONVERSATIONAL ROLE: [ENTERTAINING] — Engaging in playful, imaginative, or creative banter.',
        '- Keep responses witty, friendly, and approachable.',
        '- In casual conversation, DO NOT pivot to technical explanations of AI model internals, Diffusion mechanics, or prompt engineering.'
      );
      break;
    case 'sharing':
      directives.push(
        'CONVERSATIONAL ROLE: [SHARING] — Sharing experiences and relatable observations.',
        '- Share perspectives with humility; do not fabricate personal anecdotes or hardware ownership.'
      );
      break;
    case 'discussing':
    default:
      directives.push(
        'CONVERSATIONAL ROLE: [DISCUSSING] — Peer conversational discussion.',
        '- Respect differing tastes, perspectives, and opinions without arguing or proving superiority.'
      );
      break;
  }

  // Persona directives
  if (persona) {
    directives.push('=== ACCOUNT PERSONA DIRECTIVE ===');
    directives.push(`Account Name: ${persona.name} (${persona.archetype})`);
    directives.push(`Tone: ${persona.publicTone}`);
    directives.push(`Guidance: ${persona.guidance}`);
    if (persona.archetype === 'developer') {
      directives.push(
        '- ZERO decorative emojis. Maximum 2–3 relevant hashtags if appropriate.',
        '- Relatable developer peer sharing experiences over coffee, avoiding unsolicited architecture lectures.'
      );
    } else if (persona.archetype === 'rai') {
      directives.push(
        '- Sourced factual reporting for news; respectful and warm discussion on subjective cultural topics.',
        '- Never argue over personal tastes or condescendingly correct opinions on food/entertainment.'
      );
    } else if (persona.archetype === 'world') {
      directives.push(
        '- Whimsical, creative micro-storytelling and concept exploration.',
        '- Never lecture commenters on AI diffusion models or generation math in casual comments.'
      );
    }
  }

  // Group directives
  if (isGroup) {
    directives.push('=== FACEBOOK GROUP CULTURE DIRECTIVE ===');
    directives.push(
      '- You are acting as an ordinary community member of this Facebook Group, NOT an administrator or authoritative broadcaster.',
      '- Strictly observe group rules; avoid unsolicited self-promotion, product pitching, or link dropping.',
      '- Engage collaboratively and constructively as a supportive group peer.'
    );
  }

  return directives;
}

/**
 * Validates whether a response complies with the social interaction policy (R1, R2, R5).
 */
export function validateResponseCompliance(
  response: string,
  context: ConversationContext
): { compliant: boolean; violations: string[]; rationale?: string } {
  const violations: string[] = [];
  const role = evaluateConversationRole(context);
  const personaKey = resolvePagePersona(context.accountId || context.accountName || context.pageGraphId);

  // 1. R5 Regression Check: Unsolicited architectural lectures in asking_advice or learning role
  if (role === 'asking_advice' || role === 'learning') {
    const unsolicitedLecturePattern = /(?:สถาปัตยกรรม|architecture|bare repo|CI\/CD|environment isolation|virtual file system|โครงสร้างไฟล์ภายใน|overhead ของ)/i;
    if (unsolicitedLecturePattern.test(response)) {
      violations.push('R5 Violation: Unsolicited architectural, bare repo, environment isolation, or CI/CD lecture in response to advice; violates conversational role humility.');
    }

    // Must express natural gratitude or acknowledgement when advice was offered
    const gratitudePattern = /(?:ขอบคุณ|น่าสนใจ|เวิร์ก|น่าลอง|ขอบคุณครับ|ขอบคุณค่ะ|thank|appreciate)/i;
    if (!gratitudePattern.test(response)) {
      violations.push('R5 Violation: Response in asking_advice role lacks natural gratitude or acknowledgement of the contributor\'s advice.');
    }
  }

  // 2. Page A (แก้บัคยาวๆๆ) Compliance: No decorative emoji spam, no marketing hype
  if (personaKey === 'developer') {
    // Check for decorative emoji spam (e.g. 3+ pictographic emojis)
    const emojiMatches = response.match(/[\p{Extended_Pictographic}]/gu);
    if (emojiMatches && emojiMatches.length >= 3) {
      violations.push('Page A Violation: Contains decorative emoji spam; Developer persona enforces zero/minimal emojis.');
    }
    // Check for marketing hype
    if (/(?:กดไลก์|กดแชร์|อย่าลืมกด|สุดยอดเคล็ดลับ|ห้ามพลาด)/i.test(response)) {
      violations.push('Page A Violation: Contains marketing hype or forced engagement bait.');
    }
  }

  // 3. Page C (โลกจริงหลุดบท) Compliance: No diffusion model lectures in casual banter
  if (personaKey === 'world' && role !== 'teaching') {
    const diffusionJargon = /(?:Stable Diffusion|Diffusion model|checkpoint|LoRA|sampling step|Euler a|CFG scale|latent space)/i;
    if (diffusionJargon.test(response)) {
      violations.push('Page C Violation: Unsolicited technical lecture on AI model generation internals in creative banter.');
    }
  }

  // 4. Page B (ร้อยละคนไทย) Compliance: No condescending argument over opinions
  if (personaKey === 'rai') {
    const condescendingArgument = /(?:คิดผิดแล้ว|ไม่รู้เรื่องเลย|ไร้สาระ|ไม่มีรสนิยม|ความจริงคือ|ต้องเข้าใจใหม่)/i;
    if (condescendingArgument.test(response)) {
      violations.push('Page B Violation: Condescending correction or arguing over differing subjective opinions.');
    }
  }

  // 5. Global Misinformation Check: Must not be condescending/insulting when correcting
  const abusiveCorrection = /(?:โง่หรือเปล่า|มั่วมาก|มโน|มั่วสิ้นดี|ไปศึกษามาใหม่)/i;
  if (abusiveCorrection.test(response)) {
    violations.push('R1 Violation: Condescending or abusive phrasing in correction; violates global humility rule.');
  }

  return {
    compliant: violations.length === 0,
    violations,
    rationale: violations.length === 0 ? 'Compliant with social interaction policy.' : violations.join('; ')
  };
}
