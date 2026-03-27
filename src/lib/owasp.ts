export function validatePassword(password: string) {
  const errors: string[] = []
  if (password.length < 8)          errors.push('ต้องมีอย่างน้อย 8 ตัวอักษร')
  if (!/[A-Z]/.test(password))      errors.push('ต้องมีตัวพิมพ์ใหญ่')
  if (!/[a-z]/.test(password))      errors.push('ต้องมีตัวพิมพ์เล็ก')
  if (!/[0-9]/.test(password))      errors.push('ต้องมีตัวเลข')
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('ต้องมีอักขระพิเศษ เช่น !@#$')
  return { valid: errors.length === 0, errors }
}