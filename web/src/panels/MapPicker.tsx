import { useState } from 'react';
import type { MapResponse, MapStatus } from '../types';

export interface MapPickerProps {
  maps: MapResponse[];
  currentId: number | null;
  onPick: (id: number) => void;
}

const STATUS_LABEL: Record<MapStatus, string> = {
  DRAFT: 'Draft',
  UPLOADED: 'Uploaded',
  TILING: 'Tiling',
  READY: 'Ready',
  FAILED: 'Failed',
};

/**
 * Map selector: a dropdown of the authed map list (name + status badge) plus a
 * numeric "load map id" input so a user without the authed list can load a
 * known id directly.
 */
export const MapPicker: React.FC<MapPickerProps> = ({ maps, currentId, onPick }) => {
  const [idText, setIdText] = useState('');

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value;
    if (value === '') return;
    const id = Number(value);
    if (Number.isInteger(id) && id > 0) onPick(id);
  };

  const handleLoad = (e: React.FormEvent): void => {
    e.preventDefault();
    const id = Number(idText.trim());
    if (Number.isInteger(id) && id > 0) {
      onPick(id);
      setIdText('');
    }
  };

  const current = currentId !== null ? maps.find((m) => m.id === currentId) : undefined;
  const currentBadge =
    current !== undefined ? STATUS_LABEL[current.status] : undefined;

  return (
    <div className="rm-panel rm-map-picker">
      <div className="rm-panel-title">Map</div>

      {maps.length > 0 ? (
        <select
          className="rm-select"
          value={currentId !== null ? String(currentId) : ''}
          onChange={handleSelect}
        >
          <option value="">Select a map…</option>
          {maps.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.name} — {STATUS_LABEL[m.status]}
            </option>
          ))}
        </select>
      ) : (
        <div className="rm-empty">Sign in to list your maps.</div>
      )}

      {current !== undefined && currentBadge !== undefined && (
        <div className={`rm-status-badge rm-status-${current.status.toLowerCase()}`}>
          {currentBadge}
        </div>
      )}

      <form className="rm-id-form" onSubmit={handleLoad}>
        <input
          className="rm-input"
          type="number"
          inputMode="numeric"
          placeholder="Load map id…"
          value={idText}
          onChange={(e) => setIdText(e.target.value)}
        />
        <button className="rm-btn" type="submit">
          Load
        </button>
      </form>
    </div>
  );
};
