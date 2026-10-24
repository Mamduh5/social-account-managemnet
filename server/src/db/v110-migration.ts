import type Database from 'better-sqlite3';
import {migrateGeneralPublishing} from './general-posts-schema.js';
import {initializeContentWorkspaceSchema} from './content-workspace-schema.js';
/** One transaction for the exact copy-tested general-post and workspace schema. */
export function migrateV110Database(database:Database.Database,validateBeforeCommit?:(database:Database.Database)=>void){migrateGeneralPublishing(database,db=>{initializeContentWorkspaceSchema(db);validateBeforeCommit?.(db);});}
