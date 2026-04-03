// test/mocks/prisma.ts
import { PrismaClient } from '../../src/generated/prisma/client.js'
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended'
import { prisma } from '../../src/lib/prisma.js'
import { beforeEach, vi } from 'vitest'

vi.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}))

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>

beforeEach(() => {
  mockReset(prismaMock)
})