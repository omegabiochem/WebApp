import { useState } from "react";
import type { Report } from "../../types/reports";
import type { Role } from "../../utils/roles";
import { canEditHeader, canEditMicro, canQA } from "../../utils/roles";

type Props = {
  report: Report|null;
  role: Role;
  onSaveHeader: (dto: Partial<Report>) => Promise<Report>;
  onSaveMicro: (dto: Partial<Report>) => Promise<Report>;
  onQaApprove: () => Promise<Report>;
  onLock: () => Promise<Report>;
};



export default function MicroMixReport({
  report: initial,
  role,
  onSaveHeader,
  onSaveMicro,
  onQaApprove,
  onLock,
}: Props) {
  const [report, setReport] = useState<Report |null>(initial ?? null);
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingMicro, setSavingMicro] = useState(false);

//   useEffect(() => {
//     async function loadReport() {
//       try {
//         const res = await fetch("http://localhost:3000/reports/123", {
//           headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
//         });
//         if (!res.ok) throw new Error("Failed to fetch report");
//         const data: Report = await res.json();
//         setReport(data);
//       } catch (err) {
//         console.error("Error loading report", err);
//       }
//     }
//     loadReport();
//   }, []);
  

  // 🚨 guard if no report
  if (!report) {
    return <div className="p-4 text-red-600">No report loaded</div>;
  }

  const locked = report.status === "LOCKED";
  const headerEnabled = canEditHeader(role) && !locked;
  const microEnabled = canEditMicro(role) && !locked;
  const qaEnabled = canQA(role) && !locked;

  async function handleHeaderSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!headerEnabled) return;
    setSavingHeader(true);
    const fd = new FormData(e.currentTarget);
    const dto: any = Object.fromEntries(fd.entries());
    const updated = await onSaveHeader(dto);
    setReport(updated);
    setSavingHeader(false);
  }

  async function handleMicroSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!microEnabled) return;
    setSavingMicro(true);
    const fd = new FormData(e.currentTarget);
    const dto: any = Object.fromEntries(fd.entries());
    // Compose counts exactly as the paper shows (keep units on right)
    if (dto.tbc_dilution || dto.tbc_result) {
      dto.totalBacterialCount =
        `${dto.tbc_dilution ?? ""} ${dto.tbc_result ?? ""}`.trim();
    }
    if (dto.tmyc_dilution || dto.tmyc_result) {
      dto.totalMoldYeastCount =
        `${dto.tmyc_dilution ?? ""} ${dto.tmyc_result ?? ""}`.trim();
    }
    const updated = await onSaveMicro(dto);
    setReport(updated);
    setSavingMicro(false);
  }

  const labelCls = "text-xs font-medium tracking-wide";
  const inputCls =
    "w-full border border-black/40 rounded-sm px-2 py-1 text-sm disabled:bg-neutral-100";
  const box = "border border-black p-3 rounded-sm bg-white";
  const cap = "uppercase tracking-[0.15em] font-semibold";

  return (
    <div className="mx-auto max-w-5xl space-y-4 text-gray-900 print:text-black">
      {/* Top Header */}
      <div className={`${box}`}>
        <div className="text-center">
          <div className={`${cap} text-lg`}>Laboratory Report</div>
          <div className="mt-1 text-xs">
            <div className="font-semibold">OMEGA BIOLOGICAL LABORATORY, INC. (FDA REG.)</div>
            <div>56 PARK AVENUE, LYNDHURST. NJ 07071</div>
            <div>Tel: (201) 883 1222 • Fax: (201) 883 0449 • Email: lab@omegabiochem.com</div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs">
          <div className="font-semibold">M-30451</div>
          <div className="font-semibold">SOP # OM 05B, MIX FORM REV-06</div>
        </div>
      </div>

      {/* Report Header Form */}
      <form onSubmit={handleHeaderSubmit} className={`${box}`}>
        <div className={`${cap} mb-3`}>Report</div>

        <div className="grid grid-cols-12 gap-2">
          <Field label="CLIENT" name="client" defaultValue={report?.client ?? ""} disabled={!headerEnabled} />
          <Field label="DATE SENT" name="dateSent" type="date" defaultValue={report.dateSent ?? ""} disabled={!headerEnabled} />

          <Field label="TYPE OF TEST" name="testType" col={6} defaultValue={report.testType ?? ""} disabled={!headerEnabled} />
          <Field label="SAMPLE TYPE" name="sampleType" col={6} defaultValue={report.sampleType ?? ""} disabled={!headerEnabled} />
          <Field label="FORMULA #" name="formulaNo" col={6} defaultValue={report.formulaNo ?? ""} disabled={!headerEnabled} />

          <Field label="DESCRIPTION" name="description" col={12} defaultValue={report.description ?? ""} disabled={!headerEnabled} />

          <Field label="LOT #" name="lotNo" col={6} defaultValue={report.lotNo ?? ""} disabled={!headerEnabled} />
          <Field label="MANUFACTURE DATE" name="manufactureDate" type="date" col={6} defaultValue={report.manufactureDate ?? ""} disabled={!headerEnabled} />

          <Field label="TEST SOP #" name="testSop" col={6} defaultValue={report.testSop ?? ""} disabled={!headerEnabled} />
          <Field label="DATE TESTED" name="dateTested" type="date" col={6} defaultValue={report.dateTested ?? ""} disabled={!headerEnabled} />

          <Field label="PRELIMINARY RESULTS" name="preliminaryResults" col={8} defaultValue={report.preliminaryResults ?? ""} disabled={!headerEnabled} />
          <Field label="PRELIMINARY RESULTS DATE" name="preliminaryDate" type="date" col={4} defaultValue={report.preliminaryDate ?? ""} disabled={!headerEnabled} />

          <Field label="DATE COMPLETED" name="dateCompleted" type="date" col={4} defaultValue={report.dateCompleted ?? ""} disabled={!headerEnabled} />
        </div>

        {headerEnabled && (
          <div className="mt-3 text-right">
            <button className="px-4 py-2 bg-[var(--brand)] text-white rounded-md">
              {savingHeader ? "Saving..." : "Save Header"}
            </button>
          </div>
        )}
      </form>

      {/* TBC / TFC Results */}
      <form onSubmit={handleMicroSubmit} className={`${box}`}>
        <div className={`${cap} mb-3`}>TBC / TFC Results</div>

        <div className="grid grid-cols-12 text-xs font-semibold border-b border-black">
          <Cell className="col-span-4">TYPE OF TEST</Cell>
          <Cell className="col-span-2">DILUTION</Cell>
          <Cell className="col-span-2">GRAM STAIN</Cell>
          <Cell className="col-span-2">RESULT</Cell>
          <Cell className="col-span-2">SPECIFICATION</Cell>
        </div>

        {/* Row: Total Bacterial Count */}
        <div className="grid grid-cols-12 items-center border-b border-black py-1">
          <Cell className="col-span-4">Total Bacterial Count:</Cell>
          <Cell className="col-span-2">
            <input name="tbc_dilution" placeholder="x 10^1" defaultValue={extractLeft(report.totalBacterialCount)} className={inputCls} disabled={!microEnabled} />
          </Cell>
          <Cell className="col-span-2">
            <input name="tbc_gram" placeholder="" className={inputCls} disabled={!microEnabled} />
          </Cell>
          <Cell className="col-span-2">
            <input name="tbc_result" placeholder="" defaultValue={extractRight(report.totalBacterialCount)} className={inputCls} disabled={!microEnabled} />
          </Cell>
          <Cell className="col-span-2 text-sm">CFU/ ml/g</Cell>
        </div>

        {/* Row: Total Mold & Yeast Count */}
        <div className="grid grid-cols-12 items-center border-b border-black py-1">
          <Cell className="col-span-4">Total Mold & Yeast Count:</Cell>
          <Cell className="col-span-2">
            <input name="tmyc_dilution" placeholder="x 10^1" defaultValue={extractLeft(report.totalMoldYeastCount)} className={inputCls} disabled={!microEnabled} />
          </Cell>
          <Cell className="col-span-2">
            <input name="tmyc_gram" placeholder="" className={inputCls} disabled={!microEnabled} />
          </Cell>
          <Cell className="col-span-2">
            <input name="tmyc_result" placeholder="" defaultValue={extractRight(report.totalMoldYeastCount)} className={inputCls} disabled={!microEnabled} />
          </Cell>
          <Cell className="col-span-2 text-sm">CFU/ ml/g</Cell>
        </div>

        {/* Pathogen Screening */}
        <div className="mt-4">
          <div className={`${cap} mb-2`}>Pathogen Screening (Please check the organism to be tested)</div>

          <PathogenRow
            label="E.coli"
            name="pathogen_ecoli"
            value={report.pathogen_ecoli}
            gramsDefault={1}
            disabled={!microEnabled}
          />
          <PathogenRow
            label="P.aeruginosa"
            name="pathogen_paeruginosa"
            value={report.pathogen_paeruginosa}
            gramsDefault={1}
            disabled={!microEnabled}
          />
          <PathogenRow
            label="S.aureus"
            name="pathogen_saureus"
            value={report.pathogen_saureus}
            gramsDefault={1}
            disabled={!microEnabled}
          />
          <PathogenRow
            label="Salmonella"
            name="pathogen_salmonella"
            value={report.pathogen_salmonella}
            gramsDefault={1}
            disabled={!microEnabled}
          />
          <PathogenRow
            label="Clostridia species"
            name="pathogen_clostridia"
            value={report.pathogen_clostridia}
            gramsDefault={3}
            disabled={!microEnabled}
          />
          <PathogenRow
            label="C.albicans"
            name="pathogen_calbicans"
            value={report.pathogen_calbicans}
            gramsDefault={1}
            disabled={!microEnabled}
          />
          <PathogenRow
            label="B.cepacia"
            name="pathogen_bcepacia"
            value={report.pathogen_bcepacia}
            gramsDefault={1}
            disabled={!microEnabled}
          />
          <PathogenRow
            label="Other"
            name="pathogen_other"
            value={report.pathogen_other}
            gramsDefault={1}
            disabled={!microEnabled}
          />
        </div>

        {/* Legend */}
        <div className="mt-3 text-[11px] leading-tight">
          <span className="font-semibold">DENOTES:</span> NA: Not Applicable / N.G.: No Growth /
          GM. (+) B: Gram (+) Bacilli / GM. (+) C Gram (+) Cocci / GM. NEG: Gram Negative /
          NT: Not Tested / TNTC: Too Numerous To Count
        </div>

        {/* Comments */}
        <div className="mt-3">
          <label className={labelCls}>Comments:</label>
          <textarea
            name="comments"
            defaultValue={report.comments ?? ""}
            className="w-full h-24 border border-black/40 rounded-sm p-2 text-sm disabled:bg-neutral-100"
            disabled={!microEnabled}
          />
        </div>

        {/* Tested/Reviewed signature lines */}
        <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="font-semibold whitespace-nowrap">TESTED BY:</div>
            <div className="flex-1 border-b border-black h-[1.4em]"></div>
            <div className="font-semibold ml-4 whitespace-nowrap">DATE:</div>
            <div className="flex-1 border-b border-black h-[1.4em]"></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="font-semibold whitespace-nowrap">REVIEWED BY:</div>
            <div className="flex-1 border-b border-black h-[1.4em]"></div>
            <div className="font-semibold ml-4 whitespace-nowrap">DATE:</div>
            <div className="flex-1 border-b border-black h-[1.4em]"></div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {microEnabled && (
            <button className="px-4 py-2 bg-[var(--brand)] text-white rounded-md">
              {savingMicro ? "Saving..." : "Save Micro/Pathogens"}
            </button>
          )}
          {qaEnabled && report.status === "SUBMITTED" && (
            <button
              type="button"
              onClick={async () => setReport(await onQaApprove())}
              className="px-4 py-2 rounded-md bg-emerald-600 text-white"
            >
              QA Approve
            </button>
          )}
          {qaEnabled && report.status === "QA_APPROVED" && (
            <button
              type="button"
              onClick={async () => setReport(await onLock())}
              className="px-4 py-2 rounded-md bg-gray-900 text-white"
            >
              Lock Report
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({
  label, name, defaultValue, disabled, type = "text", col = 6,
}: { label: string; name: string; defaultValue?: any; disabled?: boolean; type?: string; col?: 4|6|8|12 }) {
  const inputCls =
    "w-full border border-black/40 rounded-sm px-2 py-1 text-sm disabled:bg-neutral-100";
  return (
    <div className={`col-span-${col}`}>
      <label className="block text-[11px] font-semibold uppercase mb-0.5 tracking-wide">{label}</label>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} disabled={disabled} className={inputCls} />
    </div>
  );
}

function Cell({ children, className = "" }: { children: any; className?: string }) {
  return <div className={`px-2 py-1 ${className}`}>{children}</div>;
}

function extractLeft(s?: string | null) {
  if (!s) return "";
  const parts = s.split(" ");
  return parts[0] ?? "";
}
function extractRight(s?: string | null) {
  if (!s) return "";
  const parts = s.split(" ");
  return parts.slice(1).join(" ");
}

function PathogenRow({
  label, name, value, gramsDefault, disabled,
}: { label: string; name: string; value?: string | null; gramsDefault: number; disabled: boolean; }) {
  // parse "Absent" | "Present in Xg of sample"
  const present = value?.toLowerCase().startsWith("present");
  const grams = present ? (value?.match(/(\d+)\s*g/i)?.[1] ?? gramsDefault.toString()) : gramsDefault.toString();

  const commonCls = "inline-flex items-center gap-1 mr-4";
  const box = (checked: boolean) =>
    `inline-block w-3 h-3 border border-black align-middle mr-1 ${checked ? "bg-black" : "bg-white"}`;

  return (
    <div className="flex items-center justify-between border-b border-dashed border-black/40 py-1 text-sm">
      <div className="flex-1">
        <span className="font-medium">• {label}</span>
      </div>
      <div className="flex-1 flex items-center justify-end text-sm">
        <label className={commonCls}>
          <span className={box(!present)} />
          <input type="radio" name={name} value={`Absent`} defaultChecked={!present} disabled={disabled} className="hidden" />
          <span>Absent</span>
        </label>
        <label className={commonCls}>
          <span className={box(!!present)} />
          <input type="radio" name={name} value="PRESENT" defaultChecked={!!present} disabled={disabled} className="hidden" />
          <span>Present in</span>
          <input
            name={`${name}_grams`}
            defaultValue={grams}
            disabled={disabled || !present}
            className="w-12 border border-black/40 rounded-sm px-1 py-0.5 text-sm text-center mx-1 disabled:bg-neutral-100"
          />
          <span>g of sample</span>
        </label>
        <span className="ml-4 text-xs">Specification: <b>Absent</b></span>
      </div>
    </div>
  );
}



// function useEffect(arg0: () => void, arg1: never[]) {
//     throw new Error("Function not implemented.");
// }
// import { useForm } from "react-hook-form";
// import { useNavigate } from "react-router-dom";
// import { useAuth } from "../../context/AuthContext";
// import { createReport } from "../../services/reportsService";

// export default function MicroMixReport() {
//   const { user } = useAuth();
//   const nav = useNavigate();
//   const { register, handleSubmit, formState:{ isSubmitting } } = useForm<any>({
//     defaultValues: { client: "", testSop: "OM 05B" }
//   });

//   if (!user) return <p>Please log in.</p>;

//   const onSubmit = async (data: any) => {
//     const r = await createReport(data);
//     nav(`/reports/${r.id}`);
//   };

//   return (
//     <div className="max-w-2xl bg-white rounded-xl shadow p-6">
//       <h1 className="text-xl font-semibold mb-4">New Lab Report</h1>
//       <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
//         <div className="md:col-span-2">
//           <label className="text-sm">Client</label>
//           <input className="w-full border rounded-md p-2" {...register("client")} required />
//         </div>
//         <div>
//           <label className="text-sm">Date Sent</label>
//           <input type="date" className="w-full border rounded-md p-2" {...register("dateSent")} />
//         </div>
//         <div>
//           <label className="text-sm">Test Type</label>
//           <input className="w-full border rounded-md p-2" {...register("testType")} />
//         </div>
//         <div>
//           <label className="text-sm">Sample Type</label>
//           <input className="w-full border rounded-md p-2" {...register("sampleType")} />
//         </div>
//         <div>
//           <label className="text-sm">Formula #</label>
//           <input className="w-full border rounded-md p-2" {...register("formulaNo")} />
//         </div>
//         <div className="md:col-span-2">
//           <label className="text-sm">Description</label>
//           <input className="w-full border rounded-md p-2" {...register("description")} />
//         </div>
//         <div>
//           <label className="text-sm">Lot #</label>
//           <input className="w-full border rounded-md p-2" {...register("lotNo")} />
//         </div>
//         <div>
//           <label className="text-sm">Manufacture Date</label>
//           <input type="date" className="w-full border rounded-md p-2" {...register("manufactureDate")} />
//         </div>
//         <div>
//           <label className="text-sm">Test SOP #</label>
//           <input className="w-full border rounded-md p-2" {...register("testSop")} />
//         </div>
//         <div>
//           <label className="text-sm">Date Tested</label>
//           <input type="date" className="w-full border rounded-md p-2" {...register("dateTested")} />
//         </div>
//         <div className="md:col-span-2">
//           <label className="text-sm">Preliminary Results</label>
//           <input className="w-full border rounded-md p-2" {...register("preliminaryResults")} />
//         </div>
//         <div>
//           <label className="text-sm">Preliminary Results Date</label>
//           <input type="date" className="w-full border rounded-md p-2" {...register("preliminaryDate")} />
//         </div>
//         <div>
//           <label className="text-sm">Date Completed</label>
//           <input type="date" className="w-full border rounded-md p-2" {...register("dateCompleted")} />
//         </div>
//         <div className="md:col-span-2 text-right">
//           <button disabled={isSubmitting} className="bg-[var(--brand)] text-white rounded-md px-4 py-2">
//             {isSubmitting ? "Creating..." : "Create Report"}
//           </button>
//         </div>
//       </form>
//     </div>
//   );
// }
