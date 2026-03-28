import 'dotenv/config'
import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  migrate: {
    async adapter() {
      const { Pool } = pg
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
      })
      return new PrismaPg(pool)
    },
  },
})