import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createClient() {
  const dbUrl = process.env['DATABASE_URL'] ?? 'file:./dev.db'
  const dbPath = dbUrl.replace(/^file:/, '')
  const absolutePath = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(__dirname, '../../', dbPath)
  const adapter = new PrismaBetterSqlite3({ url: absolutePath })
  return new PrismaClient({ adapter })
}

export const db = createClient()
