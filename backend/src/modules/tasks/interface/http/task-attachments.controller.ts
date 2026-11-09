import {
    BadRequestException,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    Res,
    StreamableFile,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiProduces,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiErrorResponse } from '../../../../shared/http/api-error.response';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/interface/http/decorators';
import { DeleteAttachmentUseCase } from '../../application/delete-attachment.use-case';
import { DownloadAttachmentUseCase } from '../../application/download-attachment.use-case';
import { UploadAttachmentUseCase } from '../../application/upload-attachment.use-case';
import { actorOf } from './actor-of';
import { attachmentDisposition } from './content-disposition';
import { AttachmentResponse, AttachmentUploadBody } from './tasks.responses';

/** The part of the multer file object this controller relies on (disk storage). */
interface UploadedDiskFile {
    originalname: string;
    mimetype: string;
    path: string;
    size: number;
}

/** multer spools the upload to disk, so concurrent 20 MB requests do not sit in memory. */
const UPLOAD_SPOOL_DIR = join(tmpdir(), 'tasks-uploads');

const errorResponse = (status: HttpStatus, description: string): MethodDecorator =>
    ApiResponse({ status, description, type: ApiErrorResponse });

const unauthorized = errorResponse(HttpStatus.UNAUTHORIZED, 'Missing or invalid access token');
const notFound = errorResponse(HttpStatus.NOT_FOUND, 'Task or attachment not found');

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks/:id/attachments')
export class TaskAttachmentsController {
    constructor(
        private readonly uploadAttachment: UploadAttachmentUseCase,
        private readonly downloadAttachment: DownloadAttachmentUseCase,
        private readonly deleteAttachment: DeleteAttachmentUseCase,
    ) {}

    @Post()
    @UseInterceptors(FileInterceptor('file', { dest: UPLOAD_SPOOL_DIR, defParamCharset: 'utf8' }))
    @ApiOperation({ summary: 'Attach one file (multipart field "file") to a task' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: AttachmentUploadBody })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'Attachment metadata',
        type: AttachmentResponse,
    })
    @errorResponse(HttpStatus.BAD_REQUEST, 'No file, empty file or malformed multipart body')
    @errorResponse(HttpStatus.PAYLOAD_TOO_LARGE, 'File exceeds the size limit')
    @errorResponse(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'TASK_ATTACHMENT_LIMIT: the task already has the maximum number of files',
    )
    @notFound
    @unauthorized
    async upload(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) taskId: string,
        @UploadedFile() file: UploadedDiskFile | undefined,
    ): Promise<AttachmentResponse> {
        if (file === undefined) throw new BadRequestException('Field "file" is required');
        // Opened eagerly by createReadStream: destroy it so an unconsumed stream never leaks an fd.
        const stream = createReadStream(file.path);
        try {
            if (file.size === 0) throw new BadRequestException('The file is empty');
            const view = await this.uploadAttachment.execute(actorOf(user), taskId, {
                name: file.originalname,
                contentType: file.mimetype,
                stream,
            });
            return new AttachmentResponse(view);
        } finally {
            stream.destroy();
            await rm(file.path, { force: true });
        }
    }

    @Get(':attachmentId')
    @ApiOperation({ summary: 'Download an attachment' })
    @ApiProduces('application/octet-stream')
    @ApiResponse({ status: HttpStatus.OK, description: 'File bytes as an attachment' })
    @notFound
    @unauthorized
    async download(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) taskId: string,
        @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
        @Res({ passthrough: true }) response: Response,
    ): Promise<StreamableFile> {
        const { meta, stream } = await this.downloadAttachment.execute(
            actorOf(user),
            taskId,
            attachmentId,
        );
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return new StreamableFile(stream, {
            type: meta.contentType,
            disposition: attachmentDisposition(meta.originalName),
            length: meta.sizeBytes,
        });
    }

    @Delete(':attachmentId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete an attachment and its file' })
    @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Attachment deleted' })
    @notFound
    @unauthorized
    async remove(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) taskId: string,
        @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    ): Promise<void> {
        await this.deleteAttachment.execute(actorOf(user), taskId, attachmentId);
    }
}
