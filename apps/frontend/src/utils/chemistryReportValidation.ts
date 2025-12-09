export type ChemActiveRow = {
  key: string;          // internal key, unique
  label: string;        // what shows on the form
  checked: boolean;     // "ACTIVE TO BE TESTED" checkbox
  sopNo: string;
  formulaContent: string; // %
  result: string;         // %
  dateTestedInitial: string; // "MM/DD/YYYY / AB"
};

// Default actives from the template
export const DEFAULT_CHEM_ACTIVES: ChemActiveRow[] = [
  { key: "ACID_VALUE",           label: "ACID VALUE",            checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "ALCONOX",              label: "ALCONOX",               checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "ALCONOX_RESIDUAL",     label: "ALCONOX RESIDUAL",      checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "ALLANTOIN",            label: "ALLANTOIN",             checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "AVOBENZONE",           label: "AVOBENZONE",            checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "BISACODYL",            label: "BISACODYL",             checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "BENZOPHENONE_3",       label: "BENZOPHENONE - 3",      checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "COLLOIDAL_OATMEAL",    label: "COLLOIDAL OATMEAL",     checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "DIMETHICONE",          label: "DIMETHICONE",           checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "DRIED_EXTRACT",        label: "DRIED EXTRACT",         checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "HOMOSALATE",           label: "HOMOSALATE",            checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "HYDRO_CORTISONE",      label: "HYDRO CORTISONE",       checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "OCTOCRYLENE",          label: "OCTOCRYLENE",           checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "OCTYL_METHOXYCINNAMATE", label: "OCTYL METHOXYCINNAMATE", checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "OCTYL_SALICYLATE",     label: "OCTYL SALICYLATE",      checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "SALICYLIC_ACID",       label: "SALICYLIC ACID",        checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "SULFUR",               label: "SULFUR",                checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "TITANIUM_DIOXIDE",     label: "TITANIUM DIOXIDE",      checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "TITER",                label: "TITER",                 checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "TOC",                  label: "TOC",                   checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "PERCENT_TRANSMISSION", label: "% TRANSMISSION",        checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "VISCOSITY",            label: "VISCOSITY",             checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "WATER_CONTENT",        label: "WATER CONTENT",         checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "ZINC_OXIDE",           label: "ZINC OXIDE",            checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
  { key: "OTHER",                label: "OTHER",                 checked: false, sopNo: "", formulaContent: "", result: "", dateTestedInitial: "" },
];
