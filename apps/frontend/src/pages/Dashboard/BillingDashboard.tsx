import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
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

type BillingInvoiceStatus = "DRAFT" | "CONFIRMED" | "SENT" | "VOID";
type BillingTab = "OVERVIEW" | "INVOICES" | "UNBILLED" | "PRICING";
type BillingActionDialog =
  | {
      kind: "OVERRIDE";
      line: BillingLine;
      unitPrice: string;
      reason: string;
    }
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
  emails: BillingEmailHistory[];
  extraCharges: BillingInvoiceExtraCharge[];
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

type GroupedUnbilledReport = {
  key: string;
  sourceType: string;
  sourceId: string;
  formType: string;
  formNumber: string;
  reportNumber: string;
  clientCode: string;
  billingReadyAt: string;
  description: string | null;
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
  clientCode: string;
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

const STERILITY_TEST_LABELS = [
  "Sterility USP 71",
  "Testing",
];

const APE_TEST_LABELS = [
  "AET USP51",
  "TBT/TFC",
];

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

  return [...byKey.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
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


function isMissingPricingRule(issue?: string | null) {
  return String(issue ?? "")
    .toLowerCase()
    .includes("no pricing rule configured");
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

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function groupUnbilledByReport(
  items: UnbilledItem[],
): GroupedUnbilledReport[] {
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
        billingReadyAt: item.billingReadyAt,
        description: unbilledDescription(item) || null,
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
    group.testLabels = uniqueNonEmpty(
      group.items.map(
        (item) => item.testLabel || nice(item.testKey),
      ),
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

export default function BillingDashboard() {
  const { user } = useAuth();

  const role = String((user as any)?.role ?? "");
  const isManager = role === "ADMIN" || role === "SYSTEMADMIN";

  const [tab, setTab] = useState<BillingTab>("OVERVIEW");
  const [month, setMonth] = useState(currentMonthKey());
  const [clientCode, setClientCode] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<
    "ALL" | BillingInvoiceStatus
  >("ALL");

  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceListResponse | null>(null);
  const [unbilled, setUnbilled] = useState<UnbilledResponse | null>(null);
  const [prices, setPrices] = useState<PricingRule[]>([]);
  const [billingClients, setBillingClients] = useState<BillingClientOption[]>([]);

  /*
   * Common Billing filters.
   *
   * These controls live in the main Billing header and remain
   * visible while switching between Overview, Invoices,
   * Unbilled, and Pricing.
   */
  const [departmentFilter, setDepartmentFilter] = useState<
    "ALL" | "MICRO" | "CHEMISTRY"
  >("ALL");
  const [formTypeFilter, setFormTypeFilter] = useState("ALL");
  const [testFilter, setTestFilter] = useState("ALL");
  const [itemFilter, setItemFilter] = useState("ALL");

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

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

  const [draftAdjustment, setDraftAdjustment] = useState("0.00");
  const [draftNotes, setDraftNotes] = useState("");

  const [actionDialog, setActionDialog] =
    useState<BillingActionDialog>(null);

  const [pricingRuleDialog, setPricingRuleDialog] =
    useState<PricingRuleDialog>(null);
  const [extraChargeDialog, setExtraChargeDialog] =
    useState<ExtraChargeDialog>(null);

  const [priceForm, setPriceForm] = useState<PriceForm>({
    clientCode: "",
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

  const pricingTestOptions = useMemo(
    () => getTestOptions(priceForm.formType),
    [priceForm.formType],
  );

  const pricingItemOptions = useMemo(
    () => getItemOptions(priceForm.formType),
    [priceForm.formType],
  );

  const pricingSupportsItem =
    supportsPricingItem(priceForm.formType);

  const pricingRequiresItem =
    requiresPricingItem(priceForm.formType);

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

    return api<InvoiceListResponse>(
      `/billing/invoices?${params.toString()}`,
    );
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
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (tab === "PRICING" && isManager) {
      refreshPrices();
      refreshBillingClients();
    }
  }, [tab, isManager, refreshPrices, refreshBillingClients]);

  useEffect(() => {
    setPage(1);
  }, [month, clientCode, invoiceStatus, perPage]);

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

      if (
        result?.invoiceCount === 0 &&
        skippedNotReadySources > 0
      ) {
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
      setTab("INVOICES");
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
    if (
      !invoiceDetail ||
      !isManager ||
      actionDialog?.kind !== "OVERRIDE"
    ) {
      return;
    }

    const line = actionDialog.line;
    const unitPrice = actionDialog.unitPrice.trim();
    const reason = actionDialog.reason.trim();

    if (!unitPrice || Number.isNaN(Number(unitPrice)) || Number(unitPrice) < 0) {
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

  function confirmInvoice() {
    if (!invoiceDetail || !isManager) return;

    setActionDialog({ kind: "CONFIRM" });
  }

  async function submitConfirmInvoice() {
    if (
      !invoiceDetail ||
      !isManager ||
      actionDialog?.kind !== "CONFIRM"
    ) {
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
        isRegeneration
          ? "Invoice PDF regenerated"
          : "Invoice PDF generated",
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
      const { blob } = await apiBlob(
        `/billing/invoices/${row.id}/pdf`,
      );

      const url = URL.createObjectURL(blob);

      const opened = window.open(
        url,
        "_blank",
        "noopener,noreferrer",
      );

      if (!opened) {
        toast.error("Browser blocked the PDF window");
        URL.revokeObjectURL(url);
        return;
      }

      window.setTimeout(
        () => URL.revokeObjectURL(url),
        60_000,
      );
    } catch (error: any) {
      toast.error(extractMessage(error));
    } finally {
      setWorking(null);
    }
  }

  function reopenInvoiceForEditing() {
    if (
      !invoiceDetail ||
      !isManager ||
      invoiceDetail.status !== "CONFIRMED"
    ) {
      return;
    }

    setActionDialog({
      kind: "REOPEN",
    });
  }

  async function submitReopenInvoice() {
    if (
      !invoiceDetail ||
      !isManager ||
      actionDialog?.kind !== "REOPEN"
    ) {
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
    if (
      !invoiceDetail ||
      !isManager ||
      invoiceDetail.status !== "SENT"
    ) {
      return;
    }

    setActionDialog({
      kind: "REVISE",
    });
  }

  async function submitCreateInvoiceRevision() {
    if (
      !invoiceDetail ||
      !isManager ||
      actionDialog?.kind !== "REVISE"
    ) {
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

      toast.success(
        `Created revised invoice ${revised.invoiceNumber}`,
      );

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
    if (
      !invoiceDetail ||
      actionDialog?.kind !== "SEND"
    ) {
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
        invoiceDetail.scheduledToEmail ??
        invoiceDetail.billingEmail ??
        "",
      scheduledSendLocal: toDateTimeLocal(
        invoiceDetail.scheduledSendAt,
      ),
    });
  }

  async function submitScheduleInvoiceSend() {
    if (
      !invoiceDetail ||
      actionDialog?.kind !== "SCHEDULE"
    ) {
      return;
    }

    const toEmail = actionDialog.toEmail.trim();
    const scheduled = new Date(actionDialog.scheduledSendLocal);

    if (!toEmail) {
      toast.error("Recipient email is required");
      return;
    }

    if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= Date.now()) {
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
    if (
      !invoiceDetail ||
      !isManager ||
      actionDialog?.kind !== "VOID"
    ) {
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
        isEdit
          ? "Additional charge updated"
          : "Additional charge added",
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

    const formSupportsItem =
      supportsPricingItem(item.formType);

    const itemOptions =
      getItemOptions(item.formType);

    const knownItem =
      !!item.itemKey &&
      itemOptions.some(
        (option) => option.value === item.itemKey,
      );

    const customItemLabel =
      item.itemLabel ||
      (item.itemKey
        ? nice(item.itemKey.replace(/^OTHER_/, ""))
        : "");

    setPriceForm({
      clientCode: String(item.clientCode ?? "")
        .trim()
        .toUpperCase(),

      department,
      formType: item.formType,

      testKey: knownTest
        ? item.testKey
        : CUSTOM_TEST_VALUE,

      testLabel: knownTest
        ? item.testLabel || nice(item.testKey)
        : "",

      itemKey: !formSupportsItem
        ? ""
        : knownItem
          ? item.itemKey || ""
          : item.itemKey
            ? CUSTOM_ITEM_VALUE
            : "",

      itemLabel: knownItem
        ? item.itemLabel ||
          (item.itemKey ? nice(item.itemKey) : "")
        : "",

      customTestLabel: knownTest
        ? ""
        : item.testLabel || nice(item.testKey),

      customItemLabel:
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

    setClientCode(
      String(item.clientCode ?? "")
        .trim()
        .toUpperCase(),
    );
    setDepartmentFilter(department);
    setFormTypeFilter(item.formType);
    setTestFilter(item.testKey || "ALL");
    setItemFilter(item.itemKey || "ALL");

    setPricingPrefillMessage(
      `Prefilled from ${item.formNumber} / ${item.reportNumber}. Enter the Unit Price and review Effective From before creating the rule.`,
    );

    setTab("PRICING");

    window.setTimeout(() => {
      document
        .getElementById("billing-pricing-rule-form")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

      const priceInput = document.getElementById(
        "billing-pricing-unit-price",
      ) as HTMLInputElement | null;

      priceInput?.focus();
    }, 0);
  }

  async function createPriceRule(event: React.FormEvent) {
    event.preventDefault();
    if (!isManager) return;

    if (!priceForm.clientCode.trim()) {
      toast.error("Client code is required");
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

    if (pricingSupportsItem) {
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

      /*
       * Chemistry and COA always require an individual item.
       *
       * Micro pathogen selection is optional because a Micro
       * report may legitimately contain only Type-of-Test/TBC-TFC
       * work with no pathogen selected.
       */
      if (pricingRequiresItem && !itemKey) {
        toast.error(
          `${pricingItemName(priceForm.formType)} is required`,
        );
        return;
      }

      if (!itemKey) {
        itemLabel = undefined;
      }
    }

    if (!priceForm.unitPrice.trim()) {
      toast.error("Unit price is required");
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
          department: priceForm.department,
          formType: priceForm.formType,

          testKey,
          testLabel: testLabel || undefined,

          ...(pricingSupportsItem && itemKey
            ? {
                itemKey,
                itemLabel: itemLabel || undefined,
              }
            : {}),

          /*
           * All new item-level rules are one flat charge.
           * Legacy PER_ACTIVE rules remain visible in the table,
           * but this form no longer creates them.
           */
          priceBasis: "FLAT",

          unitPrice: priceForm.unitPrice,
          active: true,
          effectiveFrom: effective.toISOString(),
        }),
      });

      toast.success("Pricing rule created");

      setPricingPrefillMessage(null);

      setPriceForm((prev) => ({
        ...prev,

        testKey: "",
        testLabel: "",

        itemKey: "",
        itemLabel: "",

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
    if (
      !isManager ||
      pricingRuleDialog?.kind !== "EDIT"
    ) {
      return;
    }

    const {
      rule,
      unitPrice,
      effectiveFrom,
      testLabel,
      itemLabel,
      active,
    } = pricingRuleDialog;

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
    if (
      !isManager ||
      pricingRuleDialog?.kind !== "DELETE"
    ) {
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

      toast.success(rule.active ? "Pricing rule disabled" : "Pricing rule enabled");
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
      const code = String(row.clientCode ?? "").trim().toUpperCase();
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
      const code = String(item.clientCode ?? "").trim().toUpperCase();
      if (!code || byCode.has(code)) continue;

      byCode.set(code, {
        clientCode: code,
      });
    }

    for (const rule of prices) {
      const code = String(rule.clientCode ?? "").trim().toUpperCase();
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
        return [
          "MICRO_MIX",
          "MICRO_MIX_WATER",
          "STERILITY",
          "APE",
        ].includes(formType);
      }

      return ["CHEMISTRY_MIX", "COA"].includes(formType);
    });
  }, [departmentFilter]);

  const commonTestOptions = useMemo(() => {
    const tests = new Map<string, string>();

    const add = (value?: string | null, label?: string | null) => {
      const key = String(value ?? "").trim();
      if (!key) return;

      tests.set(
        key,
        String(label ?? "").trim() || nice(key),
      );
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

      if (
        departmentFilter !== "ALL" &&
        department !== departmentFilter
      ) {
        continue;
      }

      if (
        formTypeFilter !== "ALL" &&
        item.formType !== formTypeFilter
      ) {
        continue;
      }

      add(item.testKey, item.testLabel);
    }

    for (const rule of prices) {
      if (
        departmentFilter !== "ALL" &&
        rule.department !== departmentFilter
      ) {
        continue;
      }

      if (
        formTypeFilter !== "ALL" &&
        rule.formType !== formTypeFilter
      ) {
        continue;
      }

      add(rule.testKey, rule.testLabel);
    }

    return [...tests.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [
    departmentFilter,
    formTypeFilter,
    commonFormOptions,
    unbilled,
    prices,
  ]);

  const commonItemOptions = useMemo(() => {
    const items = new Map<string, string>();

    const add = (value?: string | null, label?: string | null) => {
      const key = String(value ?? "").trim();
      if (!key) return;

      items.set(
        key,
        String(label ?? "").trim() || nice(key),
      );
    };

    const forms =
      formTypeFilter !== "ALL"
        ? [formTypeFilter]
        : commonFormOptions;

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

      if (
        departmentFilter !== "ALL" &&
        department !== departmentFilter
      ) {
        continue;
      }

      if (
        formTypeFilter !== "ALL" &&
        item.formType !== formTypeFilter
      ) {
        continue;
      }

      if (
        testFilter !== "ALL" &&
        item.testKey !== testFilter
      ) {
        continue;
      }

      add(item.itemKey, item.itemLabel);
    }

    for (const rule of prices) {
      if (
        departmentFilter !== "ALL" &&
        rule.department !== departmentFilter
      ) {
        continue;
      }

      if (
        formTypeFilter !== "ALL" &&
        rule.formType !== formTypeFilter
      ) {
        continue;
      }

      if (
        testFilter !== "ALL" &&
        rule.testKey !== testFilter
      ) {
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
    }) => {
      const department =
        row.formType === "CHEMISTRY_MIX" || row.formType === "COA"
          ? "CHEMISTRY"
          : "MICRO";

      if (
        departmentFilter !== "ALL" &&
        department !== departmentFilter
      ) {
        return false;
      }

      if (
        formTypeFilter !== "ALL" &&
        row.formType !== formTypeFilter
      ) {
        return false;
      }

      if (
        testFilter !== "ALL" &&
        row.testKey !== testFilter
      ) {
        return false;
      }

      if (
        itemFilter !== "ALL" &&
        row.itemKey !== itemFilter
      ) {
        return false;
      }

      return true;
    },
    [
      departmentFilter,
      formTypeFilter,
      testFilter,
      itemFilter,
    ],
  );

  const visibleUnbilled = useMemo(() => {
    return (unbilled?.items ?? []).filter(
      matchesCommonLineFilters,
    );
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

      if (
        departmentFilter !== "ALL" &&
        rule.department !== departmentFilter
      ) {
        return false;
      }

      if (
        formTypeFilter !== "ALL" &&
        rule.formType !== formTypeFilter
      ) {
        return false;
      }

      if (
        testFilter !== "ALL" &&
        rule.testKey !== testFilter
      ) {
        return false;
      }

      if (
        itemFilter !== "ALL" &&
        rule.itemKey !== itemFilter
      ) {
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
    return (invoiceDetail?.lines ?? []).filter(
      matchesCommonLineFilters,
    );
  }, [invoiceDetail, matchesCommonLineFilters]);


  const invoiceSourceRows = useMemo(() => {
    const rows = new Map<
      string,
      {
        key: string;
        sourceType: string;
        sourceId: string;
        formNumber: string;
        reportNumber: string;
        charges: BillingInvoiceExtraCharge[];
      }
    >();

    for (const line of visibleInvoiceLines) {
      const key = `${line.sourceType}:${line.sourceId}`;

      if (!rows.has(key)) {
        rows.set(key, {
          key,
          sourceType: line.sourceType,
          sourceId: line.sourceId,
          formNumber: line.formNumber,
          reportNumber: line.reportNumber,
          charges: [],
        });
      }
    }

    for (const charge of invoiceDetail?.extraCharges ?? []) {
      const key = `${charge.sourceType}:${charge.sourceId}`;
      const row = rows.get(key);

      if (row) {
        row.charges.push(charge);
      }
    }

    return [...rows.values()];
  }, [visibleInvoiceLines, invoiceDetail]);

  function clearCommonFilters() {
    setClientCode("");
    setDepartmentFilter("ALL");
    setFormTypeFilter("ALL");
    setTestFilter("ALL");
    setItemFilter("ALL");
    setInvoiceStatus("ALL");
    setPage(1);
  }

  const activeCommonFilterCount = [
    !!clientCode.trim(),
    departmentFilter !== "ALL",
    formTypeFilter !== "ALL",
    testFilter !== "ALL",
    itemFilter !== "ALL",
    invoiceStatus !== "ALL",
  ].filter(Boolean).length;

  const hasActiveCommonFilters =
    activeCommonFilterCount > 0;

  const unresolvedInSelected =
    visibleInvoiceLines.filter(
      (line) =>
        !!line.pricingIssue || line.unitPrice == null || line.amount == null,
    ).length;

  return (
    <>
      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Header / actions */}
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
                type="button"
                variant={
                  hasActiveCommonFilters
                    ? "danger"
                    : "secondary"
                }
                onClick={clearCommonFilters}
                disabled={!hasActiveCommonFilters}
                className="min-w-[118px]"
              >
                Clear Filters
                {hasActiveCommonFilters && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-[11px] font-bold text-white">
                    {activeCommonFilterCount}
                  </span>
                )}
              </Button>

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

          {/* Stable common filter bar */}
          <div className="bg-slate-50/70 px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  Filters
                </div>

                <div className="mt-0.5 text-xs text-slate-500">
                  These filters apply across Overview, Invoices, Unbilled, and Pricing.
                </div>
              </div>

              {hasActiveCommonFilters && (
                <div className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                  {activeCommonFilterCount} active
                </div>
              )}
            </div>

            {/*
              Keep one predictable two-row filter layout:
              Row 1 = Month, Client, Department, Form Type
              Row 2 = Type of Test, Pathogen / Active / COA Item, Invoice Status.
              On narrower screens the filter area scrolls horizontally
              instead of changing the order.
            */}
            <div className="overflow-x-auto pb-1">
              <div className="grid min-w-[900px] grid-cols-4 gap-x-3 gap-y-4">
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Billing Month
                  </span>

                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <label className="block min-w-0">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Client
                  </span>

                  <select
                    value={clientCode}
                    onChange={(e) => {
                      setClientCode(e.target.value);
                      setPage(1);
                    }}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">All Clients</option>

                    {commonClientOptions.map((client) => (
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

                <label className="block min-w-0">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Department
                  </span>

                  <select
                    value={departmentFilter}
                    onChange={(e) => {
                      setDepartmentFilter(
                        e.target.value as
                          | "ALL"
                          | "MICRO"
                          | "CHEMISTRY",
                      );

                      setFormTypeFilter("ALL");
                      setTestFilter("ALL");
                      setItemFilter("ALL");
                    }}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="ALL">All Departments</option>
                    <option value="MICRO">Micro</option>
                    <option value="CHEMISTRY">Chemistry</option>
                  </select>
                </label>

                <label className="block min-w-0">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Form Type
                  </span>

                  <select
                    value={formTypeFilter}
                    onChange={(e) => {
                      setFormTypeFilter(e.target.value);
                      setTestFilter("ALL");
                      setItemFilter("ALL");
                    }}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="ALL">All Forms</option>

                    {commonFormOptions.map((formType) => (
                      <option
                        key={formType}
                        value={formType}
                      >
                        {nice(formType)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block min-w-0">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Type of Test
                  </span>

                  <select
                    value={testFilter}
                    onChange={(e) => {
                      setTestFilter(e.target.value);
                      setItemFilter("ALL");
                    }}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="ALL">All Tests</option>

                    {commonTestOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block min-w-0">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Pathogen / Active / COA Item
                  </span>

                  <select
                    value={itemFilter}
                    onChange={(e) =>
                      setItemFilter(e.target.value)
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="ALL">All Items</option>

                    {commonItemOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block min-w-0">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Invoice Status
                  </span>

                  <select
                    value={invoiceStatus}
                    onChange={(e) =>
                      setInvoiceStatus(
                        e.target.value as
                          | "ALL"
                          | BillingInvoiceStatus,
                      )
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option
                        key={status}
                        value={status}
                      >
                        {nice(status)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </section>

        <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {managerTabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
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
                onClick={() => setTab("UNBILLED")}
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
                onClick={() => setTab("UNBILLED")}
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
                    onClick={() => {
                      setInvoiceStatus(status);
                      setTab("INVOICES");
                    }}
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
          </div>
        )}

        {tab === "INVOICES" && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Invoices</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Draft, confirmed, sent, and void invoice history.
                </p>
              </div>

              <div className="flex items-end gap-2">
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
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Invoice #</th>
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
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(row.periodStart)}
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
                        {row._count?.lines ?? "-"}
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
                            onClick={() =>
                              viewInvoicePdfFromList(row)
                            }
                            disabled={
                              working ===
                              `VIEW_ROW_PDF:${row.id}`
                            }
                          >
                            {working ===
                            `VIEW_ROW_PDF:${row.id}` ? (
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
                        colSpan={10}
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
        )}

        {tab === "UNBILLED" && (
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
                <div className="text-xs text-slate-500">Estimated subtotal</div>
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
                    Missing pricing or invalid source data will never be silently
                    billed at $0.
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Form #</th>
                    <th className="px-4 py-3">Report #</th>
                    <th className="px-4 py-3">Form Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Type of Test</th>
                    <th className="px-4 py-3">
                      Pathogens / Actives / COA Items
                    </th>
                    <th className="px-4 py-3">Unit Price</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Billing Ready</th>
                    <th className="px-4 py-3">Issue</th>
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

                      <td className="px-4 py-3">
                        {group.reportNumber}
                      </td>

                      <td className="px-4 py-3">
                        {nice(group.formType)}
                      </td>

                      <td className="max-w-[220px] px-4 py-3 text-xs leading-5 text-slate-600">
                        {group.description || "-"}
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
                                : item.testLabel ||
                                  nice(item.testKey));

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
                                  : item.testLabel ||
                                    nice(item.testKey));

                              return isManager &&
                                isMissingPricingRule(
                                  item.pricingIssue,
                                ) ? (
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
                          <span className="font-medium text-emerald-700">
                            Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {!loading &&
                    groupedVisibleUnbilled.length === 0 && (
                      <tr>
                        <td
                          colSpan={10}
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
        )}

        {tab === "PRICING" && isManager && (
          <div className="space-y-5">
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
                    Select the form, its Type of Test, and when applicable the exact Micro pathogen, Chemistry active, or COA item. Pricing is client-specific and date-effective.
                  </p>
                </div>
              </div>

              {pricingPrefillMessage && (
                <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                  <div className="flex items-start gap-3">
                    <CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0" />

                    <div>
                      <div className="font-semibold">
                        Missing pricing rule
                      </div>

                      <div className="mt-1 text-xs leading-5">
                        {pricingPrefillMessage}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setPricingPrefillMessage(null)
                    }
                    className="rounded-md p-1 text-sky-700 hover:bg-sky-100"
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

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
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">Select Client</option>

                    {commonClientOptions.map((client) => (
                      <option
                        key={client.clientCode}
                        value={client.clientCode}
                      >
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
                        department === "MICRO"
                          ? "MICRO_MIX"
                          : "CHEMISTRY_MIX";

                      setPriceForm((p) => ({
                        ...p,
                        department,
                        formType,

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

                      const selected =
                        pricingTestOptions.find(
                          (option) => option.value === testKey,
                        );

                      setPriceForm((p) => ({
                        ...p,

                        testKey,

                        testLabel:
                          selected?.label ?? "",

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
                      <option
                        key={option.value}
                        value={option.value}
                      >
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

                {pricingSupportsItem && (
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      {pricingItemName(priceForm.formType)}
                    </span>

                    <select
                      required={pricingRequiresItem}
                      value={priceForm.itemKey}
                      onChange={(e) => {
                        const itemKey = e.target.value;

                        const selected =
                          pricingItemOptions.find(
                            (option) => option.value === itemKey,
                          );

                        setPriceForm((p) => ({
                          ...p,

                          itemKey,

                          itemLabel:
                            selected?.label ?? "",

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
                          : `Select ${pricingItemName(
                              priceForm.formType,
                            )}`}
                      </option>

                      {pricingItemOptions.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}

                      <option value={CUSTOM_ITEM_VALUE}>
                        Other / Custom{" "}
                        {pricingItemName(priceForm.formType)}
                      </option>
                    </select>
                  </label>
                )}

                {pricingSupportsItem &&
                  priceForm.itemKey === CUSTOM_ITEM_VALUE && (
                    <label>
                      <span className="mb-1 block text-xs font-medium text-slate-600">
                        Custom{" "}
                        {pricingItemName(priceForm.formType)}{" "}
                        Name
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

                <label>
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Unit Price
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
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Form</th>
                      <th className="px-4 py-3">Test</th>
                      <th className="px-4 py-3">Pathogen / Active / COA Item</th>
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
                        <td className="px-4 py-3">{nice(rule.department)}</td>
                        <td className="px-4 py-3">{nice(rule.formType)}</td>
                        <td className="px-4 py-3">
                          {rule.testLabel || nice(rule.testKey)}
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
                          colSpan={10}
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
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusClass(
                        invoiceDetail.status,
                      )}`}
                    >
                      {nice(invoiceDetail.status)}
                    </span>
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
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Invoice Lines
                      </h3>
                      <p className="text-xs text-slate-500">
                        {visibleInvoiceLines.length} charge
                        {visibleInvoiceLines.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    {unresolvedInSelected > 0 && (
                      <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                        <AlertTriangle className="h-4 w-4" />
                        {unresolvedInSelected} pricing issue
                        {unresolvedInSelected === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Form #</th>
                          <th className="px-4 py-3">Report #</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Test</th>
                          <th className="px-4 py-3 text-right">Unit Price</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-4 py-3">Pricing</th>
                          {invoiceDetail.status === "DRAFT" && isManager && (
                            <th className="px-4 py-3 text-right">Action</th>
                          )}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {visibleInvoiceLines.map((line, lineIndex) => {
                          const sourceKey =
                            `${line.sourceType}:${line.sourceId}`;

                          const firstSourceLineIndex =
                            visibleInvoiceLines.findIndex(
                              (candidate) =>
                                `${candidate.sourceType}:${candidate.sourceId}` ===
                                sourceKey,
                            );

                          const isFirstSourceLine =
                            firstSourceLineIndex === lineIndex;

                          return (
                            <tr key={line.id} className="align-top">
                              <td className="px-4 py-3 font-medium">
                                {line.formNumber}
                              </td>

                              <td className="px-4 py-3">
                                {line.reportNumber}
                              </td>

                              <td className="px-4 py-3">
                                {nice(line.formType)}
                              </td>

                              <td className="px-4 py-3">
                                <div>
                                  {line.testLabel || nice(line.testKey)}
                                </div>

                                {(line.itemLabel || line.itemKey) && (
                                  <div className="mt-0.5 text-xs font-medium text-slate-600">
                                    {line.itemLabel || nice(line.itemKey!)}
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
                                      line.manualOverrideReason || undefined
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

                                      {isFirstSourceLine && (
                                        <Button
                                          variant="secondary"
                                          onClick={() =>
                                            openAddExtraCharge({
                                              sourceType: line.sourceType,
                                              sourceId: line.sourceId,
                                              formNumber: line.formNumber,
                                              reportNumber: line.reportNumber,
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
                          );
                        })}

                        {visibleInvoiceLines.length === 0 && (
                          <tr>
                            <td
                              colSpan={
                                invoiceDetail.status === "DRAFT" && isManager
                                  ? 8
                                  : 7
                              }
                              className="px-4 py-10 text-center text-sm text-slate-500"
                            >
                              No invoice lines match the common filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          Additional Charges by Form
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Add named report-level charges such as rush processing or special handling.
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Form #</th>
                            <th className="px-4 py-3">Report #</th>
                            <th className="px-4 py-3">Additional Charges</th>
                            <th className="px-4 py-3 text-right">Extra Total</th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                          {invoiceSourceRows
                            .filter((row) => row.charges.length > 0)
                            .map((row) => {
                            const extraTotal = row.charges.reduce(
                              (sum, charge) => sum + Number(charge.amount || 0),
                              0,
                            );

                            return (
                              <tr key={row.key} className="align-top">
                                <td className="px-4 py-3 font-medium text-slate-900">
                                  {row.formNumber}
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {row.reportNumber}
                                </td>
                                <td className="px-4 py-3">
                                  {row.charges.length ? (
                                    <div className="space-y-2">
                                      {row.charges.map((charge) => (
                                        <div
                                          key={charge.id}
                                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                                        >
                                          <div className="min-w-0">
                                            <div className="truncate text-sm font-medium text-slate-800">
                                              {charge.name}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                              {money(charge.amount)}
                                            </div>
                                          </div>

                                          {invoiceDetail.status === "DRAFT" && isManager && (
                                            <div className="flex shrink-0 gap-1">
                                              <button
                                                type="button"
                                                onClick={() => openEditExtraCharge(charge)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                                                title="Edit additional charge"
                                              >
                                                <Pencil className="h-3.5 w-3.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => openDeleteExtraCharge(charge)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                                                title="Delete additional charge"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                                  {money(extraTotal)}
                                </td>
                              </tr>
                            );
                          })}

                          {invoiceSourceRows.every(
                            (row) => row.charges.length === 0,
                          ) && (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-4 py-8 text-center text-sm text-slate-500"
                              >
                                No additional charges added.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
                    <div className="space-y-4">
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

                            <label className="sm:col-span-2">
                              <span className="mb-1 block text-xs font-medium text-slate-600">
                                Notes
                              </span>
                              <textarea
                                value={draftNotes}
                                onChange={(e) => setDraftNotes(e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              />
                            </label>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
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
                                unresolvedInSelected > 0
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
                      ) : (
                        <div className="rounded-xl border border-slate-200 p-4">
                          <h3 className="font-semibold text-slate-900">Notes</h3>
                          <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                            {invoiceDetail.notes || "No invoice notes."}
                          </p>
                        </div>
                      )}

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
                                  Scheduled for {formatDateTime(invoiceDetail.scheduledSendAt)}
                                </div>
                                <div className="mt-0.5">
                                  Recipient: {invoiceDetail.scheduledToEmail || invoiceDetail.billingEmail || "-"}
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
                                  {working === "CANCEL_SCHEDULE" && <Spinner dark />}
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

                            {invoiceDetail.status === "SENT" &&
                              isManager && (
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
                            {invoiceDetail.voidReason || "No void reason stored."}
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
                            Confirmed: {formatDateTime(invoiceDetail.confirmedAt)}
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
                </div>
              </div>
            )}
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

              {actionDialog.kind === "CONFIRM" && invoiceDetail && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="font-semibold text-amber-950">
                    {invoiceDetail.clientCode}
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-4">
                    <span className="text-sm text-amber-800">Invoice total</span>
                    <span className="text-2xl font-bold text-amber-950">
                      {money(invoiceDetail.total)}
                    </span>
                  </div>
                  <div className="mt-3 border-t border-amber-200 pt-3 text-xs leading-5 text-amber-800">
                    After confirmation, invoice charges become immutable. The PDF
                    can still be regenerated until the invoice is sent.
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
                    additional charges, adjustment, or notes and confirm it again.
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
                      Due date will be 30 days after the scheduled/actual send date.
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
                    {extraChargeDialog.charge.formNumber} · {money(extraChargeDialog.charge.amount)}
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
                variant={extraChargeDialog.kind === "DELETE" ? "danger" : "primary"}
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
                        Inactive rules are retained for history but are not used for new billing.
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
                      working ===
                      `PRICE_EDIT:${pricingRuleDialog.rule.id}`
                    }
                  >
                    {working ===
                    `PRICE_EDIT:${pricingRuleDialog.rule.id}` ? (
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
                      working ===
                      `PRICE_DELETE:${pricingRuleDialog.rule.id}`
                    }
                  >
                    {working ===
                    `PRICE_DELETE:${pricingRuleDialog.rule.id}` ? (
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
