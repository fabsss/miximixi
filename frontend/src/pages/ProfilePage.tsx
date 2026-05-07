import { useEffect, useState, useCallback, useRef } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '../context/AuthContext'
import {
  createTelegramLinkCode,
  getTelegramLinks,
  unlinkTelegramDevice,
  type TelegramLink,
  type TelegramLinkResponse,
} from '../lib/api'

export function ProfilePage() {
  const { user, logout } = useAuth()
  const [links, setLinks] = useState<TelegramLink[]>([])
  const [linkCode, setLinkCode] = useState<TelegramLinkResponse | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [codeExpiry, setCodeExpiry] = useState<number>(0)
  const [generating, setGenerating] = useState(false)
  const [, setTick] = useState(0)
  const unmountedRef = useRef(false)

  useEffect(() => {
    return () => { unmountedRef.current = true }
  }, [])

  const loadLinks = useCallback(async () => {
    try {
      setLinks(await getTelegramLinks())
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void loadLinks()
  }, [loadLinks])

  // Poll for new links while code is active
  useEffect(() => {
    if (!linkCode) return
    const interval = setInterval(loadLinks, 3000)
    return () => clearInterval(interval)
  }, [linkCode, loadLinks])

  // Countdown timer — keyed on linkCode so it restarts when a new code is generated
  useEffect(() => {
    if (!linkCode) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, codeExpiry - Date.now())
      if (remaining === 0) {
        setLinkCode(null)
        setQrDataUrl(null)
        setCodeExpiry(0)
      } else {
        setTick(t => t + 1)
      }
    }, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkCode])

  async function generateCode() {
    setGenerating(true)
    try {
      const response = await createTelegramLinkCode()
      if (unmountedRef.current) return
      setLinkCode(response)
      setCodeExpiry(Date.now() + response.expires_in * 1000)
      const dataUrl = await QRCode.toDataURL(response.deep_link, { width: 240, margin: 2 })
      if (unmountedRef.current) return
      setQrDataUrl(dataUrl)
    } catch (err) {
      console.error(err)
    } finally {
      if (!unmountedRef.current) setGenerating(false)
    }
  }

  async function handleUnlink(telegramUserId: number) {
    await unlinkTelegramDevice(telegramUserId)
    await loadLinks()
  }

  const secondsLeft = linkCode ? Math.max(0, Math.ceil((codeExpiry - Date.now()) / 1000)) : 0

  return (
    <div style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Profil</h1>
      <p><strong>{user?.display_name}</strong> ({user?.email})</p>
      <button onClick={logout} style={{ marginBottom: '2rem' }}>Abmelden</button>

      <h2>Telegram-Geräte</h2>
      {links.length === 0 && <p>Noch kein Telegram-Gerät verknüpft.</p>}
      {links.map(link => (
        <div key={link.telegram_user_id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <span>@{link.telegram_username ?? link.telegram_user_id}</span>
          <span style={{ fontSize: '0.85rem', color: '#888' }}>
            seit {new Date(link.linked_at).toLocaleDateString('de-DE')}
          </span>
          <button onClick={() => handleUnlink(link.telegram_user_id)}>Entfernen</button>
        </div>
      ))}

      <h3 style={{ marginTop: '2rem' }}>Neues Gerät verknüpfen</h3>
      {!linkCode && (
        <button onClick={generateCode} disabled={generating}>
          {generating ? 'Generiere...' : 'QR-Code generieren'}
        </button>
      )}
      {linkCode && qrDataUrl && (
        <div>
          <p>Scanne diesen QR-Code mit deiner Handy-Kamera. Der Code ist noch {secondsLeft}s gültig.</p>
          <img src={qrDataUrl} alt="Telegram Link QR Code" style={{ display: 'block', margin: '1rem 0' }} />
          <p style={{ fontSize: '0.85rem', color: '#888' }}>
            Oder öffne manuell: <a href={linkCode.deep_link}>{linkCode.deep_link}</a>
          </p>
          {secondsLeft === 0 && (
            <button onClick={generateCode}>Neuen Code generieren</button>
          )}
        </div>
      )}
    </div>
  )
}
