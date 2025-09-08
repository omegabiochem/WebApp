// import { useEffect, useState } from "react";
// import { useParams } from "react-router-dom";
// import { useAuth } from "../../context/AuthContext";
// import type { Report } from "../../types/reports";
// import type { Role } from "../../utils/roles";
// import { api } from "../../lib/api";
// import MicroMixReport from "./MicroMixReport";

// async function fetchReport(id: string): Promise<Report> {
//   return api(`/reports/${id}`);
// }
// async function saveHeader(id: string, dto: Partial<Report>): Promise<Report> {
//   return api(`/reports/${id}/header`, {
//     method: "PATCH",
//     body: JSON.stringify(dto),
//   });
// }
// async function saveMicro(id: string, dto: Partial<Report>): Promise<Report> {
//   // marshal pathogen grams: when radio = PRESENT, compose "Present in Xg of sample"
//   const patch: any = { ...dto };
//   const names = [
//     "ecoli",
//     "paeruginosa",
//     "saureus",
//     "salmonella",
//     "clostridia",
//     "calbicans",
//     "bcepacia",
//     "other",
//   ];
//   for (const key of names) {
//     const field = `pathogen_${key}` as keyof Report;
//     const grams = (dto as any)[`pathogen_${key}_grams`];
//     if ((dto as any)[field] === "PRESENT") {
//       patch[field] = `Present in ${grams ?? "1"}g of sample`;
//     } else if (
//       (dto as any)[field] === "Absent" ||
//       (dto as any)[field] === "ABSENT"
//     ) {
//       patch[field] = "Absent";
//     }
//     delete patch[`pathogen_${key}_grams`];
//   }
//   return api(`/reports/${id}/micro`, {
//     method: "PATCH",
//     body: JSON.stringify(patch),
//   });
// }
// async function qaApprove(id: string): Promise<Report> {
//   return api(`/reports/${id}/qa-approve`, { method: "POST" });
// }
// async function lockReport(id: string): Promise<Report> {
//   return api(`/reports/${id}/lock`, { method: "POST" });
// }

// export default function MicroMixReportDetail() {
//   const { id = "" } = useParams();
//   const { user } = useAuth();
//   const [report, setReport] = useState<Report | null>(null);
//   const [err, setErr] = useState<string | null>(null);

//   useEffect(() => {
//     (async () => {
//       try {
//         setReport(await fetchReport(id));
//       } catch (e: any) {
//         setErr(e?.message ?? "Failed to load");
//       }
//     })();
//   }, [id]);

//   if (!user) return <p className="text-red-600">Please log in.</p>;
//   if (err) return <p className="text-red-600">{err}</p>;
//   if (!report) return <p>Loading...</p>;

//   const role = user.role as Role;

//   return (
//     <MicroMixReport
//       report={report}
//       role={role}
//       onSaveHeader={(dto) =>
//         saveHeader(report.id, dto).then((r) => {
//           setReport(r);
//           return r; // ✅ ensures Promise<Report>
//         })
//       }
//       onSaveMicro={(dto) =>
//         saveMicro(report.id, dto).then((r) => {
//           setReport(r);
//           return r; // ✅ ensures Promise<Report>
//         })
//       }
//       onQaApprove={() =>
//         qaApprove(report.id).then((r) => {
//           setReport(r);
//           return r;
//         })
//       }
//       onLock={() =>
//         lockReport(report.id).then((r) => {
//           setReport(r);
//           return r;
//         })
//       }
//     />
//   );
// }

// // import { useEffect, useState } from "react";

// // import { useParams } from "react-router-dom";
// // import { useAuth } from "../../context/AuthContext";
// // import { canEditHeader, canEditMicro, canQA } from "../../utils/roles";
// // import { getReport, lockReport, qaApprove, updateHeader, updateMicro } from "../../services/reportsService";

// // export default function MicroMixReportDetail() {
// //   const { id } = useParams();
// //   const { user } = useAuth();
// //   const [report, setReport] = useState<any | null>(null);
// //   const [saving, setSaving] = useState(false);

// //   useEffect(() => { (async () => { if (id) setReport(await getReport(id)); })(); }, [id]);

// //   if (!user) return <p>Please log in.</p>;
// //   if (!report) return <p>Loading...</p>;

// //   const locked = report.status === "LOCKED";
// //   const canHead = canEditHeader(user.role) && !locked;
// //   const canMic = canEditMicro(user.role) && !locked;
// //   const canQa = canQA(user.role) && !locked;

// //   async function saveHeader(e: React.FormEvent<HTMLFormElement>) {
// //     e.preventDefault();
// //     setSaving(true);
// //     const fd = new FormData(e.currentTarget);
// //     const dto = Object.fromEntries(fd.entries());
// //     const updated = await updateHeader(report.id, dto);
// //     setReport(updated); setSaving(false);
// //   }

// //   async function saveMicro(e: React.FormEvent<HTMLFormElement>) {
// //     e.preventDefault();
// //     setSaving(true);
// //     const fd = new FormData(e.currentTarget);
// //     const dto = Object.fromEntries(fd.entries());
// //     const updated = await updateMicro(report.id, dto);
// //     setReport(updated); setSaving(false);
// //   }

// //   async function doQaApprove() {
// //     const updated = await qaApprove(report.id);
// //     setReport(updated);
// //   }

// //   async function doLock() {
// //     const updated = await lockReport(report.id);
// //     setReport(updated);
// //   }

// //   return (
// //     <div className="grid grid-cols-1 gap-6">
// //       <div className="bg-white rounded-xl shadow p-6">
// //         <div className="flex items-center justify-between mb-4">
// //           <h1 className="text-xl font-semibold">Report #{report.id.slice(0,6)} • <span className="text-gray-500">{report.status}</span></h1>
// //         </div>

// //         {/* Header section */}
// //         <form onSubmit={saveHeader} className="grid grid-cols-1 md:grid-cols-2 gap-3">
// //           {[
// //             ["client","Client"],
// //             ["dateSent","Date Sent","date"],
// //             ["testType","Test Type"],
// //             ["sampleType","Sample Type"],
// //             ["formulaNo","Formula #"],
// //             ["description","Description"],
// //             ["lotNo","Lot #"],
// //             ["manufactureDate","Manufacture Date","date"],
// //             ["testSop","Test SOP #"],
// //             ["dateTested","Date Tested","date"],
// //             ["preliminaryResults","Preliminary Results"],
// //             ["preliminaryDate","Preliminary Results Date","date"],
// //             ["dateCompleted","Date Completed","date"]
// //           ].map(([key,label,type]) => (
// //             <div key={key} className={key==="description" ? "md:col-span-2" : ""}>
// //               <label className="text-sm">{label}</label>
// //               <input name={key} type={type||"text"} defaultValue={report[key as keyof typeof report] ?? ""} disabled={!canHead}
// //                      className="w-full border rounded-md p-2 disabled:bg-gray-100" />
// //             </div>
// //           ))}
// //           {canHead && (
// //             <div className="md:col-span-2 text-right">
// //               <button disabled={saving} className="bg-[var(--brand)] text-white rounded-md px-4 py-2">
// //                 {saving ? "Saving..." : "Save Header"}
// //               </button>
// //             </div>
// //           )}
// //         </form>
// //       </div>

// //       {/* Micro/Chem section */}
// //       <div className="bg-white rounded-xl shadow p-6">
// //         <h2 className="font-semibold mb-3">Counts & Pathogens</h2>
// //         <form onSubmit={saveMicro} className="grid grid-cols-1 md:grid-cols-2 gap-3">
// //           {[
// //             ["totalBacterialCount","Total Bacterial Count (CFU/ml or g)"],
// //             ["totalMoldYeastCount","Total Mold & Yeast Count (CFU/ml or g)"],
// //             ["pathogen_ecoli","E.coli (Absent/Present...)"],
// //             ["pathogen_paeruginosa","P.aeruginosa"],
// //             ["pathogen_saureus","S.aureus"],
// //             ["pathogen_salmonella","Salmonella"],
// //             ["pathogen_clostridia","Clostridia species"],
// //             ["pathogen_calbicans","C.albicans"],
// //             ["pathogen_bcepacia","B.cepacia"],
// //             ["pathogen_other","Other (with spec)"],
// //             ["comments","Comments"]
// //           ].map(([key,label]) => (
// //             <div key={key} className={key==="comments" ? "md:col-span-2" : ""}>
// //               <label className="text-sm">{label}</label>
// //               <input name={key} defaultValue={report[key as keyof typeof report] ?? ""} disabled={!canMic}
// //                      className="w-full border rounded-md p-2 disabled:bg-gray-100" />
// //             </div>
// //           ))}
// //           {canMic && (
// //             <div className="md:col-span-2 text-right">
// //               <button disabled={saving} className="bg-[var(--brand)] text-white rounded-md px-4 py-2">
// //                 {saving ? "Saving..." : "Save Micro/Chem"}
// //               </button>
// //             </div>
// //           )}
// //         </form>
// //       </div>

// //       {/* QA actions */}
// //       {canQa && (
// //         <div className="bg-white rounded-xl shadow p-6 flex gap-3">
// //           <button onClick={doQaApprove} className="px-4 py-2 rounded-md bg-emerald-600 text-white">QA Approve</button>
// //           {report.status === "QA_APPROVED" && (
// //             <button onClick={doLock} className="px-4 py-2 rounded-md bg-gray-900 text-white">Lock Report</button>
// //           )}
// //         </div>
// //       )}
// //     </div>
// //   );
// // }
