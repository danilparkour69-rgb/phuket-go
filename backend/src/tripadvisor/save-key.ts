import { createBackendRuntime } from '../runtime'
import { isTripadvisorKeyConfigured, saveTripadvisorApiKey } from './credential'

const runtime = createBackendRuntime()

try {
  if (!isTripadvisorKeyConfigured(runtime.env)) {
    throw new Error('TRIPADVISOR_API_KEY is not set in environment')
  }

  await saveTripadvisorApiKey(runtime.prisma, runtime.env.TRIPADVISOR_API_KEY!)
  console.log('Tripadvisor API key is saved in integration_credentials table.')
} finally {
  await runtime.close()
}
