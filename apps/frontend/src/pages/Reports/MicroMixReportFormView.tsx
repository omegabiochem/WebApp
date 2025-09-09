type MicroReportFormProps = {
  report: any;
  onClose: () => void;
};
export default function MicroMixReportFormView({
  report,
  onClose,
}: MicroReportFormProps) {
  type PathRow = {
    checked: boolean;
    key: string;
    label: string;
    grams?: string;
    result: "Absent" | "Present" | "";
    spec: "Absent" | "";
  };

  const pathogenDefaults: PathRow[] = [
    {
      checked: false,
      key: "E_COLI",
      label: "E.coli",
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "P_AER",
      label: "P.aeruginosa",
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "S_AUR",
      label: "S.aureus",
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "SALM",
      label: "Salmonella",
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
      result: "",
      spec: "Absent",
    },
    {
      checked: false,
      key: "B_CEP",
      label: "B.cepacia",
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
  ];
  return (
    <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
      >
        ✕
      </button>

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

            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.client || ""}
              readOnly
              disabled
            />
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="whitespace-nowrap font-medium">DATE SENT:</div>
            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.dateSent || ""}
              readOnly
              disabled
            />
          </div>
        </div>

        {/* TYPE OF TEST / SAMPLE TYPE / FORMULA # */}
        <div className="grid grid-cols-[33%_33%_34%] border-b border-black text-[12px] leading-snug">
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">TYPE OF TEST:</div>

            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.typeOfTest || ""}
              readOnly
              disabled
            />
          </div>
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">SAMPLE TYPE:</div>

            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.sampleType || ""}
              readOnly
              disabled
            />
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">FORMULA #:</div>
            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.formulaNo || ""}
              readOnly
              disabled
            />
          </div>
        </div>

        {/* DESCRIPTION (full row) */}
        <div className="border-b border-black flex items-center gap-2 px-2 text-[12px] leading-snug">
          <div className="w-28 font-medium">DESCRIPTION:</div>

          <input
            className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
            value={report?.description || ""}
            readOnly
            disabled
          />
        </div>

        {/* LOT # / MANUFACTURE DATE */}
        <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">LOT #:</div>
            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.lotNo || ""}
              readOnly
              disabled
            />
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">
              MANUFACTURE DATE:
            </div>
            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.manufactureDate || ""}
              readOnly
              disabled
            />
          </div>
        </div>

        {/* TEST SOP # / DATE TESTED */}
        <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">TEST SOP #:</div>
            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.testSopNo || ""}
              readOnly
              disabled
            />
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="font-medium whitespace-nowrap">DATE TESTED:</div>
            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.dateTested || ""}
              readOnly
              disabled
            />
          </div>
        </div>

        {/* PRELIMINARY RESULTS / PRELIMINARY RESULTS DATE */}
        <div className="grid grid-cols-[45%_55%] border-b border-black text-[12px] leading-snug">
          <div className="px-2 border-r border-black flex items-center gap-1">
            <div className="font-medium">PRELIMINARY RESULTS:</div>
            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.preliminaryResults || ""}
              readOnly
              disabled
            />
          </div>
          <div className="px-2 flex items-center gap-1">
            <div className="font-medium">PRELIMINARY RESULTS DATE:</div>
            <input
              className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
              value={report?.preliminaryResultsDate || ""}
              readOnly
              disabled
            />
          </div>
        </div>

        {/* DATE COMPLETED (full row, label + input) */}
        <div className=" flex items-center gap-2 px-2 text-[12px] leading-snug">
          <div className="font-medium whitespace-nowrap">DATE COMPLETED:</div>
          <input
            className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
            value={report?.dateCompleted || ""}
            readOnly
            disabled
          />
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
              value={report?.tbc_gram || ""}
              readOnly
              disabled
            />
          </div>
          <div className="py-1 px-2 border-r border-black flex">
            <input
              className="w-1/2 input-editable  px-1"
              value={report?.tbc_result || ""}
              readOnly
              disabled
            />
            <div className="py-1 px-2 text-center">CFU/ml</div>
          </div>
          <div className="py-1 px-2 flex">
            <input
              className="w-full input-editable  px-1"
              value={report?.tbc_spec || ""}
              readOnly
              disabled
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
              value={report?.tmy_gram || ""}
              readOnly
              disabled
            />
          </div>
          <div className="py-1 px-2 border-r border-black flex">
            <input
              className="w-1/2 input-editable  px-1"
              value={report?.tmy_result || ""}
              readOnly
              disabled
            />
            <div className="py-1 px-2 text-center">CFU/ml</div>
          </div>
          <div className="py-1 px-2 flex">
            <input
              className="w-full input-editable  px-1"
              value={report?.tmy_spec || ""}
              readOnly
              disabled
            />
          </div>
        </div>
      </div>

      <div className="p-2 font-bold">
        PATHOGEN SCREENING (Please check the organism to be tested)
      </div>

      {/* Pathogen screening */}
      <div className="border border-black">
        <div className="grid grid-cols-[25%_55%_20%] text-center font-semibold border-b border-black">
          <div className="p-2 border-r">ORGANISM</div>
          <div className="p-2 border-r">RESULT</div>
          <div className="p-2">SPECIFICATION</div>
        </div>
        {(report?.pathogens || pathogenDefaults).map((p: any) => (
          <div
            key={p.key}
            className="grid grid-cols-[25%_55%_20%] border-b border-black text-[11px]"
          >
            <div className="py-[2px] px-2 border-r flex gap-2 items-center text-center">
              {/* Organism checkbox */}
              <input
                type="checkbox"
                className="thick-box"
                checked={p.checked || false}
                readOnly
                disabled
              />
              <span>{p.label}</span>
            </div>
            <div className="py-[2px] px-2 border-r flex gap-4 justify-center text-center">
              <label>
                {/* Result radios */}
                <input
                  type="radio"
                  className="thick-box"
                  checked={p.result === "Absent"}
                  readOnly
                  disabled
                />{" "}
                Absent
              </label>
              <label>
                <input
                  type="radio"
                  className="thick-box"
                  checked={p.result === "Present"}
                  readOnly
                  disabled
                /> {" "}
                Present
              </label>
              <span className="ml-1">in 11g of sample</span>
            </div>
            <div className="py-[2px] px-2 text-center">{p.spec}</div>
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
            value={report?.comments || ""}
            readOnly
            disabled
          />
        </div>

        {/* TESTED BY */}

        <div className="p-2">
          <div className="font-medium mb-2 flex items-center gap-2">
            TESTED BY:
            <input
              className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
              value={report?.testedBy || ""}
              readOnly
              disabled
            />
          </div>

          <div className="font-medium mt-2 flex items-center gap-2">
            DATE:
            <input
              className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
              value={report?.testedDate || ""}
              readOnly
              disabled
            />
          </div>
        </div>

        {/* REVIEWED BY */}
        <div className="p-2">
          <div className="font-medium mb-2 flex items-center gap-2">
            REVIEWED BY:
            <input
              className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
              value={report?.reviewedBy || ""}
              readOnly
              disabled
            />
          </div>

          <div className="font-medium mt-2 flex items-center gap-2">
            DATE:
            <input
              className="flex-1 border-0 border-b border-black/70 focus:border-blue-500 focus:ring-0 text-[12px] outline-none"
              value={report?.reviewedDate || ""}
              readOnly
              disabled
            />
          </div>
        </div>
      </div>
    </div>
  );
}
