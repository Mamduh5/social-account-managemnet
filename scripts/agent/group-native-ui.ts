import type {Page,Locator} from 'playwright';
import {parseGroupThreadIdentity} from '../../server/src/domain/groups.js';

export interface GroupTextTarget {destinationId:string;preparedId:string;accountId:string;groupUrl:string;content:string;contentHash:string;graphId:string;profileId:string;rules:string;moderation:string;}
export interface NativeOutcome {state:'published'|'pending_approval'|'restricted'|'uncertain';url?:string;notes:string;}
export class NativeHold extends Error {constructor(readonly code:string,message:string){super(message);}}
const normal=(value:string)=>value.replace(/\r\n/g,'\n').trim();
// Public feed rendering may collapse an empty paragraph; editor approval remains byte/line exact.
const displayText=(value:string)=>normal(value).replace(/\n{2,}/g,'\n');
function sameGroup(page:Page,target:GroupTextTarget){const expected=new URL(target.groupUrl),actual=new URL(page.url());if(actual.origin!==expected.origin||actual.pathname.replace(/\/$/,'')!==expected.pathname.replace(/\/$/,''))throw new NativeHold('target_changed','Native page is not the exact canonical Group');}

/** Only rendered public UI and normal input. No network interception, private endpoints,
 * React/internal state, cookie extraction, account switching or browser security changes. */
export class FacebookGroupTextUI {
  async inspect(page:Page,target:GroupTextTarget){
    await page.goto(target.groupUrl,{waitUntil:'domcontentloaded',timeout:30000});
    const login=page.locator('input[name="email"],input[name="pass"]');
    if(await login.count()&&await login.first().isVisible())throw new NativeHold('login_required',`Sign in normally in the dedicated profile for SCC account ${target.accountId}, then select authorized native Page ${target.profileId}. No other account session or credentials are copied.`);
    sameGroup(page,target);
    const body=await page.locator('body').innerText();
    if(/captcha|security check|ตรวจสอบความปลอดภัย|ยืนยันตัวตน/i.test(body))throw new NativeHold('human_verification_required','Facebook requires normal human verification; no claim or bypass');
    if(/You can.t post|participation.*suspended|บัญชีของคุณถูกจำกัด/i.test(body))throw new NativeHold('restricted','Facebook reports a posting restriction');
    const joined=page.getByRole('button',{name:/^(Joined|เข้าร่วมแล้ว)(\s|$)/i});await joined.waitFor({state:'visible',timeout:15000}).catch(()=>{});
    if(await joined.count()!==1||!await joined.isVisible())throw new NativeHold('membership_unverified','Joined membership was not uniquely visible for this browser identity');
    // Existing matching text is a reconciliation signal, never permission to resubmit.
    const articles=page.getByRole('article');if(target.content.trim())for(let i=0;i<await articles.count();i++){if(displayText(await articles.nth(i).innerText()).includes(displayText(target.content)))throw new NativeHold('existing_post_requires_reconciliation','Matching original discussion is already visible; inspect its receipt without submitting');}
    return {joined:true};
  }
  private async actingIdentity(dialog:Locator,target:GroupTextTarget){
    const links=await dialog.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>(a as HTMLAnchorElement).href));
    const exact=links.filter(href=>{try{const u=new URL(href);return u.origin==='https://www.facebook.com'&&(u.pathname===`/groups/${new URL(target.groupUrl).pathname.split('/')[2]}/user/${target.profileId}/`||u.pathname===`/profile.php`&&u.searchParams.get('id')===target.profileId||u.pathname===`/${target.profileId}`||u.pathname===`/${target.profileId}/`);}catch{return false;}});
    if(!exact.length)throw new NativeHold('posting_identity_unverified',`Composer does not expose the exact authorized native Page/profile ${target.profileId} for SCC account ${target.accountId}. Select that Page manually in its dedicated profile; display-name matching is insufficient.`);
  }
  async openComposer(page:Page,target:GroupTextTarget){
    await this.inspect(page,target);
    const opener=page.getByRole('button',{name:/^(Write something|เขียนอะไรสักหน่อย)/i});
    if(await opener.count()!==1||!await opener.isVisible())throw new NativeHold('composer_unsupported','A unique native original-text composer opener is unavailable; no guessed coordinates or alternative endpoint');
    await opener.click();
    const editor=page.locator('[role="dialog"] [contenteditable="true"][role="textbox"]');await editor.waitFor({state:'visible',timeout:15000});if(await editor.count()!==1)throw new NativeHold('composer_unsupported','No unique original-text editor');
    const dialog=editor.locator('xpath=ancestor::*[@role="dialog"][1]');sameGroup(page,target);await this.actingIdentity(dialog,target);
    const post=dialog.getByRole('button',{name:/^(Post|โพสต์)$/});if(await post.count()!==1)throw new NativeHold('submission_unavailable','Native Post control is ambiguous or absent');
    return {dialog,editor,post};
  }
  async check(page:Page,target:GroupTextTarget){
    const prepared=await this.openComposer(page,target);
    const result={ready:true,groupUrl:target.groupUrl,profileId:target.profileId,graphId:target.graphId,joined:true,nativeTextComposer:true,postingIdentityVerified:true,observedAt:new Date().toISOString(),source:'agent_browser_observation',notice:'Empty native composer inspected; no text entered, claim or Post click. This is readiness, not publication authority.'};
    const close=prepared.dialog.getByRole('button',{name:/^(Close composer dialog|ปิดกล่องโต้ตอบช่องเขียนข้อความ)$/i});if(await close.count()===1)await close.click();
    return result;
  }
  async prepare(page:Page,target:GroupTextTarget){
    const {dialog,editor,post}=await this.openComposer(page,target);
    await editor.fill(target.content);
    if(normal(await editor.innerText())!==normal(target.content))throw new NativeHold('text_mismatch','Rendered text differs from the authorized original');
    if(!await post.isEnabled())throw new NativeHold('submission_unavailable','Native Post control is unavailable or disabled');
    await this.actingIdentity(dialog,target);sameGroup(page,target);
    return {observation:{observedAt:new Date().toISOString(),source:'agent_browser_observation' as const,groupUrl:target.groupUrl,graphId:target.graphId,profileId:target.profileId,joined:true as const,textComposerObserved:true as const,rulesRead:true as const,moderation:target.moderation as 'unknown'|'required'|'not_required',notes:'Dedicated browser profile and loopback process verified; Joined, exact native Page link, original-text editor, exact text and enabled Post control observed. Existing dated SCC Group rules remain the authorization context.'},post,editor,dialog};
  }
  async verifyPrepared(page:Page,target:GroupTextTarget,prepared:Awaited<ReturnType<FacebookGroupTextUI['prepare']>>){sameGroup(page,target);await this.actingIdentity(prepared.dialog,target);if(normal(await prepared.editor.innerText())!==normal(target.content)||!await prepared.post.isEnabled())throw new NativeHold('pre_dispatch_changed','Composer text or Post control changed before dispatch');}
  async submit(page:Page,target:GroupTextTarget,prepared:Awaited<ReturnType<FacebookGroupTextUI['prepare']>>):Promise<NativeOutcome>{
    // The caller persists its single-dispatch fence before invoking this method.
    await prepared.post.click({timeout:10000,noWaitAfter:true});
    for(let attempt=0;attempt<5;attempt++){
      await page.waitForTimeout(1000);const feedback=(await page.locator('[role="alert"],[role="status"],[role="dialog"]').allTextContents()).join('\n');
      if(/pending approval|submitted.{0,50}approval|รอการอนุมัติ|ส่งโพสต์.{0,30}ผู้ดูแล/i.test(feedback))return {state:'pending_approval',notes:'Native UI reports pending administrator approval. This is a charged completed submission, not a retry trigger.'};
      if(/You can.t post|บัญชีของคุณถูกจำกัด|temporarily blocked/i.test(feedback))return {state:'restricted',notes:'Native UI reports a posting restriction after the single dispatch.'};
      const published=await this.observePublished(page,target);if(published)return published;
    }
    return {state:'uncertain',notes:'Single native Post click attempted; no unambiguous receipt/moderation response observed. Reconcile the original; never auto-retry.'};
  }
  async observePublished(page:Page,target:GroupTextTarget):Promise<NativeOutcome|null>{
      sameGroup(page,target);const articles=page.getByRole('article');const urls=new Set<string>();
      for(let i=0;i<await articles.count();i++){const article=articles.nth(i);if(!displayText(await article.innerText()).includes(displayText(target.content)))continue;const hrefs=await article.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>(a as HTMLAnchorElement).href));
        const actingPagePresent=hrefs.some(h=>{try{const u=new URL(h);return u.origin==='https://www.facebook.com'&&(u.pathname.includes(`/user/${target.profileId}/`)||u.pathname==='/profile.php'&&u.searchParams.get('id')===target.profileId||u.pathname.replace(/\/$/,'')===`/${target.profileId}`);}catch{return false;}});if(!actingPagePresent)continue;
        for(const href of hrefs){try{const thread=parseGroupThreadIdentity(href);if(thread.canonicalUrl===target.groupUrl&&!thread.commentId&&!thread.replyCommentId)urls.add(`https://www.facebook.com/groups/${thread.groupToken}/posts/${thread.postId}/`);}catch{}}
      }
      if(urls.size===1)return {state:'published',url:[...urls][0],notes:'Original text, acting Page link and one Group post permalink observed after the single dispatch. Feed-only empty-paragraph spacing normalized; the exact pre-click editor text/hash is retained. Native browser observation, not Groups API verification.'};
      return null;
  }
}
