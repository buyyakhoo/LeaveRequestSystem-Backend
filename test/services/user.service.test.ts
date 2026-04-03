import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validatePassword, loginWithEmailPassword, loginWithGoogle, hashPassword, PASSWORD_MAX_LENGTH } from '../../src/services/user.service.js'
import { prisma } from '../../src/lib/prisma.js'
import argon2 from 'argon2'

// Mock Prisma
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    employees: { findUnique: vi.fn() },
    employee_identities: { create: vi.fn() },
  },
}))

// Mock argon2
vi.mock('argon2', () => ({
  default: { verify: vi.fn(), hash: vi.fn(), argon2id: 2 },
}))

describe('UserService - validatePassword', () => {
  it('should return empty array when password meets all policies', () => {
    const validPassword = 'StrongPassword123!'
    const errors = validatePassword(validPassword)
    expect(errors).toHaveLength(0)
  })

  it('should return errors when password is too short', () => {
    const shortPassword = 'Short1!'
    const errors = validatePassword(shortPassword)
    expect(errors).toContain('Password must be at least 8 characters long')
  })

  it('should return error when password exceeds max length', () => {
    const longPassword = 'A' + 'a'.repeat(PASSWORD_MAX_LENGTH) + '1!'
    const errors = validatePassword(longPassword)
    expect(errors).toContain(`Password must not exceed ${PASSWORD_MAX_LENGTH} characters`)
  })

  it('should return multiple errors if password lacks uppercase, number, and special char', () => {
    const weakPassword = 'weakpassword'
    const errors = validatePassword(weakPassword)
    expect(errors).toContain('Password must contain at least one uppercase letter')
    expect(errors).toContain('Password must contain at least one digit')
    expect(errors).toContain('Password must contain at least one special character')
  })

  it('should return error when password lacks a lowercase letter', () => {
    const noLower = 'NOLOWERCASE123!'
    const errors = validatePassword(noLower)
    expect(errors).toContain('Password must contain at least one lowercase letter')
  })
})

describe('UserService - loginWithEmailPassword', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should throw INVALID_CREDENTIALS if password exceeds max length', async () => {
    const longPassword = 'a'.repeat(PASSWORD_MAX_LENGTH + 1)
    await expect(loginWithEmailPassword('test@mail.com', longPassword)).rejects.toThrow('INVALID_CREDENTIALS')
  })

  it('should throw INVALID_CREDENTIALS if employee not found', async () => {
    vi.mocked(prisma.employees.findUnique).mockResolvedValue(null)
    await expect(loginWithEmailPassword('notfound@mail.com', 'Pass123!')).rejects.toThrow('INVALID_CREDENTIALS')
  })

  it('should throw ACCOUNT_DISABLED if employee status is not active', async () => {
    vi.mocked(prisma.employees.findUnique).mockResolvedValue({ status: 'disabled' } as any)
    await expect(loginWithEmailPassword('disabled@mail.com', 'Pass123!')).rejects.toThrow('ACCOUNT_DISABLED')
  })

  it('should throw INVALID_CREDENTIALS if local identity or password hash is missing', async () => {
    vi.mocked(prisma.employees.findUnique).mockResolvedValue({
      status: 'active', employee_identities: [],
    } as any)
    await expect(loginWithEmailPassword('noidentity@mail.com', 'Pass123!')).rejects.toThrow('INVALID_CREDENTIALS')
  })

  it('should throw INVALID_CREDENTIALS if password does not match', async () => {
    vi.mocked(prisma.employees.findUnique).mockResolvedValue({
      status: 'active', employee_identities: [{ provider: 'local', password_hash: 'hashed_pass' }],
    } as any)
    vi.mocked(argon2.verify).mockResolvedValue(false)
    await expect(loginWithEmailPassword('wrongpass@mail.com', 'WrongPass123!')).rejects.toThrow('INVALID_CREDENTIALS')
  })

  it('should return employee data successfully when credentials are correct', async () => {
    const mockEmployee = {
      id: 'emp-uuid', employee_code: 'EMP001', email: 'test@mail.com',
      first_name: 'John', last_name: 'Doe', department_id: 1,
      role: 'user', status: 'active', departments: { name: 'IT' },
      employee_identities: [{ provider: 'local', password_hash: 'hashed_pass' }],
    }
    vi.mocked(prisma.employees.findUnique).mockResolvedValue(mockEmployee as any)
    vi.mocked(argon2.verify).mockResolvedValue(true)

    const result = await loginWithEmailPassword('test@mail.com', 'CorrectPass123!')
    expect(result).toEqual({
      id: 'emp-uuid', employee_code: 'EMP001', email: 'test@mail.com',
      first_name: 'John', last_name: 'Doe', department_id: 1, department_name: 'IT', role: 'user',
    })
  })
})

describe('UserService - loginWithGoogle', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('should throw NOT_AN_EMPLOYEE if email not found in DB', async () => {
    vi.mocked(prisma.employees.findUnique).mockResolvedValue(null)
    await expect(loginWithGoogle('google-123', 'unknown@mail.com')).rejects.toThrow('NOT_AN_EMPLOYEE')
  })

  it('should throw ACCOUNT_DISABLED if employee is disabled', async () => {
    vi.mocked(prisma.employees.findUnique).mockResolvedValue({ status: 'disabled' } as any)
    await expect(loginWithGoogle('google-123', 'disabled@mail.com')).rejects.toThrow('ACCOUNT_DISABLED')
  })

  it('should throw GOOGLE_ACCOUNT_MISMATCH if google id does not match existing identity', async () => {
    vi.mocked(prisma.employees.findUnique).mockResolvedValue({
      status: 'active', employee_identities: [{ provider: 'google', provider_id: 'old-google-id' }],
    } as any)
    await expect(loginWithGoogle('new-google-id', 'test@mail.com')).rejects.toThrow('GOOGLE_ACCOUNT_MISMATCH')
  })

  it('should create new google identity and return employee if no google identity exists', async () => {
    const mockEmployee = {
      id: 'emp-uuid', email: 'test@mail.com', status: 'active',
      departments: { name: 'HR' }, employee_identities: [{ provider: 'local' }],
    }
    vi.mocked(prisma.employees.findUnique).mockResolvedValue(mockEmployee as any)

    const result = await loginWithGoogle('google-123', 'test@mail.com')
    expect(prisma.employee_identities.create).toHaveBeenCalledWith({
      data: { employee_id: 'emp-uuid', provider: 'google', provider_id: 'google-123' },
    })
    expect(result.email).toBe('test@mail.com')
  })

  it('should return employee if google id matches existing identity', async () => {
    const mockEmployee = {
      id: 'emp-uuid', email: 'test@mail.com', status: 'active',
      departments: { name: 'HR' }, employee_identities: [{ provider: 'google', provider_id: 'google-123' }],
    }
    vi.mocked(prisma.employees.findUnique).mockResolvedValue(mockEmployee as any)

    const result = await loginWithGoogle('google-123', 'test@mail.com')
    expect(prisma.employee_identities.create).not.toHaveBeenCalled()
    expect(result.email).toBe('test@mail.com')
  })
})

describe('UserService - hashPassword', () => {
  it('should call argon2.hash with password and options', async () => {
    vi.mocked(argon2.hash).mockResolvedValue('hashed_result')
    const result = await hashPassword('MyPass123!')
    expect(argon2.hash).toHaveBeenCalledTimes(1)
    expect(result).toBe('hashed_result')
  })
})