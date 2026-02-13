import type { FieldKey, VerificationFieldResult } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

type ResultsTableProps = {
  results: VerificationFieldResult[];
  selectedField: FieldKey | null;
  handleFieldHover: (field: FieldKey | null) => void;
};

const getRowClasses = (isActiveRow: boolean) => {
  if (isActiveRow) {
    return "cursor-pointer bg-indigo-50 outline-none";
  }

  return "cursor-pointer bg-white outline-none hover:bg-slate-50";
};

export const ResultsTable = ({
  results,
  selectedField,
  handleFieldHover,
}: ResultsTableProps) => {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Results</h2>
        <p className="mt-1 text-xs text-slate-600">
          Hover or focus a row to highlight evidence on the label preview.
        </p>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Field</th>
              <th className="px-4 py-3 font-semibold">Application</th>
              <th className="px-4 py-3 font-semibold">Label Extracted</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              const isActiveRow = selectedField === result.field;

              return (
                <tr
                  key={result.field}
                  tabIndex={0}
                  aria-label={`Result row for ${result.label}`}
                  className={`${getRowClasses(isActiveRow)} border-t border-slate-100 align-top`}
                  onMouseEnter={() => handleFieldHover(result.field)}
                  onMouseLeave={() => handleFieldHover(null)}
                  onFocus={() => handleFieldHover(result.field)}
                  onBlur={() => handleFieldHover(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleFieldHover(result.field);
                    }
                  }}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div>{result.label}</div>
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      {result.reason}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {result.applicationValue}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {result.extractedValue}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={result.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
