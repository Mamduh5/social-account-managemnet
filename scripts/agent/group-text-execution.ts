import {randomUUID} from 'node:crypto';
import {AgentStore} from './store.js';
import {GroupTextPublication} from './group-text-publication.js';
import {GroupBrowser} from './group-browser.js';
import {FacebookGroupTextUI,NativeHold,type GroupTextTarget,type NativeOutcome} from './group-native-ui.js';
import {groupBrowserLease} from './group-browser-binding.js';

export interface NativeSession {binding:{accountId:string;endpoint:string};prepare(target:GroupTextTarget):Promise<any>;verify(target:GroupTextTarget,prepared:any):Promise<void>;submit(target:GroupTextTarget,prepared:any):Promise<NativeOutcome>;observe?(target:GroupTextTarget):Promise<NativeOutcome|null>;}
export interface NativeDriver {withSession<T>(target:GroupTextTarget,action:(session:NativeSession)=>Promise<T>):Promise<T>;}
export interface GroupExecutionResult {submissionStarted:boolean;ready?:boolean;state?:string;reason?:string;receiptState?:string;[key:string]:unknown;}
export class DedicatedGroupDriver implements NativeDriver {
  constructor(readonly browser:GroupBrowser,readonly ui=new FacebookGroupTextUI()){}
  withSession<T>(target:GroupTextTarget,action:(session:NativeSession)=>Promise<T>){return this.browser.withPage(target.accountId,(page,config)=>action({binding:{accountId:config.accountId,endpoint:config.endpoint},prepare:t=>this.ui.prepare(page,t),verify:(t,p)=>this.ui.verifyPrepared(page,t,p),submit:(t,p)=>this.ui.submit(page,t,p),observe:t=>this.ui.observePublished(page,t)}));}
}

/** Shared SCC execution, no timer or new scheduler. All agents invoke this same boundary.
 * Preflight -> exact composer -> atomic charge -> durable click fence -> one click -> outcome. */
export class GroupTextExecution {
  constructor(readonly store:AgentStore,readonly lane:GroupTextPublication,readonly driver:NativeDriver,readonly saveReceipt?:(preparedId:string,url:string)=>Promise<unknown>,readonly clock:()=>Date=()=>new Date()){}
  private async publishedReceipt(destinationId:string,preparedId:string,outcome:NativeOutcome){
    if(outcome.state!=='published'||!outcome.url||!this.saveReceipt)return 'no_published_receipt';const step='save_scc_group_receipt',claim=this.store.claimOperation(destinationId,step,{preparedId,url:outcome.url});
    if(!claim.claimed)return claim.operation.status;
    try{const receipt=await this.saveReceipt(preparedId,outcome.url);this.store.finishOperation(destinationId,step,'succeeded',receipt);return 'saved_in_scc';}catch(e){this.store.finishOperation(destinationId,step,'uncertain',{error:String(e)});return 'scc_receipt_reconciliation_required';}
  }
  async reconcileVisible(destinationId:string):Promise<GroupExecutionResult>{
    const candidate=await this.lane.candidate(destinationId),original=this.store.getOperation(destinationId,'native_ui_dispatch');
    if(!original)return {submissionStarted:false,ready:false,reason:'no_managed_native_dispatch_to_reconcile'};
    if(candidate.job.state.phase==='published')return {submissionStarted:true,state:'published',url:candidate.job.state.receiptUrl,notice:'Saved original outcome; no navigation, receipt rewrite or Post action.'};
    const executionId='group-reconcile:'+randomUUID(),lease=groupBrowserLease(candidate.target.accountId);this.store.createJob(executionId,{destinationId,mode:'read_only_visible_receipt'});if(this.store.providerOwner('scc:facebook-group-browser')||!this.store.reserveProvider(lease,executionId))return {submissionStarted:false,ready:false,reason:'dedicated_browser_busy_or_unresolved'};
    try{return await this.driver.withSession(candidate.target,async session=>{if(!session.observe)throw Error('Read-only native observation unsupported');const outcome=await session.observe(candidate.target);if(!outcome)return {submissionStarted:true,state:'uncertain',reason:'receipt_not_visible_no_retry'};const observedAt=this.clock().toISOString();
      this.lane.record({commandId:executionId.replace(':','-'),destinationId,...outcome,observedAt,source:'agent_browser_observation',accountId:candidate.target.accountId,groupUrl:candidate.target.groupUrl});
      if(original.status==='uncertain'||original.status==='pending')this.store.finishOperation(destinationId,'native_ui_dispatch','succeeded',{...outcome,observedAt,reconciledReadOnly:true});
      const continuation=this.store.getOperation(destinationId,'continue_original');if(continuation?.status==='pending')this.store.finishOperation(destinationId,'continue_original','succeeded',{...outcome,observedAt,originalChargeRetained:true});
      const receiptState=await this.publishedReceipt(destinationId,candidate.target.preparedId,outcome);this.store.patchState(executionId,{phase:'reconciled',outcome,receiptState});return {submissionStarted:true,state:outcome.state,url:outcome.url,observedAt,receiptState,source:'agent_browser_observation',reconciledReadOnly:true};
    });}finally{this.store.releaseProvider(lease,executionId);}
  }
  async run(destinationId:string,submit=false):Promise<GroupExecutionResult>{
    const candidate=await this.lane.candidate(destinationId);
    if(!['due_requires_authorized_native_executor','charged_original_continuation_requires_native_executor'].includes(candidate.admission))return {ready:false,submissionStarted:false,reason:candidate.admission,destinationId,notice:'Inspect/reconcile this original; no new grant, claim, reschedule or remote dispatch.'};
    const executionId='group-execution:'+randomUUID(),lease=groupBrowserLease(candidate.target.accountId);
    this.store.createJob(executionId,{destinationId,mode:submit?'execute':'preflight'});
    if(this.store.providerOwner('scc:facebook-group-browser')||!this.store.reserveProvider(lease,executionId)){this.store.patchState(executionId,{phase:'browser_busy'});return {ready:false,submissionStarted:false,reason:'dedicated_browser_busy_or_unresolved',owner:this.store.providerOwner(lease)};}
    this.store.patchState(executionId,{phase:'preflight',remoteDispatchAttempted:false});let claimed=false,dispatchFenced=false;
    try{return await this.driver.withSession(candidate.target,async session=>{
      if(session.binding.accountId!==candidate.target.accountId)throw new NativeHold('browser_account_mismatch','Native session belongs to another SCC account');const prepared=await session.prepare(candidate.target);await session.verify(candidate.target,prepared);
      this.store.patchState(executionId,{phase:'ready',readyAt:this.clock().toISOString()});
      if(!submit)return {ready:true,submissionStarted:false,executionId,destinationId,notice:'Dedicated native composer verified. Execute performs a fresh check; this read never charges or clicks Post.'};
      const readiness={destinationId,contentHash:candidate.target.contentHash,checkedAt:this.clock().toISOString(),profileId:candidate.target.profileId,accountId:session.binding.accountId,endpoint:session.binding.endpoint,executionId};
      const request={destinationId,observation:prepared.observation},result=candidate.admission==='charged_original_continuation_requires_native_executor'?await this.lane.resumeClaim(request,readiness):await this.lane.claim(request,readiness);if(!result.submissionStarted)return result;
      claimed=true;this.store.patchState(executionId,{phase:'claimed'});
      await session.verify(candidate.target,prepared);
      const dispatch=await this.lane.fenceDispatch(destinationId,executionId);
      if(!dispatch.claimed)throw Error('Original dispatch fence already exists; reconciliation only');dispatchFenced=true;
      this.store.patchState(executionId,{phase:'dispatch_fenced',remoteDispatchAttempted:true});
      // No call capable of Post/submit exists before the fence and charged exact claim.
      const outcome=await session.submit(candidate.target,prepared);const observedAt=this.clock().toISOString();
      this.store.finishOperation(destinationId,'native_ui_dispatch',outcome.state==='uncertain'?'uncertain':'succeeded',{...outcome,observedAt});
      this.lane.record({commandId:executionId.replace(':','-'),destinationId,...outcome,observedAt,source:'agent_browser_observation',accountId:candidate.target.accountId,groupUrl:candidate.target.groupUrl});
      this.store.patchState(executionId,{phase:'recorded',outcome});
      const receiptState=await this.publishedReceipt(destinationId,candidate.target.preparedId,outcome);
      return {ready:true,submissionStarted:true,continuedOriginal:candidate.admission==='charged_original_continuation_requires_native_executor',executionId,destinationId,...outcome,observedAt,receiptState,source:'agent_browser_observation'};
    });}catch(e){
      const reason=e instanceof NativeHold?e.code:'executor_error',message=(e as Error).message;
      if(claimed&&dispatchFenced){
        const saved=this.store.getOperation(destinationId,'native_ui_dispatch');if(saved?.status==='succeeded'){this.store.patchState(executionId,{phase:'outcome_reconciliation_required',reason,message});return {ready:false,submissionStarted:true,state:'outcome_reconciliation_required',savedNativeOutcome:saved.response,executionId,destinationId,reason,message};}
        const outcome={state:'uncertain' as const,notes:'Native dispatch fence exists; click or response is uncertain: '+message};
        this.store.finishOperation(destinationId,'native_ui_dispatch','uncertain',outcome);
        this.lane.record({commandId:executionId.replace(':','-')+'-uncertain',destinationId,...outcome,observedAt:this.clock().toISOString(),source:'agent_browser_observation',accountId:candidate.target.accountId,groupUrl:candidate.target.groupUrl});
        this.store.patchState(executionId,{phase:'uncertain',reason,message});return {ready:false,submissionStarted:true,state:'uncertain',executionId,destinationId,reason,message};
      }
      if(claimed){
        // Here this managed executor conclusively never reached its only submission call.
        this.store.patchState(destinationId,{phase:'stopped_before_dispatch',managedPreDispatchStop:{executionId,reason,message,observedAt:this.clock().toISOString()}});
        this.store.recordKnowledge({id:executionId+':pre-dispatch-stop',kind:'observation',accountId:candidate.target.accountId,resourceId:destinationId,source:'scc_managed_executor',text:'Stopped before the only native submit call and before its durable dispatch fence. Original intent and one charge retained; no replay authority created.',evidence:{executionId,reason,message}});
      }
      this.store.patchState(executionId,{phase:'stopped_before_dispatch',reason,message});return {ready:false,submissionStarted:claimed,state:'stopped_before_dispatch',executionId,destinationId,reason,message};
    }finally{this.store.releaseProvider(lease,executionId);}
  }
}
