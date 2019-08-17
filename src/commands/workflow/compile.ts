import {existsSync, readFileSync} from 'fs'
import {dirname, join} from 'path'

import Command from '../../root-command'
import * as compile from '../../utils/compiler'
import ServiceCompile from '../service/compile'
import ServiceCreate from '../service/create'
import ServiceStart from '../service/start'

export default class WorkflowCompile extends Command {
  static description = 'Compile a workflow'

  static flags = {
    ...Command.flags
  }

  static args = [{
    name: 'WORKFLOW_FILE',
    description: 'Path of a workflow file'
  }]

  async run(): Promise<any> {
    const {args} = this.parse(WorkflowCompile)
    const definition = await compile.workflow(readFileSync(args.WORKFLOW_FILE), async (instanceObject: any) => {
      if (instanceObject.instanceHash) {
        return instanceObject.instanceHash
      }
      if (instanceObject.service) {
        return this.serviceToInstance(instanceObject.service)
      }
      if (instanceObject.src) {
        return this.sourceToInstance(args.WORKFLOW_FILE, instanceObject.src)
      }
      throw new Error('at least one of the following parameter should be set: "instanceHash", "service" or "src"')
    })
    this.styledJSON(definition)
    this.spinner.stop()
    return definition
  }

  async sourceToInstance(dir: string, src: string): Promise<string> {
    const directory = join(dirname(dir), src)
    const definition = await ServiceCompile.run([existsSync(directory) ? directory : src, '--silent'])
    const service = await ServiceCreate.run([JSON.stringify(definition), '--silent'])
    return this.serviceToInstance(service.hash)
  }

  async serviceToInstance(key: string): Promise<string> {
    const {services} = await this.api.service.list({})
    if (!services) throw new Error('no services deployed, please deploy your service first')
    const match = services.filter(x => x.hash === key || x.sid === key)
    if (!match || match.length === 0) throw new Error(`cannot find any service with the following: ${key}`)
    if (match.length > 1) throw new Error(`multiple services match the following sid: ${key}, provide a service's hash instead`)
    const service = match[0]
    if (!service.hash) throw new Error('invalid service')
    const {instances} = await this.api.instance.list({serviceHash: service.hash})
    if (!instances || instances.length === 0) {
      const instance = await ServiceStart.run([service.hash, '--silent'])
      return instance.hash
    }
    if (instances.length > 1) throw new Error('multiple instances match the service, use parameter "instanceHash" instead of "service"')
    const instance = instances[0]
    if (!instance.hash) throw new Error('invalid instance')
    return instance.hash
  }
}
