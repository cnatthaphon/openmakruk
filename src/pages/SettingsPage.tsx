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
