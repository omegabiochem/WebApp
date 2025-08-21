import { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";

// ----- Roles (keep in sync with backend) -----
type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "CHEMISTRY"
  | "QA"
  | "CLIENT";

// A small helper to lock fields per role (frontend hint; backend is the source of truth)
function canEdit(role: Role | undefined, field: string) {
  const map: Record<Role, string[]> = {
    SYSTEMADMIN: ["*"],
    ADMIN: ["*"],
    FRONTDESK: [
      "client",
      "dateSent",
      "typeOfTest",
      "sampleType",
      "formulaNo",
      "description",
      "lotNo",
      "manufactureDate",
      "testSopNo",
    ],
    MICRO: [
      "tbc_dilution",
      "tbc_gram",
      "tbc_result",
      "tbc_spec",
      "tmy_dilution",
      "tmy_gram",
      "tmy_result",
      "tmy_spec",
      "pathogens",
      "dateTested",
      "preliminaryResults",
      "preliminaryResultsDate",
    ],
    CHEMISTRY: [
      "tbc_dilution",
      "tbc_gram",
      "tbc_result",
      "tbc_spec",
      "tmy_dilution",
      "tmy_gram",
      "tmy_result",
      "tmy_spec",
      "pathogens",
      "dateTested",
      "preliminaryResults",
      "preliminaryResultsDate",
    ],
    QA: ["dateCompleted", "reviewedBy", "reviewedDate", "comments"],
    CLIENT: [], // read-only
  };
  if (!role) return false;
  if (map[role]?.includes("*")) return true;
  return map[role]?.includes(field) ?? false;
}

// Simple input wrapper that locks by role
function Field({
  label,
  value,
  onChange,
  readOnly,
  className = "",
  inputClass = "",
  placeholder = " ", // placeholder space keeps boxes visible when empty
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  className?: string;
  inputClass?: string;
  placeholder?: string;
}) {
  return (
    <div className={`flex gap-2 items-center ${className}`}>
      <div className="w-48 shrink-0 text-[12px] font-medium">{label}</div>
      <input
        className={`flex-1 border border-black/70 px-2 py-1 text-[12px] leading-tight ${inputClass}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
      />
    </div>
  );
}

// Print styles: A4-ish, monochrome borders, hide controls when printing
const PrintStyles = () => (
  <style>{`
  @media print {
    @page { size: A4 portrait; margin: 14mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .sheet { box-shadow: none !important; border: none !important; }
  }
`}</style>
);

export default function MicroMixReportForm({ report }: { report?: any }) {
  const { user } = useAuth();
  const role = user?.role as Role | undefined;

  // ---- local state (prefill from report if editing) ----
  const [client, setClient] = useState(report?.client || "");
  const [dateSent, setDateSent] = useState(report?.dateSent || "");
  const [typeOfTest, setTypeOfTest] = useState(report?.typeOfTest || "");
  const [sampleType, setSampleType] = useState(report?.sampleType || "");
  const [formulaNo, setFormulaNo] = useState(report?.formulaNo || "");
  const [description, setDescription] = useState(report?.description || "");
  const [lotNo, setLotNo] = useState(report?.lotNo || "");
  const [manufactureDate, setManufactureDate] = useState(
    report?.manufactureDate || ""
  );
  const [testSopNo, setTestSopNo] = useState(report?.testSopNo || "");
  const [dateTested, setDateTested] = useState(report?.dateTested || "");
  const [preliminaryResults, setPreliminaryResults] = useState(
    report?.preliminaryResults || ""
  );
  const [preliminaryResultsDate, setPreliminaryResultsDate] = useState(
    report?.preliminaryResultsDate || ""
  );
  const [dateCompleted, setDateCompleted] = useState(
    report?.dateCompleted || ""
  );

  // TBC/TFC blocks
  //   const [tbc_dilution, set_tbc_dilution] = useState("x 10^1");
  const [tbc_gram, set_tbc_gram] = useState(report?.tbc_gram || "");
  const [tbc_result, set_tbc_result] = useState(report?.tbc_result || "");
  const [tbc_spec, set_tbc_spec] = useState(report?.tbc_spec || "");

  //   const [tmy_dilution, set_tmy_dilution] = useState("x 10^1"); // Total Mold & Yeast
  const [tmy_gram, set_tmy_gram] = useState(report?.tmy_gram || "");
  const [tmy_result, set_tmy_result] = useState(report?.tmy_result || "");
  const [tmy_spec, set_tmy_spec] = useState(report?.tmy_spec || "");

  // Pathogens (Absent/Present + sample grams)
  type PathRow = {
    checked: boolean;
    key: string;
    label: string;
    // grams: string;
    result: "Absent" | "Present" | "";
    spec: "Absent" | "";
  };
  const pathogenDefaults: PathRow[] = useMemo(
    () => [
      {
        checked: false,
        key: "E_COLI",
        label: "E.coli",
        //grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "P_AER",
        label: "P.aeruginosa",
        //grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "S_AUR",
        label: "S.aureus",
        //grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "SALM",
        label: "Salmonella",
        //grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "CLOSTRIDIA",
        label: "Clostridia species",
        grams: "3g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "C_ALB",
        label: "C.albicans",
        ////grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "B_CEP",
        label: "B.cepacia",
        //grams: "11g",
        result: "",
        spec: "Absent",
      },
      {
        checked: false,
        key: "OTHER",
        label: "Other",
        grams: "",
        result: "",
        spec: "Absent",
      },
    ],
    []
  );
  // const [pathogens, setPathogens] = useState<PathRow[]>(pathogenDefaults);
  const [pathogens, setPathogens] = useState<PathRow[]>(
    report?.pathogens || pathogenDefaults
  );

  const [comments, setComments] = useState(report?.comments || "");
  const [testedBy, setTestedBy] = useState(report?.testedBy || "");
  const [reviewedBy, setReviewedBy] = useState(report?.reviewedBy || "");
  const [testedDate, setTestedDate] = useState(report?.testedDate || "");
  const [reviewedDate, setReviewedDate] = useState(report?.reviewedDate || "");

  const lock = (f: string) => !canEdit(role, f);

  // ----------- Save handler -----------
  const handleSave = async () => {
    const token = localStorage.getItem("token");
    const payload = {
      client,
      dateSent,
      typeOfTest,
      sampleType,
      formulaNo,
      description,
      lotNo,
      manufactureDate,
      testSopNo,
      dateTested,
      preliminaryResults,
      preliminaryResultsDate,
      dateCompleted,
      tbc_gram,
      tbc_result,
      tbc_spec,
      tmy_gram,
      tmy_result,
      tmy_spec,
      pathogens,
      comments,
      testedBy,
      reviewedBy,
      testedDate,
      reviewedDate,
    };

    try {
      // const API_BASE = import.meta.env.VITE_API_URL;
      const API_BASE = "http://localhost:3000";
      const url = report?.id
        ? `${API_BASE}/reports/micro-mix/${report.id}` //existing one
        : `${API_BASE}/reports/micro-mix`; // new one

      const method = report?.id ? "PATCH" : "POST";

      console.log("Token being sent:", token);

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // from useAuth()
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Save failed: ${res.statusText}`);
      const saved = await res.json();

      alert(`✅ Report saved: ${saved.fullNumber || saved.id}`);
    } catch (err: any) {
      console.error(err);
      alert("❌ Error saving report: " + err.message);
    }
  };

  return (
    <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4">
      <PrintStyles />

      {/* Header + print controls */}
      <div className="no-print mb-4 flex justify-end gap-2">
        <button
          className="px-3 py-1 rounded-md border"
          onClick={() => window.print()}
        >
          Print
        </button>
        <button
          className="px-3 py-1 rounded-md border bg-blue-600 text-white"
          onClick={handleSave}
        >
          {report?.id ? "Update Report" : "Save Report"}
        </button>
      </div>

      {/* Letterhead */}
      <div className="mb-2 text-center">
        <div
          className="font-bold tracking-wide text-[22px]"
          style={{ color: "blue" }}
        >
          OMEGA BIOLOGICAL LABORATORY, INC.
        </div>
        <div className="text-[16px]" style={{ color: "blue" }}>
          (FDA REG.)
        </div>
        <div className="text-[12px]">
          56 PARK AVENUE, LYNDHURST, NJ 07071 <br></br>
          Tel: (201) 883 1222 • Fax: (201) 883 0449
        </div>
        <div>
          <div className="text-[12px]">
            Email: <span style={{ color: "blue" }}>lab@omegabiochem.com</span>
          </div>
          {/* <div className="font-medium">Report No: {report.fullNumber}</div> */}
        </div>
        <div
          className="text-[18px] font-bold mt-1"
          style={{ textDecoration: "underline" }}
        >
          Report
        </div>
      </div>

      {/* Top meta block */}
      <div className="w-full border border-black text-[15px]">
        {/* CLIENT / DATE SENT */}
        <div className="grid grid-cols-[67%_33%] border-b border-black text-[12px] leading-snug">
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="whitespace-nowrap font-medium">CLIENT:</div>
            {lock("client") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={client}
                onChange={(e) => setClient(e.target.value)}
              />
            )}
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="whitespace-nowrap font-medium">DATE SENT:</div>
            {lock("dateSent") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={dateSent}
                onChange={(e) => setDateSent(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* TYPE OF TEST / SAMPLE TYPE / FORMULA # */}
        <div className="grid grid-cols-[33%_33%_34%] border-b border-black text-[12px] leading-snug">
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">TYPE OF TEST:</div>
            {lock("typeOfTest") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={typeOfTest}
                onChange={(e) => setTypeOfTest(e.target.value)}
              />
            )}
          </div>
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">SAMPLE TYPE:</div>
            {lock("sampleType") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={sampleType}
                onChange={(e) => setSampleType(e.target.value)}
              />
            )}
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">FORMULA #:</div>
            {lock("formulaNo") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={formulaNo}
                onChange={(e) => setFormulaNo(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* DESCRIPTION (full row) */}
        <div className="border-b border-black flex items-center gap-2 px-2 text-[12px] leading-snug">
          <div className="w-28 font-medium">DESCRIPTION:</div>
          {lock("description") ? (
            <div className="flex-1 border-b border-black min-h-[14px]"></div>
          ) : (
            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </div>

        {/* LOT # / MANUFACTURE DATE */}
        <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">LOT #:</div>
            {lock("lotNo") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={lotNo}
                onChange={(e) => setLotNo(e.target.value)}
              />
            )}
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">
              MANUFACTURE DATE:
            </div>
            {lock("manufactureDate") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={manufactureDate}
                onChange={(e) => setManufactureDate(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* TEST SOP # / DATE TESTED */}
        <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">TEST SOP #:</div>
            {lock("testSopNo") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={testSopNo}
                onChange={(e) => setTestSopNo(e.target.value)}
              />
            )}
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">DATE TESTED:</div>
            {lock("dateTested") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={dateTested}
                onChange={(e) => setDateTested(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* PRELIMINARY RESULTS / PRELIMINARY RESULTS DATE */}
        <div className="grid grid-cols-[45%_55%] border-b border-black text-[12px] leading-snug">
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="font-medium">PRELIMINARY RESULTS:</div>
            {lock("preliminaryResults") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={preliminaryResults}
                onChange={(e) => setPreliminaryResults(e.target.value)}
              />
            )}
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="font-medium">PRELIMINARY RESULTS DATE:</div>
            {lock("preliminaryResultsDate") ? (
              <div className="flex-1 border-b border-black min-h-[14px]"></div>
            ) : (
              <input
                className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                value={preliminaryResultsDate}
                onChange={(e) => setPreliminaryResultsDate(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* DATE COMPLETED (full row, label + input) */}
        <div className=" flex items-center gap-2 px-2 text-[12px] leading-snug">
          <div className="font-medium whitespace-nowrap">DATE COMPLETED:</div>
          {lock("dateCompleted") ? (
            <div className="border-b border-black min-h-[14px] flex-1"></div>
          ) : (
            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={dateCompleted}
              onChange={(e) => setDateCompleted(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="p-2 font-bold">TBC / TFC RESULTS:</div>

      {/* TBC/TFC table */}
      <div className="mt-2 border border-black">
        <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px] text-center items-center font-semibold border-b border-black">
          <div className="p-2  border-r border-black">TYPE OF TEST</div>
          <div className="p-2 border-r border-black">DILUTION</div>
          <div className="p-2 border-r border-black">GRAM STAIN</div>
          <div className="p-2 border-r border-black">RESULT</div>
          <div className="p-2">SPECIFICATION</div>
        </div>
        {/* Row 1: Total Bacterial Count */}
        <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px] border-b border-black">
          <div className=" py-1 px-2 font-bold border-r border-black">
            Total Bacterial Count:
          </div>
          <div className="py-1 px-2 border-r border-black">
            <div className="py-1 px-2 text-center"> x 10^0</div>
            {/* <input
              className="w-full border border-black/70 px-1"
              value={tbc_dilution}
              onChange={(e) => set_tbc_dilution(e.target.value)}
              readOnly={lock("tbc_dilution")}
            /> */}
          </div>
          <div className="py-1 px-2 border-r border-black flex">
            <input
              className="w-full input-editable  px-1"
              value={tbc_gram}
              onChange={(e) => set_tbc_gram(e.target.value)}
              readOnly={lock("tbc_gram")}
            />
          </div>
          <div className="py-1 px-2 border-r border-black flex">
            <input
              className="w-1/2 input-editable  px-1"
              value={tbc_result}
              onChange={(e) => set_tbc_result(e.target.value)}
              readOnly={lock("tbc_result")}
              placeholder="CFU/ml"
            />
            <div className="py-1 px-2 text-center">CFU/ml</div>
          </div>
          <div className="py-1 px-2 flex">
            <input
              className="w-full input-editable  px-1"
              value={tbc_spec}
              onChange={(e) => set_tbc_spec(e.target.value)}
              readOnly={lock("tbc_spec")}
            />
          </div>
        </div>
        {/* Row 2: Total Mold & Yeast Count */}
        <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px]">
          <div className="py-1 px-2 font-bold border-r border-black">
            Total Mold & Yeast Count:
          </div>
          <div className="py-1 px-2 border-r border-black">
            <div className="py-1 px-2 text-center"> x 10^0</div>
            {/* <input
              className="w-full border border-black/70 px-1"
              value={tmy_dilution}
              onChange={(e) => set_tmy_dilution(e.target.value)}
              readOnly={lock("tmy_dilution")}
            /> */}
          </div>
          <div className="py-1 px-2 border-r border-black flex">
            <input
              className="w-full input-editable  px-1 "
              value={tmy_gram}
              onChange={(e) => set_tmy_gram(e.target.value)}
              readOnly={lock("tmy_gram")}
            />
          </div>
          <div className="py-1 px-2 border-r border-black flex">
            <input
              className="w-1/2 input-editable  px-1"
              value={tmy_result}
              onChange={(e) => set_tmy_result(e.target.value)}
              readOnly={lock("tmy_result")}
              placeholder="CFU/ml"
            />
            <div className="py-1 px-2 text-center">CFU/ml</div>
          </div>
          <div className="py-1 px-2 flex">
            <input
              className="w-full input-editable  px-1"
              value={tmy_spec}
              onChange={(e) => set_tmy_spec(e.target.value)}
              readOnly={lock("tmy_spec")}
            />
          </div>
        </div>
      </div>

      <div className="p-2 font-bold">
        PATHOGEN SCREENING (Please check the organism to be tested)
      </div>

      {/* Pathogen screening */}
      <div className="mt-3 border border-black">
        {/* Header */}
        <div className="grid grid-cols-[25%_55%_20%] text-[12px] text-center font-semibold border-b border-black">
          <div className="p-2 border-r border-black"></div>
          <div className="p-2 border-r border-black">RESULT</div>
          <div className="p-2">SPECIFICATION</div>
        </div>

        {/* Rows */}
        {pathogens.map((p, idx) => (
          <div
            key={p.key}
            className="grid grid-cols-[25%_55%_20%] text-[11px] leading-tight border-b last:border-b-0 border-black"
          >
            {/* First column */}
            <div className="py-[2px] px-2 border-r border-black flex items-center gap-2">
              <input
                type="checkbox"
                className="form-checkbox rounded-full border-black h-3 w-3"
                checked={p.checked || false}
                onChange={(e) => {
                  const copy = [...pathogens];
                  copy[idx] = { ...p, checked: e.target.checked };
                  setPathogens(copy);
                }}
                disabled={lock("pathogens")}
              />
              <span className="font-bold">{p.label}</span>
              {p.key === "OTHER" && (
                <input
                  className="input-editable leading-tight"
                  placeholder="(specify)"
                  readOnly
                />
              )}
            </div>

            {/* Second column */}
            <div className="py-[2px] px-2 border-r border-black flex text-center gap-2 items-center">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="form-checkbox rounded-full border-black h-3 w-3"
                  checked={p.result === "Absent"}
                  onChange={() => {
                    const copy = [...pathogens];
                    copy[idx] = { ...p, result: "Absent" };
                    setPathogens(copy);
                  }}
                  disabled={lock("pathogens")}
                />
                Absent
              </label>
              <span>/</span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="form-checkbox rounded-full border-black h-3 w-3"
                  checked={p.result === "Present"}
                  onChange={() => {
                    const copy = [...pathogens];
                    copy[idx] = { ...p, result: "Present" };
                    setPathogens(copy);
                  }}
                  disabled={lock("pathogens")}
                />
                Present
              </label>
              <span className="ml-1">in 11g</span>
            </div>

            {/* Third column */}
            <div className="py-[2px] px-2 text-center">Absent</div>
          </div>
        ))}
      </div>

      {/* Legends / Comments */}
      <div className="mt-2 text-[11px]">
        <div
          className=" font-bold border-black p-2"
          style={{ textDecoration: "underline" }}
        >
          DENOTES: NA (Not Applicable) / N.G. (No Growth) / GM.(+)B Gram (+)
          Bacilli / GM.(+)C Gram (+) Cocci / GM.NEG Gram Negative / NT (Not
          Tested) / TNTC (Too Numerous To Count)
        </div>
      </div>

      {/* Comments + Signatures */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="p2 col-span-2 flex">
          <div className="mb-1 font-medium">Comments:</div>
          <input
            className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            readOnly={lock("comments")}
            placeholder="Comments"
          />
        </div>

        {/* TESTED BY */}

        <div className="p-2">
          <div className="font-medium mb-2 flex items-center gap-2">
            TESTED BY:
            <input
              className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
              value={testedBy}
              onChange={(e) => setTestedBy(e.target.value)}
              readOnly={lock("testedBy")}
              placeholder="Name"
            />
          </div>

          <div className="font-medium mt-2 flex items-center gap-2">
            DATE:
            <input
              className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
              value={testedDate}
              onChange={(e) => setTestedDate(e.target.value)}
              readOnly={lock("testedDate")}
              placeholder="MM/DD/YYYY"
            />
          </div>
        </div>

        {/* REVIEWED BY */}
        <div className="p-2">
          <div className="font-medium mb-2 flex items-center gap-2">
            REVIEWED BY:
            <input
              className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
              value={reviewedBy}
              onChange={(e) => setReviewedBy(e.target.value)}
              readOnly={lock("testedBy")}
              placeholder="Name"
            />
          </div>

          <div className="font-medium mt-2 flex items-center gap-2">
            DATE:
            <input
              className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
              value={reviewedDate}
              onChange={(e) => setReviewedDate(e.target.value)}
              readOnly={lock("testedDate")}
              placeholder="MM/DD/YYYY"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
