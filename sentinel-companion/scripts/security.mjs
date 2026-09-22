import { randomBytes, createHash, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
export const random = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function equal(a, b) { return typeof a === 'string' && typeof b === 'string' && timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b))); }
export function passwordHash(password, salt = random()) { return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`; }
export function passwordValid(password, stored) { const [salt] = stored.split(':'); return equal(passwordHash(password, salt), stored); }
export function seal(value, key) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv); const out = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), out]).toString('base64'); }
export function unseal(value, key) { const b = Buffer.from(value, 'base64'); const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), b.subarray(0,12)); cipher.setAuthTag(b.subarray(12,28)); return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString()); }
export function mask(value) { if (Array.isArray(value)) return value.map(mask); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, /account_number$/.test(k) && typeof v === 'string' ? `••••${v.slice(-4)}` : mask(v)])); return value; }
