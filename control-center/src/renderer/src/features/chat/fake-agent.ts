import { HttpAgent } from '@ag-ui/client'
import type { BaseEvent, RunAgentInput } from '@ag-ui/client'
import { Subject } from 'rxjs'

/** Test agent: runs are driven by the test, which pushes AG-UI events into `stream`. */
export class FakeAgent extends HttpAgent {
  readonly inputs: RunAgentInput[] = []
  stream = new Subject<BaseEvent>()

  override run(input: RunAgentInput): ReturnType<HttpAgent['run']> {
    this.inputs.push(input)
    this.stream = new Subject<BaseEvent>()
    // @ag-ui/client bundles its own rxjs copy: compatible at runtime, not in types
    return this.stream.asObservable() as unknown as ReturnType<HttpAgent['run']>
  }
}
