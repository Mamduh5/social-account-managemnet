import type {Page} from 'playwright';
import {canonicalGroupIdentity} from '../../server/src/domain/groups.js';
import {FacebookGroupTextUI,NativeHold} from './group-native-ui.js';
export interface NativePageIdentity {accountId:string;name:string;graphId:string;profileId:string;}

/** Membership comes from Facebook's rendered Your Groups list, never browsing history.
 * Registration observes each selected Group separately; discovery grants no posting authority. */
export class FacebookGroupMembershipUI {
  async identify(page:Page,identity:NativePageIdentity,navigate=true){
    if(navigate)await page.goto('https://www.facebook.com/groups/feed/',{waitUntil:'domcontentloaded',timeout:30000});
    if(await page.locator('input[name="email"]:visible,input[name="pass"]:visible').count())throw new NativeHold('login_required',`Sign in normally once in the dedicated profile for ${identity.name} (${identity.accountId}), then manually select that Page. No other account session will be reused.`);
    const ads=page.getByRole('link',{name:/^(Ad Center|ศูนย์โฆษณา)$/i});await ads.first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
    const adsLinks=await ads.evaluateAll(nodes=>nodes.map(n=>(n as HTMLAnchorElement).href));
    const visibleLinks=await page.locator('a[href]').evaluateAll(nodes=>nodes.filter(n=>(n as HTMLElement).getClientRects().length).map(n=>(n as HTMLAnchorElement).href));
    const profileMatches=adsLinks.some(h=>{try{const u=new URL(h);return u.origin==='https://www.facebook.com'&&u.pathname===`/${identity.profileId}/ad_center/`;}catch{return false;}});
    const graphMatches=visibleLinks.some(h=>{try{const u=new URL(h);return u.origin==='https://business.facebook.com'&&u.searchParams.get('asset_id')===identity.graphId;}catch{return false;}});
    if(!profileMatches||!graphMatches)throw new NativeHold('posting_identity_unverified',`The dedicated Facebook UI does not identify ${identity.name}, native profile ${identity.profileId}, Graph ${identity.graphId}. Select that Page manually in its own profile; never fall back to another account.`);
    return {...identity,source:'agent_browser_observation',observedAt:new Date().toISOString()};
  }
  async joined(page:Page,identity:NativePageIdentity){
    await this.identify(page,identity);
    const own=page.getByRole('link',{name:/^(Your groups|กลุ่มของคุณ)$/i});if(await own.count()!==1)throw new NativeHold('membership_list_unsupported','No unique native Your Groups control; do not infer membership from feed links or history');await own.click();
    await page.waitForURL(url=>url.origin==='https://www.facebook.com'&&url.pathname==='/groups/joins/',{timeout:15000});
    const main=page.getByRole('main'),heading=main.getByRole('heading',{name:/^(All groups you.ve joined|กลุ่มทั้งหมดที่คุณเข้าร่วม)/i});await heading.waitFor({state:'visible',timeout:15000});const headingText=await heading.innerText();
    const links=await main.locator('a[href]').evaluateAll(nodes=>nodes.filter(n=>(n as HTMLElement).getClientRects().length).map(n=>({name:(n as HTMLElement).innerText.trim(),url:(n as HTMLAnchorElement).href})));
    const unique=new Map<string,{name:string;url:string;groupId:string;numericIdVerified:boolean}>();for(const link of links){if(!link.name||/^(View group|ดูกลุ่ม)$/i.test(link.name))continue;try{const url=new URL(link.url);if(url.origin!=='https://www.facebook.com'||!/^\/groups\/[A-Za-z0-9._-]+\/$/.test(url.pathname))continue;const g=canonicalGroupIdentity(link.url);unique.set(g.canonicalKey,{name:link.name,url:g.canonicalUrl,groupId:g.groupToken,numericIdVerified:/^\d+$/.test(g.groupToken)});}catch{}}
    await this.identify(page,identity,false);const groups=[...unique.values()].slice(0,100),reportedCount=Number(headingText.match(/\((\d+)\)/)?.[1]??groups.length);
    return {identity,source:'agent_browser_observation',observedAt:new Date().toISOString(),listingUrl:page.url(),heading:headingText,reportedCount,partial:groups.length<reportedCount,groups,notice:'Listed by native Your Groups for this verified Page. Each selected destination still requires its own Joined/composer/rules check. No posting or grant authority.'};
  }
  async inspect(page:Page,identity:NativePageIdentity,group:{name:string;url:string;groupId:string;numericIdVerified:boolean}){
    if(!group.numericIdVerified)throw new NativeHold('numeric_group_id_unverified','A vanity URL from the membership list needs an observed numeric native ID before registration');
    await page.goto(group.url,{waitUntil:'domcontentloaded',timeout:30000});await this.identify(page,identity,false);
    const composer=await new FacebookGroupTextUI().check(page,{destinationId:'membership-readiness',preparedId:'none',accountId:identity.accountId,groupUrl:group.url,content:'',contentHash:'0'.repeat(64),graphId:identity.graphId,profileId:identity.profileId,rules:'Permission inspection only; no post preparation',moderation:'unknown'});
    let about=page.getByRole('tab',{name:/^(About|เกี่ยวกับ)$/i});if(await about.count()!==1)about=page.getByRole('link',{name:/^(About|เกี่ยวกับ)$/i});if(await about.count()!==1)throw new NativeHold('rules_inspection_required','No unique native About control; retain membership observation without inventing rules');await about.click();
    const main=page.getByRole('main');await main.waitFor({state:'visible',timeout:10000});await page.waitForTimeout(500);const rules=await main.innerText();if(!rules.trim())throw new NativeHold('rules_inspection_required','No visible About/rules text');await this.identify(page,identity,false);
    return {identity,group,composer,observedAt:new Date().toISOString(),source:'agent_browser_observation',rules:rules.slice(0,8000),rulesComplete:false,moderation:'unknown',notice:'Visible About snapshot only; no global moderation exemption or undisplayed numbered-rule claim. No text entered or Post click.'};
  }
}
