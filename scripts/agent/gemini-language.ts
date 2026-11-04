import {z} from 'zod';

export const geminiLanguagePolicyVersion='gemini-multilingual.v1';
export const languageTagSchema=z.string().max(35).regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/,'Use a language tag such as en, th or ja');
export const geminiLanguageSchema=z.object({
  spokenLanguage:z.union([z.literal('none'),languageTagSchema]),dialogue:z.string().trim().max(300),
  intendedAudience:z.string().trim().min(1).max(500),rationale:z.string().trim().min(1).max(800),
  evidenceBasis:z.enum(['hypothesis','verified_research']),findingIds:z.array(z.string().min(1).max(150)).max(3),
  captionLanguages:z.array(languageTagSchema).min(1).max(3),hashtagLanguages:z.array(languageTagSchema).max(3),
}).strict().superRefine((s,c)=>{
  if((s.spokenLanguage==='none')!==(s.dialogue===''))c.addIssue({code:'custom',message:'No-speech concepts require empty dialogue; spoken concepts require their exact brief dialogue'});
  if(s.evidenceBasis==='verified_research'&&!s.findingIds.length)c.addIssue({code:'custom',message:'Verified language rationale requires supplied verified research'});
});
export const geminiLanguageInstructions='Gemini multilingual policy gemini-multilingual.v1: a Thai Page name is not a language or geography restriction. Research relevant creators internationally, including successful and ordinary examples across languages. English, Thai, other languages and language-independent visual storytelling are eligible. Choose according to the original concept, intended audience and supplied evidence; never assume English increases views or Thai limits them. Prefer native ambience/foley without dialogue when visuals already communicate the story. Do not add speech, narration or subtitles merely to satisfy a language field. If brief speech genuinely improves the concept, choose one appropriate language, supply exact short dialogue and preserve its language and wording consistently. Record languageStrategy {spokenLanguage:"none"|language-tag,dialogue:"" for none or exact brief speech,intendedAudience,rationale,evidenceBasis:"hypothesis"|"verified_research",findingIds:[],captionLanguages:[language-tags],hashtagLanguages:[language-tags or empty]}. Language tags include en, th, ja and regional variants. Use hypothesis when evidence is unavailable, stale or independently unverified; a model-reported source is not verified optimization evidence. Social captions and hashtags follow the intended audience and actual reviewed video, may use different/multiple languages and may omit hashtags. They are publication copy, not instructions to render subtitles or narration. Keep all originality, audiovisual QA and separate publication-approval gates.';

export function validateLanguageEvidence(raw:unknown,findings:Record<string,any>[],now=Date.now()){
  const s=geminiLanguageSchema.parse(raw);
  for(const id of s.findingIds){const f=findings.find(f=>f.id===id);if(!f)throw new Error('Language strategy cites unsupplied research');
    if(s.evidenceBasis==='verified_research'&&(f.independentlyVerified!==true||f.access==='blocked'||f.stale||!Number.isFinite(Date.parse(f.validUntil))||Date.parse(f.validUntil)<=now))throw new Error('Language optimization is a hypothesis without fresh independently verified research');}
  return s;
}

/** Legacy idea bytes stay identical. This builder is called only by Gemini production. */
export function geminiConceptIdea(concept:Record<string,any>){
  const lines=[concept.idea,'Hook: '+concept.hook,'Development: '+concept.development,'Payoff: '+concept.payoff,'One complete ten-second portrait scene. Native audio.'];
  if(concept.languageStrategy){const s=geminiLanguageSchema.parse(concept.languageStrategy);
    lines.push('Intended audience: '+s.intendedAudience);
    if(s.spokenLanguage==='none')lines.push('Communicate through visuals and natural ambience/foley. No spoken dialogue or narration.');
    else lines.push('Speech language: '+s.spokenLanguage+'. Preserve this language and exact brief dialogue consistently: '+JSON.stringify(s.dialogue)+'. Do not translate or add speech.');
    lines.push('Social caption and hashtag choices are publication metadata; they do not request in-video subtitles or narration.');
  }
  return lines.join('\n');
}
