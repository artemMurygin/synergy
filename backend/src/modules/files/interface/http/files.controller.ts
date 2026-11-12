import type { Readable } from 'node:stream';
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
    Query,
    Req,
    Res,
    StreamableFile,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiProduces,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import busboy from 'busboy';
import type { Request, Response } from 'express';
import {
    apiErrorResponse,
    apiUnauthorizedResponse,
} from '../../../../shared/http/api-error-response.decorator';
import { attachmentDisposition } from '../../../../shared/http/content-disposition';
import {
    CurrentUser,
    Public,
    type AuthenticatedUser,
} from '../../../auth/interface/http/decorators';
import { ownerOf } from '../../../auth/interface/http/owner-of';
import { CreateDownloadLinkUseCase } from '../../application/create-download-link.use-case';
import { DeleteFileUseCase } from '../../application/delete-file.use-case';
import { DownloadFileContentUseCase } from '../../application/download-file-content.use-case';
import { GetFileUseCase } from '../../application/get-file.use-case';
import type { StoredFileView } from '../../application/stored-file-view';
import { UploadFileUseCase } from '../../application/upload-file.use-case';
import { DownloadLinkResponse, FileUploadBody, StoredFileResponse } from './files.responses';

const FILE_FIELD = 'file';

const notFound = apiErrorResponse(
    HttpStatus.NOT_FOUND,
    'FILE_NOT_FOUND: no such file or it belongs to another user',
);
const gone = apiErrorResponse(HttpStatus.GONE, 'FILE_GONE: the file is deleted');

@ApiTags('files')
@Controller('files')
export class FilesController {
    constructor(
        private readonly uploadFile: UploadFileUseCase,
        private readonly getFile: GetFileUseCase,
        private readonly deleteFile: DeleteFileUseCase,
        private readonly createDownloadLink: CreateDownloadLinkUseCase,
        private readonly downloadFileContent: DownloadFileContentUseCase,
    ) {}

    @Post()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Upload one file (multipart field "file"), streamed to storage' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: FileUploadBody })
    @ApiResponse({
        status: HttpStatus.CREATED,
        description: 'File metadata',
        type: StoredFileResponse,
    })
    @apiErrorResponse(HttpStatus.BAD_REQUEST, 'No file, empty file or malformed multipart body')
    @apiErrorResponse(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE: over the limit for its kind')
    @apiErrorResponse(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'FILE_UNSUPPORTED_MEDIA_TYPE: content is not in the whitelist',
    )
    @apiUnauthorizedResponse
    async upload(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Req() request: Request,
    ): Promise<StoredFileResponse> {
        const ownerId = ownerOf(user);
        try {
            const view = await this.streamUpload(request, (fileName, stream) =>
                this.uploadFile.execute({ ownerId, fileName, stream }),
            );
            return new StoredFileResponse(view);
        } catch (error) {
            // Остаток тела (после 413, 415) дочитывается вхолостую: иначе клиент не получит ответ
            // или keep-alive сокет зависнет.
            if (!request.complete) {
                request.unpipe();
                request.resume();
            }
            throw error;
        }
    }

    @Get(':id')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'File metadata, including a deleted file' })
    @ApiResponse({ status: HttpStatus.OK, description: 'File metadata', type: StoredFileResponse })
    @notFound
    @apiUnauthorizedResponse
    async get(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) fileId: string,
    ): Promise<StoredFileResponse> {
        return new StoredFileResponse(
            await this.getFile.execute({ ownerId: ownerOf(user), fileId }),
        );
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete the file content; metadata stays with status "deleted"' })
    @ApiResponse({
        status: HttpStatus.NO_CONTENT,
        description: 'Deleted (also when already deleted)',
    })
    @notFound
    @apiUnauthorizedResponse
    async remove(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) fileId: string,
    ): Promise<void> {
        await this.deleteFile.execute({ ownerId: ownerOf(user), fileId });
    }

    @Post(':id/download-link')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Short-lived signed link to download the file without a token header',
    })
    @ApiResponse({ status: HttpStatus.OK, description: 'Signed link', type: DownloadLinkResponse })
    @apiErrorResponse(
        HttpStatus.SERVICE_UNAVAILABLE,
        'FILE_DOWNLOAD_LINKS_UNAVAILABLE: download links are not configured',
    )
    @notFound
    @gone
    @apiUnauthorizedResponse
    async downloadLink(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('id', ParseUUIDPipe) fileId: string,
    ): Promise<DownloadLinkResponse> {
        return new DownloadLinkResponse(
            await this.createDownloadLink.execute({ ownerId: ownerOf(user), fileId }),
        );
    }

    // Публичный: браузерные загрузчики не умеют слать Authorization, доступ даёт токен из ссылки.
    @Public()
    @Get(':id/content')
    @ApiOperation({ summary: 'Download the file by a signed link' })
    @ApiQuery({ name: 'token', required: true, description: 'Token from the download link' })
    @ApiProduces('application/octet-stream')
    @ApiResponse({ status: HttpStatus.OK, description: 'File bytes as an attachment' })
    @apiErrorResponse(
        HttpStatus.FORBIDDEN,
        'FILE_DOWNLOAD_TOKEN_INVALID: expired, forged or foreign',
    )
    @gone
    async content(
        @Param('id', ParseUUIDPipe) fileId: string,
        @Query('token') token: unknown,
        @Res({ passthrough: true }) response: Response,
    ): Promise<StreamableFile> {
        const file = await this.downloadFileContent.execute({
            fileId,
            token: typeof token === 'string' ? token : '',
        });
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return new StreamableFile(file.stream, {
            type: file.contentType,
            disposition: attachmentDisposition(file.name),
            length: file.sizeBytes,
        });
    }

    // Multipart разбирается потоком: первый файл поля `file` сразу уходит в use case.
    private streamUpload(
        request: Request,
        handle: (fileName: string, stream: Readable) => Promise<StoredFileView>,
    ): Promise<StoredFileView> {
        return new Promise((resolve, reject) => {
            let parser: busboy.Busboy;
            try {
                parser = busboy({
                    headers: request.headers,
                    defParamCharset: 'utf8',
                    limits: { files: 1 },
                });
            } catch {
                reject(new BadRequestException('Expected a multipart/form-data body'));
                return;
            }
            let fileStream: Readable | undefined;
            // busboy не замечает обрыв соединения: без этого поток файла и загрузка в
            // хранилище висят вечно, а незавершённый multipart upload не отменяется.
            request.once('close', () => {
                if (request.complete) return;
                const aborted = new BadRequestException('Upload was aborted by the client');
                fileStream?.destroy(aborted);
                parser.destroy(aborted);
            });
            parser.on('file', (field, stream, info) => {
                if (field !== FILE_FIELD || fileStream !== undefined) {
                    stream.resume();
                    return;
                }
                fileStream = stream;
                handle(info.filename ?? '', stream).then(resolve, reject);
            });
            parser.on('error', () => {
                reject(new BadRequestException('Malformed multipart body'));
            });
            parser.on('close', () => {
                if (fileStream === undefined) {
                    reject(new BadRequestException(`Field "${FILE_FIELD}" is required`));
                }
            });
            request.pipe(parser);
        });
    }
}
