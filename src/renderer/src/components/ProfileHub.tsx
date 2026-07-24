import { useCallback, useEffect, useMemo, useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import type { UserProfile, VaultCredentialMeta } from '@shared/profile'
import { emptyUserProfile } from '@shared/profile'
import '../styles/chrome-pages.css'

const VAULT_PREVIEW = 50

export function ProfileHub(): React.JSX.Element {
  const [profile, setProfile] = useState<UserProfile>(emptyUserProfile())
  const [savedSnapshot, setSavedSnapshot] = useState<string>('')
  const [vault, setVault] = useState<VaultCredentialMeta[]>([])
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [customKey, setCustomKey] = useState('')
  const [customVal, setCustomVal] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [p, v] = await Promise.all([
        window.browgent.getUserProfile(),
        window.browgent.listVault()
      ])
      setProfile(p)
      setSavedSnapshot(JSON.stringify(p))
      setVault(v)
      setLoadError(null)
    } catch (e) {
      // Seed snapshot so local edits remain saveable after a load failure
      setSavedSnapshot((prev) => prev || JSON.stringify(emptyUserProfile()))
      setLoadError(e instanceof Error ? e.message : 'Could not load profile')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const dirty = useMemo(() => {
    // A typed-but-unadded custom pair is unsaved work too, so Save must enable.
    const hasStagedCustom = customKey.trim().length > 0
    return (
      hasStagedCustom ||
      JSON.stringify(profile) !== (savedSnapshot || JSON.stringify(emptyUserProfile()))
    )
  }, [profile, savedSnapshot, customKey])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      // Fold any typed-but-unadded custom pair in so it is never silently dropped.
      const stagedKey = customKey.trim()
      const toSave: UserProfile = stagedKey
        ? { ...profile, custom: { ...profile.custom, [stagedKey]: customVal } }
        : profile
      const next = await window.browgent.setUserProfile(toSave)
      setProfile(next)
      setSavedSnapshot(JSON.stringify(next))
      if (stagedKey) {
        setCustomKey('')
        setCustomVal('')
      }
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 1600)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const field = (
    label: string,
    key: keyof UserProfile,
    opts?: { type?: string; placeholder?: string; autoComplete?: string }
  ): React.JSX.Element => (
    <label className="settings-field">
      {label}
      <input
        type={opts?.type || 'text'}
        placeholder={opts?.placeholder}
        autoComplete={opts?.autoComplete}
        value={String(profile[key] ?? '')}
        onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
      />
    </label>
  )

  return (
    <section className="settings-section settings-section-stack">
      <div>
        <h2>User Hub</h2>
        <p className="settings-lead">
          Store contact and address details locally. When enabled, the agent can use{' '}
          <code className="settings-code">get_profile</code> and <code className="settings-code">fill_form</code>{' '}
          (try dryRun first) — it should never invent your email or phone. Passwords stay in the vault
          below and require confirm via <code className="settings-code">get_credentials</code>.
        </p>
      </div>

      {loadError && (
        <p className="settings-lead import-error" role="alert">
          {loadError}
        </p>
      )}

      <div className="settings-card settings-card-fields">
        <div className="profile-grid">
          {field('Full name', 'fullName', { autoComplete: 'name' })}
          {field('First name', 'firstName', { autoComplete: 'given-name' })}
          {field('Last name', 'lastName', { autoComplete: 'family-name' })}
          {field('Email', 'email', { type: 'email', autoComplete: 'email' })}
          {field('Alt email', 'emailAlt', { type: 'email' })}
          {field('Phone', 'phone', { type: 'tel', autoComplete: 'tel' })}
          {field('Alt phone', 'phoneAlt', { type: 'tel' })}
          {field('Company', 'company', { autoComplete: 'organization' })}
          {field('Job title', 'jobTitle', { autoComplete: 'organization-title' })}
          {field('Website', 'website', { autoComplete: 'url' })}
          {field('Birthday', 'birthday', { placeholder: 'YYYY-MM-DD', autoComplete: 'bday' })}
        </div>

        <h3 className="profile-subhead">Address</h3>
        <div className="profile-grid">
          <label className="settings-field">
            Line 1
            <input
              autoComplete="address-line1"
              value={profile.address.line1}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  address: { ...p.address, line1: e.target.value }
                }))
              }
            />
          </label>
          <label className="settings-field">
            Line 2
            <input
              autoComplete="address-line2"
              value={profile.address.line2}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  address: { ...p.address, line2: e.target.value }
                }))
              }
            />
          </label>
          <label className="settings-field">
            City
            <input
              autoComplete="address-level2"
              value={profile.address.city}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  address: { ...p.address, city: e.target.value }
                }))
              }
            />
          </label>
          <label className="settings-field">
            Region / state
            <input
              autoComplete="address-level1"
              value={profile.address.region}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  address: { ...p.address, region: e.target.value }
                }))
              }
            />
          </label>
          <label className="settings-field">
            Postal code
            <input
              autoComplete="postal-code"
              value={profile.address.postalCode}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  address: { ...p.address, postalCode: e.target.value }
                }))
              }
            />
          </label>
          <label className="settings-field">
            Country
            <input
              autoComplete="country-name"
              value={profile.address.country}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  address: { ...p.address, country: e.target.value }
                }))
              }
            />
          </label>
        </div>

        <h3 className="profile-subhead">Custom fields</h3>
        <div className="profile-custom-add">
          <input
            placeholder="Key"
            aria-label="Custom field key"
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const k = customKey.trim()
                if (!k) return
                setProfile((p) => ({
                  ...p,
                  custom: { ...p.custom, [k]: customVal }
                }))
                setCustomKey('')
                setCustomVal('')
              }
            }}
          />
          <input
            placeholder="Value"
            aria-label="Custom field value"
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const k = customKey.trim()
                if (!k) return
                setProfile((p) => ({
                  ...p,
                  custom: { ...p.custom, [k]: customVal }
                }))
                setCustomKey('')
                setCustomVal('')
              }
            }}
          />
          <button
            type="button"
            className="settings-btn"
            onClick={() => {
              const k = customKey.trim()
              if (!k) return
              setProfile((p) => ({
                ...p,
                custom: { ...p.custom, [k]: customVal }
              }))
              setCustomKey('')
              setCustomVal('')
            }}
          >
            Add
          </button>
        </div>
        {Object.keys(profile.custom).length > 0 && (
          <ul className="profile-custom-list">
            {Object.entries(profile.custom).map(([k, v]) => (
              <li key={k}>
                <code>{k}</code>
                <span className="profile-custom-val">{v}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${k}`}
                  onClick={() =>
                    setProfile((p) => {
                      const custom = { ...p.custom }
                      delete custom[k]
                      return { ...p, custom }
                    })
                  }
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="settings-check-row" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={profile.agentMayUse}
            onChange={(e) => setProfile((p) => ({ ...p, agentMayUse: e.target.checked }))}
          />
          <span>Allow the agent to read this profile for form fill</span>
        </label>

        <div className="settings-actions profile-save-row">
          <button
            type="button"
            className="settings-btn settings-btn-accent"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            <Save size={14} />{' '}
            {savedFlash ? 'Saved' : saving ? 'Saving…' : dirty ? 'Save profile' : 'Saved'}
          </button>
          {dirty && !saving && !savedFlash && (
            <span className="settings-muted profile-dirty-hint">Unsaved changes</span>
          )}
        </div>
      </div>

      <div className="settings-card settings-card-pad">
        <p className="settings-toggle-label">Password vault ({vault.length})</p>
        <p className="settings-toggle-sub">
          From browser import. Passwords never shown here — only origin + username. Used by the
          agent via <code className="settings-code">get_credentials</code> (with confirm).
        </p>
        {vault.length === 0 ? (
          <p className="settings-lead">Empty — import passwords from Settings → Import.</p>
        ) : (
          <ul className="vault-list">
            {vault.slice(0, VAULT_PREVIEW).map((c) => (
              <li key={c.id}>
                <span className="vault-origin" title={c.origin}>
                  {c.origin}
                </span>
                <span className="vault-user" title={c.username || undefined}>
                  {c.username || '—'}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove credential for ${c.origin}`}
                  onClick={() =>
                    void window.browgent.removeVaultItem(c.id).then(() => refresh())
                  }
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {vault.length > VAULT_PREVIEW && (
          <p className="settings-toggle-sub" style={{ marginTop: 8 }}>
            Showing {VAULT_PREVIEW} of {vault.length}. Remove unused entries or clear the vault.
          </p>
        )}
        {vault.length > 0 && (
          <button
            type="button"
            className="settings-btn"
            style={{ marginTop: 10 }}
            onClick={() => {
              if (window.confirm('Clear all saved passwords from the vault?')) {
                void window.browgent.clearVault().then(() => refresh())
              }
            }}
          >
            Clear vault
          </button>
        )}
      </div>
    </section>
  )
}
