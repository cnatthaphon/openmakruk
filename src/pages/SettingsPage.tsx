// ⚙️ Settings tab — user-facing controls for every preference
// declared in lib/settings.ts. Each control updates localStorage
// immediately and the rest of the app re-reads on next render.
//
// Some settings (piece set, board theme, language) require a deeper
// wiring into Board.tsx and the rest of the chrome — those are
// marked "🚧 ต่อจริงใน Phase ถัดไป" in their captions so users know
// the value is being saved but not yet visible.

import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from '../lib/settings';
import { playMove } from '../lib/audio';
import { toast } from '../components/Toast';
import { listEngines } from '../lib/engine';
import {
  disableCloud,
  enableCloud,
  hasStoredSession,
  loadSession,
  saveSession,
} from '../lib/backend/cloudSession';
import { getBackend } from '../lib/backend';
import {
  PROVINCES_BY_REGION,
  REGION_LABELS_TH,
  findProvince,
  type Region,
} from '../lib/provinces';
import {
  evaluateCosmetics,
  loadCosmeticSelection,
  saveCosmeticSelection,
} from '../lib/cosmetics';

type Props = {
  onSettingsChange?: (s: Settings) => void;
};

export function SettingsPage({ onSettingsChange }: Props) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    saveSettings(settings);
    onSettingsChange?.(settings);
  }, [settings, onSettingsChange]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <h2>⚙️ ตั้งค่า</h2>
        <p>การเปลี่ยนแปลงเก็บใน browser ของคุณ · ไม่ส่งไป server</p>
      </header>

      <section className="settings-section">
        <h3>🎨 หน้าตา (Visuals)</h3>

        <SettingRow label="ชุดตัวหมาก" hint="เปลี่ยนแล้วผลกระทบทันทีบน ♔ เล่น">
          <select
            value={settings.pieceSet}
            onChange={(e) => set('pieceSet', e.target.value as Settings['pieceSet'])}
          >
            <option value="fulmene">Fulmene (gradient 3D)</option>
            <option value="yevrowl">Yevrowl (flat silhouette)</option>
          </select>
        </SettingRow>

        <SettingRow label="สีกระดาน">
          <select
            value={settings.boardTheme}
            onChange={(e) => set('boardTheme', e.target.value as Settings['boardTheme'])}
          >
            <option value="wood">ไม้เข้ม (default)</option>
            <option value="green">เขียว (lichess-style)</option>
            <option value="blue">น้ำเงิน</option>
          </select>
        </SettingRow>

        <SettingRow label="แสดงพิกัด a-h, 1-8">
          <Toggle
            checked={settings.showCoordinates}
            onChange={(v) => set('showCoordinates', v)}
          />
        </SettingRow>

        <SettingRow label="ไฮไลต์ตาเดินล่าสุด">
          <Toggle
            checked={settings.highlightLastMove}
            onChange={(v) => set('highlightLastMove', v)}
          />
        </SettingRow>

        <SettingRow label="แสดงจุดช่องเดินที่ถูกกฎ">
          <Toggle
            checked={settings.showLegalDots}
            onChange={(v) => set('showLegalDots', v)}
          />
        </SettingRow>

        <SettingRow
          label={`ความเร็ว animation: ${settings.animationMs} ms`}
          hint="0 = ปิด animation"
        >
          <input
            type="range"
            min={0}
            max={500}
            step={20}
            value={settings.animationMs}
            onChange={(e) => set('animationMs', parseInt(e.target.value, 10))}
          />
        </SettingRow>
      </section>

      <section className="settings-section">
        <h3>🔊 เสียง (Audio)</h3>

        <SettingRow label="เปิดเสียงเอฟเฟกต์">
          <Toggle
            checked={settings.soundsEnabled}
            onChange={(v) => set('soundsEnabled', v)}
          />
        </SettingRow>

        <SettingRow label={`ระดับเสียง: ${Math.round(settings.soundsVolume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.soundsVolume * 100)}
            onChange={(e) =>
              set('soundsVolume', parseInt(e.target.value, 10) / 100)
            }
            disabled={!settings.soundsEnabled}
          />
        </SettingRow>

        <SettingRow label="ทดลองฟังเสียง">
          <button
            className="settings-test-button"
            onClick={() => {
              if (settings.soundsEnabled) playMove(settings.soundsVolume);
            }}
            disabled={!settings.soundsEnabled}
          >
            🎵 เล่นเสียง "เดินหมาก"
          </button>
        </SettingRow>
      </section>

      <section className="settings-section">
        <h3>📊 การวิเคราะห์ (Analysis)</h3>

        <SettingRow
          label="แสดง eval bar ระหว่างเล่น"
          hint="เฉพาะโหมด Casual · ปิดอัตโนมัติใน Rated"
        >
          <Toggle
            checked={settings.showEvalBar}
            onChange={(v) => set('showEvalBar', v)}
          />
        </SettingRow>

        <SettingRow
          label="Engine"
          hint="เลือก engine ที่ใช้คิด · Fairy-Stockfish (แข็งสุด) · personality bots (สไตล์ต่างๆ ระดับ 700–1100) · Random/Greedy (baseline)"
        >
          <select
            value={settings.engineId}
            onChange={(e) => set('engineId', e.target.value)}
          >
            {listEngines().map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </SettingRow>
      </section>

      <section className="settings-section">
        <h3>🎨 Cosmetics · เลือกตราประจำตัว</h3>
        <p className="label-aside">
          ตราที่ปลดล็อกแล้วจะแสดงข้างชื่อในเมนูบนสุด · ปลดล็อกได้จาก rating + Puzzles + Counting + Move Trainer + Boss Rush + streak
        </p>
        <CosmeticPicker />
      </section>

      <section className="settings-section">
        <h3>🌐 ภาษาและความปลอดภัย</h3>

        <SettingRow label="ภาษา" hint="🚧 English UI ใน Phase ถัดไป">
          <select
            value={settings.language}
            onChange={(e) => set('language', e.target.value as Settings['language'])}
          >
            <option value="th">ไทย</option>
            <option value="en">English (coming soon)</option>
          </select>
        </SettingRow>

        <SettingRow label="ยืนยันก่อนยอมแพ้ / เสมอ">
          <Toggle
            checked={settings.confirmActions}
            onChange={(v) => set('confirmActions', v)}
          />
        </SettingRow>
      </section>

      <CloudSyncSection />

      <section className="settings-section">
        <h3>🔄 รีเซ็ต</h3>
        <button
          className="settings-reset-button"
          onClick={() => {
            toast.confirm(
              'รีเซ็ตการตั้งค่าทั้งหมดเป็นค่าเริ่มต้น? (ไม่กระทบ rating / ประวัติเกม)',
              {
                confirmLabel: 'รีเซ็ต',
                destructive: true,
                onConfirm: () => {
                  setSettings({ ...DEFAULT_SETTINGS });
                  toast.success('รีเซ็ตการตั้งค่าแล้ว');
                },
              },
            );
          }}
        >
          🔄 รีเซ็ตการตั้งค่าทั้งหมด
        </button>
      </section>
    </div>
  );
}

// ---- Internal pieces ---------------------------------------------------

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-label">
        <div>{label}</div>
        {hint && <div className="setting-row-hint">{hint}</div>}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`settings-toggle ${checked ? 'on' : 'off'}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-thumb" />
    </button>
  );
}

function CloudSyncSection() {
  // Local mirror — refresh on action so the UI updates without
  // needing a full page reload.
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  // Re-read every render is cheap (localStorage). The `tick` dep is
  // what forces re-render after enable/disable.
  void tick;
  const session = loadSession();
  const isOn = hasStoredSession() && getBackend().isOnline();
  const [busy, setBusy] = useState(false);

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Use the session's stored province (set during onboarding) so
      // the user doesn't have to re-pick it when enabling cloud sync.
      await enableCloud({ province: loadSession().province });
      toast.success('เปิด cloud sync แล้ว · เกมจะ sync ไป server โดยอัตโนมัติ');
    } catch (err) {
      toast.error(`เปิด cloud sync ไม่สำเร็จ: ${String(err)}`);
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const handleDisable = () => {
    toast.confirm(
      'ปิด cloud sync? · session ปัจจุบันจะถูกลบ · เกมหลังจากนี้จะไม่ sync',
      {
        confirmLabel: 'ปิด',
        destructive: true,
        onConfirm: () => {
          disableCloud();
          toast.success('ปิด cloud sync แล้ว · กลับเป็น offline mode');
          refresh();
        },
      },
    );
  };

  return (
    <section className="settings-section">
      <h3>☁️ Cloud Sync</h3>
      <p className="settings-hint">
        เปิดเพื่อ sync เกม · rating · leaderboard ระหว่างเครื่อง · ใช้ anonymous account · ไม่ต้องสมัคร · ปิดได้ทุกเมื่อ
      </p>

      {isOn ? (
        <>
          <div className="settings-cloud-status">
            <div>
              <strong>เชื่อมต่อแล้ว</strong>{' '}
              · {session.displayName || 'ผู้เล่น'}
              {session.province && (() => {
                const p = findProvince(session.province);
                return p ? <> · <span className="label-aside">📍 {p.nameTh}</span></> : null;
              })()}
            </div>
            <div className="label-aside">
              user id: <code>{session.userId.slice(0, 8)}…</code>{' '}
              · sync ล่าสุด:{' '}
              {session.lastSyncAt
                ? new Date(session.lastSyncAt).toLocaleString('th-TH')
                : '—'}
            </div>
          </div>
          <ProvincePicker token={session.token} currentProvince={session.province} onChange={refresh} />
          <button className="settings-reset-button" onClick={handleDisable}>
            🔌 ปิด cloud sync
          </button>
        </>
      ) : (
        <button
          className="settings-cloud-enable"
          onClick={handleEnable}
          disabled={busy}
        >
          {busy ? '⏳ กำลังเชื่อมต่อ…' : '☁️ เปิด cloud sync'}
        </button>
      )}
    </section>
  );
}

function ProvincePicker({
  token,
  currentProvince,
  onChange,
}: {
  token: string;
  currentProvince: string | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(currentProvince);

  const dirty = pending !== currentProvince;

  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const backend = getBackend();
      if (!backend.updateProfile) throw new Error('no updateProfile');
      const profile = await backend.updateProfile(token, { province: pending });
      const sess = loadSession();
      saveSession({ ...sess, province: profile.province, region: profile.region });
      toast.success('บันทึกจังหวัดแล้ว');
      onChange();
    } catch (err) {
      toast.error(`บันทึกไม่สำเร็จ: ${String(err).slice(0, 80)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-province-picker">
      <label className="label-aside" htmlFor="settings-province-select">📍 จังหวัด (สำหรับ leaderboard ภูมิภาค):</label>
      <select
        id="settings-province-select"
        value={pending ?? ''}
        onChange={(e) => setPending(e.target.value || null)}
        disabled={busy}
      >
        <option value="">— ไม่ระบุ —</option>
        {(Object.keys(REGION_LABELS_TH) as Region[]).map((r) => (
          <optgroup key={r} label={REGION_LABELS_TH[r]}>
            {PROVINCES_BY_REGION[r].map((p) => (
              <option key={p.code} value={p.code}>{p.nameTh}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {dirty && (
        <button onClick={save} disabled={busy} className="settings-province-save">
          {busy ? '⏳…' : '💾 บันทึก'}
        </button>
      )}
    </div>
  );
}

function CosmeticPicker() {
  const [items, setItems] = useState(() => evaluateCosmetics());
  const [selected, setSelected] = useState<string | null>(
    () => loadCosmeticSelection().selectedId,
  );
  // Re-evaluate on focus — unlock state can change while the user is
  // on the settings page (e.g. they just hit rating 1500 in a new
  // tab). Cheap to recompute.
  useEffect(() => {
    const refresh = () => setItems(evaluateCosmetics());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const pick = (id: string | null) => {
    setSelected(id);
    saveCosmeticSelection(id);
  };

  return (
    <div className="cosmetic-grid">
      <button
        className={`cosmetic-card ${selected === null ? 'is-selected' : ''}`}
        onClick={() => pick(null)}
      >
        <div className="cosmetic-glyph" aria-hidden="true">∅</div>
        <div className="cosmetic-name">ไม่ใช้ตรา</div>
        <div className="cosmetic-hint">default · ไม่แสดงตราข้างชื่อ</div>
      </button>
      {items.map((c) => (
        <button
          key={c.id}
          className={`cosmetic-card ${selected === c.id ? 'is-selected' : ''} ${c.unlocked ? '' : 'is-locked'}`}
          disabled={!c.unlocked}
          onClick={() => c.unlocked && pick(c.id)}
          title={c.unlocked ? c.descTh : `🔒 ${c.unlockHint}`}
        >
          <div className="cosmetic-glyph" aria-hidden="true">
            {c.unlocked ? c.glyph : '🔒'}
          </div>
          <div className="cosmetic-name">{c.nameTh}</div>
          <div className="cosmetic-hint">
            {c.unlocked ? c.descTh : c.unlockHint}
          </div>
        </button>
      ))}
    </div>
  );
}
