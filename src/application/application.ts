import * as uuidv4 from 'uuid/v4'
import { checkStreamReady, errNoStatus, Stream } from '../util/grpc';
import { API, ExecutionCreateInputs, ExecutionCreateOutputs, EventStreamInputs, Event, ExecutionStreamInputs, Execution, ExecutionStatus } from '../api';

type Options = {
  client
}

class Application {
  // api gives access to low level gRPC calls.
  private api: API

  constructor(api: API) {
    this.api = api;
  }

  listenEvent(request: EventStreamInputs): Stream<Event> {
    return this.api.event.stream(request)
  }

  listenResult(request: ExecutionStreamInputs): Stream<Execution> {
    return this.api.execution.stream(request)
  }

  executeTask(request: ExecutionCreateInputs): ExecutionCreateOutputs {
    return this.api.execution.create(request)
  }

  executeTaskAndWaitResult(request: ExecutionCreateInputs): Promise<Execution> {
    return new Promise<Execution>((resolve, reject) => {
      const tag = uuidv4()
      const stream = this.listenResult({
        filter: {
          instanceHash: request.instanceHash,
          statuses: [
            ExecutionStatus.COMPLETED,
            ExecutionStatus.FAILED,
          ],
          tags: [tag]
        }
      })
        .on('metadata', (metadata) => {
          const err = checkStreamReady(metadata)
          if (err == errNoStatus) return
          if (err) {
            stream.destroy(err)
            return
          }
          this.executeTask({
            ...request,
            tags: [...(request.tags || []), tag]
          }).catch((err) => stream.destroy(err))
        })
        .on('data', (result) => {
          stream.cancel()
          result.error ? reject(new Error(result.error)) : resolve(result)
        })
        .on('error', (err) => {
          stream.cancel()
          reject(err)
        })
    })
  }
}

export default Application;
export {
  Options,
  Stream,
}
