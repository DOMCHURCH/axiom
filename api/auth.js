import { verifyToken } from '@clerk/backend'

export async function verifyClerkToken(req) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return null
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY })
    return payload?.sub || null
  } catch {
    return null
  }
}
