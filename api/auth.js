import { createClerkClient } from '@clerk/backend'

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

export async function verifyClerkToken(req) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return null
    const payload = await clerk.verifyToken(token)
    return payload?.sub || null
  } catch {
    return null
  }
}
