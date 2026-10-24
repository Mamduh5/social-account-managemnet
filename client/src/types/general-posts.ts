export type GeneralPostType = 'text' | 'image' | 'multi_image' | 'link';
export type PostContentType = GeneralPostType | 'reel';
export interface ImageAsset {
  id: string;
  original_filename: string;
  mime_type: string;
  width: number;
  height: number;
  file_size: number;
  previewUrl: string;
}
export interface DraftAttachment { mediaId: string; altText?: string }
export interface DraftDestination {
  accountId: string;
  caption: string;
  hashtags?: string;
  linkUrl?: string;
  attachments: DraftAttachment[];
  selectedVariantId?: string | null;
  applyBranding?: boolean;
}
export interface DraftInput {
  title: string;
  contentType: PostContentType;
  videoId?: string;
  scheduledAt?: string | null;
  destinations: DraftDestination[];
}
export interface PublishingDraft extends DraftInput {
  id: string;
  revision: number;
  status: 'draft' | 'approved' | 'rejected' | 'queued';
  approvedRevision?: number | null;
  queuedPostId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
export interface PostCapabilities { supportedPostTypes: PostContentType[]; reason?: string }
