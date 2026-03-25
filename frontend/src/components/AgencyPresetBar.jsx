import { agencyServicePresets, paymentPlanPresets } from '../constants/agencyPresets';

export default function AgencyPresetBar({ onApplyServicePreset, onApplyPaymentPlanPreset }) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hazir Hizmetler</p>
        <p className="mt-1 text-xs text-slate-600">Sik kullanilan kalemleri ekleyin.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {agencyServicePresets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => onApplyServicePreset?.(preset)}
              title={preset.description}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hazir Odeme Planlari</p>
        <p className="mt-1 text-xs text-slate-600">Odeme planini tek adimda ekleyin.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {paymentPlanPresets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => onApplyPaymentPlanPreset?.(preset)}
              title={preset.description}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
