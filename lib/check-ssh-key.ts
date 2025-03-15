import { existsSync } from 'fs'
import { resolve } from 'path'

export function checkSSHKey() {
  const keyPath = resolve(process.cwd(), process.env.VPS_PRIVATE_KEY || '')
  if (!existsSync(keyPath)) {
    throw new Error(`SSH key not found at ${keyPath}`)
  }
}