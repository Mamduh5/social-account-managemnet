import {test} from 'node:test';
import assert from 'node:assert/strict';
import {geminiLanguageSchema,geminiLanguageInstructions,geminiConceptIdea,validateLanguageEvidence} from '../scripts/agent/gemini-language.js';
import {productionConceptSchema} from '../scripts/agent/production.js';
import {creatorResearchSchema} from '../scripts/agent/creator-research.js';
import {createRequire} from 'node:module';
const route=createRequire(__filename)('../scripts/agent/antigravity-gemini.cjs');
const language=(extra:any={})=>({spokenLanguage:'none',dialogue:'',intendedAudience:'International viewers who enjoy visual micro-stories',rationale:'Readable physical action communicates without speech; audience choice remains a hypothesis.',evidenceBasis:'hypothesis',findingIds:[],captionLanguages:['en'],hashtagLanguages:[],...extra});
const concept={version:'gemini-concept.v1',fictional:true,accountId:'page',title:'A tiny umbrella',idea:'An original leaf shelters a small toy.',hook:'The toy is surprised by rain',development:'The leaf bends toward it',payoff:'The toy settles under shelter',category:'living_objects'};
test('no spoken language is valid with natural sound and independent multilingual publication copy',()=>{
  const s=geminiLanguageSchema.parse(language({captionLanguages:['en','th'],hashtagLanguages:['ja']}));assert.equal(s.spokenLanguage,'none');assert.equal(s.dialogue,'');
  const idea=geminiConceptIdea({...concept,languageStrategy:s});assert.match(idea,/natural ambience\/foley/);assert.match(idea,/No spoken dialogue or narration/);assert.doesNotMatch(idea,/Speech language:|Preserve this language|speaker|spoken-delivery/);assert.match(idea,/publication metadata/);
});
for(const [code,line] of [['en','Wait!'],['th','เดี๋ยวก่อน'],['ja','ありがとう'],['es','¡Gracias!'],['zh-Hant','謝謝'],['pt-BR','Obrigado!']])test('brief speech preserves exact '+code+' words without selecting Thai by Page identity',()=>{const s=geminiLanguageSchema.parse(language({spokenLanguage:code,dialogue:line,captionLanguages:['en']}));const idea=geminiConceptIdea({...concept,languageStrategy:s});assert.ok(idea.includes('Speech language: '+code));assert.ok(idea.includes(JSON.stringify(line)));assert.match(idea,/Do not translate or add speech/);assert.doesNotMatch(idea,/No spoken dialogue/);});
test('reject missing audience/rationale, inconsistent dialogue and unsupported evidence claims',()=>{
  for(const extra of [{intendedAudience:''},{rationale:''},{spokenLanguage:'none',dialogue:'hello'},{spokenLanguage:'ja',dialogue:''},{captionLanguages:['none']},{evidenceBasis:'verified_research'}])assert.equal(geminiLanguageSchema.safeParse(language(extra)).success,false);
  const now=Date.parse('2026-11-04T00:00:00Z'),finding={id:'source',independentlyVerified:false,access:'observed',validUntil:'2026-11-05T00:00:00Z'};
  const choice=language({evidenceBasis:'verified_research',findingIds:['source']});assert.throws(()=>validateLanguageEvidence(choice,[finding],now),/hypothesis/);
  assert.throws(()=>validateLanguageEvidence(choice,[{...finding,independentlyVerified:true,validUntil:'2026-11-03T00:00:00Z'}],now),/hypothesis/);
  assert.throws(()=>validateLanguageEvidence(choice,[],now),/unsupplied/);assert.equal(validateLanguageEvidence({...choice,evidenceBasis:'hypothesis'},[finding],now).evidenceBasis,'hypothesis');
  assert.equal(validateLanguageEvidence(choice,[{...finding,independentlyVerified:true}],now).evidenceBasis,'verified_research');
});
test('historical Gemini concepts keep their exact fields and idea bytes',()=>{assert.deepEqual(productionConceptSchema.parse(concept),concept);assert.equal(geminiConceptIdea(concept),[concept.idea,'Hook: '+concept.hook,'Development: '+concept.development,'Payoff: '+concept.payoff,'One complete ten-second portrait scene. Native audio.'].join('\n'));});
test('research preserves unknown speech rather than inferring it from English captions',()=>{
  const r=creatorResearchSchema.parse({version:'gemini-creator-research.v1',observedAt:'2026-11-04T00:00:00Z',validUntil:'2026-11-05T00:00:00Z',access:'partial',limitations:'No audio was heard; no performance inference.',principles:[],examples:[{id:'example',creator:'International fixture creator',url:'https://www.facebook.com/reel/123',platform:'facebook',publishedAt:null,durationSeconds:null,inspection:'page_body',performance:'unclassified',comparison:'No matched performance evidence',metrics:[],characteristics:'Only public caption text was inspected',limitations:'No audiovisual review',languageObservation:{spokenLanguage:null,textLanguages:['en'],audience:null,limitations:'English caption does not establish spoken language or viewer location'}}]});assert.equal(r.examples[0].languageObservation?.spokenLanguage,null);
});
test('new Gemini policy is international and language-neutral; Flow and Page A wrapper contracts remain outside it',()=>{assert.match(geminiLanguageInstructions,/internationally/);assert.match(geminiLanguageInstructions,/never assume English increases views or Thai limits them/);assert.match(geminiLanguageInstructions,/hypothesis/);for(const provider of ['flow_web','flow_manual'])assert.equal(route.request({task:{payload:{provider}}}),null);assert.equal(route.request({task:{payload:{content:{responseContract:'agent-content-result.v1'}}}}),null);});
