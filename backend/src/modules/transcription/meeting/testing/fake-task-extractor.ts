import type { RawExtractedTask } from '../domain/extracted-meeting-task';
import { TaskExtractorPort, type TaskExtractionContext } from '../domain/ports/task-extractor.port';

export interface RecordedExtraction {
    lines: string[];
    context: TaskExtractionContext;
}

type ExtractBehaviour = (lines: readonly string[], call: number) => RawExtractedTask[];
type MergeBehaviour = (batches: readonly (readonly RawExtractedTask[])[]) => RawExtractedTask[];

/** Двойник извлечения: отвечает заданным поведением и запоминает вызовы. */
export class FakeTaskExtractor extends TaskExtractorPort {
    readonly extractions: RecordedExtraction[] = [];
    readonly merges: RawExtractedTask[][][] = [];

    constructor(
        private readonly onExtract: ExtractBehaviour = () => [],
        private readonly onMerge: MergeBehaviour = (batches) => batches.flat(),
    ) {
        super();
    }

    extract(lines: readonly string[], context: TaskExtractionContext): Promise<RawExtractedTask[]> {
        this.extractions.push({ lines: [...lines], context });
        return Promise.resolve(this.onExtract(lines, this.extractions.length - 1));
    }

    merge(batches: readonly (readonly RawExtractedTask[])[]): Promise<RawExtractedTask[]> {
        this.merges.push(batches.map((b) => [...b]));
        return Promise.resolve(this.onMerge(batches));
    }
}
