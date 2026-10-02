import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  FileDown,
  FileText,
  Mail,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  GitBranch,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { api, apiBlob } from "../../lib/api";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import MicroMixWaterReportFormView from "../Reports/MicroMixWaterReportFormView";
import SterilityReportFormView from "../Reports/SterilityReportFormView";
import ChemistryMixReportFormView from "../Reports/ChemistryMixReportFormView";
import COAReportFormView from "../Reports/COAReportFormView";
import ApeReportFormView from "../Reports/ApeReportFormView";
import ApeValidationReportView from "../LabReports/ApeValidationReportView";
import ApeReportView from "../LabReports/ApeReportView";

type BillingInvoiceStatus = "DRAFT" | "CONFIRMED" | "SENT" | "VOID";
type BillingInvoiceKind = "REPORT" | "MANUAL";
type BillingTab = "OVERVIEW" | "INVOICES" | "UNBILLED" | "PRICING";
type PricingMethod = "INDIVIDUAL" | "COMBINATION";
type BillingViewPane = "FORM" | "REPORT" | "ATTACHMENTS";
type BillingApeReportTab = "APE_VALIDATION_REPORT" | "APE_REPORT";

type BillingViewedReport = {
  id: string;
  formType: string;
  formNumber: string;
  reportNumber?: string | null;
  status?: string | null;
  version?: number | null;
  clientCode?: string | null;
  [key: string]: any;
};
type BillingActionDialog =
  | {
      kind: "OVERRIDE";
      line: BillingLine;
      unitPrice: string;
      reason: string;
    }
  | { kind: "DELETE_LINE"; line: BillingLine }
  | { kind: "CONFIRM" }
  | { kind: "REOPEN" }
  | { kind: "REVISE" }
  | { kind: "SEND"; toEmail: string }
  | {
      kind: "SCHEDULE";
      toEmail: string;
      scheduledSendLocal: string;
    }
  | { kind: "VOID"; reason: string }
  | null;

type MoveInvoiceLinesDialog = {
  lineIds: string[];
  targetInvoiceId: string;
  targets: InvoiceRow[];
};

type MoveInvoiceLinesResponse = {
  sourceInvoice: InvoiceDetail;
  targetInvoice: InvoiceDetail;
  movedLineCount: number;
  movedExtraChargeCount: number;
  transferredAdjustment: string;
  sourceClosed: boolean;
};

type BillingManualInvoiceLine = {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
};

type ManualInvoiceDialog =
  | {
      kind: "CREATE";
      clientCode: string;
    }
  | {
      kind: "ADD_LINE";
      description: string;
      quantity: string;
      unitPrice: string;
    }
  | {
      kind: "EDIT_LINE";
      line: BillingManualInvoiceLine;
      description: string;
      quantity: string;
      unitPrice: string;
    }
  | {
      kind: "DELETE_LINE";
      line: BillingManualInvoiceLine;
    }
  | null;

type BillingInvoiceExtraCharge = {
  id: string;
  invoiceId: string;
  sourceType: string;
  sourceId: string;
  formNumber: string;
  reportNumber: string;
  name: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
};

type BillingExtraChargeSuggestion = {
  name: string;
  amount: string;
  usageCount: number;
  lastUsedAt: string;
};

type ExtraChargeDialog =
  | {
      kind: "ADD";
      sourceType: string;
      sourceId: string;
      formNumber: string;
      reportNumber: string;
      name: string;
      amount: string;
    }
  | {
      kind: "EDIT";
      charge: BillingInvoiceExtraCharge;
      name: string;
      amount: string;
    }
  | {
      kind: "DELETE";
      charge: BillingInvoiceExtraCharge;
    }
  | null;

type PricingRuleDialog =
  | {
      kind: "EDIT";
      rule: PricingRule;
      unitPrice: string;
      effectiveFrom: string;
      testLabel: string;
      itemLabel: string;
      active: boolean;
    }
  | {
      kind: "DELETE";
      rule: PricingRule;
    }
  | null;

type SummaryBucket = {
  count: number;
  total: string;
};

type BillingSummary = {
  month: string;
  timeZone: string;
  unbilled: {
    count: number;
    estimatedSubtotal: string;
  };
  billingExceptions: number;
  invoices: Record<BillingInvoiceStatus, SummaryBucket>;
};

type InvoiceRow = {
  id: string;
  activeKey?: string | null;
  invoiceNumber?: string | null;
  invoiceKind: BillingInvoiceKind;
  revisionOfInvoiceId?: string | null;
  revisionNumber?: number;
  clientCode: string;
  clientName?: string | null;
  status: BillingInvoiceStatus;
  periodStart: string;
  periodEnd: string;
  subtotal: string;
  adjustmentAmount: string;
  total: string;
  notes?: string | null;
  billingEmail?: string | null;
  confirmedAt?: string | null;
  sentAt?: string | null;
  dueDate?: string | null;
  scheduledSendAt?: string | null;
  scheduledToEmail?: string | null;
  scheduledBy?: string | null;
  scheduledAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  pdfFilename?: string | null;
  pdfCreatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    lines?: number;
    manualLines?: number;
    emails?: number;
  };
};

type InvoiceListResponse = {
  page: number;
  perPage: number;
  total: number;
  pages: number;
  items: InvoiceRow[];
};

type BillingLine = {
  id: string;
  invoiceId: string;
  sourceType: string;
  sourceId: string;
  chargeKey: string;
  activeChargeKey?: string | null;
  formType: string;
  formNumber: string;
  reportNumber: string;
  clientCode: string;
  client?: string | null;
  resultSentToClientAt?: string | null;
  billingReadyAt: string;
  testKey: string;
  testLabel?: string | null;
  itemKey?: string | null;
  itemLabel?: string | null;
  activeCount?: number | null;
  priceBasis: string;
  quantity: number;
  unitPrice: string | null;
  amount: string | null;
  pricingRuleId?: string | null;
  pricingIssue?: string | null;
  manualOverride: boolean;
  manualOverrideReason?: string | null;
  manualOverrideBy?: string | null;
  manualOverrideAt?: string | null;
  sourceSnapshot?: Record<string, any> | null;
};

type BillingEmailHistory = {
  id: string;
  status: string;
  toEmail?: string | null;
  ccEmails?: unknown;
  subject?: string | null;
  messageBody?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
  createdAt: string;
};

type InvoiceRevisionHistoryRow = {
  id: string;
  invoiceNumber?: string | null;
  status: BillingInvoiceStatus;
  revisionOfInvoiceId?: string | null;
  revisionNumber: number;
  confirmedAt?: string | null;
  sentAt?: string | null;
  total: string;
  createdAt: string;
};

type InvoiceDetail = InvoiceRow & {
  clientLegalName?: string | null;
  billingContactName?: string | null;
  billingPhone?: string | null;
  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountry?: string | null;
  paymentTerms?: string | null;
  pdfStorageKey?: string | null;
  pdfChecksum?: string | null;
  lines: BillingLine[];
  manualLines: BillingManualInvoiceLine[];
  emails: BillingEmailHistory[];
  extraCharges: BillingInvoiceExtraCharge[];
  extraChargeSuggestions?: BillingExtraChargeSuggestion[];
  revisionRootId?: string;
  revisionHistory?: InvoiceRevisionHistoryRow[];
};

type UnbilledItem = {
  sourceType: string;
  sourceId: string;
  chargeKey: string;
  formType: string;
  formNumber: string;
  reportNumber: string;
  clientCode: string;
  client?: string | null;
  resultSentToClientAt?: string | null;
  billingReadyAt: string;
  testKey: string;
  testLabel?: string | null;
  itemKey?: string | null;
  itemLabel?: string | null;
  activeCount?: number | null;
  priceBasis: string;
  quantity: number;
  unitPrice: string | null;
  amount: string | null;
  pricingRuleId?: string | null;
  pricingIssue?: string | null;
  deletionHistory?: {
    previouslyDeleted: true;
    deletionCount: number;
    lastDeletedAt: string;
    lastDeletedBy?: string | null;
    lastDeletedInvoiceId: string;
    lastDeletedInvoiceNumber?: string | null;
    lastDeletedInvoiceStatus?: BillingInvoiceStatus | null;
    canRestoreToOriginalDraft: boolean;
  } | null;
  sourceSnapshot?: Record<string, any> | null;
};

type UnbilledResponse = {
  month: string;
  timeZone: string;
  periodStart: string;
  periodEndExclusive: string;
  count: number;
  exceptionCount: number;
  estimatedSubtotal: string;
  items: UnbilledItem[];
};

function previousBillingMonthKey(periodStart?: string | null) {
  if (!periodStart) return "";

  const current = new Date(periodStart);
  if (Number.isNaN(current.getTime())) return "";

  const previous = new Date(
    Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1),
  );

  return `${previous.getUTCFullYear()}-${String(
    previous.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

function billingMonthLabel(monthKey?: string | null) {
  if (!monthKey) return "Previous month";

  const [year, monthNumber] = monthKey.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) {
    return monthKey;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

type GroupedUnbilledReport = {
  key: string;
  sourceType: string;
  sourceId: string;
  formType: string;
  formNumber: string;
  reportNumber: string;
  clientCode: string;
  client: string | null;
  billingReadyAt: string;
  description: string | null;
  sampleTypes: string[];
  items: UnbilledItem[];
  testLabels: string[];
  itemLabels: string[];
  quantity: number;
  amount: number;
  missingAmount: boolean;
  pricingIssues: UnbilledItem[];
};

type PricingRule = {
  id: string;
  clientCode: string;
  client?: string | null;
  department: "MICRO" | "CHEMISTRY";
  formType: string;
  testKey: string;
  testLabel?: string | null;
  itemKey?: string | null;
  itemLabel?: string | null;
  activeCount?: number | null;
  priceBasis: string;
  unitPrice: string | number;
  active: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type PriceForm = {
  pricingMethod: PricingMethod;

  /*
   * Used only for Combination Pricing.
   * Values are stable pathogen/active keys.
   */
  combinationItemKeys: string[];

  clientCode: string;

  /*
   * Exact report-level client/customer.
   * Blank = DEFAULT rule for the entire clientCode.
   */
  client: string;

  /*
   * Used only when Client dropdown = "Other / Enter Manually".
   */
  customClientName: string;

  department: "MICRO" | "CHEMISTRY";
  formType: string;

  /*
   * Dropdown selections.
   *
   * testKey/itemKey contain stable billing keys.
   * Labels are sent only for display/snapshot purposes.
   */
  testKey: string;
  testLabel: string;

  itemKey: string;
  itemLabel: string;

  customTestLabel: string;
  customItemLabel: string;

  unitPrice: string;
  effectiveFrom: string;
};

type PricingOption = {
  value: string;
  label: string;
};

type BillingClientOption = {
  clientCode: string;
  name?: string | null;
  legalName?: string | null;
  active?: boolean;
  billingEnabled?: boolean;
};

type ClientNameDirectoryRow = {
  id: string;
  clientCode: string;
  name: string;
  normalizedName: string;
  active: boolean;
  source: "AUTO" | "MANUAL" | string;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

type ClientNameDirectoryResponse = {
  clientCode: string;
  clientCodeName?: string | null;
  clientCodeActive?: boolean;
  discoveredCount: number;
  items: ClientNameDirectoryRow[];
};

const STATUS_OPTIONS: Array<"ALL" | BillingInvoiceStatus> = [
  "ALL",
  "DRAFT",
  "CONFIRMED",
  "SENT",
  "VOID",
];

const FORM_OPTIONS = [
  "MICRO_MIX",
  "MICRO_MIX_WATER",
  "STERILITY",
  "APE",
  "CHEMISTRY_MIX",
  "COA",
];

const CUSTOM_TEST_VALUE = "__CUSTOM_TEST__";
const CUSTOM_ITEM_VALUE = "__CUSTOM_ITEM__";
const CUSTOM_CLIENT_VALUE = "__CUSTOM_CLIENT__";
const PREVIOUS_MONTH_MANUAL_PREFIX = "Previous Month Pending: ";

type ManualLastMonthChargeDraft = {
  id: number;
  name: string;
  amount: string;
};

let manualLastMonthDraftSequence = 0;
function createManualLastMonthChargeDraft(): ManualLastMonthChargeDraft {
  manualLastMonthDraftSequence += 1;
  return { id: manualLastMonthDraftSequence, name: "", amount: "" };
}

/*
 * Production Type-of-Test values collected from existing records.
 *
 * We normalize punctuation/case into the same key format used by
 * BillingPricingService, then deduplicate equivalent spellings.
 */
const MICRO_MIX_TEST_LABELS = [
  "123",
  "AET -USP51",
  "FG",
  "MICRO",
  "Micro Testing",
  "MICRO TESTING",
  "Micro USP 61,62,60",
  "Micro USP61",
  "Micro USP62,60",
  "MICROBIAL",
  "Microbial  60",
  "Microbial  USP61,62,60",
  "Microbial - USP60",
  "Microbial - USP60 Only",
  "Microbial - USP61",
  "Microbial - USP61, 62, 60",
  "Microbial - USP62 and 60",
  "Microbial -USP61,62",
  "Microbial -USP61,62,60",
  "Microbial Test",
  "Microbial testing",
  "Microbial Testing",
  "MICROBIAL TESTING",
  "Microbial USP 60",
  "Microbial USP 60 and 62",
  "Microbial USP 61",
  "Microbial USP 61 - Membrane Filteration",
  "Microbial USP 61 62 and 60",
  "Microbial USP 61 and 62",
  "Microbial USP 61 and 62,60",
  "Microbial USP 61, 62 and 60",
  "Microbial USP 61,62",
  "Microbial USP 61,62 60",
  "Microbial USP 61,62 and 60",
  "Microbial USP 61,62,60",
  "Microbial USP 62",
  "Microbial USP 62 and 60",
  "Microbial USP 62, 60",
  "Microbial USP 62,60",
  "Microbial USP61",
  "Microbial USP61, 62",
  "Microbial USP61, 62, 60",
  "Microbial USP61,62,60",
  "Microbial USP62,60",
  "Sterility USP71",
  "TBC / TFC",
  "TBC-TFC",
  "TBC/ TBC",
  "TBC/TBC",
  "TBC/TFC",
  "TBC/TFCBG",
  "TBC/TMY",
  "TCB/TFC",
  "Total Aerobics, Yeast & Mol",
  "UPS - 61/62",
  "UPS-61/62",
  "US-61/62",
  "USP - 61/62",
  "USP <51>, Antimicrobial Preservative Efficacy test",
  "USP 61 Membrane Filtration",
  "USP 61/62",
  "USP- 61/62",
  "USP-51",
  "USP-61-62",
  "USP-61/61",
  "USP-61/62",
  "USP/61-62",
  "USP/61/62",
  "USP/6162",
];

const MICRO_WATER_TEST_LABELS = [
  "ALPHA USP-61/62",
  "APHA - USP 61/62",
  "APHA USP 61/62",
  "APHA USP-61/62",
  "APHA-USP 61/62",
  "APHA-USP-61/62",
  "Microbial  USP60, 61, 62",
  "Microbial Testing",
  "Microbial Testing USP60, 61, 62",
  "Microbial USP 61",
  "Microbial USP 61, 62 ,60",
  "Microbial USP 61,62 and 60",
  "Microbial USP60, 61, 62",
  "Microbial USP61,62,60",
  "Total Aerobics, Yeast & Mold",
  "TOTAL AEROBICS, YEAST & MOLD",
  "USP 61/62",
  "WATER MICRO",
];

const STERILITY_TEST_LABELS = ["Sterility USP 71", "Testing"];

const APE_TEST_LABELS = ["AET USP51", "TBT/TFC"];

const CHEMISTRY_TEST_OPTIONS: PricingOption[] = [
  { value: "ID", label: "ID" },
  { value: "PERCENT_ASSAY", label: "Percent Assay" },
  { value: "CONTENT_UNIFORMITY", label: "Content Uniformity" },
  { value: "OTHER", label: "Other" },
];

const MICRO_MIX_PATHOGEN_OPTIONS: PricingOption[] = [
  { value: "E_COLI", label: "E.coli" },
  { value: "P_AER", label: "P.aeruginosa" },
  { value: "S_AUR", label: "S.aureus" },
  { value: "SALM", label: "Salmonella" },
  { value: "CLOSTRIDIA", label: "Clostridia species" },
  { value: "C_ALB", label: "C.albicans" },
  { value: "B_CEP", label: "B.cepacia" },
  { value: "OTHER", label: "Other" },
];

const MICRO_WATER_PATHOGEN_OPTIONS: PricingOption[] = [
  { value: "E_COLI", label: "E.coli" },
  { value: "P_AER", label: "P.aeruginosa" },
  { value: "S_AUR", label: "S.aureus" },
  { value: "SALM", label: "Salmonella" },
  { value: "CLOSTRIDIA", label: "Clostridia species" },
  { value: "C_ALB", label: "C.albicans" },
  { value: "COLI", label: "Coliforms" },
  { value: "B_CEP", label: "B.cepacia" },
  { value: "OTHER", label: "Other" },
];

const CHEMISTRY_ACTIVE_OPTIONS: PricingOption[] = [
  { value: "ACID_VALUE", label: "ACID VALUE" },
  { value: "ALCONOX", label: "ALCONOX" },
  { value: "ALCONOX_RESIDUAL", label: "ALCONOX RESIDUAL" },
  { value: "ALLANTOIN", label: "ALLANTOIN" },
  { value: "AVOBENZONE", label: "AVOBENZONE" },
  { value: "BISACODYL", label: "BISACODYL" },
  { value: "BENZOPHENONE_3", label: "BENZOPHENONE - 3" },
  { value: "COLLOIDAL_OATMEAL", label: "COLLOIDAL OATMEAL" },
  { value: "CONTENT_UNIFORMITY", label: "CONTENT UNIFORMITY" },
  { value: "DIMETHICONE", label: "DIMETHICONE" },
  { value: "DRIED_EXTRACT", label: "DRIED EXTRACT" },
  { value: "GLYCERINE", label: "GLYCERINE" },
  { value: "HOMOSALATE", label: "HOMOSALATE" },
  { value: "HYDRO_CORTISONE", label: "HYDRO CORTISONE" },
  { value: "OCTOCRYLENE", label: "OCTOCRYLENE" },
  { value: "OCTYL_METHOXYCINNAMATE", label: "OCTYL METHOXYCINNAMATE" },
  { value: "OCTYL_SALICYLATE", label: "OCTYL SALICYLATE" },
  { value: "PHENYLEPHRINE", label: "PHENYLEPHRINE" },
  { value: "SALICYLIC_ACID", label: "SALICYLIC ACID" },
  { value: "SULFUR", label: "SULFUR" },
  { value: "TITANIUM_DIOXIDE", label: "TITANIUM DIOXIDE" },
  { value: "TITER", label: "TITER" },
  { value: "TOC", label: "TOC" },
  { value: "PERCENT_TRANSMISSION", label: "% TRANSMISSION" },
  { value: "VISCOSITY", label: "VISCOSITY" },
  { value: "ZINC_OXIDE", label: "ZINC OXIDE" },
  { value: "OTHER", label: "OTHER" },
];

const COA_ITEM_OPTIONS: PricingOption[] = [
  { value: "IDENTIFICATION", label: "Identification" },
  { value: "SPECIFIC_ROTATION", label: "Specific Rotation" },
  { value: "REFRACTIVE_INDEX", label: "Refractive Index" },
  { value: "WATER", label: "Water Content" },
  { value: "RESIDUE_ON_IGNITION", label: "Residue on Ignition" },
  { value: "ASSAY", label: "Assay" },
  { value: "PH_5", label: "PH %" },
  { value: "OTHER_1", label: "OTHER 1" },
  { value: "OTHER_2", label: "OTHER 2" },
  { value: "OTHER_3", label: "OTHER 3" },
  { value: "OTHER_4", label: "OTHER 4" },
  { value: "OTHER_5", label: "OTHER 5" },
  { value: "OTHER_6", label: "OTHER 6" },
  { value: "OTHER_7", label: "OTHER 7" },
  { value: "OTHER_8", label: "OTHER 8" },
  { value: "OTHER_9", label: "OTHER 9" },
  { value: "OTHER_10", label: "OTHER 10" },
  { value: "OTHER_11", label: "OTHER 11" },
  { value: "OTHER_12", label: "OTHER 12" },
];

function normalizePricingKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function dedupeProductionTests(labels: string[]): PricingOption[] {
  const byKey = new Map<string, PricingOption>();

  for (const label of labels) {
    const value = normalizePricingKey(label);
    if (!value || byKey.has(value)) continue;
    byKey.set(value, { value, label });
  }

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}

const TEST_OPTIONS_BY_FORM: Record<string, PricingOption[]> = {
  MICRO_MIX: dedupeProductionTests(MICRO_MIX_TEST_LABELS),
  MICRO_MIX_WATER: dedupeProductionTests(MICRO_WATER_TEST_LABELS),
  STERILITY: dedupeProductionTests(STERILITY_TEST_LABELS),
  APE: dedupeProductionTests(APE_TEST_LABELS),
  CHEMISTRY_MIX: CHEMISTRY_TEST_OPTIONS,
  COA: [{ value: "COA", label: "COA Verification" }],
};

function getTestOptions(formType: string) {
  return TEST_OPTIONS_BY_FORM[formType] ?? [];
}

function getItemOptions(formType: string) {
  if (formType === "MICRO_MIX") return MICRO_MIX_PATHOGEN_OPTIONS;
  if (formType === "MICRO_MIX_WATER") {
    return MICRO_WATER_PATHOGEN_OPTIONS;
  }
  if (formType === "CHEMISTRY_MIX") return CHEMISTRY_ACTIVE_OPTIONS;
  if (formType === "COA") return COA_ITEM_OPTIONS;
  return [] as PricingOption[];
}

function supportsPricingItem(formType: string) {
  return (
    formType === "MICRO_MIX" ||
    formType === "MICRO_MIX_WATER" ||
    formType === "CHEMISTRY_MIX" ||
    formType === "COA"
  );
}

function requiresPricingItem(formType: string) {
  return formType === "CHEMISTRY_MIX" || formType === "COA";
}

function pricingItemName(formType: string) {
  if (formType === "MICRO_MIX" || formType === "MICRO_MIX_WATER") {
    return "Pathogen";
  }

  if (formType === "COA") {
    return "COA Item";
  }

  return "Active";
}

function supportsCombinationPricing(formType: string) {
  return (
    formType === "MICRO_MIX" ||
    formType === "MICRO_MIX_WATER" ||
    formType === "CHEMISTRY_MIX"
  );
}

function buildCombinationItemKey(itemKeys: string[]) {
  const normalized = Array.from(
    new Set(
      itemKeys.map((value) => normalizePricingKey(value)).filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  if (normalized.length < 2) return "";

  return `COMBO_${normalized.join("_PLUS_")}`;
}

function isCombinationItemKey(value?: string | null) {
  return String(value ?? "").startsWith("COMBO_");
}

function isMissingPricingRule(issue?: string | null) {
  return String(issue ?? "")
    .toLowerCase()
    .includes("no pricing rule configured");
}

function unbilledClient(item: UnbilledItem) {
  return String(item.client ?? item.sourceSnapshot?.client ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function unbilledDescription(item: UnbilledItem) {
  const snapshot = item.sourceSnapshot ?? {};

  return String(
    snapshot.description ??
      snapshot.productDescription ??
      snapshot.sampleDescription ??
      "",
  ).trim();
}

function unbilledCombinationItemKeys(item: UnbilledItem) {
  const snapshot = item.sourceSnapshot ?? {};

  const rows = Array.isArray(snapshot.selectedPathogens)
    ? snapshot.selectedPathogens
    : Array.isArray(snapshot.selectedActives)
      ? snapshot.selectedActives
      : [];

  return Array.from(
    new Set(
      rows
        .map((row: any) =>
          String(row?.itemKey ?? row?.key ?? row?.value ?? "").trim(),
        )
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function billingSampleTypesFromSnapshot(snapshot?: Record<string, any> | null) {
  if (!snapshot || typeof snapshot !== "object") {
    return [] as string[];
  }

  const raw = Array.isArray(snapshot.sampleTypes)
    ? snapshot.sampleTypes
    : snapshot.sampleType != null
      ? [snapshot.sampleType]
      : [];

  return uniqueNonEmpty(
    raw.map((value: any) => {
      const text = String(value ?? "").trim();

      if (!text) {
        return "";
      }

      return text.replace(/_/g, " ");
    }),
  );
}

const BILLING_FORM_DEFAULT_STATUSES = new Set([
  "DRAFT",
  "UNDER_DRAFT_REVIEW",
  "SUBMITTED_BY_CLIENT",
  "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
  "CLIENT_NEEDS_FINAL_CORRECTION",
  "UNDER_CLIENT_PRELIMINARY_CORRECTION",
  "UNDER_CLIENT_FINAL_CORRECTION",
  "PRELIMINARY_RESUBMISSION_BY_CLIENT",
  "FINAL_RESUBMISSION_BY_CLIENT",
  "CLIENT_NEEDS_CORRECTION",
  "UNDER_CLIENT_CORRECTION",
  "RESUBMISSION_BY_CLIENT",
  "CHANGE_REQUESTED",
  "CORRECTION_REQUESTED",
  "UNDER_CHANGE_UPDATE",
  "UNDER_CORRECTION_UPDATE",
]);

const BILLING_REPORT_NOT_GENERATED_STATUSES = new Set([
  "DRAFT",
  "SUBMITTED_BY_CLIENT",
  "UNDER_DRAFT_REVIEW",
]);

function billingDefaultViewPane(report: BillingViewedReport): BillingViewPane {
  const status = String(report.status || "").toUpperCase();
  const formType = String(report.formType || "").toUpperCase();

  if (BILLING_FORM_DEFAULT_STATUSES.has(status)) {
    return "FORM";
  }

  if (formType === "MICRO_MIX" || formType === "MICRO_MIX_WATER") {
    if (status === "UNDER_CLIENT_FINAL_REVIEW" || status === "FINAL_APPROVED") {
      return "ATTACHMENTS";
    }

    return "REPORT";
  }

  if (formType === "APE") {
    if (status === "UNDER_CLIENT_REVIEW" || status === "APPROVED") {
      return "ATTACHMENTS";
    }

    return "REPORT";
  }

  if (
    formType === "STERILITY" ||
    formType === "CHEMISTRY_MIX" ||
    formType === "COA"
  ) {
    if (status === "UNDER_CLIENT_REVIEW" || status === "APPROVED") {
      return "ATTACHMENTS";
    }

    return "REPORT";
  }

  return "REPORT";
}

function billingReportNotGenerated(status?: string | null) {
  return BILLING_REPORT_NOT_GENERATED_STATUSES.has(String(status || ""));
}

function billingClassNames(
  ...values: Array<string | false | null | undefined>
) {
  return values.filter(Boolean).join(" ");
}

function BillingReportNotGeneratedMessage({
  report,
}: {
  report: BillingViewedReport;
}) {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-8 py-10 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-2xl">
          📄
        </div>

        <h3 className="text-lg font-semibold text-slate-800">
          Report not generated
        </h3>

        <p className="mt-2 text-sm text-slate-600">
          This report is not available yet because the form is currently in{" "}
          <span className="font-semibold">
            {nice(String(report.status || ""))}
          </span>
          .
        </p>

        <p className="mt-3 text-xs text-slate-500">
          Form #{report.formNumber || "-"}
        </p>
      </div>
    </div>
  );
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
  );
}

function groupUnbilledByReport(items: UnbilledItem[]): GroupedUnbilledReport[] {
  const groups = new Map<string, GroupedUnbilledReport>();

  for (const item of items) {
    const key = `${item.sourceType}:${item.sourceId}`;

    let group = groups.get(key);

    if (!group) {
      group = {
        key,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        formType: item.formType,
        formNumber: item.formNumber,
        reportNumber: item.reportNumber,
        clientCode: item.clientCode,
        client: unbilledClient(item) || null,
        billingReadyAt: item.billingReadyAt,
        description: unbilledDescription(item) || null,
        sampleTypes: [],
        items: [],
        testLabels: [],
        itemLabels: [],
        quantity: 0,
        amount: 0,
        missingAmount: false,
        pricingIssues: [],
      };

      groups.set(key, group);
    }

    group.items.push(item);

    if (!group.description) {
      group.description = unbilledDescription(item) || null;
    }

    group.quantity += Number(item.quantity ?? 0) || 0;

    if (item.amount == null) {
      group.missingAmount = true;
    } else {
      const amount = Number(item.amount);

      if (Number.isFinite(amount)) {
        group.amount += amount;
      }
    }

    if (item.pricingIssue) {
      group.pricingIssues.push(item);
    }
  }

  for (const group of groups.values()) {
    group.sampleTypes = uniqueNonEmpty(
      group.items.flatMap((item) =>
        billingSampleTypesFromSnapshot(item.sourceSnapshot),
      ),
    );

    group.testLabels = uniqueNonEmpty(
      group.items.map((item) => item.testLabel || nice(item.testKey)),
    );

    group.itemLabels = uniqueNonEmpty(
      group.items.map((item) => {
        if (item.itemLabel) return item.itemLabel;
        if (item.itemKey) return nice(item.itemKey);

        if (item.activeCount != null) {
          return `${item.activeCount} active${
            item.activeCount === 1 ? "" : "s"
          }`;
        }

        return null;
      }),
    );
  }

  return [...groups.values()].sort((a, b) => {
    const readyDiff =
      new Date(a.billingReadyAt).getTime() -
      new Date(b.billingReadyAt).getTime();

    if (readyDiff !== 0) return readyDiff;

    return a.formNumber.localeCompare(b.formNumber);
  });
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayDateInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function nextPricingEffectiveDate(currentEffectiveFrom?: string | null) {
  const today = todayDateInput();

  if (!currentEffectiveFrom) {
    return today;
  }

  const current = new Date(currentEffectiveFrom);

  if (Number.isNaN(current.getTime())) {
    return today;
  }

  current.setUTCDate(current.getUTCDate() + 1);

  const nextDay = `${current.getUTCFullYear()}-${String(
    current.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`;

  return nextDay > today ? nextDay : today;
}

function money(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "$0.00";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function nice(value?: string | null) {
  if (!value) return "-";
  return value.replace(/_/g, " ");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function toDateTimeLocal(value?: string | Date | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);

  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function statusClass(status: BillingInvoiceStatus) {
  switch (status) {
    case "DRAFT":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "CONFIRMED":
      return "bg-blue-50 text-blue-800 ring-blue-200";
    case "SENT":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "VOID":
      return "bg-rose-50 text-rose-800 ring-rose-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 ${
        dark
          ? "border-slate-300 border-t-slate-700"
          : "border-white/60 border-t-white"
      }`}
      aria-hidden="true"
    />
  );
}

function extractMessage(error: any) {
  if (typeof error?.body?.message === "string") return error.body.message;
  if (typeof error?.message === "string") return error.message;
  return "Something went wrong";
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "success";
  type?: "button" | "submit";
  className?: string;
}) {
  const colors =
    variant === "primary"
      ? "bg-[var(--brand)] text-white hover:opacity-90"
      : variant === "danger"
        ? "bg-rose-600 text-white hover:bg-rose-700"
        : variant === "success"
          ? "bg-emerald-600 text-white hover:bg-emerald-700"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${colors} ${className}`}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  title,
  value,
  sub,
  tone = "default",
  onClick,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "warning" | "success" | "danger";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50/40"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50/40"
        : tone === "danger"
          ? "border-rose-200 bg-rose-50/40"
          : "border-slate-200 bg-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left shadow-sm transition ${
        onClick ? "hover:-translate-y-0.5 hover:shadow-md" : ""
      } ${toneClass}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {sub != null && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </button>
  );
}

type BillingFilterState = {
  month: string;
  clientCode: string;
  invoiceStatus: "ALL" | BillingInvoiceStatus;
  departmentFilter: "ALL" | "MICRO" | "CHEMISTRY";
  formTypeFilter: string;
  testFilter: string;
  itemFilter: string;
  resultSentFrom: string;
  resultSentTo: string;
  page: number;
  perPage: number;
};

function defaultBillingFilters(): BillingFilterState {
  return {
    month: currentMonthKey(),
    clientCode: "",
    invoiceStatus: "ALL",
    departmentFilter: "ALL",
    formTypeFilter: "ALL",
    testFilter: "ALL",
    itemFilter: "ALL",
    resultSentFrom: "",
    resultSentTo: "",
    page: 1,
    perPage: 25,
  };
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getInitialBillingFilters(
  searchParams: URLSearchParams,
  storageKey: string | null,
): BillingFilterState {
  const defaults = defaultBillingFilters();

  try {
    const hasUrlFilters = [
      "billingMonth",
      "billingClient",
      "billingStatus",
      "billingDepartment",
      "billingForm",
      "billingTest",
      "billingItem",
      "billingResultSentFrom",
      "billingResultSentTo",
      "billingPage",
      "billingPerPage",
    ].some((key) => searchParams.has(key));

    if (hasUrlFilters) {
      const invoiceStatus = searchParams.get("billingStatus");
      const departmentFilter = searchParams.get("billingDepartment");

      return {
        ...defaults,
        month: searchParams.get("billingMonth") || defaults.month,
        clientCode: searchParams.get("billingClient") || defaults.clientCode,
        invoiceStatus:
          invoiceStatus === "DRAFT" ||
          invoiceStatus === "CONFIRMED" ||
          invoiceStatus === "SENT" ||
          invoiceStatus === "VOID"
            ? invoiceStatus
            : "ALL",
        departmentFilter:
          departmentFilter === "MICRO" || departmentFilter === "CHEMISTRY"
            ? departmentFilter
            : "ALL",
        formTypeFilter:
          searchParams.get("billingForm") || defaults.formTypeFilter,
        testFilter: searchParams.get("billingTest") || defaults.testFilter,
        itemFilter: searchParams.get("billingItem") || defaults.itemFilter,
        resultSentFrom:
          searchParams.get("billingResultSentFrom") || defaults.resultSentFrom,
        resultSentTo:
          searchParams.get("billingResultSentTo") || defaults.resultSentTo,
        page: parsePositiveInt(searchParams.get("billingPage"), defaults.page),
        perPage: parsePositiveInt(
          searchParams.get("billingPerPage"),
          defaults.perPage,
        ),
      };
    }

    if (storageKey) {
      const raw = localStorage.getItem(storageKey);

      if (raw) {
        const saved = JSON.parse(raw) as Partial<BillingFilterState>;

        return {
          ...defaults,
          ...saved,
          month: saved.month || defaults.month,
          clientCode: String(saved.clientCode ?? ""),
          invoiceStatus:
            saved.invoiceStatus === "DRAFT" ||
            saved.invoiceStatus === "CONFIRMED" ||
            saved.invoiceStatus === "SENT" ||
            saved.invoiceStatus === "VOID"
              ? saved.invoiceStatus
              : "ALL",
          departmentFilter:
            saved.departmentFilter === "MICRO" ||
            saved.departmentFilter === "CHEMISTRY"
              ? saved.departmentFilter
              : "ALL",
          formTypeFilter: String(
            saved.formTypeFilter ?? defaults.formTypeFilter,
          ),
          testFilter: String(saved.testFilter ?? defaults.testFilter),
          itemFilter: String(saved.itemFilter ?? defaults.itemFilter),
          resultSentFrom: String(
            saved.resultSentFrom ?? defaults.resultSentFrom,
          ),
          resultSentTo: String(saved.resultSentTo ?? defaults.resultSentTo),
          page:
            typeof saved.page === "number" && saved.page > 0
              ? saved.page
              : defaults.page,
          perPage:
            typeof saved.perPage === "number" && saved.perPage > 0
              ? saved.perPage
              : defaults.perPage,
        };
      }
    }
  } catch {
    // Ignore malformed URL/localStorage filter data and use defaults.
  }

  return defaults;
}

export default function BillingDashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const role = String((user as any)?.role ?? "");
  const isManager = role === "ADMIN" || role === "SYSTEMADMIN";

  const userKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid ||
    null;

  const filterStorageKeyForTab = useCallback(
    (targetTab: BillingTab) =>
      userKey ? `billingDashboardFilters:${targetTab}:user:${userKey}` : null,
    [userKey],
  );

  const LEGACY_FILTER_STORAGE_KEY = userKey
    ? `billingDashboardFilters:user:${userKey}`
    : null;

  const OVERVIEW_FILTER_STORAGE_KEY = filterStorageKeyForTab("OVERVIEW");

  /*
   * Start Overview from its own saved filters. For users upgrading
   * from the older shared-filter UI, fall back to the legacy saved
   * filter set once so their existing choices are not lost.
   */
  const initialFilters = getInitialBillingFilters(
    searchParams,
    OVERVIEW_FILTER_STORAGE_KEY || LEGACY_FILTER_STORAGE_KEY,
  );

  const [tab, setTab] = useState<BillingTab>("OVERVIEW");
  const [month, setMonth] = useState(initialFilters.month);
  const [clientCode, setClientCode] = useState(initialFilters.clientCode);
  const [invoiceStatus, setInvoiceStatus] = useState<
    "ALL" | BillingInvoiceStatus
  >(initialFilters.invoiceStatus);
  const [departmentFilter, setDepartmentFilter] = useState<
    "ALL" | "MICRO" | "CHEMISTRY"
  >(initialFilters.departmentFilter);
  const [formTypeFilter, setFormTypeFilter] = useState(
    initialFilters.formTypeFilter,
  );
  const [testFilter, setTestFilter] = useState(initialFilters.testFilter);
  const [itemFilter, setItemFilter] = useState(initialFilters.itemFilter);
  const [resultSentFrom, setResultSentFrom] = useState(
    initialFilters.resultSentFrom,
  );
  const [resultSentTo, setResultSentTo] = useState(initialFilters.resultSentTo);
  const [page, setPage] = useState(initialFilters.page);
  const [perPage, setPerPage] = useState(initialFilters.perPage);
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  // Dashboard-style read-only report viewer used by Billing View.
  const [billingViewedReport, setBillingViewedReport] =
    useState<BillingViewedReport | null>(null);

  const [billingViewPane, setBillingViewPane] =
    useState<BillingViewPane>("REPORT");

  const [billingViewLoadingKey, setBillingViewLoadingKey] = useState<
    string | null
  >(null);

  const [billingApeReportTab, setBillingApeReportTab] =
    useState<BillingApeReportTab>("APE_VALIDATION_REPORT");

  const [billingApeChildReports, setBillingApeChildReports] = useState<
    Record<string, any>
  >({});

  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceListResponse | null>(null);
  const [unbilled, setUnbilled] = useState<UnbilledResponse | null>(null);
  const [prices, setPrices] = useState<PricingRule[]>([]);
  const [billingClients, setBillingClients] = useState<BillingClientOption[]>(
    [],
  );

  const [pricingClientDirectory, setPricingClientDirectory] = useState<
    ClientNameDirectoryRow[]
  >([]);

  const [pricingClientDirectoryLoading, setPricingClientDirectoryLoading] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);

  const [lastMonthPending, setLastMonthPending] =
    useState<UnbilledResponse | null>(null);
  const [lastMonthPendingLoading, setLastMonthPendingLoading] = useState(false);
  const [lastMonthPendingError, setLastMonthPendingError] = useState<
    string | null
  >(null);
  const [selectedLastMonthSourceKeys, setSelectedLastMonthSourceKeys] =
    useState<string[]>([]);
  const [showLastMonthPicker, setShowLastMonthPicker] = useState(false);
  const [showManualLastMonthCharge, setShowManualLastMonthCharge] =
    useState(false);
  const [manualLastMonthCharges, setManualLastMonthCharges] = useState<
    ManualLastMonthChargeDraft[]
  >(() => [createManualLastMonthChargeDraft()]);
  const [editingManualLastMonthLineId, setEditingManualLastMonthLineId] =
    useState<string | null>(null);
  const [editManualLastMonthName, setEditManualLastMonthName] = useState("");
  const [editManualLastMonthAmount, setEditManualLastMonthAmount] =
    useState("");

  const [draftAdjustment, setDraftAdjustment] = useState("0.00");
  const [draftNotes, setDraftNotes] = useState("");

  const [actionDialog, setActionDialog] = useState<BillingActionDialog>(null);

  const [selectedMoveLineIds, setSelectedMoveLineIds] = useState<string[]>([]);
  const [moveInvoiceLinesDialog, setMoveInvoiceLinesDialog] =
    useState<MoveInvoiceLinesDialog | null>(null);

  const [pricingRuleDialog, setPricingRuleDialog] =
    useState<PricingRuleDialog>(null);
  const [extraChargeDialog, setExtraChargeDialog] =
    useState<ExtraChargeDialog>(null);

  const [manualInvoiceDialog, setManualInvoiceDialog] =
    useState<ManualInvoiceDialog>(null);

  const [priceForm, setPriceForm] = useState<PriceForm>({
    pricingMethod: "INDIVIDUAL",
    combinationItemKeys: [],

    clientCode: "",
    client: "",
    customClientName: "",
    department: "MICRO",
    formType: "MICRO_MIX",

    testKey: "",
    testLabel: "",

    itemKey: "",
    itemLabel: "",

    customTestLabel: "",
    customItemLabel: "",

    unitPrice: "",
    effectiveFrom: `${currentMonthKey()}-01`,
  });

  const [pricingPrefillMessage, setPricingPrefillMessage] = useState<
    string | null
  >(null);

  const loadPricingClientDirectory = useCallback(
    async (clientCodeInput: string) => {
      if (!isManager) {
        return [] as ClientNameDirectoryRow[];
      }

      const code = String(clientCodeInput ?? "")
        .trim()
        .toUpperCase();

      if (!code) {
        return [] as ClientNameDirectoryRow[];
      }

      const response = await api<ClientNameDirectoryResponse>(
        `/billing/client-names?clientCode=${encodeURIComponent(code)}`,
      );

      return Array.isArray(response?.items) ? response.items : [];
    },
    [isManager],
  );

  const refreshPricingClientDirectory = useCallback(
    async (clientCodeInput = priceForm.clientCode) => {
      const code = String(clientCodeInput ?? "")
        .trim()
        .toUpperCase();

      if (!code) {
        setPricingClientDirectory([]);
        return;
      }

      setPricingClientDirectoryLoading(true);

      try {
        const rows = await loadPricingClientDirectory(code);

        setPricingClientDirectory(rows);
      } catch (error: any) {
        setPricingClientDirectory([]);

        toast.error(extractMessage(error));
      } finally {
        setPricingClientDirectoryLoading(false);
      }
    },
    [loadPricingClientDirectory, priceForm.clientCode],
  );

  /*
   * Centralized client-name dropdown.
   *
   * GET /billing/client-names automatically syncs names from
   * existing reports before returning this list.
   */
  useEffect(() => {
    if (!isManager || tab !== "PRICING") {
      return;
    }

    const code = priceForm.clientCode.trim().toUpperCase();

    if (!code) {
      setPricingClientDirectory([]);
      return;
    }

    refreshPricingClientDirectory(code);
  }, [isManager, tab, priceForm.clientCode, refreshPricingClientDirectory]);

  const pricingClientOptions = useMemo(() => {
    const byIdentity = new Map<string, string>();

    const add = (value?: string | null) => {
      const label = String(value ?? "")
        .trim()
        .replace(/\s+/g, " ");

      if (!label) {
        return;
      }

      const identity = label.toUpperCase();

      if (!byIdentity.has(identity)) {
        byIdentity.set(identity, label);
      }
    };

    for (const row of pricingClientDirectory) {
      add(row.name);
    }

    /*
     * Keep an Unbilled-prefilled client visible immediately
     * while the backend directory request is still loading.
     */
    if (priceForm.client && priceForm.client !== CUSTOM_CLIENT_VALUE) {
      add(priceForm.client);
    }

    return [...byIdentity.values()].sort((a, b) => a.localeCompare(b));
  }, [pricingClientDirectory, priceForm.client]);

  const pricingTestOptions = useMemo(
    () => getTestOptions(priceForm.formType),
    [priceForm.formType],
  );

  const pricingItemOptions = useMemo(
    () => getItemOptions(priceForm.formType),
    [priceForm.formType],
  );

  const pricingSupportsItem = supportsPricingItem(priceForm.formType);

  const pricingRequiresItem = requiresPricingItem(priceForm.formType);

  const pricingSupportsCombination = supportsCombinationPricing(
    priceForm.formType,
  );

  const combinationPricingPreview = useMemo(() => {
    if (
      priceForm.pricingMethod !== "COMBINATION" ||
      !pricingSupportsCombination
    ) {
      return null;
    }

    const selectedOptions = pricingItemOptions
      .filter(
        (option) =>
          option.value !== "OTHER" &&
          priceForm.combinationItemKeys.includes(option.value),
      )
      .sort((a, b) => a.value.localeCompare(b.value));

    const itemKeys = selectedOptions.map((option) => option.value);
    const itemKey = buildCombinationItemKey(itemKeys);
    const itemLabel = selectedOptions.map((option) => option.label).join(" + ");

    let testKey = priceForm.testKey;
    if (testKey === CUSTOM_TEST_VALUE) {
      testKey = normalizePricingKey(priceForm.customTestLabel);
    }

    const clientCodeValue = priceForm.clientCode.trim().toUpperCase();

    const clientValue =
      priceForm.client === CUSTOM_CLIENT_VALUE
        ? priceForm.customClientName.trim().replace(/\s+/g, " ")
        : priceForm.client.trim().replace(/\s+/g, " ");

    const effectiveAt = new Date(
      `${priceForm.effectiveFrom || todayDateInput()}T00:00:00`,
    );

    const isEffective = (rule: PricingRule) => {
      const from = new Date(rule.effectiveFrom);
      const to = rule.effectiveTo ? new Date(rule.effectiveTo) : null;

      if (Number.isNaN(effectiveAt.getTime()) || Number.isNaN(from.getTime())) {
        return true;
      }

      if (from > effectiveAt) return false;
      if (to && to <= effectiveAt) return false;

      return true;
    };

    const resolveRule = (ruleItemKey: string) => {
      const matching = prices
        .filter(
          (rule) =>
            rule.active &&
            rule.clientCode === clientCodeValue &&
            rule.formType === priceForm.formType &&
            rule.testKey === testKey &&
            rule.itemKey === ruleItemKey &&
            isEffective(rule),
        )
        .sort(
          (a, b) =>
            new Date(b.effectiveFrom).getTime() -
            new Date(a.effectiveFrom).getTime(),
        );

      if (clientValue) {
        const exact = matching.find(
          (rule) =>
            String(rule.client ?? "")
              .trim()
              .replace(/\s+/g, " ")
              .toUpperCase() === clientValue.toUpperCase(),
        );

        if (exact) return exact;
      }

      return matching.find((rule) => !rule.client) ?? null;
    };

    const individual = selectedOptions.map((option) => ({
      option,
      rule: resolveRule(option.value),
    }));

    const individualTotal = individual.reduce(
      (sum, row) => (row.rule ? sum + Number(row.rule.unitPrice ?? 0) : sum),
      0,
    );

    const missingIndividual = individual
      .filter((row) => !row.rule)
      .map((row) => row.option.label);

    const combinationRule = itemKey ? resolveRule(itemKey) : null;

    return {
      selectedOptions,
      itemKey,
      itemLabel,
      individualTotal,
      missingIndividual,
      combinationRule,
    };
  }, [
    priceForm.pricingMethod,
    priceForm.combinationItemKeys,
    priceForm.clientCode,
    priceForm.client,
    priceForm.customClientName,
    priceForm.formType,
    priceForm.testKey,
    priceForm.customTestLabel,
    priceForm.effectiveFrom,
    pricingSupportsCombination,
    pricingItemOptions,
    prices,
  ]);

  const individualPricingPreview = useMemo(() => {
    if (
      priceForm.pricingMethod !== "INDIVIDUAL" ||
      !priceForm.clientCode.trim()
    ) {
      return null;
    }

    let testKey = priceForm.testKey;

    if (testKey === CUSTOM_TEST_VALUE) {
      testKey = normalizePricingKey(priceForm.customTestLabel);
    }

    if (!testKey) {
      return null;
    }

    let itemKey = priceForm.itemKey || "";

    if (itemKey === CUSTOM_ITEM_VALUE) {
      const customLabel = priceForm.customItemLabel.trim();

      itemKey = customLabel ? `OTHER_${normalizePricingKey(customLabel)}` : "";
    }

    if (pricingRequiresItem && !itemKey) {
      return null;
    }

    const clientCodeValue = priceForm.clientCode.trim().toUpperCase();

    const clientValue =
      priceForm.client === CUSTOM_CLIENT_VALUE
        ? priceForm.customClientName.trim().replace(/\s+/g, " ")
        : priceForm.client.trim().replace(/\s+/g, " ");

    const effectiveAt = new Date(
      `${priceForm.effectiveFrom || todayDateInput()}T00:00:00`,
    );

    const matching = prices
      .filter((rule) => {
        if (!rule.active) return false;
        if (rule.clientCode !== clientCodeValue) return false;
        if (rule.formType !== priceForm.formType) return false;
        if (rule.testKey !== testKey) return false;

        const ruleItemKey = rule.itemKey ?? "";

        if (ruleItemKey !== itemKey) return false;

        const from = new Date(rule.effectiveFrom);

        const to = rule.effectiveTo ? new Date(rule.effectiveTo) : null;

        if (
          !Number.isNaN(effectiveAt.getTime()) &&
          !Number.isNaN(from.getTime())
        ) {
          if (from > effectiveAt) return false;
          if (to && to <= effectiveAt) return false;
        }

        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.effectiveFrom).getTime() -
          new Date(a.effectiveFrom).getTime(),
      );

    let rule: PricingRule | null = null;

    if (clientValue) {
      rule =
        matching.find(
          (candidate) =>
            String(candidate.client ?? "")
              .trim()
              .replace(/\s+/g, " ")
              .toUpperCase() === clientValue.toUpperCase(),
        ) ?? null;
    }

    if (!rule) {
      rule = matching.find((candidate) => !candidate.client) ?? null;
    }

    return {
      rule,
      itemKey,
    };
  }, [
    priceForm.pricingMethod,
    priceForm.clientCode,
    priceForm.client,
    priceForm.customClientName,
    priceForm.formType,
    priceForm.testKey,
    priceForm.customTestLabel,
    priceForm.itemKey,
    priceForm.customItemLabel,
    priceForm.effectiveFrom,
    pricingRequiresItem,
    prices,
  ]);

  function currentBillingFilterState(): BillingFilterState {
    return {
      month,
      clientCode,
      invoiceStatus,
      departmentFilter,
      formTypeFilter,
      testFilter,
      itemFilter,
      resultSentFrom,
      resultSentTo,
      page,
      perPage,
    };
  }

  function applyBillingFilterState(next: BillingFilterState) {
    setMonth(next.month);
    setClientCode(next.clientCode);
    setInvoiceStatus(next.invoiceStatus);
    setDepartmentFilter(next.departmentFilter);
    setFormTypeFilter(next.formTypeFilter);
    setTestFilter(next.testFilter);
    setItemFilter(next.itemFilter);
    setResultSentFrom(next.resultSentFrom);
    setResultSentTo(next.resultSentTo);
    setPage(next.page);
    setPerPage(next.perPage);
  }

  function saveBillingFiltersForTab(
    targetTab: BillingTab,
    state: BillingFilterState,
  ) {
    const storageKey = filterStorageKeyForTab(targetTab);
    if (!storageKey) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore storage errors in restricted browser contexts.
    }
  }

  function loadBillingFiltersForTab(targetTab: BillingTab) {
    return getInitialBillingFilters(
      new URLSearchParams(),
      filterStorageKeyForTab(targetTab),
    );
  }

  function switchBillingTab(
    targetTab: BillingTab,
    overrides: Partial<BillingFilterState> = {},
  ) {
    /*
     * Save the tab we are leaving BEFORE applying the target tab's
     * filters. This is what keeps Unbilled filters from being replaced
     * when Set Price pre-fills Pricing filters.
     */
    saveBillingFiltersForTab(tab, currentBillingFilterState());

    const targetState: BillingFilterState = {
      ...loadBillingFiltersForTab(targetTab),
      ...overrides,
    };

    saveBillingFiltersForTab(targetTab, targetState);
    applyBillingFilterState(targetState);
    setTab(targetTab);
  }

  /*
   * Initial hydration follows the reference dashboard behavior:
   * URL values take priority, then the saved per-user Overview values.
   */
  useEffect(() => {
    const next = getInitialBillingFilters(
      searchParams,
      OVERVIEW_FILTER_STORAGE_KEY || LEGACY_FILTER_STORAGE_KEY,
    );

    applyBillingFilterState(next);
    setFiltersHydrated(true);
    // Rehydrate only when the authenticated user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [OVERVIEW_FILTER_STORAGE_KEY, LEGACY_FILTER_STORAGE_KEY]);

  /* Save the active tab independently. */
  useEffect(() => {
    if (!filtersHydrated) return;

    saveBillingFiltersForTab(tab, currentBillingFilterState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filtersHydrated,
    tab,
    month,
    clientCode,
    invoiceStatus,
    departmentFilter,
    formTypeFilter,
    testFilter,
    itemFilter,
    resultSentFrom,
    resultSentTo,
    page,
    perPage,
    filterStorageKeyForTab,
  ]);

  /* Keep the active tab's selections reflected in the URL. */
  useEffect(() => {
    if (!filtersHydrated) return;

    const next = new URLSearchParams(searchParams);
    const defaults = defaultBillingFilters();

    const setOrDelete = (key: string, value: string, defaultValue: string) => {
      if (value && value !== defaultValue) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    };

    setOrDelete("billingMonth", month, defaults.month);
    setOrDelete(
      "billingClient",
      clientCode.trim().toUpperCase(),
      defaults.clientCode,
    );
    setOrDelete("billingStatus", invoiceStatus, defaults.invoiceStatus);
    setOrDelete(
      "billingDepartment",
      departmentFilter,
      defaults.departmentFilter,
    );
    setOrDelete("billingForm", formTypeFilter, defaults.formTypeFilter);
    setOrDelete("billingTest", testFilter, defaults.testFilter);
    setOrDelete("billingItem", itemFilter, defaults.itemFilter);
    setOrDelete(
      "billingResultSentFrom",
      resultSentFrom,
      defaults.resultSentFrom,
    );
    setOrDelete("billingResultSentTo", resultSentTo, defaults.resultSentTo);

    if (page !== defaults.page) {
      next.set("billingPage", String(page));
    } else {
      next.delete("billingPage");
    }

    if (perPage !== defaults.perPage) {
      next.set("billingPerPage", String(perPage));
    } else {
      next.delete("billingPerPage");
    }

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    filtersHydrated,
    month,
    clientCode,
    invoiceStatus,
    departmentFilter,
    formTypeFilter,
    testFilter,
    itemFilter,
    resultSentFrom,
    resultSentTo,
    page,
    perPage,
    searchParams,
    setSearchParams,
  ]);

  const managerTabs: BillingTab[] = isManager
    ? ["OVERVIEW", "UNBILLED", "INVOICES", "PRICING"]
    : ["OVERVIEW", "UNBILLED", "INVOICES"];

  const baseQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("month", month);
    if (clientCode.trim()) {
      params.set("clientCode", clientCode.trim().toUpperCase());
    }
    return params;
  }, [month, clientCode]);

  const loadSummary = useCallback(async () => {
    const params = new URLSearchParams(baseQuery);
    return api<BillingSummary>(`/billing/summary?${params.toString()}`);
  }, [baseQuery]);

  const loadInvoices = useCallback(async () => {
    const params = new URLSearchParams(baseQuery);
    if (invoiceStatus !== "ALL") params.set("status", invoiceStatus);
    params.set("page", String(page));
    params.set("perPage", String(perPage));

    return api<InvoiceListResponse>(`/billing/invoices?${params.toString()}`);
  }, [baseQuery, invoiceStatus, page, perPage]);

  const loadUnbilled = useCallback(async () => {
    const params = new URLSearchParams(baseQuery);
    return api<UnbilledResponse>(`/billing/unbilled?${params.toString()}`);
  }, [baseQuery]);

  const loadPriceRules = useCallback(async () => {
    if (!isManager) return [] as PricingRule[];

    const response = await api<any>("/billing/prices");

    if (Array.isArray(response)) return response as PricingRule[];
    if (Array.isArray(response?.items)) return response.items as PricingRule[];
    if (Array.isArray(response?.rows)) return response.rows as PricingRule[];

    return [];
  }, [isManager]);

  const loadBillingClients = useCallback(async () => {
    if (!isManager) return [] as BillingClientOption[];

    const response = await api<any>("/client-details");

    const rows: BillingClientOption[] = Array.isArray(response)
      ? response
      : Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.rows)
          ? response.rows
          : [];

    return rows
      .filter((row) => row?.clientCode)
      .map((row) => ({
        ...row,
        clientCode: String(row.clientCode).trim().toUpperCase(),
      }))
      .sort((a, b) => a.clientCode.localeCompare(b.clientCode));
  }, [isManager]);

  const refreshBillingClients = useCallback(async () => {
    if (!isManager) return;

    try {
      setBillingClients(await loadBillingClients());
    } catch (error: any) {
      toast.error(extractMessage(error));
    }
  }, [isManager, loadBillingClients]);

  function closeBillingReportView() {
    setBillingViewedReport(null);
    setBillingViewPane("REPORT");
    setBillingApeReportTab("APE_VALIDATION_REPORT");
  }

  async function openBillingReport(row: {
    sourceType?: string;
    sourceId: string;
    formType: string;
    formNumber?: string;
    reportNumber?: string;
  }) {
    const sourceId = String(row.sourceId ?? "").trim();

    if (!sourceId) {
      toast.error("Report ID is unavailable");
      return;
    }

    const loadingKey = `${row.sourceType ?? ""}:${sourceId}`;
    setBillingViewLoadingKey(loadingKey);

    try {
      const isChemistry =
        row.sourceType === "CHEMISTRY_REPORT" ||
        row.formType === "CHEMISTRY_MIX" ||
        row.formType === "COA";

      const fullReport = await api<any>(
        isChemistry
          ? `/chemistry-reports/${encodeURIComponent(sourceId)}`
          : `/reports/${encodeURIComponent(sourceId)}`,
        {
          method: "GET",
        },
      );

      const report: BillingViewedReport = {
        ...fullReport,
        id: fullReport?.id || sourceId,
        formType: fullReport?.formType || row.formType,
        formNumber: fullReport?.formNumber || row.formNumber || "",
        reportNumber: fullReport?.reportNumber ?? row.reportNumber ?? "",
      };

      setBillingViewPane(billingDefaultViewPane(report));

      if (report.formType === "APE") {
        setBillingApeReportTab("APE_VALIDATION_REPORT");
      }

      setBillingViewedReport(report);
    } catch (error: any) {
      console.error("Failed to open billing report viewer", error);

      toast.error(error?.message || "Failed to load report");
    } finally {
      setBillingViewLoadingKey(null);
    }
  }

  function billingApeChildKey(
    parentId: string,
    reportType: BillingApeReportTab,
  ) {
    return `${parentId}:${reportType}`;
  }

  function makeBillingApeChildReport(
    parent: BillingViewedReport,
    reportType: BillingApeReportTab,
  ) {
    const saved =
      billingApeChildReports[billingApeChildKey(parent.id, reportType)];

    if (saved) {
      return {
        ...parent,
        ...saved,
        id: saved.id,
        reportType,
        parentReportId: parent.id,
        parentFormNumber: parent.formNumber,
        parentReportNumber: parent.reportNumber,
        parentStatus: parent.status,
        workflowStatus: parent.status,
        parentVersion: parent.version ?? 0,
        childStatus: saved.status,
        childVersion: saved.version,
        status: parent.status,
      };
    }

    return {
      ...parent,
      id: null,
      parentReportId: parent.id,
      reportType,
      parentFormNumber: parent.formNumber,
      parentReportNumber: parent.reportNumber,
      parentStatus: parent.status,
      workflowStatus: parent.status,
      parentVersion: parent.version ?? 0,
      childStatus: "DRAFT",
      childVersion: 0,
      status: parent.status || "UNDER_TESTING_REVIEW",
      reportNumber: "",
      formType: undefined,
      clientCode:
        parent.clientCode ||
        String(parent.formNumber || "").split("-")[0] ||
        "",
      dateSent: parent.dateSent ?? "",
      typeOfTest: parent.typeOfTest ?? "APE",
      sampleType: parent.sampleType ?? "",
      formulaNo: parent.formulaNo ?? "",
      description: parent.description ?? "",
      lotNo: parent.lotNo ?? "",
      manufactureDate: parent.manufactureDate ?? "",
      testSopNo: parent.testSopNo ?? "",
      testReference: parent.testReference ?? "USP <51> CURRENT",
      dateTested: parent.dateTested ?? "",
      dateCompleted: parent.dateCompleted ?? "",
    };
  }

  function renderBillingApeReportTabs(parent: BillingViewedReport) {
    const validationChild = makeBillingApeChildReport(
      parent,
      "APE_VALIDATION_REPORT",
    );

    const apeChild = makeBillingApeChildReport(parent, "APE_REPORT");

    const tabClass = (tab: BillingApeReportTab) =>
      billingClassNames(
        "rounded-lg px-3 py-1.5 text-sm font-semibold border transition",
        billingApeReportTab === tab
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 hover:bg-slate-50",
      );

    return (
      <div>
        <div className="no-print mx-auto mb-4 rounded-xl border bg-white px-3 py-2">
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className={tabClass("APE_VALIDATION_REPORT")}
              onClick={() => setBillingApeReportTab("APE_VALIDATION_REPORT")}
            >
              APE Validation Report
            </button>

            <button
              type="button"
              className={tabClass("APE_REPORT")}
              onClick={() => setBillingApeReportTab("APE_REPORT")}
            >
              APE Report
            </button>
          </div>
        </div>

        {billingApeReportTab === "APE_VALIDATION_REPORT" && (
          <ApeValidationReportView
            key={
              validationChild.id ?? `${parent.id}:APE_VALIDATION_REPORT:view`
            }
            report={validationChild}
            embedded={true}
            pageMode="VIEW"
            forcePageReadOnly={true}
            hideTopActions={true}
            hideBottomActions={true}
            onClose={() => {}}
          />
        )}

        {billingApeReportTab === "APE_REPORT" && (
          <ApeReportView
            key={apeChild.id ?? `${parent.id}:APE_REPORT:view`}
            report={apeChild}
            embedded={true}
            pageMode="VIEW"
            forcePageReadOnly={true}
            hideTopActions={true}
            hideBottomActions={true}
            onClose={() => {}}
          />
        )}
      </div>
    );
  }

  function renderBillingViewedReport(report: BillingViewedReport) {
    if (
      billingViewPane === "REPORT" &&
      billingReportNotGenerated(report.status)
    ) {
      return <BillingReportNotGeneratedMessage report={report} />;
    }

    if (report.formType === "MICRO_MIX") {
      return (
        <MicroMixReportFormView
          report={report}
          onClose={closeBillingReportView}
          showSwitcher={false}
          pane={billingViewPane}
        />
      );
    }

    if (report.formType === "MICRO_MIX_WATER") {
      return (
        <MicroMixWaterReportFormView
          report={report}
          onClose={closeBillingReportView}
          showSwitcher={false}
          pane={billingViewPane}
        />
      );
    }

    if (report.formType === "STERILITY") {
      return (
        <SterilityReportFormView
          report={report}
          onClose={closeBillingReportView}
          showSwitcher={false}
          pane={billingViewPane}
        />
      );
    }

    if (report.formType === "APE") {
      if (billingViewPane === "FORM" || billingViewPane === "ATTACHMENTS") {
        return (
          <ApeReportFormView
            report={report}
            onClose={closeBillingReportView}
            showSwitcher={false}
            pane={billingViewPane}
          />
        );
      }

      return renderBillingApeReportTabs(report);
    }

    if (report.formType === "CHEMISTRY_MIX") {
      return (
        <ChemistryMixReportFormView
          report={report}
          onClose={closeBillingReportView}
          showSwitcher={false}
          pane={billingViewPane}
        />
      );
    }

    if (report.formType === "COA") {
      return (
        <COAReportFormView
          report={report}
          onClose={closeBillingReportView}
          showSwitcher={false}
          pane={billingViewPane}
        />
      );
    }

    return (
      <div className="text-sm text-slate-600">
        This form type ({report.formType}) does not have a viewer yet.
      </div>
    );
  }

  const refreshAll = useCallback(async () => {
    setLoading(true);

    try {
      const [s, i, u] = await Promise.all([
        loadSummary(),
        loadInvoices(),
        loadUnbilled(),
      ]);

      setSummary(s);
      setInvoices(i);
      setUnbilled(u);
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setLoading(false);
    }
  }, [loadSummary, loadInvoices, loadUnbilled]);

  const refreshPrices = useCallback(async () => {
    if (!isManager) return;

    setPricesLoading(true);
    try {
      setPrices(await loadPriceRules());
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setPricesLoading(false);
    }
  }, [isManager, loadPriceRules]);

  useEffect(() => {
    const parent = billingViewedReport;

    if (!parent || parent.formType !== "APE") {
      return;
    }

    const safeParent = parent;

    let cancelled = false;

    async function loadApeChildren() {
      try {
        const [validationReport, apeReport] = await Promise.all([
          api<any>(
            `/reports/ape-child/by-parent?parentReportId=${encodeURIComponent(
              safeParent.id,
            )}&reportType=APE_VALIDATION_REPORT`,
          ),
          api<any>(
            `/reports/ape-child/by-parent?parentReportId=${encodeURIComponent(
              safeParent.id,
            )}&reportType=APE_REPORT`,
          ),
        ]);

        if (cancelled) return;

        setBillingApeChildReports((prev) => {
          const next = { ...prev };

          if (validationReport?.id) {
            next[billingApeChildKey(safeParent.id, "APE_VALIDATION_REPORT")] = {
              ...safeParent,
              ...validationReport,
              reportType: "APE_VALIDATION_REPORT",
              parentReportId: safeParent.id,
              parentFormNumber: safeParent.formNumber,
              parentReportNumber: safeParent.reportNumber,
              clientCode:
                validationReport.clientCode ||
                safeParent.clientCode ||
                String(safeParent.formNumber || "").split("-")[0] ||
                "",
            };
          }

          if (apeReport?.id) {
            next[billingApeChildKey(safeParent.id, "APE_REPORT")] = {
              ...safeParent,
              ...apeReport,
              reportType: "APE_REPORT",
              parentReportId: safeParent.id,
              parentFormNumber: safeParent.formNumber,
              parentReportNumber: safeParent.reportNumber,
              clientCode:
                apeReport.clientCode ||
                safeParent.clientCode ||
                String(safeParent.formNumber || "").split("-")[0] ||
                "",
            };
          }

          return next;
        });
      } catch (error) {
        console.error(
          "Failed to load APE child reports in Billing viewer",
          error,
        );
      }
    }

    loadApeChildren();

    return () => {
      cancelled = true;
    };
  }, [billingViewedReport?.id, billingViewedReport?.formType]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!isManager) return;

    if (tab === "PRICING" || tab === "OVERVIEW" || tab === "UNBILLED") {
      refreshPrices();
    }

    if (
      tab === "PRICING" ||
      tab === "INVOICES" ||
      tab === "OVERVIEW" ||
      tab === "UNBILLED"
    ) {
      refreshBillingClients();
    }
  }, [tab, isManager, refreshPrices, refreshBillingClients]);

  useEffect(() => {
    setPage(1);
  }, [month, clientCode, invoiceStatus, perPage]);

  useEffect(() => {
    setSelectedMoveLineIds([]);
    setMoveInvoiceLinesDialog(null);
  }, [
    selectedInvoiceId,
    departmentFilter,
    formTypeFilter,
    testFilter,
    itemFilter,
    resultSentFrom,
    resultSentTo,
  ]);

  useEffect(() => {
    setSelectedLastMonthSourceKeys([]);
    setShowLastMonthPicker(false);
    setShowManualLastMonthCharge(false);
    setManualLastMonthCharges([createManualLastMonthChargeDraft()]);
    setEditingManualLastMonthLineId(null);
    setEditManualLastMonthName("");
    setEditManualLastMonthAmount("");
  }, [selectedInvoiceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadLastMonthPending() {
      if (!invoiceDetail || invoiceDetail.invoiceKind !== "REPORT") {
        setLastMonthPending(null);
        setLastMonthPendingError(null);
        setLastMonthPendingLoading(false);
        return;
      }

      const previousMonth = previousBillingMonthKey(invoiceDetail.periodStart);
      if (!previousMonth) {
        setLastMonthPending(null);
        setLastMonthPendingError(null);
        return;
      }

      setLastMonthPendingLoading(true);
      setLastMonthPendingError(null);

      try {
        const params = new URLSearchParams();
        params.set("month", previousMonth);
        params.set("clientCode", invoiceDetail.clientCode);

        const result = await api<UnbilledResponse>(
          `/billing/unbilled?${params.toString()}`,
        );

        if (!cancelled) {
          setLastMonthPending(result);
        }
      } catch (error: any) {
        if (!cancelled) {
          setLastMonthPending(null);
          setLastMonthPendingError(extractMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLastMonthPendingLoading(false);
        }
      }
    }

    loadLastMonthPending();

    return () => {
      cancelled = true;
    };
  }, [
    invoiceDetail?.id,
    invoiceDetail?.invoiceKind,
    invoiceDetail?.periodStart,
    invoiceDetail?.clientCode,
  ]);

  async function openInvoice(id: string) {
    setSelectedInvoiceId(id);
    setDetailLoading(true);

    try {
      const detail = await api<InvoiceDetail>(`/billing/invoices/${id}`);
      setInvoiceDetail(detail);
      setDraftAdjustment(detail.adjustmentAmount ?? "0.00");
      setDraftNotes(detail.notes ?? "");
    } catch (error: any) {
      toast.error(extractMessage(error));
      setSelectedInvoiceId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function reloadSelectedInvoice(id = selectedInvoiceId) {
    if (!id) return;

    const detail = await api<InvoiceDetail>(`/billing/invoices/${id}`);
    setInvoiceDetail(detail);
    setDraftAdjustment(detail.adjustmentAmount ?? "0.00");
    setDraftNotes(detail.notes ?? "");
  }

  async function generateDrafts() {
    setWorking("GENERATE");

    try {
      const result = await api<any>("/billing/invoices/generate", {
        method: "POST",
        body: JSON.stringify({
          month,
          ...(clientCode.trim()
            ? { clientCode: clientCode.trim().toUpperCase() }
            : {}),
        }),
      });

      const added = Array.isArray(result?.invoices)
        ? result.invoices.reduce(
            (sum: number, row: any) => sum + Number(row?.linesAdded ?? 0),
            0,
          )
        : 0;

      const skippedNotReadySources = Number(
        result?.skippedNotReadySources ?? 0,
      );

      if (result?.invoiceCount === 0 && skippedNotReadySources > 0) {
        toast(
          `${skippedNotReadySources} form${
            skippedNotReadySources === 1 ? "" : "s"
          } remain unbilled because all charges are not Ready yet.`,
          {
            icon: "⚠️",
          },
        );
      } else if (result?.invoiceCount === 0) {
        toast.success("No new Ready billable forms found");
      } else {
        const skippedText =
          skippedNotReadySources > 0
            ? ` ${skippedNotReadySources} form${
                skippedNotReadySources === 1 ? "" : "s"
              } remain Unbilled because they are not fully Ready.`
            : "";

        toast.success(
          `Draft generation complete. ${added} line${
            added === 1 ? "" : "s"
          } added.${skippedText}`,
        );
      }

      await refreshAll();
      switchBillingTab("INVOICES");
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function refreshInvoicePricing() {
    if (!invoiceDetail) return;

    setWorking("REFRESH_PRICING");
    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/refresh-pricing`,
        {
          method: "POST",
        },
      );

      setInvoiceDetail(updated);
      setDraftAdjustment(updated.adjustmentAmount ?? "0.00");
      setDraftNotes(updated.notes ?? "");
      toast.success("Pricing refreshed");
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function saveDraft() {
    if (!invoiceDetail) return;

    setWorking("SAVE_DRAFT");
    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/draft`,
        {
          method: "PATCH",
          body: JSON.stringify({
            adjustmentAmount: draftAdjustment,
            notes: draftNotes,
          }),
        },
      );

      setInvoiceDetail(updated);
      toast.success("Draft updated");
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function overrideLine(line: BillingLine) {
    if (!invoiceDetail || !isManager) return;

    setActionDialog({
      kind: "OVERRIDE",
      line,
      unitPrice: line.unitPrice ?? "",
      reason: line.manualOverrideReason ?? "",
    });
  }

  async function submitOverrideLine() {
    if (!invoiceDetail || !isManager || actionDialog?.kind !== "OVERRIDE") {
      return;
    }

    const line = actionDialog.line;
    const unitPrice = actionDialog.unitPrice.trim();
    const reason = actionDialog.reason.trim();

    if (
      !unitPrice ||
      Number.isNaN(Number(unitPrice)) ||
      Number(unitPrice) < 0
    ) {
      toast.error("Enter a valid unit price");
      return;
    }

    if (reason.length < 3) {
      toast.error("Override reason must be at least 3 characters");
      return;
    }

    setWorking(`LINE:${line.id}`);

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/lines/${line.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            unitPrice,
            reason,
          }),
        },
      );

      setInvoiceDetail(updated);
      setActionDialog(null);
      toast.success("Line price overridden");
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function toggleMoveInvoiceLine(lineId: string) {
    setSelectedMoveLineIds((current) =>
      current.includes(lineId)
        ? current.filter((id) => id !== lineId)
        : [...current, lineId],
    );
  }

  function toggleAllVisibleMoveInvoiceLines() {
    const visibleIds = visibleInvoiceLines.map((line) => line.id);

    if (visibleIds.length === 0) return;

    const allSelected = visibleIds.every((id) =>
      selectedMoveLineIds.includes(id),
    );

    setSelectedMoveLineIds((current) => {
      if (allSelected) {
        const visibleSet = new Set(visibleIds);
        return current.filter((id) => !visibleSet.has(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  async function openMoveSelectedInvoiceLines() {
    if (!invoiceDetail || !isManager) return;

    if (invoiceDetail.status !== "DRAFT") {
      toast.error("Reopen the invoice for editing before moving lines");
      return;
    }

    if (invoiceDetail.invoiceKind !== "REPORT") {
      toast.error("Only report invoice lines can be moved");
      return;
    }

    const validLineIds = selectedMoveLineIds.filter((id) =>
      invoiceDetail.lines.some((line) => line.id === id),
    );

    if (validLineIds.length === 0) {
      toast.error("Select at least one invoice line to move");
      return;
    }

    setWorking("LOAD_MOVE_TARGETS");

    try {
      const params = new URLSearchParams();
      params.set("clientCode", invoiceDetail.clientCode);
      params.set("status", "DRAFT");
      params.set("page", "1");
      params.set("perPage", "100");

      const response = await api<InvoiceListResponse>(
        `/billing/invoices?${params.toString()}`,
      );

      const sourceStart = new Date(invoiceDetail.periodStart).getTime();
      const sourceEnd = new Date(invoiceDetail.periodEnd).getTime();

      const targets = response.items.filter((candidate) => {
        if (candidate.id === invoiceDetail.id) return false;
        if (candidate.invoiceKind !== "REPORT") return false;
        if (candidate.clientCode !== invoiceDetail.clientCode) return false;

        return (
          new Date(candidate.periodStart).getTime() === sourceStart &&
          new Date(candidate.periodEnd).getTime() === sourceEnd
        );
      });

      if (targets.length === 0) {
        toast.error(
          "No other DRAFT report invoice exists for this client and billing period. If the invoice you want is CONFIRMED, reopen it first.",
        );
        return;
      }

      setMoveInvoiceLinesDialog({
        lineIds: validLineIds,
        targetInvoiceId: targets[0].id,
        targets,
      });
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function submitMoveSelectedInvoiceLines() {
    if (!invoiceDetail || !isManager || !moveInvoiceLinesDialog) return;

    if (!moveInvoiceLinesDialog.targetInvoiceId) {
      toast.error("Select the target invoice");
      return;
    }

    setWorking("MOVE_LINES");

    try {
      const result = await api<MoveInvoiceLinesResponse>(
        `/billing/invoices/${invoiceDetail.id}/lines/move`,
        {
          method: "POST",
          body: JSON.stringify({
            targetInvoiceId: moveInvoiceLinesDialog.targetInvoiceId,
            lineIds: moveInvoiceLinesDialog.lineIds,
          }),
        },
      );

      setSelectedMoveLineIds([]);
      setMoveInvoiceLinesDialog(null);

      if (result.sourceClosed) {
        setSelectedInvoiceId(result.targetInvoice.id);
        setInvoiceDetail(result.targetInvoice);
        setDraftAdjustment(result.targetInvoice.adjustmentAmount ?? "0.00");
        setDraftNotes(result.targetInvoice.notes ?? "");

        toast.success(
          `${result.movedLineCount} line${
            result.movedLineCount === 1 ? "" : "s"
          } moved. The empty source invoice was marked VOID as merged.`,
        );
      } else {
        setInvoiceDetail(result.sourceInvoice);
        setDraftAdjustment(result.sourceInvoice.adjustmentAmount ?? "0.00");
        setDraftNotes(result.sourceInvoice.notes ?? "");

        toast.success(
          `${result.movedLineCount} line${
            result.movedLineCount === 1 ? "" : "s"
          } moved to the selected invoice.`,
        );
      }

      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function deleteInvoiceLine(line: BillingLine) {
    if (!invoiceDetail || !isManager) return;

    setActionDialog({
      kind: "DELETE_LINE",
      line,
    });
  }

  async function submitDeleteInvoiceLine() {
    if (!invoiceDetail || !isManager || actionDialog?.kind !== "DELETE_LINE") {
      return;
    }

    const line = actionDialog.line;

    setWorking(`DELETE_LINE:${line.id}`);

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/lines/${line.id}`,
        {
          method: "DELETE",
        },
      );

      setInvoiceDetail(updated);
      setDraftAdjustment(updated.adjustmentAmount ?? "0.00");
      setDraftNotes(updated.notes ?? "");
      setActionDialog(null);
      toast.success("Invoice line deleted");
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function restoreDeletedUnbilledLine(item: UnbilledItem) {
    if (!isManager) return;

    const history = item.deletionHistory;

    if (!history?.canRestoreToOriginalDraft || !history.lastDeletedInvoiceId) {
      toast.error("The original invoice is no longer an editable DRAFT");
      return;
    }

    const workKey = `RESTORE_DELETED:${item.chargeKey}`;

    setWorking(workKey);

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${history.lastDeletedInvoiceId}/lines/restore`,
        {
          method: "POST",
          body: JSON.stringify({
            chargeKey: item.chargeKey,
          }),
        },
      );

      if (invoiceDetail?.id === updated.id) {
        setInvoiceDetail(updated);
        setDraftAdjustment(updated.adjustmentAmount ?? "0.00");
        setDraftNotes(updated.notes ?? "");
      }

      toast.success(
        `Restored ${item.formNumber} to ${updated.invoiceNumber || "draft invoice"}`,
      );

      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function confirmInvoice() {
    if (!invoiceDetail || !isManager) return;

    setActionDialog({ kind: "CONFIRM" });
  }

  async function submitConfirmInvoice() {
    if (!invoiceDetail || !isManager || actionDialog?.kind !== "CONFIRM") {
      return;
    }

    setWorking("CONFIRM");

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            notes: draftNotes,
          }),
        },
      );

      setInvoiceDetail(updated);
      setActionDialog(null);
      toast.success(`Confirmed ${updated.invoiceNumber}`);
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function generatePdf() {
    if (!invoiceDetail || !isManager) return;

    const isRegeneration = !!invoiceDetail.pdfFilename;

    setWorking("PDF");

    try {
      await api(`/billing/invoices/${invoiceDetail.id}/pdf`, {
        method: "POST",
      });

      await reloadSelectedInvoice(invoiceDetail.id);
      await refreshAll();

      toast.success(
        isRegeneration ? "Invoice PDF regenerated" : "Invoice PDF generated",
      );
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function getPdf(mode: "VIEW" | "DOWNLOAD") {
    if (!invoiceDetail) return;

    setWorking(mode === "VIEW" ? "VIEW_PDF" : "DOWNLOAD_PDF");

    try {
      const { blob, filename } = await apiBlob(
        `/billing/invoices/${invoiceDetail.id}/pdf`,
      );

      const url = URL.createObjectURL(blob);

      if (mode === "VIEW") {
        const opened = window.open(url, "_blank", "noopener,noreferrer");

        if (!opened) {
          toast.error("Browser blocked the PDF window");
          URL.revokeObjectURL(url);
          return;
        }

        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download =
          filename ||
          invoiceDetail.pdfFilename ||
          `${invoiceDetail.invoiceNumber || "invoice"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function viewInvoicePdfFromList(row: InvoiceRow) {
    if (!row.pdfFilename) {
      toast.error("This invoice does not have an official PDF yet");
      return;
    }

    setWorking(`VIEW_ROW_PDF:${row.id}`);

    try {
      const { blob } = await apiBlob(`/billing/invoices/${row.id}/pdf`);

      const url = URL.createObjectURL(blob);

      const opened = window.open(url, "_blank", "noopener,noreferrer");

      if (!opened) {
        toast.error("Browser blocked the PDF window");
        URL.revokeObjectURL(url);
        return;
      }

      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function reopenInvoiceForEditing() {
    if (!invoiceDetail || !isManager || invoiceDetail.status !== "CONFIRMED") {
      return;
    }

    setActionDialog({
      kind: "REOPEN",
    });
  }

  async function submitReopenInvoice() {
    if (!invoiceDetail || !isManager || actionDialog?.kind !== "REOPEN") {
      return;
    }

    setWorking("REOPEN");

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/reopen`,
        {
          method: "POST",
        },
      );

      setInvoiceDetail(updated);
      setDraftAdjustment(updated.adjustmentAmount ?? "0.00");
      setDraftNotes(updated.notes ?? "");
      setActionDialog(null);

      toast.success(
        `${updated.invoiceNumber || "Invoice"} reopened for editing`,
      );

      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function createInvoiceRevision() {
    if (!invoiceDetail || !isManager || invoiceDetail.status !== "SENT") {
      return;
    }

    setActionDialog({
      kind: "REVISE",
    });
  }

  async function submitCreateInvoiceRevision() {
    if (!invoiceDetail || !isManager || actionDialog?.kind !== "REVISE") {
      return;
    }

    setWorking("REVISE");

    try {
      const revised = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/revise`,
        {
          method: "POST",
        },
      );

      setSelectedInvoiceId(revised.id);
      setInvoiceDetail(revised);
      setDraftAdjustment(revised.adjustmentAmount ?? "0.00");
      setDraftNotes(revised.notes ?? "");
      setActionDialog(null);

      toast.success(`Created revised invoice ${revised.invoiceNumber}`);

      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function sendInvoice() {
    if (!invoiceDetail) return;

    setActionDialog({
      kind: "SEND",
      toEmail: invoiceDetail.billingEmail ?? "",
    });
  }

  async function submitSendInvoice() {
    if (!invoiceDetail || actionDialog?.kind !== "SEND") {
      return;
    }

    const defaultEmail = invoiceDetail.billingEmail ?? "";
    const toEmail = actionDialog.toEmail.trim();

    if (!toEmail && !defaultEmail) {
      toast.error("Recipient email is required");
      return;
    }

    const isResend = invoiceDetail.status === "SENT";

    setWorking("SEND");

    try {
      await api(`/billing/invoices/${invoiceDetail.id}/send`, {
        method: "POST",
        body: JSON.stringify({
          ...(toEmail ? { toEmail } : {}),
          resend: isResend,
        }),
      });

      setActionDialog(null);
      await reloadSelectedInvoice(invoiceDetail.id);
      await refreshAll();
      toast.success(isResend ? "Invoice resent" : "Invoice sent");
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function scheduleInvoiceSend() {
    if (!invoiceDetail) return;

    setActionDialog({
      kind: "SCHEDULE",
      toEmail:
        invoiceDetail.scheduledToEmail ?? invoiceDetail.billingEmail ?? "",
      scheduledSendLocal: toDateTimeLocal(invoiceDetail.scheduledSendAt),
    });
  }

  async function submitScheduleInvoiceSend() {
    if (!invoiceDetail || actionDialog?.kind !== "SCHEDULE") {
      return;
    }

    const toEmail = actionDialog.toEmail.trim();
    const scheduled = new Date(actionDialog.scheduledSendLocal);

    if (!toEmail) {
      toast.error("Recipient email is required");
      return;
    }

    if (
      Number.isNaN(scheduled.getTime()) ||
      scheduled.getTime() <= Date.now()
    ) {
      toast.error("Choose a future send date and time");
      return;
    }

    setWorking("SCHEDULE_SEND");

    try {
      await api(`/billing/invoices/${invoiceDetail.id}/schedule-send`, {
        method: "POST",
        body: JSON.stringify({
          toEmail,
          scheduledSendAt: scheduled.toISOString(),
        }),
      });

      setActionDialog(null);
      await reloadSelectedInvoice(invoiceDetail.id);
      await refreshAll();
      toast.success(
        invoiceDetail.scheduledSendAt
          ? "Invoice send rescheduled"
          : "Invoice send scheduled",
      );
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function cancelScheduledInvoiceSend() {
    if (!invoiceDetail?.scheduledSendAt) return;

    setWorking("CANCEL_SCHEDULE");

    try {
      await api(`/billing/invoices/${invoiceDetail.id}/schedule-send`, {
        method: "DELETE",
      });

      await reloadSelectedInvoice(invoiceDetail.id);
      await refreshAll();
      toast.success("Scheduled invoice send cancelled");
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function voidInvoice() {
    if (!invoiceDetail || !isManager) return;

    setActionDialog({
      kind: "VOID",
      reason: "",
    });
  }

  async function submitVoidInvoice() {
    if (!invoiceDetail || !isManager || actionDialog?.kind !== "VOID") {
      return;
    }

    const reason = actionDialog.reason.trim();

    if (reason.length < 3) {
      toast.error("Void reason must be at least 3 characters");
      return;
    }

    setWorking("VOID");

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/void`,
        {
          method: "POST",
          body: JSON.stringify({
            reason,
          }),
        },
      );

      setInvoiceDetail(updated);
      setActionDialog(null);
      toast.success("Invoice voided");
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function openCreateManualInvoice() {
    if (!isManager) return;

    setManualInvoiceDialog({
      kind: "CREATE",
      clientCode: clientCode.trim().toUpperCase(),
    });
  }

  async function submitCreateManualInvoice() {
    if (!isManager || manualInvoiceDialog?.kind !== "CREATE") {
      return;
    }

    const selectedClient = manualInvoiceDialog.clientCode.trim().toUpperCase();

    if (!selectedClient) {
      toast.error("Select a client");
      return;
    }

    setWorking("CREATE_MANUAL_INVOICE");

    try {
      const created = await api<InvoiceDetail>("/billing/invoices/manual", {
        method: "POST",
        body: JSON.stringify({
          clientCode: selectedClient,
        }),
      });

      setManualInvoiceDialog(null);
      setSelectedInvoiceId(created.id);
      setInvoiceDetail(created);
      setDraftAdjustment(created.adjustmentAmount ?? "0.00");
      setDraftNotes(created.notes ?? "");

      toast.success("Manual invoice draft created");
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function openAddManualLine() {
    if (
      !invoiceDetail ||
      !isManager ||
      invoiceDetail.invoiceKind !== "MANUAL" ||
      invoiceDetail.status !== "DRAFT"
    ) {
      return;
    }

    setManualInvoiceDialog({
      kind: "ADD_LINE",
      description: "",
      quantity: "1",
      unitPrice: "",
    });
  }

  function openEditManualLine(line: BillingManualInvoiceLine) {
    if (
      !invoiceDetail ||
      !isManager ||
      invoiceDetail.invoiceKind !== "MANUAL" ||
      invoiceDetail.status !== "DRAFT"
    ) {
      return;
    }

    setManualInvoiceDialog({
      kind: "EDIT_LINE",
      line,
      description: line.description,
      quantity: String(line.quantity),
      unitPrice: line.unitPrice,
    });
  }

  function openDeleteManualLine(line: BillingManualInvoiceLine) {
    if (
      !invoiceDetail ||
      !isManager ||
      invoiceDetail.invoiceKind !== "MANUAL" ||
      invoiceDetail.status !== "DRAFT"
    ) {
      return;
    }

    setManualInvoiceDialog({
      kind: "DELETE_LINE",
      line,
    });
  }

  async function submitManualInvoiceLine() {
    if (
      !invoiceDetail ||
      !isManager ||
      !manualInvoiceDialog ||
      (manualInvoiceDialog.kind !== "ADD_LINE" &&
        manualInvoiceDialog.kind !== "EDIT_LINE")
    ) {
      return;
    }

    const description = manualInvoiceDialog.description.trim();
    const quantity = Number(manualInvoiceDialog.quantity);
    const unitPrice = Number(manualInvoiceDialog.unitPrice);

    if (description.length < 2) {
      toast.error("Description must be at least 2 characters");
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      toast.error("Quantity must be a whole number of at least 1");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      toast.error("Unit price must be greater than 0");
      return;
    }

    const isEdit = manualInvoiceDialog.kind === "EDIT_LINE";
    const lineId = isEdit ? manualInvoiceDialog.line.id : null;

    setWorking(isEdit ? `MANUAL_LINE:${lineId}` : "ADD_MANUAL_LINE");

    try {
      const updated = await api<InvoiceDetail>(
        isEdit
          ? `/billing/invoices/${invoiceDetail.id}/manual-lines/${lineId}`
          : `/billing/invoices/${invoiceDetail.id}/manual-lines`,
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify({
            description,
            quantity,
            unitPrice: unitPrice.toFixed(2),
          }),
        },
      );

      setInvoiceDetail(updated);
      setDraftAdjustment(updated.adjustmentAmount ?? "0.00");
      setDraftNotes(updated.notes ?? "");
      setManualInvoiceDialog(null);

      toast.success(isEdit ? "Invoice item updated" : "Invoice item added");
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function submitDeleteManualInvoiceLine() {
    if (
      !invoiceDetail ||
      !isManager ||
      manualInvoiceDialog?.kind !== "DELETE_LINE"
    ) {
      return;
    }

    const line = manualInvoiceDialog.line;

    setWorking(`DELETE_MANUAL_LINE:${line.id}`);

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/manual-lines/${line.id}`,
        {
          method: "DELETE",
        },
      );

      setInvoiceDetail(updated);
      setDraftAdjustment(updated.adjustmentAmount ?? "0.00");
      setDraftNotes(updated.notes ?? "");
      setManualInvoiceDialog(null);

      toast.success("Invoice item deleted");
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function refreshLastMonthPendingForInvoice(
    detail: InvoiceDetail | null = invoiceDetail,
  ) {
    if (!detail || detail.invoiceKind !== "REPORT") {
      setLastMonthPending(null);
      return;
    }

    const previousMonth = previousBillingMonthKey(detail.periodStart);
    if (!previousMonth) {
      setLastMonthPending(null);
      return;
    }

    const params = new URLSearchParams();
    params.set("month", previousMonth);
    params.set("clientCode", detail.clientCode);

    const result = await api<UnbilledResponse>(
      `/billing/unbilled?${params.toString()}`,
    );
    setLastMonthPending(result);
  }

  async function addSelectedLastMonthPending() {
    if (
      !invoiceDetail ||
      !isManager ||
      invoiceDetail.invoiceKind !== "REPORT" ||
      invoiceDetail.status !== "DRAFT"
    ) {
      return;
    }

    if (selectedLastMonthSourceKeys.length === 0) {
      toast.error("Select at least one previous-month form");
      return;
    }

    const notReady = selectedLastMonthGroups.filter(
      (group) => group.missingAmount || group.pricingIssues.length > 0,
    );

    if (notReady.length > 0) {
      toast.error(
        "Resolve pricing for all selected previous-month forms before adding them",
      );
      return;
    }

    setWorking("ADD_PREVIOUS_MONTH_FORMS");

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/previous-month/forms`,
        {
          method: "POST",
          body: JSON.stringify({
            sourceKeys: selectedLastMonthSourceKeys,
          }),
        },
      );

      setInvoiceDetail(updated);
      setDraftAdjustment(updated.adjustmentAmount ?? "0.00");
      setDraftNotes(updated.notes ?? "");
      setSelectedLastMonthSourceKeys([]);
      setShowLastMonthPicker(false);
      await refreshLastMonthPendingForInvoice(updated);
      await refreshAll();
      toast.success("Previous-month pending forms added to this invoice");
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function addManualLastMonthPending() {
    if (
      !invoiceDetail ||
      !isManager ||
      invoiceDetail.invoiceKind !== "REPORT" ||
      invoiceDetail.status !== "DRAFT"
    ) {
      return;
    }

    const enteredRows = manualLastMonthCharges.filter(
      (row) => row.name.trim() || row.amount.trim(),
    );

    if (enteredRows.length === 0) {
      toast.error("Add at least one manual charge");
      return;
    }

    const charges: Array<{ description: string; amount: string }> = [];

    for (const row of enteredRows) {
      const description = row.name.trim();
      const amount = Number(row.amount);

      if (description.length < 2) {
        toast.error("Enter a charge name for every manual charge");
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error(`Enter an amount greater than 0 for ${description}`);
        return;
      }

      charges.push({
        description,
        amount: amount.toFixed(2),
      });
    }

    setWorking("ADD_PREVIOUS_MONTH_MANUAL");

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/previous-month/manual-charge`,
        {
          method: "POST",
          body: JSON.stringify({ charges }),
        },
      );

      setInvoiceDetail(updated);
      setDraftAdjustment(updated.adjustmentAmount ?? "0.00");
      setDraftNotes(updated.notes ?? "");
      setManualLastMonthCharges([createManualLastMonthChargeDraft()]);
      setShowManualLastMonthCharge(false);
      await refreshAll();
      toast.success(
        `${charges.length} manual previous-month charge${charges.length === 1 ? "" : "s"} added`,
      );
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function startEditManualLastMonthPending(line: BillingManualInvoiceLine) {
    setEditingManualLastMonthLineId(line.id);
    setEditManualLastMonthName(
      String(line.description ?? "").replace(PREVIOUS_MONTH_MANUAL_PREFIX, ""),
    );
    setEditManualLastMonthAmount(String(line.amount ?? ""));
  }

  function cancelEditManualLastMonthPending() {
    setEditingManualLastMonthLineId(null);
    setEditManualLastMonthName("");
    setEditManualLastMonthAmount("");
  }

  async function saveEditManualLastMonthPending(
    line: BillingManualInvoiceLine,
  ) {
    if (
      !invoiceDetail ||
      !isManager ||
      invoiceDetail.invoiceKind !== "REPORT" ||
      invoiceDetail.status !== "DRAFT"
    ) {
      return;
    }

    const description = editManualLastMonthName.trim();
    const amount = Number(editManualLastMonthAmount);

    if (description.length < 2) {
      toast.error("Enter a charge name");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }

    setWorking(`EDIT_PREVIOUS_MONTH_MANUAL:${line.id}`);

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/manual-lines/${line.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            description,
            quantity: 1,
            unitPrice: amount.toFixed(2),
          }),
        },
      );

      setInvoiceDetail(updated);
      setDraftAdjustment(updated.adjustmentAmount ?? "0.00");
      setDraftNotes(updated.notes ?? "");
      cancelEditManualLastMonthPending();
      await refreshAll();
      toast.success(`Updated ${description}`);
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function deleteManualLastMonthPending(line: BillingManualInvoiceLine) {
    if (
      !invoiceDetail ||
      !isManager ||
      invoiceDetail.invoiceKind !== "REPORT" ||
      invoiceDetail.status !== "DRAFT"
    ) {
      return;
    }

    if (!window.confirm("Remove this manual previous-month charge?")) {
      return;
    }

    setWorking(`DELETE_PREVIOUS_MONTH_MANUAL:${line.id}`);

    try {
      const updated = await api<InvoiceDetail>(
        `/billing/invoices/${invoiceDetail.id}/manual-lines/${line.id}`,
        { method: "DELETE" },
      );

      setInvoiceDetail(updated);
      setDraftAdjustment(updated.adjustmentAmount ?? "0.00");
      setDraftNotes(updated.notes ?? "");
      await refreshAll();
      toast.success("Manual previous-month charge removed");
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function openAddExtraCharge(row: {
    sourceType: string;
    sourceId: string;
    formNumber: string;
    reportNumber: string;
  }) {
    if (!invoiceDetail || !isManager || invoiceDetail.status !== "DRAFT") {
      return;
    }

    setExtraChargeDialog({
      kind: "ADD",
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      formNumber: row.formNumber,
      reportNumber: row.reportNumber,
      name: "",
      amount: "",
    });
  }

  function openEditExtraCharge(charge: BillingInvoiceExtraCharge) {
    if (!invoiceDetail || !isManager || invoiceDetail.status !== "DRAFT") {
      return;
    }

    setExtraChargeDialog({
      kind: "EDIT",
      charge,
      name: charge.name,
      amount: charge.amount,
    });
  }

  function openDeleteExtraCharge(charge: BillingInvoiceExtraCharge) {
    if (!invoiceDetail || !isManager || invoiceDetail.status !== "DRAFT") {
      return;
    }

    setExtraChargeDialog({
      kind: "DELETE",
      charge,
    });
  }

  async function submitExtraCharge() {
    if (!invoiceDetail || !extraChargeDialog) return;

    if (extraChargeDialog.kind === "DELETE") {
      setWorking(`EXTRA_DELETE:${extraChargeDialog.charge.id}`);

      try {
        const updated = await api<InvoiceDetail>(
          `/billing/invoices/${invoiceDetail.id}/extra-charges/${extraChargeDialog.charge.id}`,
          { method: "DELETE" },
        );

        setInvoiceDetail(updated);
        setExtraChargeDialog(null);
        toast.success("Additional charge deleted");
        await refreshAll();
      } catch (error: any) {
        toast.error(extractMessage(error));
      } finally {
        setWorking(null);
      }
      return;
    }

    const name = extraChargeDialog.name.trim();
    const amount = Number(extraChargeDialog.amount);

    if (name.length < 2) {
      toast.error("Charge name must be at least 2 characters");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an additional charge greater than 0");
      return;
    }

    const isEdit = extraChargeDialog.kind === "EDIT";
    const workingKey = isEdit
      ? `EXTRA_EDIT:${extraChargeDialog.charge.id}`
      : "EXTRA_ADD";

    setWorking(workingKey);

    try {
      const updated = await api<InvoiceDetail>(
        isEdit
          ? `/billing/invoices/${invoiceDetail.id}/extra-charges/${extraChargeDialog.charge.id}`
          : `/billing/invoices/${invoiceDetail.id}/extra-charges`,
        {
          method: isEdit ? "PATCH" : "POST",
          body: JSON.stringify(
            isEdit
              ? {
                  name,
                  amount: amount.toFixed(2),
                }
              : {
                  sourceType: extraChargeDialog.sourceType,
                  sourceId: extraChargeDialog.sourceId,
                  name,
                  amount: amount.toFixed(2),
                },
          ),
        },
      );

      setInvoiceDetail(updated);
      setExtraChargeDialog(null);
      toast.success(
        isEdit ? "Additional charge updated" : "Additional charge added",
      );
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function openPricingFromUnbilled(item: UnbilledItem) {
    if (!isManager) {
      toast.error("Only ADMIN or SYSTEMADMIN can create pricing rules");
      return;
    }

    if (!isMissingPricingRule(item.pricingIssue)) {
      return;
    }

    const department: "MICRO" | "CHEMISTRY" =
      item.formType === "CHEMISTRY_MIX" || item.formType === "COA"
        ? "CHEMISTRY"
        : "MICRO";

    const testOptions = getTestOptions(item.formType);

    const knownTest = testOptions.some(
      (option) => option.value === item.testKey,
    );

    const formSupportsItem = supportsPricingItem(item.formType);
    const formSupportsCombination = supportsCombinationPricing(item.formType);

    const combinationItemKeys = formSupportsCombination
      ? unbilledCombinationItemKeys(item)
      : [];

    const sourcePricingMethod: PricingMethod =
      formSupportsCombination &&
      (isCombinationItemKey(item.itemKey) ||
        String(item.sourceSnapshot?.pricingMethod ?? "").toUpperCase() ===
          "COMBINATION")
        ? "COMBINATION"
        : "INDIVIDUAL";

    const itemOptions = getItemOptions(item.formType);

    const knownItem =
      sourcePricingMethod === "INDIVIDUAL" &&
      !!item.itemKey &&
      itemOptions.some((option) => option.value === item.itemKey);

    const customItemLabel =
      item.itemLabel ||
      (item.itemKey ? nice(item.itemKey.replace(/^OTHER_/, "")) : "");

    setPriceForm({
      pricingMethod: sourcePricingMethod,

      /*
       * IMPORTANT:
       * Keep the complete selected pathogen / active list from
       * the source report even when Set Price initially opens in
       * Individual mode. If the user changes to Combination,
       * these checkboxes are already selected automatically.
       */
      combinationItemKeys,

      clientCode: String(item.clientCode ?? "")
        .trim()
        .toUpperCase(),

      client: unbilledClient(item),
      customClientName: "",

      department,
      formType: item.formType,

      testKey: knownTest ? item.testKey : CUSTOM_TEST_VALUE,

      testLabel: knownTest ? item.testLabel || nice(item.testKey) : "",

      itemKey:
        sourcePricingMethod === "COMBINATION" || !formSupportsItem
          ? ""
          : knownItem
            ? item.itemKey || ""
            : item.itemKey
              ? CUSTOM_ITEM_VALUE
              : "",

      itemLabel:
        sourcePricingMethod === "INDIVIDUAL" && knownItem
          ? item.itemLabel || (item.itemKey ? nice(item.itemKey) : "")
          : "",

      customTestLabel: knownTest ? "" : item.testLabel || nice(item.testKey),

      customItemLabel:
        sourcePricingMethod === "INDIVIDUAL" &&
        formSupportsItem &&
        item.itemKey &&
        !knownItem
          ? customItemLabel
          : "",

      unitPrice: "",

      /*
       * Use the first day of the billing month being reviewed
       * so the new rule can resolve this unbilled charge.
       */
      effectiveFrom: `${month}-01`,
    });

    const selectionLabel =
      combinationItemKeys.length > 0
        ? ` Selected ${
            department === "MICRO" ? "pathogens" : "actives"
          } from the report are also prefilled for Combination Pricing.`
        : "";

    setPricingPrefillMessage(
      `Prefilled from ${item.formNumber} / ${item.reportNumber}${
        unbilledClient(item) ? ` for ${unbilledClient(item)}` : ""
      }.${selectionLabel} Enter the price and review Effective From before creating the rule.`,
    );

    switchBillingTab("PRICING", {
      clientCode: String(item.clientCode ?? "")
        .trim()
        .toUpperCase(),
      departmentFilter: department,
      formTypeFilter: item.formType,
      testFilter: item.testKey || "ALL",
      itemFilter:
        sourcePricingMethod === "COMBINATION" ? "ALL" : item.itemKey || "ALL",
      page: 1,
    });

    window.setTimeout(() => {
      document.getElementById("billing-pricing-rule-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      const priceInput = document.getElementById(
        "billing-pricing-unit-price",
      ) as HTMLInputElement | null;

      priceInput?.focus();
    }, 0);
  }

  async function openExistingPriceFromUnbilled(item: UnbilledItem) {
    if (!isManager) {
      toast.error("Only ADMIN or SYSTEMADMIN can edit pricing rules");
      return;
    }

    if (!item.pricingRuleId) {
      if (isMissingPricingRule(item.pricingIssue)) {
        openPricingFromUnbilled(item);
        return;
      }

      toast.error("This Ready line does not have a pricing rule to edit");
      return;
    }

    let availableRules = prices;
    let rule = availableRules.find(
      (candidate) => candidate.id === item.pricingRuleId,
    );

    /*
     * Overview / Unbilled may be opened before the pricing list
     * has finished loading. Fetch once so Edit Price always opens
     * the exact rule used by this Ready charge.
     */
    if (!rule) {
      try {
        availableRules = await loadPriceRules();
        setPrices(availableRules);

        rule = availableRules.find(
          (candidate) => candidate.id === item.pricingRuleId,
        );
      } catch (error: any) {
        toast.error(extractMessage(error));
        return;
      }
    }

    if (!rule) {
      toast.error("The pricing rule used by this line could not be found");
      return;
    }

    openEditPriceRule(rule);
  }

  async function createPriceRule(event: React.FormEvent) {
    event.preventDefault();
    if (!isManager) return;

    if (!priceForm.clientCode.trim()) {
      toast.error("Client code is required");
      return;
    }

    const pricingClient =
      priceForm.client === CUSTOM_CLIENT_VALUE
        ? priceForm.customClientName.trim().replace(/\s+/g, " ")
        : priceForm.client.trim().replace(/\s+/g, " ");

    if (priceForm.client === CUSTOM_CLIENT_VALUE && !pricingClient) {
      toast.error("Enter the client name");
      return;
    }

    let testKey = priceForm.testKey;
    let testLabel = priceForm.testLabel;

    if (testKey === CUSTOM_TEST_VALUE) {
      testLabel = priceForm.customTestLabel.trim();
      testKey = normalizePricingKey(testLabel);
    }

    if (!testKey) {
      toast.error("Type of Test is required");
      return;
    }

    let itemKey: string | undefined;
    let itemLabel: string | undefined;

    if (priceForm.pricingMethod === "COMBINATION") {
      if (!pricingSupportsCombination) {
        toast.error(
          "Combination Pricing is available only for Micro Mix, Micro Mix Water, and Chemistry Mix",
        );
        return;
      }

      const selectedOptions = pricingItemOptions
        .filter(
          (option) =>
            option.value !== "OTHER" &&
            priceForm.combinationItemKeys.includes(option.value),
        )
        .sort((a, b) => a.value.localeCompare(b.value));

      if (selectedOptions.length < 2) {
        toast.error(
          `Select at least two ${
            priceForm.department === "MICRO" ? "pathogens" : "actives"
          } for Combination Pricing`,
        );
        return;
      }

      itemKey = buildCombinationItemKey(
        selectedOptions.map((option) => option.value),
      );

      itemLabel = selectedOptions.map((option) => option.label).join(" + ");
    } else if (pricingSupportsItem) {
      itemKey = priceForm.itemKey || undefined;
      itemLabel = priceForm.itemLabel || undefined;

      if (itemKey === CUSTOM_ITEM_VALUE) {
        itemLabel = priceForm.customItemLabel.trim();

        if (!itemLabel) {
          toast.error(
            `Enter the custom ${pricingItemName(
              priceForm.formType,
            ).toLowerCase()} name`,
          );
          return;
        }

        /*
         * OTHER rows are positional/editable slots.
         * Price the real custom name, not the generic OTHER slot.
         */
        itemKey = `OTHER_${normalizePricingKey(itemLabel)}`;
      }

      if (pricingRequiresItem && !itemKey) {
        toast.error(`${pricingItemName(priceForm.formType)} is required`);
        return;
      }

      if (!itemKey) {
        itemLabel = undefined;
      }
    }

    if (!priceForm.unitPrice.trim()) {
      toast.error(
        priceForm.pricingMethod === "COMBINATION"
          ? "Combination price is required"
          : "Unit price is required",
      );
      return;
    }

    setWorking("CREATE_PRICE");

    try {
      const effective = new Date(
        `${priceForm.effectiveFrom || todayDateInput()}T00:00:00`,
      );

      await api("/billing/prices", {
        method: "POST",
        body: JSON.stringify({
          clientCode: priceForm.clientCode.trim().toUpperCase(),

          client: pricingClient || null,

          department: priceForm.department,
          formType: priceForm.formType,

          testKey,
          testLabel: testLabel || undefined,

          ...(itemKey
            ? {
                itemKey,
                itemLabel: itemLabel || undefined,
              }
            : {}),

          priceBasis: "FLAT",

          unitPrice: priceForm.unitPrice,
          active: true,
          effectiveFrom: effective.toISOString(),
        }),
      });

      toast.success(
        priceForm.pricingMethod === "COMBINATION"
          ? "Combination pricing rule created"
          : "Pricing rule created",
      );

      setPricingPrefillMessage(null);

      await refreshPricingClientDirectory(priceForm.clientCode);

      setPriceForm((prev) => ({
        ...prev,

        client: pricingClient || "",

        customClientName: "",

        testKey: "",
        testLabel: "",

        itemKey: "",
        itemLabel: "",

        combinationItemKeys: [],

        customTestLabel: "",
        customItemLabel: "",

        unitPrice: "",
      }));

      await refreshPrices();
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function openEditPriceRule(rule: PricingRule) {
    if (!isManager) return;

    setPricingRuleDialog({
      kind: "EDIT",
      rule,
      unitPrice: String(rule.unitPrice ?? ""),
      effectiveFrom: nextPricingEffectiveDate(rule.effectiveFrom),
      testLabel: rule.testLabel ?? "",
      itemLabel: rule.itemLabel ?? "",
      active: rule.active,
    });
  }

  async function submitEditPriceRule() {
    if (!isManager || pricingRuleDialog?.kind !== "EDIT") {
      return;
    }

    const { rule, unitPrice, effectiveFrom, testLabel, itemLabel, active } =
      pricingRuleDialog;

    if (!unitPrice.trim() || Number(unitPrice) < 0) {
      toast.error("Enter a valid unit price");
      return;
    }

    if (!effectiveFrom) {
      toast.error("Effective From is required");
      return;
    }

    setWorking(`PRICE_EDIT:${rule.id}`);

    try {
      const effective = new Date(`${effectiveFrom}T00:00:00`);

      await api(`/billing/prices/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          unitPrice: unitPrice.trim(),
          effectiveFrom: effective.toISOString(),
          testLabel: testLabel.trim() || null,
          itemLabel: itemLabel.trim() || null,
          active,
        }),
      });

      setPricingRuleDialog(null);
      toast.success("Pricing rule updated");

      await refreshPrices();
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function openDeletePriceRule(rule: PricingRule) {
    if (!isManager) return;

    setPricingRuleDialog({
      kind: "DELETE",
      rule,
    });
  }

  async function submitDeletePriceRule() {
    if (!isManager || pricingRuleDialog?.kind !== "DELETE") {
      return;
    }

    const rule = pricingRuleDialog.rule;

    setWorking(`PRICE_DELETE:${rule.id}`);

    try {
      await api(`/billing/prices/${rule.id}`, {
        method: "DELETE",
      });

      setPricingRuleDialog(null);
      toast.success("Pricing rule deleted");

      await refreshPrices();
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function togglePriceRule(rule: PricingRule) {
    if (!isManager) return;

    setWorking(`PRICE:${rule.id}`);

    try {
      await api(`/billing/prices/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          active: !rule.active,
        }),
      });

      toast.success(
        rule.active ? "Pricing rule disabled" : "Pricing rule enabled",
      );
      await refreshPrices();
      await refreshAll();
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  const commonClientOptions = useMemo(() => {
    const byCode = new Map<string, BillingClientOption>();

    for (const client of billingClients) {
      byCode.set(client.clientCode, client);
    }

    for (const row of invoices?.items ?? []) {
      const code = String(row.clientCode ?? "")
        .trim()
        .toUpperCase();
      if (!code) continue;

      const existing = byCode.get(code);

      byCode.set(code, {
        clientCode: code,
        name: existing?.name || row.clientName || null,
        legalName: existing?.legalName || null,
        active: existing?.active,
        billingEnabled: existing?.billingEnabled,
      });
    }

    for (const item of unbilled?.items ?? []) {
      const code = String(item.clientCode ?? "")
        .trim()
        .toUpperCase();
      if (!code || byCode.has(code)) continue;

      byCode.set(code, {
        clientCode: code,
      });
    }

    for (const rule of prices) {
      const code = String(rule.clientCode ?? "")
        .trim()
        .toUpperCase();
      if (!code || byCode.has(code)) continue;

      byCode.set(code, {
        clientCode: code,
      });
    }

    /*
     * Keep the currently selected client visible even when the
     * current month has no rows for it.
     */
    const selected = clientCode.trim().toUpperCase();

    if (selected && !byCode.has(selected)) {
      byCode.set(selected, {
        clientCode: selected,
      });
    }

    return [...byCode.values()].sort((a, b) =>
      a.clientCode.localeCompare(b.clientCode),
    );
  }, [billingClients, invoices, unbilled, prices, clientCode]);

  const commonFormOptions = useMemo(() => {
    return FORM_OPTIONS.filter((formType) => {
      if (departmentFilter === "ALL") return true;

      if (departmentFilter === "MICRO") {
        return ["MICRO_MIX", "MICRO_MIX_WATER", "STERILITY", "APE"].includes(
          formType,
        );
      }

      return ["CHEMISTRY_MIX", "COA"].includes(formType);
    });
  }, [departmentFilter]);

  const commonTestOptions = useMemo(() => {
    const tests = new Map<string, string>();

    const add = (value?: string | null, label?: string | null) => {
      const key = String(value ?? "").trim();
      if (!key) return;

      tests.set(key, String(label ?? "").trim() || nice(key));
    };

    if (formTypeFilter !== "ALL") {
      for (const option of getTestOptions(formTypeFilter)) {
        add(option.value, option.label);
      }
    } else {
      for (const formType of commonFormOptions) {
        for (const option of getTestOptions(formType)) {
          add(option.value, option.label);
        }
      }
    }

    for (const item of unbilled?.items ?? []) {
      const department =
        item.formType === "CHEMISTRY_MIX" || item.formType === "COA"
          ? "CHEMISTRY"
          : "MICRO";

      if (departmentFilter !== "ALL" && department !== departmentFilter) {
        continue;
      }

      if (formTypeFilter !== "ALL" && item.formType !== formTypeFilter) {
        continue;
      }

      add(item.testKey, item.testLabel);
    }

    for (const rule of prices) {
      if (departmentFilter !== "ALL" && rule.department !== departmentFilter) {
        continue;
      }

      if (formTypeFilter !== "ALL" && rule.formType !== formTypeFilter) {
        continue;
      }

      add(rule.testKey, rule.testLabel);
    }

    return [...tests.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [departmentFilter, formTypeFilter, commonFormOptions, unbilled, prices]);

  const commonItemOptions = useMemo(() => {
    const items = new Map<string, string>();

    const add = (value?: string | null, label?: string | null) => {
      const key = String(value ?? "").trim();
      if (!key) return;

      items.set(key, String(label ?? "").trim() || nice(key));
    };

    const forms =
      formTypeFilter !== "ALL" ? [formTypeFilter] : commonFormOptions;

    for (const formType of forms) {
      for (const option of getItemOptions(formType)) {
        add(option.value, option.label);
      }
    }

    for (const item of unbilled?.items ?? []) {
      const department =
        item.formType === "CHEMISTRY_MIX" || item.formType === "COA"
          ? "CHEMISTRY"
          : "MICRO";

      if (departmentFilter !== "ALL" && department !== departmentFilter) {
        continue;
      }

      if (formTypeFilter !== "ALL" && item.formType !== formTypeFilter) {
        continue;
      }

      if (testFilter !== "ALL" && item.testKey !== testFilter) {
        continue;
      }

      add(item.itemKey, item.itemLabel);
    }

    for (const rule of prices) {
      if (departmentFilter !== "ALL" && rule.department !== departmentFilter) {
        continue;
      }

      if (formTypeFilter !== "ALL" && rule.formType !== formTypeFilter) {
        continue;
      }

      if (testFilter !== "ALL" && rule.testKey !== testFilter) {
        continue;
      }

      add(rule.itemKey, rule.itemLabel);
    }

    return [...items.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [
    departmentFilter,
    formTypeFilter,
    testFilter,
    commonFormOptions,
    unbilled,
    prices,
  ]);

  const matchesCommonLineFilters = useCallback(
    (row: {
      formType: string;
      testKey: string;
      itemKey?: string | null;
      resultSentToClientAt?: string | null;
    }) => {
      const department =
        row.formType === "CHEMISTRY_MIX" || row.formType === "COA"
          ? "CHEMISTRY"
          : "MICRO";

      if (departmentFilter !== "ALL" && department !== departmentFilter) {
        return false;
      }

      if (formTypeFilter !== "ALL" && row.formType !== formTypeFilter) {
        return false;
      }

      if (testFilter !== "ALL" && row.testKey !== testFilter) {
        return false;
      }

      if (itemFilter !== "ALL" && row.itemKey !== itemFilter) {
        return false;
      }

      if (resultSentFrom || resultSentTo) {
        const resultSentDate = String(row.resultSentToClientAt ?? "").slice(
          0,
          10,
        );

        if (!resultSentDate) {
          return false;
        }

        if (resultSentFrom && resultSentDate < resultSentFrom) {
          return false;
        }

        if (resultSentTo && resultSentDate > resultSentTo) {
          return false;
        }
      }

      return true;
    },
    [
      departmentFilter,
      formTypeFilter,
      testFilter,
      itemFilter,
      resultSentFrom,
      resultSentTo,
    ],
  );

  const visibleUnbilled = useMemo(() => {
    return (unbilled?.items ?? []).filter(matchesCommonLineFilters);
  }, [unbilled, matchesCommonLineFilters]);

  const groupedVisibleUnbilled = useMemo(
    () => groupUnbilledByReport(visibleUnbilled),
    [visibleUnbilled],
  );

  const visibleUnbilledSummary = useMemo(() => {
    let subtotal = 0;
    let exceptions = 0;

    for (const item of visibleUnbilled) {
      const amount = Number(item.amount ?? 0);

      if (Number.isFinite(amount)) {
        subtotal += amount;
      }

      if (item.pricingIssue) {
        exceptions += 1;
      }
    }

    return {
      count: visibleUnbilled.length,
      formCount: groupedVisibleUnbilled.length,
      exceptionCount: exceptions,
      estimatedSubtotal: subtotal.toFixed(2),
    };
  }, [visibleUnbilled, groupedVisibleUnbilled]);

  const visiblePrices = useMemo(() => {
    return prices.filter((rule) => {
      if (
        clientCode.trim() &&
        rule.clientCode !== clientCode.trim().toUpperCase()
      ) {
        return false;
      }

      if (departmentFilter !== "ALL" && rule.department !== departmentFilter) {
        return false;
      }

      if (formTypeFilter !== "ALL" && rule.formType !== formTypeFilter) {
        return false;
      }

      if (testFilter !== "ALL" && rule.testKey !== testFilter) {
        return false;
      }

      if (itemFilter !== "ALL" && rule.itemKey !== itemFilter) {
        return false;
      }

      return true;
    });
  }, [
    prices,
    clientCode,
    departmentFilter,
    formTypeFilter,
    testFilter,
    itemFilter,
  ]);

  const visibleInvoiceLines = useMemo(() => {
    return (invoiceDetail?.lines ?? []).filter(matchesCommonLineFilters);
  }, [invoiceDetail, matchesCommonLineFilters]);

  const invoiceFormCount = useMemo(() => {
    if (!invoiceDetail || invoiceDetail.invoiceKind !== "REPORT") return 0;

    return new Set(
      (invoiceDetail.lines ?? [])
        .filter((line) => line.sourceId)
        .map((line) => `${line.sourceType}:${line.sourceId}`),
    ).size;
  }, [invoiceDetail]);

  const lastMonthPendingFormCount = useMemo(() => {
    return new Set(
      (lastMonthPending?.items ?? [])
        .filter((item) => item.sourceId)
        .map((item) => `${item.sourceType}:${item.sourceId}`),
    ).size;
  }, [lastMonthPending]);

  const lastMonthPendingGroups = useMemo(
    () => groupUnbilledByReport(lastMonthPending?.items ?? []),
    [lastMonthPending],
  );

  const selectedLastMonthGroups = useMemo(
    () =>
      lastMonthPendingGroups.filter((group) =>
        selectedLastMonthSourceKeys.includes(group.key),
      ),
    [lastMonthPendingGroups, selectedLastMonthSourceKeys],
  );

  const selectedLastMonthAmount = useMemo(
    () =>
      selectedLastMonthGroups.reduce(
        (sum, group) =>
          sum + (Number.isFinite(group.amount) ? group.amount : 0),
        0,
      ),
    [selectedLastMonthGroups],
  );

  const previousMonthManualLines = useMemo(
    () =>
      (invoiceDetail?.manualLines ?? []).filter((line) =>
        String(line.description ?? "").startsWith(PREVIOUS_MONTH_MANUAL_PREFIX),
      ),
    [invoiceDetail?.manualLines],
  );

  const previousMonthAddedSummary = useMemo(() => {
    if (!invoiceDetail || invoiceDetail.invoiceKind !== "REPORT") {
      return { formCount: 0, reportAmount: 0, manualAmount: 0, total: 0 };
    }

    const periodStart = new Date(invoiceDetail.periodStart).getTime();
    const previousSourceKeys = new Set<string>();
    let reportAmount = 0;

    for (const line of invoiceDetail.lines ?? []) {
      const resultSent = line.resultSentToClientAt
        ? new Date(line.resultSentToClientAt).getTime()
        : Number.NaN;

      if (Number.isFinite(resultSent) && resultSent < periodStart) {
        previousSourceKeys.add(`${line.sourceType}:${line.sourceId}`);
        reportAmount += Number(line.amount ?? 0) || 0;
      }
    }

    for (const charge of invoiceDetail.extraCharges ?? []) {
      if (previousSourceKeys.has(`${charge.sourceType}:${charge.sourceId}`)) {
        reportAmount += Number(charge.amount ?? 0) || 0;
      }
    }

    const manualAmount = previousMonthManualLines.reduce(
      (sum, line) => sum + (Number(line.amount ?? 0) || 0),
      0,
    );

    return {
      formCount: previousSourceKeys.size,
      reportAmount,
      manualAmount,
      total: reportAmount + manualAmount,
    };
  }, [invoiceDetail, previousMonthManualLines]);

  const lastMonthPendingLabel = useMemo(
    () =>
      billingMonthLabel(
        lastMonthPending?.month ||
          previousBillingMonthKey(invoiceDetail?.periodStart),
      ),
    [lastMonthPending?.month, invoiceDetail?.periodStart],
  );

  const activeFilterChips = useMemo(() => {
    const defaults = defaultBillingFilters();
    const chips: {
      key: string;
      label: string;
      onClear: () => void;
    }[] = [];

    const isReportTab = tab === "OVERVIEW" || tab === "UNBILLED";
    const isInvoiceTab = tab === "INVOICES";
    const isPricingTab = tab === "PRICING";
    const showTaxonomy = isReportTab || isPricingTab;

    if (!isPricingTab && month !== defaults.month) {
      const [year, monthNumber] = month.split("-").map(Number);
      const date =
        Number.isFinite(year) && Number.isFinite(monthNumber)
          ? new Date(year, monthNumber - 1, 1)
          : null;

      const label =
        date && !Number.isNaN(date.getTime())
          ? new Intl.DateTimeFormat(undefined, {
              month: "long",
              year: "numeric",
            }).format(date)
          : month;

      chips.push({
        key: "month",
        label: `Billing Month: ${label}`,
        onClear: () => {
          setMonth(defaults.month);
          setPage(1);
        },
      });
    }

    if (clientCode.trim()) {
      const normalized = clientCode.trim().toUpperCase();
      const selectedClient = commonClientOptions.find(
        (client) => client.clientCode === normalized,
      );

      chips.push({
        key: "client",
        label: `Client: ${normalized}${
          selectedClient?.name ? ` — ${selectedClient.name}` : ""
        }`,
        onClear: () => {
          setClientCode(defaults.clientCode);
          setPage(1);
        },
      });
    }

    if (showTaxonomy && departmentFilter !== defaults.departmentFilter) {
      chips.push({
        key: "department",
        label: `Department: ${nice(departmentFilter)}`,
        onClear: () => {
          setDepartmentFilter(defaults.departmentFilter);
          setFormTypeFilter(defaults.formTypeFilter);
          setTestFilter(defaults.testFilter);
          setItemFilter(defaults.itemFilter);
        },
      });
    }

    if (showTaxonomy && formTypeFilter !== defaults.formTypeFilter) {
      chips.push({
        key: "form",
        label: `Form: ${nice(formTypeFilter)}`,
        onClear: () => {
          setFormTypeFilter(defaults.formTypeFilter);
          setTestFilter(defaults.testFilter);
          setItemFilter(defaults.itemFilter);
        },
      });
    }

    if (showTaxonomy && testFilter !== defaults.testFilter) {
      const testLabel =
        commonTestOptions.find((option) => option.value === testFilter)
          ?.label || nice(testFilter);

      chips.push({
        key: "test",
        label: `Test: ${testLabel}`,
        onClear: () => {
          setTestFilter(defaults.testFilter);
          setItemFilter(defaults.itemFilter);
        },
      });
    }

    if (showTaxonomy && itemFilter !== defaults.itemFilter) {
      const itemLabel =
        commonItemOptions.find((option) => option.value === itemFilter)
          ?.label || nice(itemFilter);

      chips.push({
        key: "item",
        label: `Item: ${itemLabel}`,
        onClear: () => setItemFilter(defaults.itemFilter),
      });
    }

    if (isReportTab && resultSentFrom) {
      chips.push({
        key: "resultSentFrom",
        label: `Result Sent From: ${resultSentFrom}`,
        onClear: () => setResultSentFrom(defaults.resultSentFrom),
      });
    }

    if (isReportTab && resultSentTo) {
      chips.push({
        key: "resultSentTo",
        label: `Result Sent To: ${resultSentTo}`,
        onClear: () => setResultSentTo(defaults.resultSentTo),
      });
    }

    if (isInvoiceTab && invoiceStatus !== defaults.invoiceStatus) {
      chips.push({
        key: "status",
        label: `Invoice Status: ${nice(invoiceStatus)}`,
        onClear: () => {
          setInvoiceStatus(defaults.invoiceStatus);
          setPage(1);
        },
      });
    }

    return chips;
  }, [
    tab,
    month,
    clientCode,
    departmentFilter,
    formTypeFilter,
    testFilter,
    itemFilter,
    resultSentFrom,
    resultSentTo,
    invoiceStatus,
    commonClientOptions,
    commonTestOptions,
    commonItemOptions,
  ]);

  function clearAllBillingFilters() {
    const defaults = defaultBillingFilters();

    setMonth(defaults.month);
    setClientCode(defaults.clientCode);
    setDepartmentFilter(defaults.departmentFilter);
    setFormTypeFilter(defaults.formTypeFilter);
    setTestFilter(defaults.testFilter);
    setItemFilter(defaults.itemFilter);
    setResultSentFrom(defaults.resultSentFrom);
    setResultSentTo(defaults.resultSentTo);
    setInvoiceStatus(defaults.invoiceStatus);
    setPerPage(defaults.perPage);
    setPage(defaults.page);
  }

  const activeCommonFilterCount = activeFilterChips.length;
  const hasActiveCommonFilters = activeCommonFilterCount > 0;

  function renderBillingFilterSection(targetTab: BillingTab) {
    const isReportTab = targetTab === "OVERVIEW" || targetTab === "UNBILLED";
    const isInvoiceTab = targetTab === "INVOICES";
    const isPricingTab = targetTab === "PRICING";
    const showTaxonomy = isReportTab || isPricingTab;

    const sectionTitle =
      targetTab === "OVERVIEW"
        ? "Overview Filters"
        : targetTab === "UNBILLED"
          ? "Unbilled Filters"
          : targetTab === "INVOICES"
            ? "Invoice Filters"
            : "Pricing Rule Filters";

    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {sectionTitle}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Filters are saved separately for this Billing section.
            </p>
          </div>

          <button
            type="button"
            onClick={clearAllBillingFilters}
            disabled={!hasActiveCommonFilters}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold shadow-sm transition ${
              hasActiveCommonFilters
                ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700"
                : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
            }`}
          >
            <X className="h-4 w-4" />
            Clear Filters
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {!isPricingTab && (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Billing Month
              </span>
              <input
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Client Code
            </span>
            <select
              value={clientCode}
              onChange={(e) => {
                setClientCode(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All Client Codes</option>
              {commonClientOptions.map((client) => (
                <option key={client.clientCode} value={client.clientCode}>
                  {client.clientCode}
                  {client.name ? ` — ${client.name}` : ""}
                </option>
              ))}
            </select>
          </label>

          {isReportTab && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Result Sent Date From
                </span>
                <input
                  type="date"
                  value={resultSentFrom}
                  onChange={(e) => setResultSentFrom(e.target.value)}
                  max={resultSentTo || undefined}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Result Sent Date To
                </span>
                <input
                  type="date"
                  value={resultSentTo}
                  onChange={(e) => setResultSentTo(e.target.value)}
                  min={resultSentFrom || undefined}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </>
          )}

          {showTaxonomy && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Department
                </span>
                <select
                  value={departmentFilter}
                  onChange={(e) => {
                    setDepartmentFilter(
                      e.target.value as "ALL" | "MICRO" | "CHEMISTRY",
                    );
                    setFormTypeFilter("ALL");
                    setTestFilter("ALL");
                    setItemFilter("ALL");
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ALL">All Departments</option>
                  <option value="MICRO">Micro</option>
                  <option value="CHEMISTRY">Chemistry</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Form Type
                </span>
                <select
                  value={formTypeFilter}
                  onChange={(e) => {
                    setFormTypeFilter(e.target.value);
                    setTestFilter("ALL");
                    setItemFilter("ALL");
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ALL">All Forms</option>
                  {commonFormOptions.map((formType) => (
                    <option key={formType} value={formType}>
                      {nice(formType)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Type of Test
                </span>
                <select
                  value={testFilter}
                  onChange={(e) => {
                    setTestFilter(e.target.value);
                    setItemFilter("ALL");
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ALL">All Tests</option>
                  {commonTestOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Pathogen / Active / COA Item
                </span>
                <select
                  value={itemFilter}
                  onChange={(e) => {
                    setItemFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ALL">All Items</option>
                  {commonItemOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {isInvoiceTab && (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Invoice Status
              </span>
              <select
                value={invoiceStatus}
                onChange={(e) => {
                  setInvoiceStatus(
                    e.target.value as "ALL" | BillingInvoiceStatus,
                  );
                  setPage(1);
                }}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {nice(status)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {activeFilterChips.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Active filters:
            </span>

            {activeFilterChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex max-w-[360px] items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm"
              >
                <span className="truncate">{chip.label}</span>
                <button
                  type="button"
                  onClick={chip.onClear}
                  className="ml-1 shrink-0 rounded-full px-1 text-blue-500 hover:bg-blue-100 hover:text-blue-800"
                  title={`Remove ${chip.label}`}
                  aria-label={`Remove ${chip.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>
    );
  }

  const unresolvedInSelected = visibleInvoiceLines.filter(
    (line) =>
      !!line.pricingIssue || line.unitPrice == null || line.amount == null,
  ).length;

  return (
    <>
      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-6 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="h-6 w-6 shrink-0 text-[var(--brand)]" />
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Billing
                </h1>
              </div>

              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Manage billable reports, invoice drafts, confirmed invoices,
                PDFs, delivery, and client pricing.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  refreshAll();

                  if (isManager) {
                    refreshPrices();
                    refreshBillingClients();
                  }
                }}
                disabled={loading || !!working}
                className="min-w-[96px]"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>

              <Button
                onClick={generateDrafts}
                disabled={working === "GENERATE" || loading}
                className="min-w-[148px]"
              >
                {working === "GENERATE" ? (
                  <Spinner />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Generate Drafts
              </Button>
            </div>
          </div>
        </section>

        <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {managerTabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => switchBillingTab(item)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === item
                  ? "bg-[var(--brand)] text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {nice(item)}
            </button>
          ))}
        </div>

        {loading && !summary ? (
          <div className="flex min-h-48 items-center justify-center rounded-xl border bg-white">
            <Spinner dark />
          </div>
        ) : null}

        {tab === "OVERVIEW" && summary && (
          <div className="space-y-5">
            {renderBillingFilterSection("OVERVIEW")}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <SummaryCard
                title="Unbilled"
                value={visibleUnbilledSummary.count}
                sub={money(visibleUnbilledSummary.estimatedSubtotal)}
                tone={
                  visibleUnbilledSummary.exceptionCount > 0
                    ? "warning"
                    : "default"
                }
                onClick={() => switchBillingTab("UNBILLED")}
              />

              <SummaryCard
                title="Exceptions"
                value={visibleUnbilledSummary.exceptionCount}
                sub="Pricing / source issues"
                tone={
                  visibleUnbilledSummary.exceptionCount > 0
                    ? "danger"
                    : "success"
                }
                onClick={() => switchBillingTab("UNBILLED")}
              />

              {(["DRAFT", "CONFIRMED", "SENT", "VOID"] as const).map(
                (status) => (
                  <SummaryCard
                    key={status}
                    title={nice(status)}
                    value={summary.invoices[status].count}
                    sub={money(summary.invoices[status].total)}
                    tone={
                      status === "SENT"
                        ? "success"
                        : status === "VOID"
                          ? "danger"
                          : status === "DRAFT"
                            ? "warning"
                            : "default"
                    }
                    onClick={() =>
                      switchBillingTab("INVOICES", {
                        invoiceStatus: status,
                        page: 1,
                      })
                    }
                  />
                ),
              )}
            </div>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-semibold text-slate-900">
                  Billing month overview
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {summary.month} · {summary.timeZone}
                </p>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Ready to invoice
                  </div>
                  <div className="mt-2 text-3xl font-bold">
                    {money(visibleUnbilledSummary.estimatedSubtotal)}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {visibleUnbilledSummary.count} unbilled charge
                    {visibleUnbilledSummary.count === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Sent invoices
                  </div>
                  <div className="mt-2 text-3xl font-bold">
                    {money(summary.invoices.SENT.total)}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {summary.invoices.SENT.count} invoice
                    {summary.invoices.SENT.count === 1 ? "" : "s"} sent
                  </div>
                </div>
              </div>
            </section>

            {isManager && visibleUnbilled.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Current Report Pricing
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Ready lines can be edited directly here. Edit Price opens
                      the exact pricing rule currently used by that report line.
                      Missing prices continue to show Set Price.
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => switchBillingTab("UNBILLED")}
                  >
                    View All Unbilled
                  </Button>
                </div>

                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full min-w-[1280px] text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                      <tr>
                        <th className="px-4 py-3">Form #</th>
                        <th className="px-4 py-3">Report #</th>
                        <th className="px-4 py-3">Client</th>
                        <th className="px-4 py-3">Form</th>
                        <th className="px-4 py-3">Sample Type</th>
                        <th className="px-4 py-3">Type of Test</th>
                        <th className="px-4 py-3">Item / Combination</th>
                        <th className="px-4 py-3 text-right">Price</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {visibleUnbilled.map((item) => {
                        const contextLabel =
                          item.itemLabel ||
                          (item.itemKey
                            ? nice(item.itemKey)
                            : item.testLabel || nice(item.testKey));

                        const ready =
                          !item.pricingIssue &&
                          item.unitPrice != null &&
                          item.amount != null;

                        return (
                          <tr
                            key={`overview-report-price-${item.chargeKey}`}
                            className={
                              ready ? "hover:bg-slate-50/70" : "bg-amber-50/30"
                            }
                          >
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {item.formNumber}
                            </td>
                            <td className="px-4 py-3">{item.reportNumber}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium">
                                {item.clientCode}
                              </div>
                              {unbilledClient(item) && (
                                <div className="text-xs text-slate-500">
                                  {unbilledClient(item)}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">{nice(item.formType)}</td>

                            <td className="px-4 py-3">
                              {billingSampleTypesFromSnapshot(
                                item.sourceSnapshot,
                              ).length > 0 ? (
                                <div className="flex max-w-[220px] flex-wrap gap-1.5">
                                  {billingSampleTypesFromSnapshot(
                                    item.sourceSnapshot,
                                  ).map((sampleType) => (
                                    <span
                                      key={sampleType}
                                      className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800"
                                    >
                                      {sampleType}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  -
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              {item.testLabel || nice(item.testKey)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-800">
                                {contextLabel}
                              </div>
                              {isCombinationItemKey(item.itemKey) && (
                                <div className="mt-0.5 text-[11px] font-medium text-violet-600">
                                  Fixed Combination
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold">
                              {item.unitPrice == null
                                ? "—"
                                : money(item.unitPrice)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col items-start gap-1.5">
                                {ready ? (
                                  <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                    Ready
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                    Pricing Needed
                                  </span>
                                )}

                                {item.deletionHistory?.previouslyDeleted && (
                                  <span
                                    className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700"
                                    title={`Last deleted ${formatDateTime(
                                      item.deletionHistory.lastDeletedAt,
                                    )}`}
                                  >
                                    Previously Deleted ·{" "}
                                    {item.deletionHistory.deletionCount}×
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="secondary"
                                  disabled={
                                    billingViewLoadingKey ===
                                    `${item.sourceType}:${item.sourceId}`
                                  }
                                  onClick={() => openBillingReport(item)}
                                >
                                  {billingViewLoadingKey ===
                                  `${item.sourceType}:${item.sourceId}` ? (
                                    <Spinner dark />
                                  ) : (
                                    <FileText className="h-4 w-4" />
                                  )}
                                  {billingViewLoadingKey ===
                                  `${item.sourceType}:${item.sourceId}`
                                    ? "Opening..."
                                    : "View"}
                                </Button>

                                {ready &&
                                  item.deletionHistory
                                    ?.canRestoreToOriginalDraft && (
                                    <Button
                                      variant="secondary"
                                      disabled={
                                        working ===
                                        `RESTORE_DELETED:${item.chargeKey}`
                                      }
                                      onClick={() =>
                                        restoreDeletedUnbilledLine(item)
                                      }
                                    >
                                      {working ===
                                      `RESTORE_DELETED:${item.chargeKey}` ? (
                                        <Spinner dark />
                                      ) : (
                                        <RotateCcw className="h-4 w-4" />
                                      )}
                                      Restore
                                    </Button>
                                  )}

                                {ready && item.pricingRuleId ? (
                                  <Button
                                    variant="secondary"
                                    onClick={() =>
                                      openExistingPriceFromUnbilled(item)
                                    }
                                  >
                                    <Pencil className="h-4 w-4" />
                                    Edit Price
                                  </Button>
                                ) : isMissingPricingRule(item.pricingIssue) ? (
                                  <Button
                                    variant="secondary"
                                    onClick={() =>
                                      openPricingFromUnbilled(item)
                                    }
                                  >
                                    <CircleDollarSign className="h-4 w-4" />
                                    Set Price
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {isManager && (
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-900">
                      Existing Client Pricing
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Review and edit existing prices directly from Overview.
                      The selected Billing filters also filter this list.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {visiblePrices.length} rule
                      {visiblePrices.length === 1 ? "" : "s"}
                    </span>

                    <Button
                      variant="secondary"
                      onClick={() => switchBillingTab("PRICING")}
                    >
                      <Plus className="h-4 w-4" />
                      Add Pricing
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={refreshPrices}
                      disabled={pricesLoading}
                    >
                      {pricesLoading ? (
                        <Spinner dark />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      Refresh
                    </Button>
                  </div>
                </div>

                <div className="max-h-[460px] overflow-auto">
                  <table className="w-full min-w-[1240px] text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                      <tr>
                        <th className="px-4 py-3">Client Code</th>
                        <th className="px-4 py-3">Client</th>
                        <th className="px-4 py-3">Department</th>
                        <th className="px-4 py-3">Form</th>
                        <th className="px-4 py-3">Test</th>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3">Item / Combination</th>
                        <th className="px-4 py-3 text-right">Price</th>
                        <th className="px-4 py-3">Effective</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Edit</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {visiblePrices.map((rule) => (
                        <tr
                          key={`overview-price-${rule.id}`}
                          className="hover:bg-slate-50/70"
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {rule.clientCode}
                          </td>

                          <td className="px-4 py-3">
                            {rule.client || "DEFAULT"}
                          </td>

                          <td className="px-4 py-3">{nice(rule.department)}</td>

                          <td className="px-4 py-3">{nice(rule.formType)}</td>

                          <td className="px-4 py-3">
                            {rule.testLabel || nice(rule.testKey)}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                isCombinationItemKey(rule.itemKey)
                                  ? "bg-violet-50 text-violet-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {isCombinationItemKey(rule.itemKey)
                                ? "Fixed Combination"
                                : "Individual"}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">
                              {rule.itemLabel ||
                                (rule.itemKey
                                  ? nice(rule.itemKey)
                                  : "Type of Test only")}
                            </div>
                            {rule.itemKey && (
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                {rule.itemKey}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-semibold">
                            {money(rule.unitPrice)}
                          </td>

                          <td className="px-4 py-3 text-xs">
                            <div>{formatDate(rule.effectiveFrom)}</div>
                            {rule.effectiveTo && (
                              <div className="text-slate-500">
                                to {formatDate(rule.effectiveTo)}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                                rule.active
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {rule.active ? "ACTIVE" : "INACTIVE"}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="secondary"
                              onClick={() => openEditPriceRule(rule)}
                              disabled={!!working}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Button>
                          </td>
                        </tr>
                      ))}

                      {!pricesLoading && visiblePrices.length === 0 && (
                        <tr>
                          <td
                            colSpan={11}
                            className="px-4 py-12 text-center text-sm text-slate-500"
                          >
                            No pricing rules found for the selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "INVOICES" && (
          <div className="space-y-5">
            {renderBillingFilterSection("INVOICES")}

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Invoices</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Draft, confirmed, sent, and void invoice history.
                  </p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  {isManager && (
                    <Button
                      onClick={openCreateManualInvoice}
                      disabled={working === "CREATE_MANUAL_INVOICE"}
                    >
                      {working === "CREATE_MANUAL_INVOICE" ? (
                        <Spinner />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Create Manual Invoice
                    </Button>
                  )}

                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-500">
                      Rows
                    </span>
                    <select
                      value={perPage}
                      onChange={(e) => setPerPage(Number(e.target.value))}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    >
                      {[10, 25, 50, 100].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Invoice #</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Lines</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                      <th className="px-4 py-3 text-right">Adjustment</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">PDF</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {(invoices?.items ?? []).map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {row.invoiceNumber || "DRAFT"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{row.clientCode}</div>
                          {row.clientName && (
                            <div className="text-xs text-slate-500">
                              {row.clientName}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                              row.invoiceKind === "MANUAL"
                                ? "bg-violet-50 text-violet-700 ring-violet-200"
                                : "bg-slate-50 text-slate-700 ring-slate-200"
                            }`}
                          >
                            {row.invoiceKind === "MANUAL"
                              ? "Manual"
                              : "Reports"}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-slate-600">
                          {row.invoiceKind === "MANUAL"
                            ? "—"
                            : formatDate(row.periodStart)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusClass(
                              row.status,
                            )}`}
                          >
                            {nice(row.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.invoiceKind === "MANUAL"
                            ? (row._count?.manualLines ?? 0)
                            : (row._count?.lines ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {money(row.subtotal)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {money(row.adjustmentAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {money(row.total)}
                        </td>
                        <td className="px-4 py-3">
                          {row.pdfFilename ? (
                            <Button
                              variant="secondary"
                              onClick={() => viewInvoicePdfFromList(row)}
                              disabled={working === `VIEW_ROW_PDF:${row.id}`}
                            >
                              {working === `VIEW_ROW_PDF:${row.id}` ? (
                                <Spinner dark />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                              View PDF
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Not generated
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="secondary"
                            onClick={() => openInvoice(row.id)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}

                    {!loading && (invoices?.items?.length ?? 0) === 0 && (
                      <tr>
                        <td
                          colSpan={11}
                          className="px-4 py-12 text-center text-sm text-slate-500"
                        >
                          No invoices found for the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
                <div className="text-xs text-slate-500">
                  {invoices?.total ?? 0} invoice
                  {(invoices?.total ?? 0) === 1 ? "" : "s"}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>

                  <span className="text-sm text-slate-600">
                    Page {invoices?.page ?? page} of{" "}
                    {Math.max(1, invoices?.pages ?? 1)}
                  </span>

                  <Button
                    variant="secondary"
                    disabled={page >= Math.max(1, invoices?.pages ?? 1)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "UNBILLED" && (
          <div className="space-y-5">
            {renderBillingFilterSection("UNBILLED")}

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Unbilled reports
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {visibleUnbilledSummary.formCount} form
                    {visibleUnbilledSummary.formCount === 1 ? "" : "s"} ·{" "}
                    {visibleUnbilledSummary.count} charge
                    {visibleUnbilledSummary.count === 1 ? "" : "s"} ·{" "}
                    {visibleUnbilledSummary.exceptionCount} exception
                    {visibleUnbilledSummary.exceptionCount === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">
                    Estimated subtotal
                  </div>
                  <div className="text-xl font-bold text-slate-900">
                    {money(visibleUnbilledSummary.estimatedSubtotal)}
                  </div>
                </div>
              </div>

              {visibleUnbilledSummary.exceptionCount > 0 && (
                <div className="m-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <div className="font-semibold">
                      Billing exceptions need attention
                    </div>
                    <div className="mt-1 text-xs">
                      Missing pricing or invalid source data will never be
                      silently billed at $0.
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Form #</th>
                      <th className="px-4 py-3">Report #</th>
                      <th className="px-4 py-3">Form Type</th>
                      <th className="px-4 py-3">Sample Type</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Type of Test</th>
                      <th className="px-4 py-3">
                        Pathogens / Actives / COA Items
                      </th>
                      <th className="px-4 py-3">Unit Price</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Billing Ready</th>
                      <th className="px-4 py-3">Issue</th>
                      <th className="px-4 py-3">History</th>
                      <th className="px-4 py-3 text-right">View</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {groupedVisibleUnbilled.map((group) => (
                      <tr
                        key={group.key}
                        className={
                          group.pricingIssues.length > 0
                            ? "bg-amber-50/40 align-top"
                            : "align-top hover:bg-slate-50"
                        }
                      >
                        <td className="px-4 py-3 font-medium">
                          {group.formNumber}
                        </td>

                        <td className="px-4 py-3">{group.reportNumber}</td>

                        <td className="px-4 py-3">{nice(group.formType)}</td>

                        <td className="px-4 py-3">
                          {group.sampleTypes.length > 0 ? (
                            <div className="flex max-w-[220px] flex-wrap gap-1.5">
                              {group.sampleTypes.map((sampleType) => (
                                <span
                                  key={sampleType}
                                  className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800"
                                >
                                  {sampleType}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>

                        <td className="max-w-[220px] px-4 py-3 text-xs leading-5 text-slate-600">
                          <div>{group.description || "-"}</div>
                          {group.client && (
                            <div className="mt-1 font-semibold text-slate-800">
                              Client: {group.client}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex max-w-[220px] flex-wrap gap-1.5">
                            {group.testLabels.map((label) => (
                              <span
                                key={label}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                              >
                                {label}
                              </span>
                            ))}

                            {group.testLabels.length === 0 && "-"}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex max-w-[280px] flex-wrap gap-1.5">
                            {group.itemLabels.map((label) => (
                              <span
                                key={label}
                                className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800"
                              >
                                {label}
                              </span>
                            ))}

                            {group.itemLabels.length === 0 && (
                              <span className="text-xs text-slate-500">
                                Type of Test only
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            {group.items.map((item) => {
                              const label =
                                item.itemLabel ||
                                (item.itemKey
                                  ? nice(item.itemKey)
                                  : item.testLabel || nice(item.testKey));

                              return (
                                <div
                                  key={item.chargeKey}
                                  className="flex min-w-[170px] items-center justify-between gap-3 text-xs"
                                >
                                  <span className="max-w-[120px] truncate text-slate-500">
                                    {label}
                                  </span>

                                  <span
                                    className={
                                      item.unitPrice == null
                                        ? "font-medium text-amber-700"
                                        : "font-medium text-slate-800"
                                    }
                                  >
                                    {item.unitPrice == null
                                      ? "Missing"
                                      : money(item.unitPrice)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {group.amount > 0
                            ? money(group.amount)
                            : group.missingAmount
                              ? "-"
                              : money(0)}
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-500">
                          {formatDateTime(group.billingReadyAt)}
                        </td>

                        <td className="max-w-[300px] px-4 py-3 text-xs">
                          {group.pricingIssues.length > 0 ? (
                            <div className="space-y-2">
                              {group.pricingIssues.map((item) => {
                                const contextLabel =
                                  item.itemLabel ||
                                  (item.itemKey
                                    ? nice(item.itemKey)
                                    : item.testLabel || nice(item.testKey));

                                return isManager &&
                                  isMissingPricingRule(item.pricingIssue) ? (
                                  <button
                                    key={item.chargeKey}
                                    type="button"
                                    onClick={() =>
                                      openPricingFromUnbilled(item)
                                    }
                                    className="group flex w-full items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-left text-amber-900 transition hover:border-amber-300 hover:bg-amber-100"
                                    title={`Create missing pricing rule for ${contextLabel}`}
                                  >
                                    <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0" />

                                    <span className="min-w-0">
                                      <span className="block truncate font-medium">
                                        {contextLabel}
                                      </span>

                                      <span className="mt-0.5 block text-[11px]">
                                        {item.pricingIssue}
                                      </span>

                                      <span className="mt-1 block font-semibold text-[var(--brand)] group-hover:underline">
                                        Set Price →
                                      </span>
                                    </span>
                                  </button>
                                ) : (
                                  <div
                                    key={item.chargeKey}
                                    className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900"
                                  >
                                    <div className="font-medium">
                                      {contextLabel}
                                    </div>
                                    <div className="mt-0.5 text-[11px]">
                                      {item.pricingIssue}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="font-medium text-emerald-700">
                                Ready
                              </div>

                              {isManager &&
                                group.items.map((item) => {
                                  const contextLabel =
                                    item.itemLabel ||
                                    (item.itemKey
                                      ? nice(item.itemKey)
                                      : item.testLabel || nice(item.testKey));

                                  return (
                                    <button
                                      key={`ready-price-${item.chargeKey}`}
                                      type="button"
                                      onClick={() =>
                                        openExistingPriceFromUnbilled(item)
                                      }
                                      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-left text-emerald-900 transition hover:border-emerald-300 hover:bg-emerald-100"
                                      title={`Edit existing price for ${contextLabel}`}
                                    >
                                      <span className="min-w-0">
                                        <span className="block max-w-[170px] truncate text-[11px] font-medium">
                                          {contextLabel}
                                        </span>
                                        <span className="mt-0.5 block text-[11px] text-emerald-700">
                                          {item.unitPrice == null
                                            ? "Price unavailable"
                                            : money(item.unitPrice)}
                                        </span>
                                      </span>

                                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[var(--brand)] group-hover:underline">
                                        <Pencil className="h-3.5 w-3.5" />
                                        Edit Price
                                      </span>
                                    </button>
                                  );
                                })}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-xs">
                          {group.items.some(
                            (item) => item.deletionHistory?.previouslyDeleted,
                          ) ? (
                            <div className="space-y-2">
                              {group.items
                                .filter(
                                  (item) =>
                                    item.deletionHistory?.previouslyDeleted,
                                )
                                .map((item) => {
                                  const history = item.deletionHistory!;

                                  const contextLabel =
                                    item.itemLabel ||
                                    (item.itemKey
                                      ? nice(item.itemKey)
                                      : item.testLabel || nice(item.testKey));

                                  const ready =
                                    !item.pricingIssue &&
                                    item.unitPrice != null &&
                                    item.amount != null;

                                  return (
                                    <div
                                      key={`deleted-history-${item.chargeKey}`}
                                      className="min-w-[210px] rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-rose-900"
                                    >
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                                          Previously Deleted ·{" "}
                                          {history.deletionCount}×
                                        </span>
                                      </div>

                                      <div className="mt-1.5 truncate font-medium">
                                        {contextLabel}
                                      </div>

                                      <div className="mt-1 text-[11px] text-rose-700">
                                        Last deleted:{" "}
                                        {formatDateTime(history.lastDeletedAt)}
                                      </div>

                                      {(history.lastDeletedInvoiceNumber ||
                                        history.lastDeletedInvoiceStatus) && (
                                        <div className="mt-0.5 text-[11px] text-rose-700">
                                          From:{" "}
                                          {history.lastDeletedInvoiceNumber ||
                                            "Draft invoice"}
                                          {history.lastDeletedInvoiceStatus
                                            ? ` · ${nice(history.lastDeletedInvoiceStatus)}`
                                            : ""}
                                        </div>
                                      )}

                                      {isManager &&
                                        history.canRestoreToOriginalDraft &&
                                        ready && (
                                          <button
                                            type="button"
                                            disabled={
                                              working ===
                                              `RESTORE_DELETED:${item.chargeKey}`
                                            }
                                            onClick={() =>
                                              restoreDeletedUnbilledLine(item)
                                            }
                                            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                          >
                                            {working ===
                                            `RESTORE_DELETED:${item.chargeKey}` ? (
                                              <Spinner dark />
                                            ) : (
                                              <RotateCcw className="h-3.5 w-3.5" />
                                            )}
                                            Restore to Invoice
                                          </button>
                                        )}

                                      {isManager &&
                                        history.canRestoreToOriginalDraft &&
                                        !ready && (
                                          <div className="mt-2 text-[11px] font-medium text-amber-700">
                                            Resolve pricing before restoring.
                                          </div>
                                        )}

                                      {!history.canRestoreToOriginalDraft && (
                                        <div className="mt-2 text-[11px] font-medium text-slate-600">
                                          Original invoice is no longer an
                                          editable draft.
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="secondary"
                            disabled={
                              billingViewLoadingKey ===
                              `${group.sourceType}:${group.sourceId}`
                            }
                            onClick={() =>
                              openBillingReport({
                                sourceType: group.sourceType,
                                sourceId: group.sourceId,
                                formType: group.formType,
                                formNumber: group.formNumber,
                                reportNumber: group.reportNumber,
                              })
                            }
                          >
                            {billingViewLoadingKey ===
                            `${group.sourceType}:${group.sourceId}` ? (
                              <Spinner dark />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                            {billingViewLoadingKey ===
                            `${group.sourceType}:${group.sourceId}`
                              ? "Opening..."
                              : "View"}
                          </Button>
                        </td>
                      </tr>
                    ))}

                    {!loading && groupedVisibleUnbilled.length === 0 && (
                      <tr>
                        <td
                          colSpan={13}
                          className="px-4 py-12 text-center text-sm text-slate-500"
                        >
                          No unbilled forms for this month.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "PRICING" && isManager && (
          <div className="space-y-5">
            {renderBillingFilterSection("PRICING")}

            <form
              id="billing-pricing-rule-form"
              onSubmit={createPriceRule}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-[var(--brand)]" />
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Create pricing rule
                  </h2>
                  <p className="text-xs text-slate-500">
                    Client names are collected automatically from existing
                    reports. Select a discovered client, use DEFAULT for the
                    whole Client Code, or choose Other to enter a new client
                    manually.
                  </p>
                </div>
              </div>

              {pricingPrefillMessage && (
                <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                  <div className="flex items-start gap-3">
                    <CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0" />

                    <div>
                      <div className="font-semibold">Missing pricing rule</div>

                      <div className="mt-1 text-xs leading-5">
                        {pricingPrefillMessage}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPricingPrefillMessage(null)}
                    className="rounded-md p-1 text-sky-700 hover:bg-sky-100"
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-slate-900">
                    Pricing Method
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Choose how this Client + Form + Type of Test is priced.
                    Individual pricing charges selected items separately. Once a
                    fixed combination rule is configured for the scope, billing
                    requires an exact combination price and does not fall back
                    to individual prices.
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPriceForm((p) => ({
                        ...p,
                        pricingMethod: "INDIVIDUAL",
                      }))
                    }
                    className={`rounded-xl border p-4 text-left transition ${
                      priceForm.pricingMethod === "INDIVIDUAL"
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-4 w-4 rounded-full border-4 ${
                          priceForm.pricingMethod === "INDIVIDUAL"
                            ? "border-blue-600 bg-white"
                            : "border-slate-300 bg-white"
                        }`}
                      />
                      <span className="font-semibold text-slate-900">
                        Individual Item Pricing
                      </span>
                    </div>

                    <div className="mt-2 text-xs leading-5 text-slate-500">
                      Set one price for each pathogen, active, or COA item.
                      Existing pricing continues to work exactly as it does now.
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={!pricingSupportsCombination}
                    onClick={() =>
                      setPriceForm((p) => ({
                        ...p,
                        pricingMethod: "COMBINATION",
                        itemKey: "",
                        itemLabel: "",
                        customItemLabel: "",
                      }))
                    }
                    className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      priceForm.pricingMethod === "COMBINATION"
                        ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-4 w-4 rounded-full border-4 ${
                          priceForm.pricingMethod === "COMBINATION"
                            ? "border-violet-600 bg-white"
                            : "border-slate-300 bg-white"
                        }`}
                      />
                      <span className="font-semibold text-slate-900">
                        Combination Pricing
                      </span>
                    </div>

                    <div className="mt-2 text-xs leading-5 text-slate-500">
                      Set one fixed price for an exact Type of Test +
                      pathogen/active combination. Missing combinations become
                      pricing exceptions. Available for Micro Mix, Micro Mix
                      Water, and Chemistry Mix.
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label>
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Client Code
                  </span>

                  <select
                    required
                    value={priceForm.clientCode}
                    onChange={(e) =>
                      setPriceForm((p) => ({
                        ...p,
                        clientCode: e.target.value,
                        client: "",
                        customClientName: "",
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">Select Client</option>

                    {commonClientOptions.map((client) => (
                      <option key={client.clientCode} value={client.clientCode}>
                        {client.clientCode}
                        {client.name ? ` — ${client.name}` : ""}
                        {client.billingEnabled === false
                          ? " — Billing Disabled"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
                    <span>Client Name</span>

                    {pricingClientDirectoryLoading && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-normal text-slate-400">
                        <Spinner dark />
                        Updating list
                      </span>
                    )}
                  </span>

                  <select
                    value={priceForm.client}
                    onChange={(e) =>
                      setPriceForm((p) => ({
                        ...p,
                        client: e.target.value,
                        customClientName:
                          e.target.value === CUSTOM_CLIENT_VALUE
                            ? p.customClientName
                            : "",
                      }))
                    }
                    disabled={!priceForm.clientCode}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
                  >
                    <option value="">
                      {priceForm.clientCode
                        ? `DEFAULT — All ${priceForm.clientCode} Clients`
                        : "Select Client Code first"}
                    </option>

                    {pricingClientOptions.map((client) => (
                      <option key={client.toUpperCase()} value={client}>
                        {client}
                      </option>
                    ))}

                    {priceForm.clientCode && (
                      <option value={CUSTOM_CLIENT_VALUE}>
                        + Other / Enter Client Manually
                      </option>
                    )}
                  </select>

                  <div className="mt-1 text-[11px] leading-4 text-slate-500">
                    Names are collected automatically from existing reports.
                    DEFAULT keeps a fallback price for the whole Client Code.
                  </div>
                </label>

                {priceForm.client === CUSTOM_CLIENT_VALUE && (
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Other Client Name
                    </span>

                    <input
                      autoFocus
                      value={priceForm.customClientName}
                      onChange={(e) =>
                        setPriceForm((p) => ({
                          ...p,
                          customClientName: e.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      placeholder="Enter exact client name"
                    />

                    <div className="mt-1 text-[11px] leading-4 text-slate-500">
                      It will be saved to the client-name directory when this
                      pricing rule is created.
                    </div>
                  </label>
                )}

                <label>
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Department
                  </span>
                  <select
                    value={priceForm.department}
                    onChange={(e) => {
                      const department = e.target.value as
                        | "MICRO"
                        | "CHEMISTRY";

                      const formType =
                        department === "MICRO" ? "MICRO_MIX" : "CHEMISTRY_MIX";

                      setPriceForm((p) => ({
                        ...p,
                        department,
                        formType,
                        pricingMethod: supportsCombinationPricing(formType)
                          ? p.pricingMethod
                          : "INDIVIDUAL",
                        combinationItemKeys: [],

                        testKey: "",
                        testLabel: "",

                        itemKey: "",
                        itemLabel: "",

                        customTestLabel: "",
                        customItemLabel: "",
                      }));
                    }}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="MICRO">Micro</option>
                    <option value="CHEMISTRY">Chemistry</option>
                  </select>
                </label>

                <label>
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Form Type
                  </span>
                  <select
                    value={priceForm.formType}
                    onChange={(e) => {
                      const formType = e.target.value;

                      setPriceForm((p) => ({
                        ...p,
                        formType,
                        pricingMethod: supportsCombinationPricing(formType)
                          ? p.pricingMethod
                          : "INDIVIDUAL",
                        combinationItemKeys: [],

                        testKey: "",
                        testLabel: "",

                        itemKey: "",
                        itemLabel: "",

                        customTestLabel: "",
                        customItemLabel: "",
                      }));
                    }}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    {FORM_OPTIONS.filter((ft) =>
                      priceForm.department === "MICRO"
                        ? [
                            "MICRO_MIX",
                            "MICRO_MIX_WATER",
                            "STERILITY",
                            "APE",
                          ].includes(ft)
                        : ["CHEMISTRY_MIX", "COA"].includes(ft),
                    ).map((ft) => (
                      <option key={ft} value={ft}>
                        {nice(ft)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Type of Test
                  </span>

                  <select
                    required
                    value={priceForm.testKey}
                    onChange={(e) => {
                      const testKey = e.target.value;

                      const selected = pricingTestOptions.find(
                        (option) => option.value === testKey,
                      );

                      setPriceForm((p) => ({
                        ...p,

                        testKey,

                        testLabel: selected?.label ?? "",

                        customTestLabel:
                          testKey === CUSTOM_TEST_VALUE
                            ? p.customTestLabel
                            : "",
                      }));
                    }}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">Select Type of Test</option>

                    {pricingTestOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}

                    {priceForm.formType !== "CHEMISTRY_MIX" &&
                      priceForm.formType !== "COA" && (
                        <option value={CUSTOM_TEST_VALUE}>
                          Other / Custom Test
                        </option>
                      )}
                  </select>
                </label>

                {priceForm.testKey === CUSTOM_TEST_VALUE && (
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Custom Type of Test
                    </span>
                    <input
                      required
                      value={priceForm.customTestLabel}
                      onChange={(e) =>
                        setPriceForm((p) => ({
                          ...p,
                          customTestLabel: e.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                      placeholder="Enter exact Type of Test"
                    />
                  </label>
                )}

                {priceForm.pricingMethod === "INDIVIDUAL" &&
                  pricingSupportsItem && (
                    <label>
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        {pricingItemName(priceForm.formType)}
                      </span>

                      <select
                        required={pricingRequiresItem}
                        value={priceForm.itemKey}
                        onChange={(e) => {
                          const itemKey = e.target.value;

                          const selected = pricingItemOptions.find(
                            (option) => option.value === itemKey,
                          );

                          setPriceForm((p) => ({
                            ...p,

                            itemKey,

                            itemLabel: selected?.label ?? "",

                            customItemLabel:
                              itemKey === CUSTOM_ITEM_VALUE
                                ? p.customItemLabel
                                : "",
                          }));
                        }}
                        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      >
                        <option value="">
                          {priceForm.formType === "MICRO_MIX" ||
                          priceForm.formType === "MICRO_MIX_WATER"
                            ? "No Pathogen / Type of Test only"
                            : `Select ${pricingItemName(priceForm.formType)}`}
                        </option>

                        {pricingItemOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}

                        <option value={CUSTOM_ITEM_VALUE}>
                          Other / Custom {pricingItemName(priceForm.formType)}
                        </option>
                      </select>
                    </label>
                  )}

                {priceForm.pricingMethod === "INDIVIDUAL" &&
                  pricingSupportsItem &&
                  priceForm.itemKey === CUSTOM_ITEM_VALUE && (
                    <label>
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Custom {pricingItemName(priceForm.formType)} Name
                      </span>

                      <input
                        required
                        value={priceForm.customItemLabel}
                        onChange={(e) =>
                          setPriceForm((p) => ({
                            ...p,
                            customItemLabel: e.target.value,
                          }))
                        }
                        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                        placeholder={
                          priceForm.formType === "COA"
                            ? "e.g. Heavy Metals"
                            : priceForm.formType === "MICRO_MIX" ||
                                priceForm.formType === "MICRO_MIX_WATER"
                              ? "e.g. Enter custom pathogen"
                              : "e.g. Niacinamide"
                        }
                      />
                    </label>
                  )}

                {priceForm.pricingMethod === "COMBINATION" &&
                  pricingSupportsCombination && (
                    <div className="md:col-span-2 xl:col-span-4">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate-600">
                          Select{" "}
                          {priceForm.department === "MICRO"
                            ? "Pathogen Combination"
                            : "Active Combination"}
                        </span>

                        <span className="text-[11px] text-slate-400">
                          Select at least 2
                        </span>
                      </div>

                      <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {pricingItemOptions
                            .filter((option) => option.value !== "OTHER")
                            .map((option) => {
                              const checked =
                                priceForm.combinationItemKeys.includes(
                                  option.value,
                                );

                              return (
                                <label
                                  key={option.value}
                                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                                    checked
                                      ? "border-violet-300 bg-violet-50 text-violet-950"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setPriceForm((p) => ({
                                        ...p,
                                        combinationItemKeys: e.target.checked
                                          ? Array.from(
                                              new Set([
                                                ...p.combinationItemKeys,
                                                option.value,
                                              ]),
                                            )
                                          : p.combinationItemKeys.filter(
                                              (value) => value !== option.value,
                                            ),
                                      }))
                                    }
                                    className="h-4 w-4 rounded border-slate-300"
                                  />

                                  <span>{option.label}</span>
                                </label>
                              );
                            })}
                        </div>
                      </div>

                      <div className="mt-1 text-[11px] leading-4 text-slate-500">
                        The order does not matter. The same selected items
                        always create the same combination pricing identity.
                      </div>
                    </div>
                  )}

                {priceForm.pricingMethod === "COMBINATION" &&
                  combinationPricingPreview && (
                    <div className="md:col-span-2 xl:col-span-4">
                      <div className="grid gap-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4 md:grid-cols-3">
                        <div className="md:col-span-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                            Selected Combination
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            {combinationPricingPreview.itemLabel ||
                              "Select at least two items"}
                          </div>

                          {combinationPricingPreview.itemKey && (
                            <div className="mt-1 break-all text-[11px] text-slate-500">
                              {combinationPricingPreview.itemKey}
                            </div>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Existing Individual Total
                          </div>
                          <div className="mt-1 text-lg font-bold text-slate-900">
                            {money(combinationPricingPreview.individualTotal)}
                          </div>

                          {combinationPricingPreview.missingIndividual.length >
                          0 ? (
                            <div className="mt-1 text-[11px] leading-4 text-amber-700">
                              Missing individual price:{" "}
                              {combinationPricingPreview.missingIndividual.join(
                                ", ",
                              )}
                            </div>
                          ) : (
                            <div className="mt-1 text-[11px] text-emerald-700">
                              All selected individual prices are configured.
                            </div>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Existing Combination Price
                          </div>
                          <div className="mt-1 text-lg font-bold text-slate-900">
                            {combinationPricingPreview.combinationRule
                              ? money(
                                  combinationPricingPreview.combinationRule
                                    .unitPrice,
                                )
                              : "Not Set"}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            Exact client rule is used first, then Client Code
                            DEFAULT.
                          </div>

                          {combinationPricingPreview.combinationRule && (
                            <Button
                              variant="secondary"
                              className="mt-3 w-full"
                              onClick={() =>
                                openEditPriceRule(
                                  combinationPricingPreview.combinationRule!,
                                )
                              }
                            >
                              <Pencil className="h-4 w-4" />
                              Edit Existing Price
                            </Button>
                          )}
                        </div>

                        <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Suggested Starting Price
                            </div>
                            <div className="mt-1 text-lg font-bold text-slate-900">
                              {money(combinationPricingPreview.individualTotal)}
                            </div>
                          </div>

                          <Button
                            variant="secondary"
                            className="mt-3 w-full"
                            disabled={
                              combinationPricingPreview.selectedOptions.length <
                                2 ||
                              combinationPricingPreview.missingIndividual
                                .length > 0
                            }
                            onClick={() =>
                              setPriceForm((p) => ({
                                ...p,
                                unitPrice:
                                  combinationPricingPreview.individualTotal.toFixed(
                                    2,
                                  ),
                              }))
                            }
                          >
                            Use Existing Total
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                {priceForm.pricingMethod === "INDIVIDUAL" &&
                  individualPricingPreview && (
                    <div className="md:col-span-2 xl:col-span-4">
                      <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                            Existing Set Price
                          </div>

                          {individualPricingPreview.rule ? (
                            <>
                              <div className="mt-1 text-xl font-bold text-slate-900">
                                {money(individualPricingPreview.rule.unitPrice)}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                Effective{" "}
                                {formatDate(
                                  individualPricingPreview.rule.effectiveFrom,
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="mt-1 text-sm font-medium text-slate-600">
                              No existing price is configured for this exact
                              selection.
                            </div>
                          )}
                        </div>

                        {individualPricingPreview.rule && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              openEditPriceRule(individualPricingPreview.rule!)
                            }
                          >
                            <Pencil className="h-4 w-4" />
                            Edit Existing Price
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                <label>
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    {priceForm.pricingMethod === "COMBINATION"
                      ? "Combination Price"
                      : "Unit Price"}
                  </span>
                  <input
                    id="billing-pricing-unit-price"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceForm.unitPrice}
                    onChange={(e) =>
                      setPriceForm((p) => ({
                        ...p,
                        unitPrice: e.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                    placeholder="110.00"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Effective From
                  </span>
                  <input
                    required
                    type="date"
                    value={priceForm.effectiveFrom}
                    onChange={(e) =>
                      setPriceForm((p) => ({
                        ...p,
                        effectiveFrom: e.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </label>

                <div className="flex items-end">
                  <Button
                    type="submit"
                    disabled={working === "CREATE_PRICE"}
                    className="w-full"
                  >
                    {working === "CREATE_PRICE" ? (
                      <Spinner />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Create Rule
                  </Button>
                </div>
              </div>
            </form>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    Pricing rules
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {visiblePrices.length} rule
                    {visiblePrices.length === 1 ? "" : "s"}
                  </p>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => {
                    refreshPrices();
                    refreshBillingClients();
                  }}
                  disabled={pricesLoading}
                >
                  {pricesLoading ? (
                    <Spinner dark />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1240px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Client Code</th>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Form</th>
                      <th className="px-4 py-3">Test</th>
                      <th className="px-4 py-3">Pricing Method</th>
                      <th className="px-4 py-3">
                        Pathogen / Active / COA Item
                      </th>
                      <th className="px-4 py-3">Basis</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3">Effective</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {visiblePrices.map((rule) => (
                      <tr key={rule.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium">
                          {rule.clientCode}
                        </td>

                        <td className="px-4 py-3">
                          {rule.client ? (
                            <span className="font-medium text-slate-800">
                              {rule.client}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                              DEFAULT
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">{nice(rule.department)}</td>
                        <td className="px-4 py-3">{nice(rule.formType)}</td>
                        <td className="px-4 py-3">
                          {rule.testLabel || nice(rule.testKey)}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                              isCombinationItemKey(rule.itemKey)
                                ? "bg-violet-50 text-violet-700"
                                : "bg-blue-50 text-blue-700"
                            }`}
                          >
                            {isCombinationItemKey(rule.itemKey)
                              ? "Fixed Combination"
                              : "Individual"}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {rule.itemLabel ? (
                            <div>
                              <div className="font-medium text-slate-800">
                                {rule.itemLabel}
                              </div>
                              {rule.itemKey && (
                                <div className="mt-0.5 text-[11px] text-slate-400">
                                  {rule.itemKey}
                                </div>
                              )}
                            </div>
                          ) : rule.itemKey ? (
                            nice(rule.itemKey)
                          ) : rule.activeCount != null ? (
                            <span className="text-xs text-amber-700">
                              Legacy: {rule.activeCount} active
                              {rule.activeCount === 1 ? "" : "s"}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-4 py-3">{nice(rule.priceBasis)}</td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {money(rule.unitPrice)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div>{formatDate(rule.effectiveFrom)}</div>
                          {rule.effectiveTo && (
                            <div className="text-slate-500">
                              to {formatDate(rule.effectiveTo)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                              rule.active
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {rule.active ? "ACTIVE" : "INACTIVE"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditPriceRule(rule)}
                              disabled={!!working}
                              title="Edit pricing rule"
                              aria-label="Edit pricing rule"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>

                            <Button
                              variant="secondary"
                              disabled={working === `PRICE:${rule.id}`}
                              onClick={() => togglePriceRule(rule)}
                            >
                              {working === `PRICE:${rule.id}` ? (
                                <Spinner dark />
                              ) : null}
                              {rule.active ? "Disable" : "Enable"}
                            </Button>

                            <button
                              type="button"
                              onClick={() => openDeletePriceRule(rule)}
                              disabled={!!working}
                              title="Delete pricing rule"
                              aria-label="Delete pricing rule"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {!pricesLoading && visiblePrices.length === 0 && (
                      <tr>
                        <td
                          colSpan={12}
                          className="px-4 py-12 text-center text-sm text-slate-500"
                        >
                          No pricing rules found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>

      {selectedInvoiceId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Invoice
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <h2 className="text-xl font-bold text-slate-900">
                    {invoiceDetail?.invoiceNumber || "Draft Invoice"}
                  </h2>

                  {invoiceDetail && (
                    <>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusClass(
                          invoiceDetail.status,
                        )}`}
                      >
                        {nice(invoiceDetail.status)}
                      </span>

                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          invoiceDetail.invoiceKind === "MANUAL"
                            ? "bg-violet-50 text-violet-700 ring-violet-200"
                            : "bg-slate-50 text-slate-700 ring-slate-200"
                        }`}
                      >
                        {invoiceDetail.invoiceKind === "MANUAL"
                          ? "Manual"
                          : "Reports"}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedInvoiceId(null);
                  setInvoiceDetail(null);
                }}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailLoading || !invoiceDetail ? (
              <div className="flex min-h-80 items-center justify-center">
                <Spinner dark />
              </div>
            ) : (
              <div className="max-h-[calc(92vh-73px)] overflow-y-auto">
                <div className="grid gap-4 border-b border-slate-200 p-5 md:grid-cols-2 lg:grid-cols-6">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-500">
                      Client
                    </div>
                    <div className="mt-1 font-semibold">
                      {invoiceDetail.clientCode}
                    </div>
                    <div className="text-xs text-slate-500">
                      {invoiceDetail.clientLegalName ||
                        invoiceDetail.clientName ||
                        ""}
                    </div>
                  </div>

                  {invoiceDetail.invoiceKind === "REPORT" && (
                    <div className="rounded-xl bg-slate-50 p-4">
                      <div className="text-xs font-medium text-slate-500">
                        Billing Period
                      </div>
                      <div className="mt-1 font-semibold">
                        {formatDate(invoiceDetail.periodStart)} –{" "}
                        {formatDate(
                          new Date(
                            new Date(invoiceDetail.periodEnd).getTime() - 1,
                          ).toISOString(),
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-500">
                      Due Date
                    </div>
                    <div className="mt-1 font-semibold">
                      {invoiceDetail.dueDate
                        ? formatDate(invoiceDetail.dueDate)
                        : "30 days after send"}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-500">
                      Scheduled Send
                    </div>
                    <div className="mt-1 font-semibold">
                      {invoiceDetail.scheduledSendAt
                        ? formatDateTime(invoiceDetail.scheduledSendAt)
                        : "Not scheduled"}
                    </div>
                    {invoiceDetail.scheduledToEmail && (
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {invoiceDetail.scheduledToEmail}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-500">
                      Billing Email
                    </div>
                    <div className="mt-1 break-all font-semibold">
                      {invoiceDetail.billingEmail || "-"}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-medium text-slate-500">
                      Payment Terms
                    </div>
                    <div className="mt-1 font-semibold">
                      {invoiceDetail.paymentTerms || "-"}
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  {invoiceDetail.invoiceKind === "MANUAL" ? (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">
                            Manual Invoice Items
                          </h3>
                          <p className="text-xs text-slate-500">
                            {invoiceDetail.manualLines.length} item
                            {invoiceDetail.manualLines.length === 1 ? "" : "s"}
                          </p>
                        </div>

                        {invoiceDetail.status === "DRAFT" && isManager && (
                          <Button
                            onClick={openAddManualLine}
                            disabled={!!working}
                          >
                            <Plus className="h-4 w-4" />
                            Add Item
                          </Button>
                        )}
                      </div>

                      <div className="max-h-[460px] overflow-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                            <tr>
                              <th className="px-4 py-3">Description</th>
                              <th className="px-4 py-3 text-right">Qty</th>
                              <th className="px-4 py-3 text-right">
                                Unit Price
                              </th>
                              <th className="px-4 py-3 text-right">Amount</th>
                              {invoiceDetail.status === "DRAFT" &&
                                isManager && (
                                  <th className="px-4 py-3 text-right">
                                    Action
                                  </th>
                                )}
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-slate-100">
                            {invoiceDetail.manualLines.map((line) => (
                              <tr key={line.id} className="align-top">
                                <td className="px-4 py-3 font-medium text-slate-900">
                                  {line.description}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {line.quantity}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {money(line.unitPrice)}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold">
                                  {money(line.amount)}
                                </td>

                                {invoiceDetail.status === "DRAFT" &&
                                  isManager && (
                                    <td className="px-4 py-3 text-right">
                                      <div className="flex justify-end gap-1">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openEditManualLine(line)
                                          }
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                                          title="Edit invoice item"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            openDeleteManualLine(line)
                                          }
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                                          title="Delete invoice item"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  )}
                              </tr>
                            ))}

                            {invoiceDetail.manualLines.length === 0 && (
                              <tr>
                                <td
                                  colSpan={
                                    invoiceDetail.status === "DRAFT" &&
                                    isManager
                                      ? 5
                                      : 4
                                  }
                                  className="px-4 py-10 text-center text-sm text-slate-500"
                                >
                                  No items added yet. Add at least one item
                                  before confirming this invoice.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-slate-900">
                            Invoice Lines
                          </h3>
                          <p className="text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">
                              {invoiceFormCount} form
                              {invoiceFormCount === 1 ? "" : "s"}
                            </span>
                            <span className="mx-1.5 text-slate-300">•</span>
                            {visibleInvoiceLines.length} charge
                            {visibleInvoiceLines.length === 1 ? "" : "s"}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {invoiceDetail.status === "DRAFT" && isManager && (
                            <Button
                              variant="secondary"
                              onClick={openMoveSelectedInvoiceLines}
                              disabled={
                                selectedMoveLineIds.length === 0 ||
                                working === "LOAD_MOVE_TARGETS" ||
                                working === "MOVE_LINES"
                              }
                            >
                              {working === "LOAD_MOVE_TARGETS" ? (
                                <Spinner dark />
                              ) : (
                                <ArrowRightLeft className="h-4 w-4" />
                              )}
                              Move Selected
                              {selectedMoveLineIds.length > 0
                                ? ` (${selectedMoveLineIds.length})`
                                : ""}
                            </Button>
                          )}

                          {unresolvedInSelected > 0 && (
                            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                              <AlertTriangle className="h-4 w-4" />
                              {unresolvedInSelected} pricing issue
                              {unresolvedInSelected === 1 ? "" : "s"}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="max-h-[460px] overflow-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[1040px] text-sm">
                          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                            <tr>
                              {invoiceDetail.status === "DRAFT" &&
                                isManager && (
                                  <th className="w-10 px-3 py-3 text-center">
                                    <input
                                      type="checkbox"
                                      aria-label="Select all visible invoice lines"
                                      checked={
                                        visibleInvoiceLines.length > 0 &&
                                        visibleInvoiceLines.every((line) =>
                                          selectedMoveLineIds.includes(line.id),
                                        )
                                      }
                                      onChange={
                                        toggleAllVisibleMoveInvoiceLines
                                      }
                                      className="h-4 w-4 rounded border-slate-300"
                                    />
                                  </th>
                                )}
                              <th className="px-4 py-3">Form #</th>
                              <th className="px-4 py-3">Report #</th>
                              <th className="px-4 py-3">Type</th>
                              <th className="px-4 py-3">Sample Type</th>
                              <th className="px-4 py-3">Test</th>
                              <th className="px-4 py-3 text-right">
                                Unit Price
                              </th>
                              <th className="px-4 py-3 text-right">Amount</th>
                              <th className="px-4 py-3">Pricing</th>
                              <th className="px-4 py-3 text-right">View</th>
                              {invoiceDetail.status === "DRAFT" &&
                                isManager && (
                                  <th className="px-4 py-3 text-right">
                                    Action
                                  </th>
                                )}
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-slate-100">
                            {visibleInvoiceLines.map((line, lineIndex) => {
                              const sourceKey = `${line.sourceType}:${line.sourceId}`;

                              const firstSourceLineIndex =
                                visibleInvoiceLines.findIndex(
                                  (candidate) =>
                                    `${candidate.sourceType}:${candidate.sourceId}` ===
                                    sourceKey,
                                );

                              const isFirstSourceLine =
                                firstSourceLineIndex === lineIndex;

                              const lastSourceLineIndex =
                                visibleInvoiceLines.reduce(
                                  (lastIndex, candidate, candidateIndex) =>
                                    `${candidate.sourceType}:${candidate.sourceId}` ===
                                    sourceKey
                                      ? candidateIndex
                                      : lastIndex,
                                  -1,
                                );

                              const isLastSourceLine =
                                lastSourceLineIndex === lineIndex;

                              const sourceExtraCharges = isLastSourceLine
                                ? (invoiceDetail.extraCharges ?? []).filter(
                                    (charge) =>
                                      charge.sourceType === line.sourceType &&
                                      charge.sourceId === line.sourceId,
                                  )
                                : [];

                              const isPreviousMonthImported =
                                !!line.resultSentToClientAt &&
                                new Date(line.resultSentToClientAt).getTime() <
                                  new Date(invoiceDetail.periodStart).getTime();

                              return (
                                <React.Fragment key={line.id}>
                                  <tr className="align-top">
                                    {invoiceDetail.status === "DRAFT" &&
                                      isManager && (
                                        <td className="px-3 py-3 text-center">
                                          <input
                                            type="checkbox"
                                            aria-label={`Select ${line.formNumber} ${line.testLabel || line.testKey}`}
                                            checked={selectedMoveLineIds.includes(
                                              line.id,
                                            )}
                                            onChange={() =>
                                              toggleMoveInvoiceLine(line.id)
                                            }
                                            className="h-4 w-4 rounded border-slate-300"
                                          />
                                        </td>
                                      )}
                                    <td className="px-4 py-3 font-medium">
                                      <div>{line.formNumber}</div>
                                      {isPreviousMonthImported && (
                                        <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                          Previous month
                                        </span>
                                      )}
                                    </td>

                                    <td className="px-4 py-3">
                                      {line.reportNumber}
                                    </td>

                                    <td className="px-4 py-3">
                                      {nice(line.formType)}
                                    </td>

                                    <td className="px-4 py-3">
                                      {billingSampleTypesFromSnapshot(
                                        line.sourceSnapshot,
                                      ).length > 0 ? (
                                        <div className="flex max-w-[200px] flex-wrap gap-1.5">
                                          {billingSampleTypesFromSnapshot(
                                            line.sourceSnapshot,
                                          ).map((sampleType) => (
                                            <span
                                              key={sampleType}
                                              className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-800"
                                            >
                                              {sampleType}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-xs text-slate-400">
                                          -
                                        </span>
                                      )}
                                    </td>

                                    <td className="px-4 py-3">
                                      <div>
                                        {line.testLabel || nice(line.testKey)}
                                      </div>

                                      {(line.itemLabel || line.itemKey) && (
                                        <div className="mt-0.5 text-xs font-medium text-slate-600">
                                          {line.itemLabel ||
                                            nice(line.itemKey!)}
                                        </div>
                                      )}

                                      {!line.itemKey &&
                                        line.activeCount != null && (
                                          <div className="text-xs text-slate-500">
                                            Legacy: {line.activeCount} active
                                            {line.activeCount === 1 ? "" : "s"}
                                          </div>
                                        )}
                                    </td>

                                    <td className="px-4 py-3 text-right">
                                      {line.unitPrice == null
                                        ? "-"
                                        : money(line.unitPrice)}
                                    </td>

                                    <td className="px-4 py-3 text-right font-medium">
                                      {line.amount == null
                                        ? "-"
                                        : money(line.amount)}
                                    </td>

                                    <td className="px-4 py-3 text-xs">
                                      {line.pricingIssue ? (
                                        <span className="text-amber-800">
                                          {line.pricingIssue}
                                        </span>
                                      ) : line.manualOverride ? (
                                        <span
                                          className="text-blue-700"
                                          title={
                                            line.manualOverrideReason ||
                                            undefined
                                          }
                                        >
                                          Manual Override
                                        </span>
                                      ) : (
                                        <span className="text-emerald-700">
                                          Rule
                                        </span>
                                      )}
                                    </td>

                                    <td className="px-4 py-3 text-right">
                                      {isFirstSourceLine ? (
                                        <Button
                                          variant="secondary"
                                          disabled={
                                            billingViewLoadingKey ===
                                            `${line.sourceType}:${line.sourceId}`
                                          }
                                          onClick={() =>
                                            openBillingReport(line)
                                          }
                                        >
                                          {billingViewLoadingKey ===
                                          `${line.sourceType}:${line.sourceId}` ? (
                                            <Spinner dark />
                                          ) : (
                                            <FileText className="h-4 w-4" />
                                          )}
                                          {billingViewLoadingKey ===
                                          `${line.sourceType}:${line.sourceId}`
                                            ? "Opening..."
                                            : "View"}
                                        </Button>
                                      ) : (
                                        <span className="text-xs text-slate-300">
                                          —
                                        </span>
                                      )}
                                    </td>

                                    {invoiceDetail.status === "DRAFT" &&
                                      isManager && (
                                        <td className="px-4 py-3 text-right">
                                          <div className="flex justify-end gap-2">
                                            <Button
                                              variant="secondary"
                                              disabled={
                                                working === `LINE:${line.id}`
                                              }
                                              onClick={() => overrideLine(line)}
                                            >
                                              {working === `LINE:${line.id}` ? (
                                                <Spinner dark />
                                              ) : null}
                                              Override
                                            </Button>

                                            <Button
                                              variant="danger"
                                              disabled={!!working}
                                              onClick={() =>
                                                deleteInvoiceLine(line)
                                              }
                                              className="px-2.5"
                                            >
                                              {working ===
                                              `DELETE_LINE:${line.id}` ? (
                                                <Spinner />
                                              ) : (
                                                <Trash2 className="h-4 w-4" />
                                              )}
                                              Delete
                                            </Button>

                                            {isFirstSourceLine && (
                                              <Button
                                                variant="secondary"
                                                onClick={() =>
                                                  openAddExtraCharge({
                                                    sourceType: line.sourceType,
                                                    sourceId: line.sourceId,
                                                    formNumber: line.formNumber,
                                                    reportNumber:
                                                      line.reportNumber,
                                                  })
                                                }
                                                disabled={!!working}
                                              >
                                                <Plus className="h-4 w-4" />
                                                Additional Charge
                                              </Button>
                                            )}
                                          </div>
                                        </td>
                                      )}
                                  </tr>

                                  {isLastSourceLine &&
                                    sourceExtraCharges.map((charge) => (
                                      <tr
                                        key={`extra-${charge.id}`}
                                        className="border-t border-slate-100 bg-slate-50/70"
                                      >
                                        {invoiceDetail.status === "DRAFT" &&
                                          isManager && (
                                            <td className="px-3 py-2" />
                                          )}

                                        <td className="px-4 py-2">
                                          <div className="flex items-center gap-2 whitespace-nowrap">
                                            <span className="text-slate-300">
                                              ↳
                                            </span>
                                            <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                              Additional
                                            </span>
                                          </div>
                                        </td>

                                        <td colSpan={4} className="px-4 py-2">
                                          <div className="font-medium text-slate-700">
                                            {charge.name}
                                          </div>
                                          <div className="mt-0.5 text-[11px] text-slate-400">
                                            Added to {line.formNumber}
                                          </div>
                                        </td>

                                        <td className="px-4 py-2 text-right text-xs text-slate-400">
                                          —
                                        </td>

                                        <td className="px-4 py-2 text-right font-semibold text-slate-800">
                                          +{money(charge.amount)}
                                        </td>

                                        <td className="px-4 py-2">
                                          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                            Form charge
                                          </span>
                                        </td>

                                        <td className="px-4 py-2" />

                                        {invoiceDetail.status === "DRAFT" &&
                                          isManager && (
                                            <td className="px-4 py-2">
                                              <div className="flex justify-end gap-1.5">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    openEditExtraCharge(charge)
                                                  }
                                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
                                                  title="Edit additional charge"
                                                >
                                                  <Pencil className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    openDeleteExtraCharge(
                                                      charge,
                                                    )
                                                  }
                                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-rose-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                                  title="Delete additional charge"
                                                >
                                                  <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                            </td>
                                          )}
                                      </tr>
                                    ))}
                                </React.Fragment>
                              );
                            })}

                            {visibleInvoiceLines.length === 0 && (
                              <tr>
                                <td
                                  colSpan={
                                    invoiceDetail.status === "DRAFT" &&
                                    isManager
                                      ? 11
                                      : 9
                                  }
                                  className="px-4 py-10 text-center text-sm text-slate-500"
                                >
                                  No invoice lines match the selected filters.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
                    <div className="space-y-4">
                      {invoiceDetail.invoiceKind === "REPORT" && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                                Last Month Pending Charges
                              </div>
                              <h3 className="mt-1 font-semibold text-amber-950">
                                {lastMonthPendingLabel}
                              </h3>
                            </div>
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                          </div>

                          {lastMonthPendingLoading ? (
                            <div className="mt-4 flex items-center gap-2 text-sm text-amber-800">
                              <Spinner dark />
                              Checking previous month...
                            </div>
                          ) : lastMonthPendingError ? (
                            <div className="mt-3 text-sm text-rose-700">
                              {lastMonthPendingError}
                            </div>
                          ) : (
                            <>
                              <div className="mt-4 grid grid-cols-3 gap-2">
                                <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Pending Forms
                                  </div>
                                  <div className="mt-1 text-lg font-bold text-slate-900">
                                    {lastMonthPendingFormCount}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Pending Charges
                                  </div>
                                  <div className="mt-1 text-lg font-bold text-slate-900">
                                    {lastMonthPending?.count ?? 0}
                                  </div>
                                </div>
                                <div className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                    Est. Pending
                                  </div>
                                  <div className="mt-1 text-lg font-bold text-amber-900">
                                    {money(
                                      lastMonthPending?.estimatedSubtotal ??
                                        "0.00",
                                    )}
                                  </div>
                                </div>
                              </div>

                              {(lastMonthPending?.exceptionCount ?? 0) > 0 && (
                                <div className="mt-2 text-xs font-medium text-rose-700">
                                  {lastMonthPending?.exceptionCount} pending
                                  charge
                                  {(lastMonthPending?.exceptionCount ?? 0) === 1
                                    ? " has"
                                    : "s have"}{" "}
                                  unresolved pricing. Resolve pricing before
                                  adding that form.
                                </div>
                              )}

                              {invoiceDetail.status === "DRAFT" &&
                                isManager && (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowLastMonthPicker(
                                          (value) => !value,
                                        );
                                        setShowManualLastMonthCharge(false);
                                      }}
                                      disabled={
                                        (lastMonthPending?.count ?? 0) === 0 ||
                                        !!working
                                      }
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      Add from Last Month
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowManualLastMonthCharge(
                                          (value) => !value,
                                        );
                                        setShowLastMonthPicker(false);
                                      }}
                                      disabled={!!working}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      Add Manually
                                    </button>
                                  </div>
                                )}

                              {showLastMonthPicker &&
                                invoiceDetail.status === "DRAFT" &&
                                isManager && (
                                  <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-3">
                                      <div>
                                        <div className="text-sm font-semibold text-slate-900">
                                          Select previous-month forms
                                        </div>
                                        <div className="text-xs text-slate-500">
                                          A form is added with all of its ready
                                          billing charges.
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedLastMonthSourceKeys(() => {
                                            const readyGroups =
                                              lastMonthPendingGroups.filter(
                                                (group) =>
                                                  !group.missingAmount &&
                                                  group.pricingIssues.length ===
                                                    0,
                                              );
                                            const allReadySelected =
                                              readyGroups.length > 0 &&
                                              readyGroups.every((group) =>
                                                selectedLastMonthSourceKeys.includes(
                                                  group.key,
                                                ),
                                              );

                                            return allReadySelected
                                              ? []
                                              : readyGroups.map(
                                                  (group) => group.key,
                                                );
                                          })
                                        }
                                        className="text-xs font-semibold text-amber-800 hover:text-amber-950"
                                      >
                                        {lastMonthPendingGroups.filter(
                                          (group) =>
                                            !group.missingAmount &&
                                            group.pricingIssues.length === 0,
                                        ).length > 0 &&
                                        lastMonthPendingGroups
                                          .filter(
                                            (group) =>
                                              !group.missingAmount &&
                                              group.pricingIssues.length === 0,
                                          )
                                          .every((group) =>
                                            selectedLastMonthSourceKeys.includes(
                                              group.key,
                                            ),
                                          )
                                          ? "Clear All"
                                          : "Select All"}
                                      </button>
                                    </div>

                                    <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
                                      {lastMonthPendingGroups.map((group) => {
                                        const selected =
                                          selectedLastMonthSourceKeys.includes(
                                            group.key,
                                          );
                                        const ready =
                                          !group.missingAmount &&
                                          group.pricingIssues.length === 0;

                                        return (
                                          <label
                                            key={`previous-month-${group.key}`}
                                            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                                              selected
                                                ? "border-amber-400 bg-amber-50"
                                                : "border-slate-200 bg-white hover:bg-slate-50"
                                            } ${!ready ? "opacity-70" : ""}`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={selected}
                                              disabled={!ready}
                                              onChange={(e) =>
                                                setSelectedLastMonthSourceKeys(
                                                  (current) =>
                                                    e.target.checked
                                                      ? [...current, group.key]
                                                      : current.filter(
                                                          (key) =>
                                                            key !== group.key,
                                                        ),
                                                )
                                              }
                                              className="mt-1 h-4 w-4 rounded border-slate-300"
                                            />

                                            <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="font-semibold text-slate-900">
                                                  {group.formNumber}
                                                </div>
                                                <div className="font-semibold text-slate-900">
                                                  {group.missingAmount
                                                    ? "Pricing required"
                                                    : money(group.amount)}
                                                </div>
                                              </div>
                                              <div className="mt-0.5 truncate text-xs text-slate-600">
                                                {group.description ||
                                                  group.testLabels.join(", ") ||
                                                  nice(group.formType)}
                                              </div>
                                              <div className="mt-1 text-[11px] text-slate-500">
                                                {group.items.length} charge
                                                {group.items.length === 1
                                                  ? ""
                                                  : "s"}
                                                {group.testLabels.length > 0
                                                  ? ` · ${group.testLabels.join(", ")}`
                                                  : ""}
                                              </div>
                                              {!ready && (
                                                <div className="mt-1 text-[11px] font-medium text-rose-700">
                                                  Resolve pricing before adding
                                                  this form.
                                                </div>
                                              )}
                                            </div>
                                          </label>
                                        );
                                      })}
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-amber-100 pt-3">
                                      <div className="text-xs text-slate-600">
                                        Selected:{" "}
                                        {selectedLastMonthGroups.length} form
                                        {selectedLastMonthGroups.length === 1
                                          ? ""
                                          : "s"}{" "}
                                        · {money(selectedLastMonthAmount)}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={addSelectedLastMonthPending}
                                        disabled={
                                          selectedLastMonthSourceKeys.length ===
                                            0 ||
                                          working === "ADD_PREVIOUS_MONTH_FORMS"
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {working ===
                                        "ADD_PREVIOUS_MONTH_FORMS" ? (
                                          <Spinner />
                                        ) : (
                                          <Plus className="h-3.5 w-3.5" />
                                        )}
                                        Add Selected to Invoice
                                      </button>
                                    </div>
                                  </div>
                                )}

                              {showManualLastMonthCharge &&
                                invoiceDetail.status === "DRAFT" &&
                                isManager && (
                                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div>
                                        <div className="text-sm font-semibold text-slate-900">
                                          Manual previous-month charges
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">
                                          Add one or more charges when there is
                                          no report/form available to select
                                          above. The charge name you enter is
                                          shown exactly as the visible charge
                                          name on the invoice and PDF.
                                        </p>
                                      </div>
                                    </div>

                                    <div className="mt-3 space-y-2">
                                      {manualLastMonthCharges.map(
                                        (row, index) => (
                                          <div
                                            key={row.id}
                                            className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-[36px_1fr_150px_36px] sm:items-end"
                                          >
                                            <div className="hidden h-10 items-center justify-center text-xs font-semibold text-slate-400 sm:flex">
                                              {index + 1}
                                            </div>
                                            <label>
                                              <span className="mb-1 block text-xs font-medium text-slate-600">
                                                Charge Name
                                              </span>
                                              <input
                                                value={row.name}
                                                onChange={(e) =>
                                                  setManualLastMonthCharges(
                                                    (current) =>
                                                      current.map((item) =>
                                                        item.id === row.id
                                                          ? {
                                                              ...item,
                                                              name: e.target
                                                                .value,
                                                            }
                                                          : item,
                                                      ),
                                                  )
                                                }
                                                placeholder="e.g. Overtime"
                                                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                                              />
                                            </label>
                                            <label>
                                              <span className="mb-1 block text-xs font-medium text-slate-600">
                                                Amount
                                              </span>
                                              <input
                                                value={row.amount}
                                                onChange={(e) =>
                                                  setManualLastMonthCharges(
                                                    (current) =>
                                                      current.map((item) =>
                                                        item.id === row.id
                                                          ? {
                                                              ...item,
                                                              amount:
                                                                e.target.value,
                                                            }
                                                          : item,
                                                      ),
                                                  )
                                                }
                                                inputMode="decimal"
                                                placeholder="0.00"
                                                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                                              />
                                            </label>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setManualLastMonthCharges(
                                                  (current) => {
                                                    if (current.length === 1) {
                                                      return [
                                                        createManualLastMonthChargeDraft(),
                                                      ];
                                                    }
                                                    return current.filter(
                                                      (item) =>
                                                        item.id !== row.id,
                                                    );
                                                  },
                                                )
                                              }
                                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50"
                                              title="Remove this entry"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                          </div>
                                        ),
                                      )}
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setManualLastMonthCharges(
                                            (current) => [
                                              ...current,
                                              createManualLastMonthChargeDraft(),
                                            ],
                                          )
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                        Add Another Charge
                                      </button>

                                      <button
                                        type="button"
                                        onClick={addManualLastMonthPending}
                                        disabled={
                                          !manualLastMonthCharges.some(
                                            (row) =>
                                              row.name.trim() ||
                                              row.amount.trim(),
                                          ) ||
                                          working ===
                                            "ADD_PREVIOUS_MONTH_MANUAL"
                                        }
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {working ===
                                        "ADD_PREVIOUS_MONTH_MANUAL" ? (
                                          <Spinner />
                                        ) : (
                                          <Plus className="h-3.5 w-3.5" />
                                        )}
                                        Add All Charges
                                      </button>
                                    </div>
                                  </div>
                                )}

                              {previousMonthManualLines.length > 0 && (
                                <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                                    Manual Previous-Month Charges Added
                                  </div>
                                  <div className="mt-2 space-y-2">
                                    {previousMonthManualLines.map((line) => {
                                      const visibleChargeName = String(
                                        line.description ?? "",
                                      )
                                        .replace(
                                          PREVIOUS_MONTH_MANUAL_PREFIX,
                                          "",
                                        )
                                        .trim();
                                      const isEditing =
                                        editingManualLastMonthLineId ===
                                        line.id;

                                      return (
                                        <div
                                          key={`previous-manual-${line.id}`}
                                          className="rounded-lg bg-amber-50 px-3 py-2"
                                        >
                                          {isEditing ? (
                                            <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto] sm:items-end">
                                              <label>
                                                <span className="mb-1 block text-[11px] font-medium text-amber-900">
                                                  Charge Name
                                                </span>
                                                <input
                                                  value={
                                                    editManualLastMonthName
                                                  }
                                                  onChange={(e) =>
                                                    setEditManualLastMonthName(
                                                      e.target.value,
                                                    )
                                                  }
                                                  className="h-9 w-full rounded-md border border-amber-300 bg-white px-2.5 text-sm"
                                                />
                                              </label>
                                              <label>
                                                <span className="mb-1 block text-[11px] font-medium text-amber-900">
                                                  Amount
                                                </span>
                                                <input
                                                  value={
                                                    editManualLastMonthAmount
                                                  }
                                                  onChange={(e) =>
                                                    setEditManualLastMonthAmount(
                                                      e.target.value,
                                                    )
                                                  }
                                                  inputMode="decimal"
                                                  className="h-9 w-full rounded-md border border-amber-300 bg-white px-2.5 text-sm"
                                                />
                                              </label>
                                              <div className="flex items-center gap-1.5">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    saveEditManualLastMonthPending(
                                                      line,
                                                    )
                                                  }
                                                  disabled={
                                                    working ===
                                                    `EDIT_PREVIOUS_MONTH_MANUAL:${line.id}`
                                                  }
                                                  className="rounded-md bg-amber-800 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
                                                >
                                                  {working ===
                                                  `EDIT_PREVIOUS_MONTH_MANUAL:${line.id}` ? (
                                                    <Spinner />
                                                  ) : (
                                                    "Save"
                                                  )}
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={
                                                    cancelEditManualLastMonthPending
                                                  }
                                                  className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold text-slate-900">
                                                  {visibleChargeName ||
                                                    "Previous-month pending charge"}
                                                </div>
                                                <div className="text-[11px] text-amber-800">
                                                  Manual previous-month charge
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-900">
                                                  {money(line.amount)}
                                                </span>
                                                {invoiceDetail.status ===
                                                  "DRAFT" &&
                                                  isManager && (
                                                    <>
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          startEditManualLastMonthPending(
                                                            line,
                                                          )
                                                        }
                                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                                                        title={`Edit ${visibleChargeName || "manual charge"}`}
                                                      >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          deleteManualLastMonthPending(
                                                            line,
                                                          )
                                                        }
                                                        disabled={
                                                          working ===
                                                          `DELETE_PREVIOUS_MONTH_MANUAL:${line.id}`
                                                        }
                                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                                                        title={`Remove ${visibleChargeName || "manual charge"}`}
                                                      >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                      </button>
                                                    </>
                                                  )}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-amber-800">
                                  Charges are included in the invoice total only
                                  after you add them to this invoice.
                                </p>

                                {(lastMonthPending?.count ?? 0) > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!lastMonthPending?.month) return;
                                      setMonth(lastMonthPending.month);
                                      setClientCode(invoiceDetail.clientCode);
                                      setTab("UNBILLED");
                                      setSelectedInvoiceId(null);
                                      setInvoiceDetail(null);
                                    }}
                                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                                  >
                                    Open Full Unbilled List
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {invoiceDetail.status === "DRAFT" && isManager ? (
                        <div className="rounded-xl border border-slate-200 p-4">
                          <h3 className="font-semibold text-slate-900">
                            Draft Settings
                          </h3>

                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label>
                              <span className="mb-1 block text-xs font-medium text-slate-600">
                                Adjustment
                              </span>
                              <input
                                value={draftAdjustment}
                                onChange={(e) =>
                                  setDraftAdjustment(e.target.value)
                                }
                                inputMode="decimal"
                                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                              />
                            </label>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {invoiceDetail.invoiceKind === "REPORT" && (
                              <Button
                                variant="secondary"
                                onClick={refreshInvoicePricing}
                                disabled={working === "REFRESH_PRICING"}
                              >
                                {working === "REFRESH_PRICING" ? (
                                  <Spinner dark />
                                ) : (
                                  <RefreshCcw className="h-4 w-4" />
                                )}
                                Refresh Pricing
                              </Button>
                            )}

                            <Button
                              variant="secondary"
                              onClick={saveDraft}
                              disabled={working === "SAVE_DRAFT"}
                            >
                              {working === "SAVE_DRAFT" ? (
                                <Spinner dark />
                              ) : null}
                              Save Draft
                            </Button>

                            <Button
                              variant="success"
                              onClick={confirmInvoice}
                              disabled={
                                working === "CONFIRM" ||
                                (invoiceDetail.invoiceKind === "REPORT"
                                  ? unresolvedInSelected > 0
                                  : invoiceDetail.manualLines.length === 0)
                              }
                            >
                              {working === "CONFIRM" ? (
                                <Spinner />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              Confirm Invoice
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {(invoiceDetail.revisionNumber ?? 0) > 0 && (
                        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                                Revised Invoice
                              </div>
                              <div className="mt-1 text-sm font-semibold text-violet-950">
                                Revision R{invoiceDetail.revisionNumber}
                                {invoiceDetail.invoiceNumber
                                  ? ` · ${invoiceDetail.invoiceNumber}`
                                  : ""}
                              </div>
                            </div>
                            <GitBranch className="h-5 w-5 text-violet-600" />
                          </div>
                        </div>
                      )}

                      {(invoiceDetail.revisionHistory?.length ?? 0) > 1 && (
                        <div className="rounded-xl border border-slate-200 p-4">
                          <h3 className="font-semibold text-slate-900">
                            Invoice Revision History
                          </h3>

                          <div className="mt-3 space-y-2">
                            {invoiceDetail.revisionHistory!.map((version) => (
                              <button
                                key={version.id}
                                type="button"
                                onClick={() => openInvoice(version.id)}
                                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                                  version.id === invoiceDetail.id
                                    ? "border-blue-300 bg-blue-50"
                                    : "border-slate-200 hover:bg-slate-50"
                                }`}
                              >
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {version.invoiceNumber ||
                                      (version.revisionNumber === 0
                                        ? "Original Invoice"
                                        : `Revision R${version.revisionNumber}`)}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-500">
                                    {version.revisionNumber === 0
                                      ? "Original"
                                      : `Revised ${version.revisionNumber}`}
                                    {" · "}
                                    {nice(version.status)}
                                  </div>
                                </div>

                                <div className="text-sm font-semibold text-slate-800">
                                  {money(version.total)}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {(invoiceDetail.status === "CONFIRMED" ||
                        invoiceDetail.status === "SENT") && (
                        <div className="rounded-xl border border-slate-200 p-4">
                          <h3 className="font-semibold text-slate-900">
                            Official Invoice
                          </h3>

                          {invoiceDetail.status === "CONFIRMED" &&
                            invoiceDetail.scheduledSendAt && (
                              <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                                <div className="font-semibold">
                                  Scheduled for{" "}
                                  {formatDateTime(
                                    invoiceDetail.scheduledSendAt,
                                  )}
                                </div>
                                <div className="mt-0.5">
                                  Recipient:{" "}
                                  {invoiceDetail.scheduledToEmail ||
                                    invoiceDetail.billingEmail ||
                                    "-"}
                                </div>
                              </div>
                            )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {invoiceDetail.status === "CONFIRMED" &&
                              isManager && (
                                <Button
                                  onClick={generatePdf}
                                  disabled={working === "PDF"}
                                >
                                  {working === "PDF" ? (
                                    <Spinner />
                                  ) : (
                                    <FileText className="h-4 w-4" />
                                  )}
                                  {invoiceDetail.pdfFilename
                                    ? "Regenerate PDF"
                                    : "Generate PDF"}
                                </Button>
                              )}

                            {invoiceDetail.pdfFilename && (
                              <>
                                <Button
                                  variant="secondary"
                                  onClick={() => getPdf("VIEW")}
                                  disabled={working === "VIEW_PDF"}
                                >
                                  {working === "VIEW_PDF" ? (
                                    <Spinner dark />
                                  ) : (
                                    <FileText className="h-4 w-4" />
                                  )}
                                  View PDF
                                </Button>

                                <Button
                                  variant="secondary"
                                  onClick={() => getPdf("DOWNLOAD")}
                                  disabled={working === "DOWNLOAD_PDF"}
                                >
                                  {working === "DOWNLOAD_PDF" ? (
                                    <Spinner dark />
                                  ) : (
                                    <FileDown className="h-4 w-4" />
                                  )}
                                  Download
                                </Button>
                              </>
                            )}

                            <Button
                              variant="success"
                              onClick={sendInvoice}
                              disabled={working === "SEND"}
                            >
                              {working === "SEND" ? (
                                <Spinner />
                              ) : invoiceDetail.status === "SENT" ? (
                                <Mail className="h-4 w-4" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                              {invoiceDetail.status === "SENT"
                                ? "Resend"
                                : "Send Now"}
                            </Button>

                            {invoiceDetail.status === "CONFIRMED" && (
                              <Button
                                variant="secondary"
                                onClick={scheduleInvoiceSend}
                                disabled={working === "SCHEDULE_SEND"}
                              >
                                <CalendarClock className="h-4 w-4" />
                                {invoiceDetail.scheduledSendAt
                                  ? "Reschedule"
                                  : "Schedule Send"}
                              </Button>
                            )}

                            {invoiceDetail.status === "CONFIRMED" &&
                              invoiceDetail.scheduledSendAt && (
                                <Button
                                  variant="secondary"
                                  onClick={cancelScheduledInvoiceSend}
                                  disabled={working === "CANCEL_SCHEDULE"}
                                >
                                  {working === "CANCEL_SCHEDULE" && (
                                    <Spinner dark />
                                  )}
                                  Cancel Schedule
                                </Button>
                              )}

                            {invoiceDetail.status === "CONFIRMED" &&
                              isManager && (
                                <Button
                                  variant="secondary"
                                  onClick={reopenInvoiceForEditing}
                                  disabled={working === "REOPEN"}
                                >
                                  {working === "REOPEN" ? (
                                    <Spinner dark />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                  Reopen for Editing
                                </Button>
                              )}

                            {invoiceDetail.status === "SENT" && isManager && (
                              <Button
                                variant="secondary"
                                onClick={createInvoiceRevision}
                                disabled={working === "REVISE"}
                              >
                                {working === "REVISE" ? (
                                  <Spinner dark />
                                ) : (
                                  <GitBranch className="h-4 w-4" />
                                )}
                                Create Revision
                              </Button>
                            )}

                            {isManager && (
                              <Button
                                variant="danger"
                                onClick={voidInvoice}
                                disabled={working === "VOID"}
                              >
                                {working === "VOID" ? (
                                  <Spinner />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                Void
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {invoiceDetail.status === "VOID" && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                          <h3 className="font-semibold text-rose-900">
                            Voided Invoice
                          </h3>
                          <p className="mt-2 text-sm text-rose-800">
                            {invoiceDetail.voidReason ||
                              "No void reason stored."}
                          </p>
                          <div className="mt-2 text-xs text-rose-700">
                            {formatDateTime(invoiceDetail.voidedAt)}
                          </div>

                          {invoiceDetail.pdfFilename && (
                            <div className="mt-3 flex gap-2">
                              <Button
                                variant="secondary"
                                onClick={() => getPdf("VIEW")}
                              >
                                <FileText className="h-4 w-4" />
                                Historical PDF
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="rounded-xl border border-slate-200 p-4">
                        <h3 className="font-semibold text-slate-900">
                          Email History
                        </h3>

                        <div className="mt-3 space-y-2">
                          {invoiceDetail.emails?.length ? (
                            invoiceDetail.emails.map((email) => (
                              <div
                                key={email.id}
                                className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-semibold text-slate-800">
                                    {email.toEmail || "Recipient unavailable"}
                                  </span>
                                  <span
                                    className={
                                      email.status === "SENT"
                                        ? "text-emerald-700"
                                        : "text-rose-700"
                                    }
                                  >
                                    {email.status}
                                  </span>
                                </div>
                                <div className="mt-1 text-slate-500">
                                  {formatDateTime(
                                    email.sentAt || email.createdAt,
                                  )}
                                </div>
                                {email.errorMessage && (
                                  <div className="mt-1 text-rose-700">
                                    {email.errorMessage}
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-slate-500">
                              No invoice email history.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="sticky top-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="font-semibold text-slate-900">Totals</h3>

                        <div className="mt-4 space-y-3 text-sm">
                          {invoiceDetail.invoiceKind === "REPORT" && (
                            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                              <span className="font-medium text-slate-600">
                                No. of Forms
                              </span>
                              <span className="text-lg font-bold text-slate-900">
                                {invoiceFormCount}
                              </span>
                            </div>
                          )}

                          {invoiceDetail.invoiceKind === "REPORT" &&
                            previousMonthAddedSummary.total > 0 && (
                              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                                <div>
                                  <div className="font-medium text-amber-900">
                                    Last Month Added
                                  </div>
                                  <div className="text-[11px] text-amber-700">
                                    {previousMonthAddedSummary.formCount} form
                                    {previousMonthAddedSummary.formCount === 1
                                      ? ""
                                      : "s"}
                                    {previousMonthManualLines.length > 0
                                      ? ` · ${previousMonthManualLines.length} manual`
                                      : ""}
                                  </div>
                                </div>
                                <span className="font-bold text-amber-950">
                                  {money(previousMonthAddedSummary.total)}
                                </span>
                              </div>
                            )}

                          <div className="flex justify-between">
                            <span className="text-slate-500">Subtotal</span>
                            <span className="font-medium">
                              {money(invoiceDetail.subtotal)}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-slate-500">Adjustment</span>
                            <span className="font-medium">
                              {money(invoiceDetail.adjustmentAmount)}
                            </span>
                          </div>

                          <div className="border-t border-slate-300 pt-3">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900">
                                Total
                              </span>
                              <span className="text-2xl font-bold text-slate-900">
                                {money(invoiceDetail.total)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {invoiceDetail.confirmedAt && (
                          <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
                            Confirmed:{" "}
                            {formatDateTime(invoiceDetail.confirmedAt)}
                          </div>
                        )}

                        {invoiceDetail.sentAt && (
                          <div className="mt-1 text-xs text-slate-500">
                            Sent: {formatDateTime(invoiceDetail.sentAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border-2 border-red-300 bg-red-50 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-red-700">
                          Invoice Notes
                        </div>
                        <p className="mt-1 text-xs text-red-600">
                          Important invoice note — highlighted in red for
                          visibility.
                        </p>
                      </div>
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>

                    {invoiceDetail.status === "DRAFT" && isManager ? (
                      <>
                        <textarea
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          rows={4}
                          placeholder="Enter an important invoice note..."
                          className="mt-3 w-full rounded-lg border-2 border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 outline-none placeholder:text-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                        />
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-xs text-red-600">
                            The note is stored with the invoice.
                          </span>
                          <Button
                            variant="secondary"
                            onClick={saveDraft}
                            disabled={working === "SAVE_DRAFT"}
                          >
                            {working === "SAVE_DRAFT" ? <Spinner dark /> : null}
                            Save Notes
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 whitespace-pre-line rounded-lg border border-red-200 bg-white px-3 py-3 text-sm font-semibold text-red-700">
                        {invoiceDetail.notes || "No invoice notes."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {billingViewedReport && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Report details"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeBillingReportView();
            }
          }}
        >
          <div className="flex h-[90vh] max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 border-b bg-white px-6 py-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <h2 className="text-lg font-semibold">
                  {billingViewPane === "FORM"
                    ? "Form"
                    : billingViewPane === "ATTACHMENTS"
                      ? "Attachments"
                      : "Report"}{" "}
                  ({billingViewedReport.formNumber})
                </h2>

                <div className="flex justify-center">
                  <div className="inline-flex items-center rounded-full border border-slate-300 bg-white p-1 shadow-sm">
                    {(
                      ["FORM", "REPORT", "ATTACHMENTS"] as BillingViewPane[]
                    ).map((pane) => (
                      <button
                        key={pane}
                        type="button"
                        onClick={() => setBillingViewPane(pane)}
                        className={billingClassNames(
                          "rounded-full px-4 py-1.5 text-xs font-semibold transition",
                          billingViewPane === pane
                            ? "bg-blue-600 text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-blue-600",
                        )}
                      >
                        {pane === "ATTACHMENTS"
                          ? "Attachments"
                          : pane[0] + pane.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
                    onClick={closeBillingReportView}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-body min-h-0 flex-1 overflow-auto px-6 py-4 max-h-[calc(90vh-72px)]">
              {renderBillingViewedReport(billingViewedReport)}
            </div>
          </div>
        </div>
      )}

      {moveInvoiceLinesDialog && invoiceDetail && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Billing
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  Move Invoice Lines
                </h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  Move the selected charges to another DRAFT report invoice for
                  the same client and billing period.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!working) setMoveInvoiceLinesDialog(null);
                }}
                disabled={!!working}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-medium text-slate-500">From</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {invoiceDetail.invoiceNumber || "Draft invoice"}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {invoiceDetail.clientCode} ·{" "}
                    {moveInvoiceLinesDialog.lineIds.length} selected line
                    {moveInvoiceLinesDialog.lineIds.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <div className="text-xs font-medium text-blue-700">
                    Destination
                  </div>
                  <div className="mt-1 text-sm font-semibold text-blue-950">
                    Same client · same billing period
                  </div>
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Move To Invoice
                </span>
                <select
                  autoFocus
                  value={moveInvoiceLinesDialog.targetInvoiceId}
                  onChange={(event) =>
                    setMoveInvoiceLinesDialog({
                      ...moveInvoiceLinesDialog,
                      targetInvoiceId: event.target.value,
                    })
                  }
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {moveInvoiceLinesDialog.targets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.invoiceNumber || "Draft invoice"} ·{" "}
                      {money(target.total)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                The selected line charge keys stay active while they are moved,
                so they will not return to Unbilled. If every line is moved out
                of the source invoice, its additional charges and invoice
                adjustment are carried over when applicable, and the empty
                source invoice is automatically marked VOID as merged.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Button
                variant="secondary"
                onClick={() => setMoveInvoiceLinesDialog(null)}
                disabled={working === "MOVE_LINES"}
              >
                Cancel
              </Button>

              <Button
                onClick={submitMoveSelectedInvoiceLines}
                disabled={
                  working === "MOVE_LINES" ||
                  !moveInvoiceLinesDialog.targetInvoiceId
                }
              >
                {working === "MOVE_LINES" ? (
                  <Spinner />
                ) : (
                  <ArrowRightLeft className="h-4 w-4" />
                )}
                Move {moveInvoiceLinesDialog.lineIds.length} Line
                {moveInvoiceLinesDialog.lineIds.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {actionDialog && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Billing
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {actionDialog.kind === "OVERRIDE"
                    ? "Override Line Price"
                    : actionDialog.kind === "DELETE_LINE"
                      ? "Delete Invoice Line"
                      : actionDialog.kind === "CONFIRM"
                        ? "Confirm Invoice"
                        : actionDialog.kind === "REOPEN"
                          ? "Reopen Invoice for Editing"
                          : actionDialog.kind === "REVISE"
                            ? "Create Revised Invoice"
                            : actionDialog.kind === "SEND"
                              ? invoiceDetail?.status === "SENT"
                                ? "Resend Invoice"
                                : "Send Invoice"
                              : actionDialog.kind === "SCHEDULE"
                                ? invoiceDetail?.scheduledSendAt
                                  ? "Reschedule Invoice Send"
                                  : "Schedule Invoice Send"
                                : "Void Invoice"}
                </h3>
                <p className="mt-1 text-sm leading-5 text-slate-500">
                  {actionDialog.kind === "OVERRIDE"
                    ? "Enter the replacement unit price and document why it is being changed."
                    : actionDialog.kind === "DELETE_LINE"
                      ? "Remove this charge from the current DRAFT invoice. The invoice total will be recalculated immediately."
                      : actionDialog.kind === "CONFIRM"
                        ? "Review the invoice total before confirming."
                        : actionDialog.kind === "REOPEN"
                          ? "The same invoice number will be kept, but the current confirmed PDF and scheduled delivery details will be cleared so you can edit and confirm it again."
                          : actionDialog.kind === "REVISE"
                            ? "The sent invoice remains unchanged. A new DRAFT revision will be created from the latest sent version."
                            : actionDialog.kind === "SEND"
                              ? "Confirm the recipient before delivering the official invoice PDF."
                              : actionDialog.kind === "SCHEDULE"
                                ? "Choose when the invoice should be sent. The final PDF will be regenerated automatically at delivery time."
                                : "Provide a reason before voiding this invoice."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActionDialog(null)}
                disabled={!!working}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              {actionDialog.kind === "OVERRIDE" && (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-medium text-slate-500">
                      Charge
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {actionDialog.line.formNumber} ·{" "}
                      {actionDialog.line.testLabel ||
                        nice(actionDialog.line.testKey)}
                    </div>
                    {(actionDialog.line.itemLabel ||
                      actionDialog.line.itemKey) && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        {actionDialog.line.itemLabel ||
                          nice(actionDialog.line.itemKey)}
                      </div>
                    )}
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      New Unit Price
                    </span>
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="0.01"
                      value={actionDialog.unitPrice}
                      onChange={(e) =>
                        setActionDialog({
                          ...actionDialog,
                          unitPrice: e.target.value,
                        })
                      }
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Override Reason
                    </span>
                    <textarea
                      rows={3}
                      value={actionDialog.reason}
                      onChange={(e) =>
                        setActionDialog({
                          ...actionDialog,
                          reason: e.target.value,
                        })
                      }
                      className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Explain why this price is being overridden"
                    />
                  </label>
                </>
              )}

              {actionDialog.kind === "DELETE_LINE" && invoiceDetail && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <div className="font-semibold text-rose-950">
                      {actionDialog.line.formNumber} ·{" "}
                      {actionDialog.line.testLabel ||
                        nice(actionDialog.line.testKey)}
                    </div>

                    {(actionDialog.line.itemLabel ||
                      actionDialog.line.itemKey) && (
                      <div className="mt-1 text-sm text-rose-800">
                        {actionDialog.line.itemLabel ||
                          nice(actionDialog.line.itemKey!)}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-4 border-t border-rose-200 pt-3">
                      <span className="text-sm text-rose-800">Line amount</span>
                      <span className="font-bold text-rose-950">
                        {actionDialog.line.amount == null
                          ? "-"
                          : money(actionDialog.line.amount)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    {actionDialog.line.activeChargeKey
                      ? "Deleting this line releases its billing charge key. It can appear in Unbilled again and can be added to a future/generated draft."
                      : "This line belongs to a revision/history copy and does not own the active billing charge key. Deleting it removes it only from this DRAFT revision."}
                  </div>
                </div>
              )}

              {actionDialog.kind === "CONFIRM" && invoiceDetail && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="font-semibold text-amber-950">
                    {invoiceDetail.clientCode}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-4">
                    <span className="text-sm text-amber-800">
                      Invoice total
                    </span>
                    <span className="text-2xl font-bold text-amber-950">
                      {money(invoiceDetail.total)}
                    </span>
                  </div>
                  <div className="mt-3 border-t border-amber-200 pt-3 text-xs leading-5 text-amber-800">
                    After confirmation, invoice charges become immutable. The
                    PDF can still be regenerated until the invoice is sent.
                  </div>
                </div>
              )}

              {actionDialog.kind === "REOPEN" && invoiceDetail && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="font-semibold text-amber-950">
                    {invoiceDetail.invoiceNumber || "Confirmed Invoice"}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-amber-800">
                    This invoice has not been sent yet. It will return to DRAFT
                    with the same invoice number. You can then change prices,
                    additional charges, adjustment, or notes and confirm it
                    again.
                  </div>
                </div>
              )}

              {actionDialog.kind === "REVISE" && invoiceDetail && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                  <div className="font-semibold text-violet-950">
                    {invoiceDetail.invoiceNumber || "Sent Invoice"}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-violet-800">
                    The sent invoice and its PDF will remain unchanged. A new
                    revision will be created as the next R-number, for example
                    R1, R2, R3, and opened immediately as a DRAFT.
                  </div>
                </div>
              )}

              {actionDialog.kind === "SEND" && invoiceDetail && (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="font-semibold text-emerald-900">
                      {invoiceDetail.invoiceNumber || "Invoice"}
                    </div>
                    <div className="mt-1 text-xs text-emerald-700">
                      The official PDF will be attached to this email.
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Recipient Email
                    </span>
                    <input
                      autoFocus
                      type="email"
                      value={actionDialog.toEmail}
                      onChange={(e) =>
                        setActionDialog({
                          ...actionDialog,
                          toEmail: e.target.value,
                        })
                      }
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="billing@example.com"
                    />
                  </label>
                </>
              )}

              {actionDialog.kind === "SCHEDULE" && invoiceDetail && (
                <>
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <div className="font-semibold text-sky-900">
                      {invoiceDetail.invoiceNumber || "Invoice"}
                    </div>
                    <div className="mt-1 text-xs text-sky-700">
                      Due date will be 30 days after the scheduled/actual send
                      date.
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Recipient Email
                    </span>
                    <input
                      type="email"
                      value={actionDialog.toEmail}
                      onChange={(e) =>
                        setActionDialog({
                          ...actionDialog,
                          toEmail: e.target.value,
                        })
                      }
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Send Date & Time
                    </span>
                    <input
                      autoFocus
                      type="datetime-local"
                      value={actionDialog.scheduledSendLocal}
                      onChange={(e) =>
                        setActionDialog({
                          ...actionDialog,
                          scheduledSendLocal: e.target.value,
                        })
                      }
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </>
              )}

              {actionDialog.kind === "VOID" && invoiceDetail && (
                <>
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <div className="font-semibold text-rose-900">
                      {invoiceDetail.invoiceNumber || "Draft Invoice"}
                    </div>
                    <div className="mt-1 text-xs leading-5 text-rose-700">
                      Voiding releases the underlying report charge keys so they
                      can be billed again later.
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Void Reason
                    </span>
                    <textarea
                      autoFocus
                      rows={3}
                      value={actionDialog.reason}
                      onChange={(e) =>
                        setActionDialog({
                          ...actionDialog,
                          reason: e.target.value,
                        })
                      }
                      className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      placeholder="Enter the reason for voiding this invoice"
                    />
                  </label>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Button
                variant="secondary"
                onClick={() => setActionDialog(null)}
                disabled={!!working}
              >
                Cancel
              </Button>

              {actionDialog.kind === "OVERRIDE" && (
                <Button
                  onClick={submitOverrideLine}
                  disabled={working === `LINE:${actionDialog.line.id}`}
                >
                  {working === `LINE:${actionDialog.line.id}` && <Spinner />}
                  Save Override
                </Button>
              )}

              {actionDialog.kind === "DELETE_LINE" && (
                <Button
                  variant="danger"
                  onClick={submitDeleteInvoiceLine}
                  disabled={working === `DELETE_LINE:${actionDialog.line.id}`}
                >
                  {working === `DELETE_LINE:${actionDialog.line.id}` ? (
                    <Spinner />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete Line
                </Button>
              )}

              {actionDialog.kind === "CONFIRM" && (
                <Button
                  variant="success"
                  onClick={submitConfirmInvoice}
                  disabled={working === "CONFIRM"}
                >
                  {working === "CONFIRM" ? (
                    <Spinner />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Confirm Invoice
                </Button>
              )}

              {actionDialog.kind === "REOPEN" && (
                <Button
                  onClick={submitReopenInvoice}
                  disabled={working === "REOPEN"}
                >
                  {working === "REOPEN" ? (
                    <Spinner />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Reopen for Editing
                </Button>
              )}

              {actionDialog.kind === "REVISE" && (
                <Button
                  onClick={submitCreateInvoiceRevision}
                  disabled={working === "REVISE"}
                >
                  {working === "REVISE" ? (
                    <Spinner />
                  ) : (
                    <GitBranch className="h-4 w-4" />
                  )}
                  Create Revision
                </Button>
              )}

              {actionDialog.kind === "SEND" && (
                <Button
                  variant="success"
                  onClick={submitSendInvoice}
                  disabled={working === "SEND"}
                >
                  {working === "SEND" ? (
                    <Spinner />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {invoiceDetail?.status === "SENT"
                    ? "Resend Invoice"
                    : "Send Invoice"}
                </Button>
              )}

              {actionDialog.kind === "SCHEDULE" && (
                <Button
                  onClick={submitScheduleInvoiceSend}
                  disabled={working === "SCHEDULE_SEND"}
                >
                  {working === "SCHEDULE_SEND" ? (
                    <Spinner />
                  ) : (
                    <CalendarClock className="h-4 w-4" />
                  )}
                  {invoiceDetail?.scheduledSendAt
                    ? "Reschedule Send"
                    : "Schedule Send"}
                </Button>
              )}

              {actionDialog.kind === "VOID" && (
                <Button
                  variant="danger"
                  onClick={submitVoidInvoice}
                  disabled={working === "VOID"}
                >
                  {working === "VOID" ? (
                    <Spinner />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Void Invoice
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {manualInvoiceDialog && (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Manual Invoice
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {manualInvoiceDialog.kind === "CREATE"
                    ? "Create Manual Invoice"
                    : manualInvoiceDialog.kind === "ADD_LINE"
                      ? "Add Invoice Item"
                      : manualInvoiceDialog.kind === "EDIT_LINE"
                        ? "Edit Invoice Item"
                        : "Delete Invoice Item"}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!working) setManualInvoiceDialog(null);
                }}
                disabled={!!working}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              {manualInvoiceDialog.kind === "CREATE" && (
                <>
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
                    Create an invoice for a service or charge that is not tied
                    to a LIMS Form # or Report #.
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Client
                    </span>
                    <select
                      autoFocus
                      value={manualInvoiceDialog.clientCode}
                      onChange={(e) =>
                        setManualInvoiceDialog({
                          ...manualInvoiceDialog,
                          clientCode: e.target.value,
                        })
                      }
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    >
                      <option value="">Select Client</option>
                      {billingClients
                        .filter((client) => client.active !== false)
                        .map((client) => (
                          <option
                            key={client.clientCode}
                            value={client.clientCode}
                          >
                            {client.clientCode}
                            {client.name ? ` — ${client.name}` : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}

              {(manualInvoiceDialog.kind === "ADD_LINE" ||
                manualInvoiceDialog.kind === "EDIT_LINE") && (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Description
                    </span>
                    <textarea
                      autoFocus
                      rows={3}
                      value={manualInvoiceDialog.description}
                      onChange={(e) =>
                        setManualInvoiceDialog({
                          ...manualInvoiceDialog,
                          description: e.target.value,
                        })
                      }
                      className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Example: Stability consultation service"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Quantity
                      </span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={manualInvoiceDialog.quantity}
                        onChange={(e) =>
                          setManualInvoiceDialog({
                            ...manualInvoiceDialog,
                            quantity: e.target.value,
                          })
                        }
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                      />
                    </label>

                    <label>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Unit Price
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={manualInvoiceDialog.unitPrice}
                        onChange={(e) =>
                          setManualInvoiceDialog({
                            ...manualInvoiceDialog,
                            unitPrice: e.target.value,
                          })
                        }
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                        placeholder="0.00"
                      />
                    </label>
                  </div>
                </>
              )}

              {manualInvoiceDialog.kind === "DELETE_LINE" && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div className="font-semibold text-rose-950">
                    {manualInvoiceDialog.line.description}
                  </div>
                  <div className="mt-2 text-sm text-rose-800">
                    {manualInvoiceDialog.line.quantity} ×{" "}
                    {money(manualInvoiceDialog.line.unitPrice)} ={" "}
                    {money(manualInvoiceDialog.line.amount)}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Button
                variant="secondary"
                onClick={() => setManualInvoiceDialog(null)}
                disabled={!!working}
              >
                Cancel
              </Button>

              {manualInvoiceDialog.kind === "CREATE" && (
                <Button
                  onClick={submitCreateManualInvoice}
                  disabled={
                    working === "CREATE_MANUAL_INVOICE" ||
                    !manualInvoiceDialog.clientCode
                  }
                >
                  {working === "CREATE_MANUAL_INVOICE" ? <Spinner /> : null}
                  Create Draft
                </Button>
              )}

              {(manualInvoiceDialog.kind === "ADD_LINE" ||
                manualInvoiceDialog.kind === "EDIT_LINE") && (
                <Button
                  onClick={submitManualInvoiceLine}
                  disabled={
                    working === "ADD_MANUAL_LINE" ||
                    working?.startsWith("MANUAL_LINE:") === true
                  }
                >
                  {working === "ADD_MANUAL_LINE" ||
                  working?.startsWith("MANUAL_LINE:") ? (
                    <Spinner />
                  ) : null}
                  {manualInvoiceDialog.kind === "EDIT_LINE"
                    ? "Save Item"
                    : "Add Item"}
                </Button>
              )}

              {manualInvoiceDialog.kind === "DELETE_LINE" && (
                <Button
                  variant="danger"
                  onClick={submitDeleteManualInvoiceLine}
                  disabled={
                    working ===
                    `DELETE_MANUAL_LINE:${manualInvoiceDialog.line.id}`
                  }
                >
                  {working ===
                  `DELETE_MANUAL_LINE:${manualInvoiceDialog.line.id}` ? (
                    <Spinner />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete Item
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {extraChargeDialog && (
        <div className="fixed inset-0 z-[235] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Invoice Additional Charge
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {extraChargeDialog.kind === "ADD"
                    ? "Add Charge"
                    : extraChargeDialog.kind === "EDIT"
                      ? "Edit Charge"
                      : "Delete Charge"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExtraChargeDialog(null)}
                disabled={!!working}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {extraChargeDialog.kind === "DELETE" ? (
              <div className="px-5 py-5">
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <div className="font-semibold text-rose-950">
                    {extraChargeDialog.charge.name}
                  </div>
                  <div className="mt-1 text-sm text-rose-800">
                    {extraChargeDialog.charge.formNumber} ·{" "}
                    {money(extraChargeDialog.charge.amount)}
                  </div>
                  <div className="mt-3 text-xs text-rose-700">
                    Delete this additional charge from the draft invoice?
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 px-5 py-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <span className="font-semibold text-slate-900">
                    {extraChargeDialog.kind === "ADD"
                      ? extraChargeDialog.formNumber
                      : extraChargeDialog.charge.formNumber}
                  </span>
                  <span className="text-slate-500">
                    {" · "}
                    {extraChargeDialog.kind === "ADD"
                      ? extraChargeDialog.reportNumber
                      : extraChargeDialog.charge.reportNumber}
                  </span>
                </div>

                {extraChargeDialog.kind === "ADD" &&
                  (invoiceDetail?.extraChargeSuggestions?.length ?? 0) > 0 && (
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Previous Additional Charge
                      </span>
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return;

                          const index = Number(e.target.value);
                          const suggestion =
                            invoiceDetail?.extraChargeSuggestions?.[index];

                          if (!suggestion) return;

                          setExtraChargeDialog({
                            ...extraChargeDialog,
                            name: suggestion.name,
                            amount: suggestion.amount,
                          });
                        }}
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">
                          Select a previously used charge...
                        </option>
                        {invoiceDetail?.extraChargeSuggestions?.map(
                          (suggestion, index) => (
                            <option
                              key={`${suggestion.name}:${suggestion.amount}`}
                              value={index}
                            >
                              {suggestion.name} — {money(suggestion.amount)}
                              {suggestion.usageCount > 1
                                ? ` · used ${suggestion.usageCount}×`
                                : ""}
                            </option>
                          ),
                        )}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        Selecting a previous charge fills both the name and
                        amount. You can still edit either field before adding
                        it.
                      </p>
                    </label>
                  )}

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Charge Name
                  </span>
                  <input
                    autoFocus
                    value={extraChargeDialog.name}
                    onChange={(e) =>
                      setExtraChargeDialog({
                        ...extraChargeDialog,
                        name: e.target.value,
                      })
                    }
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="e.g. Rush Processing"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                    Amount
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={extraChargeDialog.amount}
                    onChange={(e) =>
                      setExtraChargeDialog({
                        ...extraChargeDialog,
                        amount: e.target.value,
                      })
                    }
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder="25.00"
                  />
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Button
                variant="secondary"
                onClick={() => setExtraChargeDialog(null)}
                disabled={!!working}
              >
                Cancel
              </Button>
              <Button
                variant={
                  extraChargeDialog.kind === "DELETE" ? "danger" : "primary"
                }
                onClick={submitExtraCharge}
                disabled={
                  working === "EXTRA_ADD" ||
                  working?.startsWith("EXTRA_EDIT:") ||
                  working?.startsWith("EXTRA_DELETE:")
                }
              >
                {working === "EXTRA_ADD" ||
                working?.startsWith("EXTRA_EDIT:") ||
                working?.startsWith("EXTRA_DELETE:") ? (
                  <Spinner />
                ) : extraChargeDialog.kind === "DELETE" ? (
                  <Trash2 className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {extraChargeDialog.kind === "DELETE"
                  ? "Delete Charge"
                  : extraChargeDialog.kind === "EDIT"
                    ? "Save Charge"
                    : "Add Charge"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {pricingRuleDialog && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pricing
                </div>

                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {pricingRuleDialog.kind === "EDIT"
                    ? "Edit Pricing Rule"
                    : "Delete Pricing Rule"}
                </h3>

                <p className="mt-1 text-sm leading-5 text-slate-500">
                  {pricingRuleDialog.kind === "EDIT"
                    ? "Price changes create a new effective version so prior billing history is preserved."
                    : "Delete is allowed only when this pricing rule has never been used on an invoice."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPricingRuleDialog(null)}
                disabled={!!working}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {pricingRuleDialog.kind === "EDIT" ? (
              <>
                <div className="space-y-4 px-5 py-5">
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-medium text-slate-500">
                        Client
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {pricingRuleDialog.rule.clientCode}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-slate-500">
                        Form
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {nice(pricingRuleDialog.rule.formType)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-slate-500">
                        Type of Test
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {pricingRuleDialog.rule.testLabel ||
                          nice(pricingRuleDialog.rule.testKey)}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-slate-500">
                        Pathogen / Active / COA Item
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {pricingRuleDialog.rule.itemLabel ||
                          (pricingRuleDialog.rule.itemKey
                            ? nice(pricingRuleDialog.rule.itemKey)
                            : "-")}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Unit Price
                      </span>
                      <input
                        autoFocus
                        type="number"
                        min="0"
                        step="0.01"
                        value={pricingRuleDialog.unitPrice}
                        onChange={(e) =>
                          setPricingRuleDialog({
                            ...pricingRuleDialog,
                            unitPrice: e.target.value,
                          })
                        }
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                        New Effective From
                      </span>
                      <input
                        type="date"
                        value={pricingRuleDialog.effectiveFrom}
                        onChange={(e) =>
                          setPricingRuleDialog({
                            ...pricingRuleDialog,
                            effectiveFrom: e.target.value,
                          })
                        }
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Test Label
                      </span>
                      <input
                        value={pricingRuleDialog.testLabel}
                        onChange={(e) =>
                          setPricingRuleDialog({
                            ...pricingRuleDialog,
                            testLabel: e.target.value,
                          })
                        }
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Item Label
                      </span>
                      <input
                        value={pricingRuleDialog.itemLabel}
                        onChange={(e) =>
                          setPricingRuleDialog({
                            ...pricingRuleDialog,
                            itemLabel: e.target.value,
                          })
                        }
                        disabled={!pricingRuleDialog.rule.itemKey}
                        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </label>
                  </div>

                  <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        Active pricing rule
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        Inactive rules are retained for history but are not used
                        for new billing.
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={pricingRuleDialog.active}
                      onChange={(e) =>
                        setPricingRuleDialog({
                          ...pricingRuleDialog,
                          active: e.target.checked,
                        })
                      }
                      className="h-5 w-5 rounded border-slate-300"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                  <Button
                    variant="secondary"
                    onClick={() => setPricingRuleDialog(null)}
                    disabled={!!working}
                  >
                    Cancel
                  </Button>

                  <Button
                    onClick={submitEditPriceRule}
                    disabled={
                      working === `PRICE_EDIT:${pricingRuleDialog.rule.id}`
                    }
                  >
                    {working === `PRICE_EDIT:${pricingRuleDialog.rule.id}` ? (
                      <Spinner />
                    ) : (
                      <Pencil className="h-4 w-4" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-5">
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <div className="font-semibold text-rose-950">
                      {pricingRuleDialog.rule.clientCode} ·{" "}
                      {nice(pricingRuleDialog.rule.formType)}
                    </div>

                    <div className="mt-1 text-sm text-rose-800">
                      {pricingRuleDialog.rule.testLabel ||
                        nice(pricingRuleDialog.rule.testKey)}
                      {pricingRuleDialog.rule.itemLabel
                        ? ` · ${pricingRuleDialog.rule.itemLabel}`
                        : ""}
                    </div>

                    <div className="mt-3 text-xs leading-5 text-rose-700">
                      If this rule has already been used by an invoice, deletion
                      will be blocked. Use Disable instead to preserve billing
                      history.
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                  <Button
                    variant="secondary"
                    onClick={() => setPricingRuleDialog(null)}
                    disabled={!!working}
                  >
                    Cancel
                  </Button>

                  <Button
                    variant="danger"
                    onClick={submitDeletePriceRule}
                    disabled={
                      working === `PRICE_DELETE:${pricingRuleDialog.rule.id}`
                    }
                  >
                    {working === `PRICE_DELETE:${pricingRuleDialog.rule.id}` ? (
                      <Spinner />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete Pricing Rule
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
