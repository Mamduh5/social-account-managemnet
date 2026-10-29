export interface TestDataRecord {
  type: string;
  id: string;
  name: string;
  classification: 'confirmed_demo' | 'owner_marked_test' | 'unknown' | 'owner_marked_keep';
  source: string;
  status: string;
  eligibility: 'safe' | 'review' | 'protected' | 'unsupported';
  updatedAt: string | null;
  protection: string;
  dependencies: string[];
  eligible: boolean;
  eligibilityReason: string;
}

export interface TestDataSelection { type: string; id: string }
export interface TestDataPreviewRecord extends TestDataSelection {
  name: string;
  eligible: boolean;
  reason: string;
  dependencies: string[];
  rows: { table: string; id: string }[];
}
export interface TestDataPreview {
  previewId: string;
  records: TestDataPreviewRecord[];
  total: number;
  canDelete: boolean;
  unchanged: string[];
  additionalChanges: string[];
  reversible: false;
  confirmationPhrase: string;
}

export interface TestDataPage {
  records: TestDataRecord[];
  hasMore: boolean;
  limit: number;
  offset: number;
  nextOffset?: number | null;
  scanIncomplete?: boolean;
}

export interface WatchFileEntry {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  modifiedAt: string;
  isImported: boolean;
  importedVideoId?: string;
  fileId: string | null;
  sourceFingerprint: string | null;
  hidden: boolean;
  visibilitySupported: boolean;
  visibilityReason?: string;
}

export interface HiddenWatchFileEntry {
  filename: string;
  fullPath: string;
  sizeBytes: number;
  modifiedAt: string;
  fileId: string;
  sourceFingerprint: string;
  currentSource: boolean;
  present: boolean | null;
}

export interface WatchFilePage {
  items: WatchFileEntry[];
  limit: number;
  offset: number;
  hasMore: boolean;
  sourceAvailable: boolean;
  scanIncomplete?: boolean;
}

export interface HiddenWatchFilePage {
  items: HiddenWatchFileEntry[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface TestDataDetail {
  record: TestDataRecord;
  evidence: string[];
  relationships: string[];
  complete: boolean;
  thumbnailUrl?: string | null;
  links?: {type:string; id:string; label:string}[];
}
