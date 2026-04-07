import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildGoogleAuthUrl, exchangeCodeForTokens, getGoogleUserInfo } from '../../src/services/google_auth.service.js'

describe('GoogleAuthService', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv, CLIENT_ID: 'test-client', GOOGLE_REDIRECT_URI: 'http://test/cb' }
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('buildGoogleAuthUrl', () => {
    it('should build a valid Google Auth URL with correct parameters', () => {
      const url = buildGoogleAuthUrl('random-state-123')
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth')
      expect(url).toContain('client_id=test-client')
      expect(url).toContain('state=random-state-123')
      expect(url).toContain('prompt=select_account')
    })
  })

  describe('exchangeCodeForTokens', () => {
    it('should throw GOOGLE_TOKEN_EXCHANGE_FAILED when response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, text: vi.fn().mockResolvedValue('Bad Request') } as any)
      await expect(exchangeCodeForTokens('invalid-code')).rejects.toThrow('GOOGLE_TOKEN_EXCHANGE_FAILED')
    })

    it('should return tokens when fetch is successful', async () => {
      const mockResponse = { access_token: 'abc', token_type: 'Bearer', id_token: 'def' }
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockResponse) } as any)
      
      const result = await exchangeCodeForTokens('valid-code')
      expect(result.access_token).toBe('abc')
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getGoogleUserInfo', () => {
    it('should throw GOOGLE_USERINFO_FAILED when response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false } as any)
      await expect(getGoogleUserInfo('bad-token')).rejects.toThrow('GOOGLE_USERINFO_FAILED')
    })

    it('should return user info when fetch is successful', async () => {
      const mockUserInfo = { id: '123', email: 'user@gmail.com', verified_email: true, name: 'User' }
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(mockUserInfo) } as any)
      
      const result = await getGoogleUserInfo('good-token')
      expect(result.email).toBe('user@gmail.com')
      expect(fetch).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: 'Bearer good-token' }
      })
    })
  })
})