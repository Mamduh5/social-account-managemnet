export interface TestDataRecord {
  type: string;
  id: string;
  name: string;
  classification: 'confirmed_demo' | 'unknown' | 'protected';
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
}
