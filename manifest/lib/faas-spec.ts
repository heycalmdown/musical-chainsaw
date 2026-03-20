import { type FaasStack, type UnifiedFunctionProps } from 'faas-stack'

import { Duration } from 'aws-cdk-lib'
import { type IFunction } from 'aws-cdk-lib/aws-lambda'
import { type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs'
import { type SqsEventSourceProps } from 'aws-cdk-lib/aws-lambda-event-sources'
import { Schedule } from 'aws-cdk-lib/aws-events'

import { existsSync } from 'node:fs'

// GET faas.plugo.town/chol/health
export const Health = defineSpec('Health', 'health.ts', 'get', '/health', 'node')

// POST faas.plugo.town/chol/sessions
export const CreateSession = defineSpec('CreateSession', 'create-session.ts', 'post', '/sessions', 'node')

// POST faas.plugo.town/chol/sessions/{sessionId}/events
export const SessionEvent = defineSpec('SessionEvent', 'session-event.ts', 'post', '/sessions/{sessionId}/events', 'node')

// DEL faas.plugo.town/chol/sessions/{sessionId}
export const DeleteSession = defineSpec('DeleteSession', 'delete-session.ts', 'del', '/sessions/{sessionId}', 'node')

type FunctionProps = Parameters<FaasStack['post']>[2]
type MethodOptions = Parameters<FaasStack['post']>[3]
export interface SpecFunction {
  (faas: FaasStack, lambdaOptions?: FunctionProps, methodOptions?: MethodOptions): ReturnType<FaasStack['post']>
  filename?: string
  func?: IFunction
}

export interface SqsSpecFunction {
  (faas: FaasStack, funcProps?: NodejsFunctionProps, eventProps?: Partial<SqsEventSourceProps>): ReturnType<FaasStack['subscribeSqs']>
  filename?: string
  func?: IFunction
}

export interface ScheduleSpecFunction {
  (faas: FaasStack, funcProps?: NodejsFunctionProps): ReturnType<FaasStack['schedule']>
  filename?: string
  func?: IFunction
}

function checkConsistency(name: string, entryName: string, writtenLang: 'node' | 'go' = 'node') {
  if (writtenLang === 'node') {
    if (!existsSync(`./src/${entryName}`)) {
      throw new Error(`File "./src/${entryName}" not found by "${name}"`)
    }
  } else if (writtenLang === 'go') {
    if (!existsSync(`./go/${entryName}/main.go`)) {
      throw new Error(`File "./go/${entryName}/main.go" not found by "${name}"`)
    }
  }
}

function defineSpec(
  opName: string,
  fileName: string,
  method: 'get' | 'post' | 'postStream' | 'put' | 'del' | 'patch',
  path: string,
  writtenLang: 'node' | 'go' = 'node',
): SpecFunction {
  const fn: SpecFunction = function (faas: FaasStack, lambdaOptions?: FunctionProps, methodOptions?: MethodOptions) {
    checkConsistency(opName, fileName, writtenLang)
    const res = faas[method](
      path,
      fileName,
      (isUnifiedFunctionProps(lambdaOptions) && lambdaOptions) || {
        [writtenLang]: lambdaOptions,
      },
      methodOptions,
    )
    fn.func = res.func
    return res
  }
  fn.filename = fileName
  return fn
}

function defineSqsSpec(opName: string, fileName: string, queueName: string): SqsSpecFunction {
  const fn: SqsSpecFunction = function (faas: FaasStack, funcProps?: NodejsFunctionProps, eventProps?: Partial<SqsEventSourceProps>) {
    checkConsistency(opName, fileName)
    const res = faas.subscribeSqs(faas.importQueue(queueName), fileName, funcProps, eventProps)
    fn.func = res
    return res
  }
  fn.filename = fileName
  return fn
}

function defineScheduleSpec(opName: string, fileName: string, schedule: Schedule): SqsSpecFunction {
  const fn: SqsSpecFunction = function (faas: FaasStack, funcProps?: NodejsFunctionProps) {
    checkConsistency(opName, fileName)
    const res = faas.schedule(schedule, fileName, funcProps)
    fn.func = res
    return res
  }
  fn.filename = fileName
  return fn
}

function isUnifiedFunctionProps(props?: FunctionProps): props is UnifiedFunctionProps {
  return props?.hasOwnProperty('go') || props?.hasOwnProperty('node') || false
}
