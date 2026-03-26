import { useEffect, useRef, useState } from 'react';
import type { ClawQuirkSettings, ShellInfo } from '../lib/settings';
import { LAUNCH_PRESETS } from '../lib/settings';

interface Props {
  settings: ClawQuirkSettings;
  onChange: (settings: ClawQuirkSettings) => void;
  onClose: () => void;
  availableShells: ShellInfo[];
}

export default function SettingsPanel({ settings, onChange, onClose, availableShells }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isCustomCommand = !LAUNCH_PRESETS.some((p) => p.value === settings.autoLaunchCommand);
  const [customDraft, setCustomDraft] = useState(isCustomCommand ? settings.autoLaunchCommand : '');

  const update = (partial: Partial<ClawQuirkSettings>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-panel" ref={panelRef}>
        <h3>Settings</h3>

        <div className="setting-row">
          <span className="setting-label">Shell</span>
          <select
            className="setting-select"
            value={settings.shell}
            onChange={(e) => update({ shell: e.target.value })}
          >
            <option value="">Default</option>
            {availableShells.map((s) => (
              <option key={s.id} value={s.command}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <label className="setting-label">
            Terminal Font Size
            <span className="setting-value">{settings.terminalFontSize}px</span>
          </label>
          <input
            type="range"
            min={10}
            max={20}
            value={settings.terminalFontSize}
            onChange={(e) =>
              update({ terminalFontSize: Number(e.target.value) })
            }
          />
        </div>

        <div className="setting-row">
          <span className="setting-label">Auto-launch Command</span>
          <select
            className="setting-select"
            value={isCustomCommand ? '__custom__' : settings.autoLaunchCommand}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustomDraft('');
                update({ autoLaunchCommand: ' ' });
              } else {
                update({ autoLaunchCommand: e.target.value });
              }
            }}
          >
            {LAUNCH_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value="__custom__">Custom...</option>
          </select>
          {isCustomCommand && (
            <input
              className="setting-input"
              type="text"
              placeholder="e.g. ollama run mistral (press Enter to apply)"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  update({ autoLaunchCommand: customDraft.trim() || ' ' });
                }
              }}
              onBlur={() => {
                if (customDraft.trim() && customDraft.trim() !== settings.autoLaunchCommand.trim()) {
                  update({ autoLaunchCommand: customDraft.trim() || ' ' });
                }
              }}
            />
          )}
        </div>

        <div className="setting-row">
          <span className="setting-label">Terminal Position</span>
          <div className="position-toggle">
            <button
              className={settings.terminalPosition === 'left' ? 'active' : ''}
              onClick={() => update({ terminalPosition: 'left' })}
            >
              Left
            </button>
            <button
              className={settings.terminalPosition === 'right' ? 'active' : ''}
              onClick={() => update({ terminalPosition: 'right' })}
            >
              Right
            </button>
          </div>
        </div>

        <div className="setting-row shortcut-hint">
          <kbd>Ctrl</kbd> + <kbd>`</kbd> toggles terminal
        </div>
      </div>
    </>
  );
}
