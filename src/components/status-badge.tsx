import type { VerificationStatus } from "@/lib/types";

type StatusBadgeProps = {
  status: VerificationStatus;
};

const getStatusClasses = (status: VerificationStatus) => {
  if (status === "Pass") {
    return "bg-emerald-100 text-emerald-800 ring-emerald-200";
  }

  if (status === "Fail") {
    return "bg-rose-100 text-rose-800 ring-rose-200";
  }

  if (status === "Missing") {
    return "bg-slate-200 text-slate-800 ring-slate-300";
  }

  return "bg-amber-100 text-amber-800 ring-amber-200";
};

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  return (
    <span
      aria-label={`Field status: ${status}`}
      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${getStatusClasses(status)}`}
    >
      {status}
    </span>
  );
};
