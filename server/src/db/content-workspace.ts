import { db } from './database.js';
import { initializeContentWorkspaceSchema } from './content-workspace-schema.js';
export function initializeContentWorkspace() { initializeContentWorkspaceSchema(db); }
export const initializeAssistantDatabase=initializeContentWorkspace;
