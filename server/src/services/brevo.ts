import axios from 'axios'
import { resolveMx } from 'dns/promises'
import { config } from '../config.js'
import { withRetry, isRetryableError } from '../lib/retry.js'
import { createLogger } from '../lib/logger.js'

// Common disposable email domains
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwam.com',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'guerrillamail.info',
  'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
  'spam4.me', 'trashmail.com', 'trashmail.me', 'trashmail.net', 'trashmail.org',
  'dispostable.com', 'yopmail.com', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf',
  'maildrop.cc', 'fakeinbox.com', 'mailnull.com', 'spamgourmet.com',
  'spamgourmet.net', 'spamgourmet.org', 'spamex.com', 'spamfree24.org',
  'throwam.com', 'discard.email', 'mailnesia.com', 'spamthisplease.com',
])

const log = createLogger('brevo')

const client = axios.create({
  baseURL: 'https://api.brevo.com/v3',
  timeout: 15000,
  maxContentLength: 1 * 1024 * 1024,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((cfg) => {
  cfg.headers['api-key'] = config.brevo.apiKey
  return cfg
})

// --- Campaign types ---

export interface CreateCampaignOpts {
  name: string
  subject: string
  body: string
  from?: string
  fromName?: string
  audienceType: 'ALL' | 'SEGMENT' | 'FILTERED'
  segmentId?: string
}

export interface Campaign {
  id: string
  name: string
  subject: string
  type: string
  status: string
  scheduledAt: string | null
}

export interface CampaignStats {
  delivered: number
  opened: number
  clicked: number
  bounced: number
  complained: number
}

// --- Contact types ---

export interface CreateContactOpts {
  email: string
  subscribed: boolean
  data?: Record<string, string | number | boolean>
}

export interface Contact {
  id: string
  email: string
  subscribed: boolean
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// --- Campaign methods ---

export async function createCampaign(opts: CreateCampaignOpts): Promise<Campaign> {
  return withRetry(
    async () => {
      log.info({ name: opts.name, audienceType: opts.audienceType }, 'creating campaign')

      const payload: Record<string, unknown> = {
        name: opts.name,
        subject: opts.subject,
        htmlContent: opts.body,
        sender: {
          email: opts.from || config.brevo.fromEmail,
          name: opts.fromName || config.brevo.fromName,
        },
        recipients: opts.audienceType === 'SEGMENT' && opts.segmentId
          ? { listIds: [parseInt(opts.segmentId)] }
          : { listIds: [2] },
      }

      const { data } = await client.post('/emailCampaigns', payload)
      log.info({ campaignId: data.id }, 'campaign created')

      return {
        id: String(data.id),
        name: opts.name,
        subject: opts.subject,
        type: 'classic',
        status: 'draft',
        scheduledAt: null,
      }
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

export async function updateCampaign(id: string, opts: Partial<CreateCampaignOpts>): Promise<Campaign> {
  return withRetry(
    async () => {
      const payload: Record<string, unknown> = {}
      if (opts.name) payload.name = opts.name
      if (opts.subject) payload.subject = opts.subject
      if (opts.body) payload.htmlContent = opts.body
      if (opts.from || opts.fromName) {
        payload.sender = {
          email: opts.from || config.brevo.fromEmail,
          name: opts.fromName || config.brevo.fromName,
        }
      }
      await client.put(`/emailCampaigns/${id}`, payload)
      return { id, name: opts.name || '', subject: opts.subject || '', type: 'classic', status: 'draft', scheduledAt: null }
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

export async function sendCampaign(id: string, scheduledFor?: string): Promise<void> {
  return withRetry(
    async () => {
      log.info({ campaignId: id, scheduledFor }, 'sending campaign')
      if (scheduledFor) {
        // Schedule for future — Brevo uses scheduledAt in ISO format
        await client.put(`/emailCampaigns/${id}`, { scheduledAt: scheduledFor })
      }
      await client.post(`/emailCampaigns/${id}/sendNow`)
      log.info({ campaignId: id }, 'campaign send triggered')
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

export async function getCampaignStats(id: string): Promise<CampaignStats> {
  return withRetry(
    async () => {
      const { data } = await client.get(`/emailCampaigns/${id}`)
      const stats = data.statistics?.campaignStats || {}
      return {
        delivered: stats.delivered || 0,
        opened: stats.uniqueViews || 0,
        clicked: stats.uniqueClicks || 0,
        bounced: stats.hardBounces + stats.softBounces || 0,
        complained: stats.unsubscriptions || 0,
      }
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

export async function listCampaigns(): Promise<Campaign[]> {
  return withRetry(
    async () => {
      const { data } = await client.get('/emailCampaigns')
      return (data.campaigns || []).map((c: Record<string, unknown>) => ({
        id: String(c.id),
        name: c.name,
        subject: c.subject,
        type: c.type || 'classic',
        status: c.status,
        scheduledAt: c.scheduledAt || null,
      }))
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

// --- Contact methods ---

export async function createContact(opts: CreateContactOpts): Promise<Contact> {
  return withRetry(
    async () => {
      log.info({ email: opts.email, subscribed: opts.subscribed }, 'creating contact')
      const payload: Record<string, unknown> = {
        email: opts.email,
        attributes: opts.data || {},
      }
      // If subscribed, add to list 2 (default list); if not, just create
      if (opts.subscribed) {
        payload.listIds = [2]
      }
      const { data } = await client.post('/contacts', payload)
      log.info({ contactId: data.id }, 'contact created')
      return {
        id: String(data.id),
        email: opts.email,
        subscribed: opts.subscribed,
        data: opts.data || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

export async function updateContact(id: string, updates: Partial<CreateContactOpts>): Promise<Contact> {
  return withRetry(
    async () => {
      // Brevo: update by email or id
      const payload: Record<string, unknown> = {}
      if (updates.data) payload.attributes = updates.data
      if (updates.subscribed !== undefined) {
        payload.listIds = updates.subscribed ? [2] : []
        payload.unlinkListIds = updates.subscribed ? [] : [2]
      }
      await client.put(`/contacts/${id}`, payload)
      return {
        id,
        email: '',
        subscribed: updates.subscribed ?? true,
        data: updates.data || {},
        createdAt: '',
        updatedAt: new Date().toISOString(),
      }
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

export async function getContact(id: string): Promise<Contact> {
  return withRetry(
    async () => {
      const { data } = await client.get(`/contacts/${id}`)
      return {
        id: String(data.id),
        email: data.email,
        subscribed: !data.emailBlacklisted,
        data: data.attributes || {},
        createdAt: data.createdAt || '',
        updatedAt: data.modifiedAt || '',
      }
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

export interface ContactEngagement {
  messagesSent: number
  hardBounces: number
  softBounces: number
  opened: number
  clicked: number
  unsubscriptions: number
  complaints: number
}

/**
 * Fetch a contact by email address and return their full engagement statistics.
 * Returns null if the contact doesn't exist in Brevo or on any error.
 *
 * No retries — this is called in bulk for many subscribers and must be fast.
 * Individual failures are silently swallowed (returns null).
 */
export async function getContactEngagement(email: string): Promise<ContactEngagement | null> {
  try {
    const { data } = await client.get(`/contacts/${encodeURIComponent(email)}`, {
      // Short timeout — called in bulk; a slow contact shouldn't block the batch
      timeout: 6000,
    })
    const stats = data.statistics || {}
    return {
      messagesSent: Array.isArray(stats.messagesSent) ? stats.messagesSent.length : 0,
      hardBounces: Array.isArray(stats.hardBounces) ? stats.hardBounces.length : 0,
      softBounces: Array.isArray(stats.softBounces) ? stats.softBounces.length : 0,
      opened: Array.isArray(stats.opened) ? stats.opened.length : 0,
      clicked: Array.isArray(stats.clicked) ? stats.clicked.length : 0,
      unsubscriptions: stats.unsubscriptions?.unsubscribeFromAllEmails?.eventData?.length ?? 0,
      complaints: Array.isArray(stats.complaints) ? stats.complaints.length : 0,
    }
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status !== 404) {
      log.warn({ email, status }, 'brevo engagement fetch failed')
    }
    return null
  }
}

export async function deleteContact(id: string): Promise<void> {
  return withRetry(
    async () => {
      await client.delete(`/contacts/${id}`)
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

export async function listContacts(cursor?: string, limit = 50): Promise<{ items: Contact[]; nextCursor: string | null; hasMore: boolean; total: number }> {
  return withRetry(
    async () => {
      const params: Record<string, string | number> = { limit }
      if (cursor) params.offset = cursor
      const { data } = await client.get('/contacts', { params })
      const items = (data.contacts || []).map((c: Record<string, unknown>) => ({
        id: String(c.id),
        email: c.email,
        subscribed: !c.emailBlacklisted,
        data: (c as Record<string, unknown>).attributes || {},
        createdAt: c.createdAt || '',
        updatedAt: c.modifiedAt || '',
      }))
      const total = data.count || 0
      const offset = parseInt(String(cursor || '0'))
      const hasMore = offset + limit < total
      return {
        items,
        nextCursor: hasMore ? String(offset + limit) : null,
        hasMore,
        total,
      }
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

// --- Transactional ---

export interface SendTransactionalOpts {
  to: string
  subject: string
  body: string
  from?: string
  name?: string
}

export async function sendTransactional(opts: SendTransactionalOpts): Promise<void> {
  return withRetry(
    async () => {
      log.info({ to: opts.to, subject: opts.subject }, 'sending transactional email')
      await client.post('/smtp/email', {
        to: [{ email: opts.to }],
        subject: opts.subject,
        htmlContent: opts.body,
        sender: {
          email: opts.from || config.brevo.fromEmail,
          name: opts.name || config.brevo.fromName,
        },
      })
      log.info({ to: opts.to }, 'transactional email sent')
    },
    { retries: 3, retryOn: isRetryableError },
  )
}

// --- Email verification ---

export interface EmailVerifyResult {
  valid: boolean
  domainExists: boolean
  isDisposable: boolean
}

export async function verifyEmail(email: string): Promise<EmailVerifyResult> {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return { valid: false, domainExists: false, isDisposable: false }

  const isDisposable = DISPOSABLE_DOMAINS.has(domain)

  try {
    const records = await resolveMx(domain)
    const domainExists = records.length > 0
    log.info({ email, domain, domainExists, isDisposable }, 'email verified via MX lookup')
    return { valid: domainExists && !isDisposable, domainExists, isDisposable }
  } catch {
    // DNS lookup failed — domain likely doesn't exist
    log.info({ email, domain }, 'email MX lookup failed — domain not found')
    return { valid: false, domainExists: false, isDisposable }
  }
}

// --- Event tracking ---

export async function trackEvent(email: string, event: string, data?: Record<string, unknown>): Promise<void> {
  return withRetry(
    async () => {
      log.debug({ email, event }, 'tracking event')
      await client.post('/events', {
        email,
        event,
        properties: data || {},
      })
    },
    { retries: 3, retryOn: isRetryableError },
  )
}
