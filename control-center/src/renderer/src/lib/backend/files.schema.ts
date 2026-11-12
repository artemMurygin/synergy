import { z } from "zod";

export const FILE_KINDS = ["document", "recording"] as const;
export const FILE_STATUSES = ["active", "deleted"] as const;

export const FileKindSchema = z.enum(FILE_KINDS);
export const FileStatusSchema = z.enum(FILE_STATUSES);

export type FileKind = z.infer<typeof FileKindSchema>;
export type FileStatus = z.infer<typeof FileStatusSchema>;

/** Metadata of an uploaded file (`POST /files`, `GET /files/:id`). */
export const StoredFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: z.string(),
  kind: FileKindSchema,
  sizeBytes: z.number(),
  status: FileStatusSchema,
  /** The recording is still held for transcription. */
  awaitingProcessing: z.boolean(),
  uploadedAt: z.string(),
  expiresAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});

export type StoredFile = z.infer<typeof StoredFileSchema>;

/** Signed download link as the server returns it: `url` is relative to the backend. */
export const DownloadLinkSchema = z.object({
  url: z.string().startsWith("/"),
  expiresAt: z.string(),
});

export type DownloadLink = z.infer<typeof DownloadLinkSchema>;
