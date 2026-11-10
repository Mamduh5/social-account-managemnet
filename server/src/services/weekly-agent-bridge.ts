import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataDir } from '../db/database.js';

export type WeeklyAgentAction = 'analysis' | 'prepare' | 'status' | 'persist' | 'groupSchedule' | 'groupStatus' | 'imageReview' | 'imageAuthorize' | 'videoAdmit';
export interface WeeklyAgentBridge { run(action: WeeklyAgentAction, input: unknown): Promise<any> }
const commands: Record<WeeklyAgentAction, string> = {
  analysis: 'weekly-analysis-enqueue', prepare: 'weekly-preparation-enqueue',
  status: 'weekly-agent-status', persist: 'weekly-preparation-persist',
  groupSchedule: 'group-text-schedule', groupStatus: 'group-text-status',
  imageReview: 'weekly-image-review', imageAuthorize: 'weekly-image-authorize', videoAdmit: 'weekly-video-admit',
};
/** The same shell-free, fixed-command bridge used by owner review. Never ticks a runner or provider. */
export class ExistingWeeklyAgentBridge implements WeeklyAgentBridge {
  run(action: WeeklyAgentAction, input: unknown): Promise<any> {
    const state = path.resolve(process.env.SCC_AGENT_STATE || path.join(dataDir, 'agent', 'agent.db'));
    if (!fs.existsSync(state)) return Promise.reject(new Error('Existing AgentRunner state unavailable; no state or provider was created'));
    const script = path.resolve(__dirname, '../../../scripts/agent.ts');
    const args = ['--import', pathToFileURL(require.resolve('tsx')).href, script, commands[action], '--state', state,
      '--scc', process.env.SCC_AGENT_SCC_URL || 'http://localhost:' + (process.env.PORT || 3001),
      '--pipeline', process.env.SCC_AGENT_PIPELINE_URL || 'http://localhost:8080', '--input', '-'];
    if (action === 'prepare' || action === 'imageAuthorize') args.push('--owner-authorized');
    return new Promise((resolve, reject) => {
      const child = execFile(process.execPath, args, { cwd: path.dirname(path.dirname(script)), windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
        try {
          const result = JSON.parse(stdout.trim());
          if (!result.ok) throw new Error(result.error?.message || 'Existing agent action held');
          if (error) throw new Error('Agent bridge interrupted; reconcile the original task identity');
          resolve(result.data);
        } catch (e) { reject(e instanceof Error ? e : new Error('Agent result unavailable; retain original intent')); }
      });
      child.stdin?.end(JSON.stringify(input));
    });
  }
}
