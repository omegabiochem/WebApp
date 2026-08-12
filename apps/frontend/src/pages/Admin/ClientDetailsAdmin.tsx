import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import toast from "react-hot-toast";

import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  ContactRound,
  CreditCard,
  FileText,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  Settings2,
  UserRound,
} from "lucide-react";

import { api } from "../../lib/api";

/* =========================================================
   TYPES
========================================================= */

type ClientDetailsRow = {
  clientCode: string;

  name?: string | null;
  legalName?: string | null;
  active: boolean;

  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;

  secondaryContactName?: string | null;
  secondaryContactEmail?: string | null;
  secondaryContactPhone?: string | null;

  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;

  timeZone: string;

  workdayStartMinutes: number;
  workdayEndMinutes: number;

  workingDays: number[];

  workflowReminderEnabled: boolean;
  workflowReminderIntervalMinutes: number;
  workflowReminderMaxCount: number;

  billingContactName?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;

  billingAddressLine1?: string | null;
  billingAddressLine2?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountry?: string | null;

  paymentTerms?: string | null;

  accountManager?: string | null;
  notes?: string | null;

  createdAt?: string;
  updatedAt?: string;
};

type ClientDetailsForm = {
  name: string;
  legalName: string;
  active: boolean;

  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;

  secondaryContactName: string;
  secondaryContactEmail: string;
  secondaryContactPhone: string;

  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;

  timeZone: string;

  workdayStart: string;
  workdayEnd: string;

  workingDays: number[];

  workflowReminderEnabled: boolean;
  workflowReminderIntervalMinutes: number;
  workflowReminderMaxCount: number;

  billingContactName: string;
  billingEmail: string;
  billingPhone: string;

  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  billingCountry: string;

  paymentTerms: string;

  accountManager: string;
  notes: string;
};

type Section =
  | "OVERVIEW"
  | "CONTACTS"
  | "SCHEDULE"
  | "BILLING"
  | "NOTES";

/* =========================================================
   STYLES
========================================================= */

function cx(
  ...classes: Array<string | false | undefined | null>
) {
  return classes.filter(Boolean).join(" ");
}

const card =
  "rounded-2xl border border-slate-200/80 bg-white shadow-sm";

const inputBase =
  "w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 " +
  "placeholder:text-slate-400 transition " +
  "hover:border-slate-300 " +
  "focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 " +
  "disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold " +
  "transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50";

const buttonPrimary = cx(
  buttonBase,
  "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 focus:ring-indigo-500/20",
);

// const buttonOutline = cx(
//   buttonBase,
//   "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 focus:ring-slate-300/30",
// );

/* =========================================================
   OPTIONS
========================================================= */

const TIME_ZONE_OPTIONS = [
  {
    value: "America/New_York",
    label: "Eastern Time",
    description: "New York",
  },
  {
    value: "America/Chicago",
    label: "Central Time",
    description: "Chicago",
  },
  {
    value: "America/Denver",
    label: "Mountain Time",
    description: "Denver",
  },
  {
    value: "America/Phoenix",
    label: "Arizona Time",
    description: "Phoenix",
  },
  {
    value: "America/Los_Angeles",
    label: "Pacific Time",
    description: "Los Angeles",
  },
  {
    value: "America/Anchorage",
    label: "Alaska Time",
    description: "Anchorage",
  },
  {
    value: "Pacific/Honolulu",
    label: "Hawaii Time",
    description: "Honolulu",
  },
];

const DAYS = [
  { value: 1, label: "Mon", full: "Monday" },
  { value: 2, label: "Tue", full: "Tuesday" },
  { value: 3, label: "Wed", full: "Wednesday" },
  { value: 4, label: "Thu", full: "Thursday" },
  { value: 5, label: "Fri", full: "Friday" },
  { value: 6, label: "Sat", full: "Saturday" },
  { value: 7, label: "Sun", full: "Sunday" },
];

const SECTIONS: Array<{
  value: Section;
  label: string;
}> = [
  {
    value: "OVERVIEW",
    label: "Overview",
  },
  {
    value: "CONTACTS",
    label: "Contacts",
  },
  {
    value: "SCHEDULE",
    label: "Schedule & Reminders",
  },
  {
    value: "BILLING",
    label: "Billing",
  },
  {
    value: "NOTES",
    label: "Notes",
  },
];

/* =========================================================
   HELPERS
========================================================= */

function minutesToTime(
  value: number | null | undefined,
) {
  const total =
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(1439, Math.max(0, value))
      : 540;

  const hour = Math.floor(total / 60);
  const minute = total % 60;

  return `${String(hour).padStart(2, "0")}:${String(
    minute,
  ).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return 0;
  }

  return hour * 60 + minute;
}

function emptyForm(): ClientDetailsForm {
  return {
    name: "",
    legalName: "",
    active: true,

    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",

    secondaryContactName: "",
    secondaryContactEmail: "",
    secondaryContactPhone: "",

    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "USA",

    timeZone: "America/New_York",

    workdayStart: "09:00",
    workdayEnd: "17:00",

    workingDays: [1, 2, 3, 4, 5],

    workflowReminderEnabled: true,

    workflowReminderIntervalMinutes: 60,
    workflowReminderMaxCount: 10,

    billingContactName: "",
    billingEmail: "",
    billingPhone: "",

    billingAddressLine1: "",
    billingAddressLine2: "",
    billingCity: "",
    billingState: "",
    billingPostalCode: "",
    billingCountry: "USA",

    paymentTerms: "",

    accountManager: "",

    notes: "",
  };
}

function toForm(
  row: ClientDetailsRow,
): ClientDetailsForm {
  return {
    name: row.name ?? "",
    legalName: row.legalName ?? "",
    active: row.active ?? true,

    primaryContactName:
      row.primaryContactName ?? "",

    primaryContactEmail:
      row.primaryContactEmail ?? "",

    primaryContactPhone:
      row.primaryContactPhone ?? "",

    secondaryContactName:
      row.secondaryContactName ?? "",

    secondaryContactEmail:
      row.secondaryContactEmail ?? "",

    secondaryContactPhone:
      row.secondaryContactPhone ?? "",

    addressLine1:
      row.addressLine1 ?? "",

    addressLine2:
      row.addressLine2 ?? "",

    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postalCode ?? "",
    country: row.country ?? "USA",

    timeZone:
      row.timeZone || "America/New_York",

    workdayStart: minutesToTime(
      row.workdayStartMinutes,
    ),

    workdayEnd: minutesToTime(
      row.workdayEndMinutes,
    ),

    workingDays:
      row.workingDays?.length > 0
        ? [...row.workingDays].sort(
            (a, b) => a - b,
          )
        : [1, 2, 3, 4, 5],

    workflowReminderEnabled:
      row.workflowReminderEnabled ?? true,

    workflowReminderIntervalMinutes:
      row.workflowReminderIntervalMinutes ?? 60,

    workflowReminderMaxCount:
      row.workflowReminderMaxCount ?? 10,

    billingContactName:
      row.billingContactName ?? "",

    billingEmail:
      row.billingEmail ?? "",

    billingPhone:
      row.billingPhone ?? "",

    billingAddressLine1:
      row.billingAddressLine1 ?? "",

    billingAddressLine2:
      row.billingAddressLine2 ?? "",

    billingCity:
      row.billingCity ?? "",

    billingState:
      row.billingState ?? "",

    billingPostalCode:
      row.billingPostalCode ?? "",

    billingCountry:
      row.billingCountry ?? "USA",

    paymentTerms:
      row.paymentTerms ?? "",

    accountManager:
      row.accountManager ?? "",

    notes:
      row.notes ?? "",
  };
}

function formatDate(
  value?: string | null,
) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isValidOptionalEmail(value: string) {
  if (!value.trim()) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value.trim(),
  );
}

/* =========================================================
   SMALL UI COMPONENTS
========================================================= */

function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1">
        <label className="text-xs font-medium text-slate-700">
          {label}
        </label>

        {required && (
          <span className="text-rose-500">*</span>
        )}
      </div>

      {children}

      {hint && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}

function CardTitle({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          {icon}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-slate-900">
          {title}
        </h2>

        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
        "focus:outline-none focus:ring-4 focus:ring-indigo-500/10",
        checked
          ? "bg-indigo-600"
          : "bg-slate-300",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cx(
          "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked
            ? "translate-x-6"
            : "translate-x-1",
        )}
      />
    </button>
  );
}

function SectionIcon({
  section,
  size = 16,
}: {
  section: Section;
  size?: number;
}) {
  switch (section) {
    case "OVERVIEW":
      return <Building2 size={size} />;

    case "CONTACTS":
      return <ContactRound size={size} />;

    case "SCHEDULE":
      return <Clock3 size={size} />;

    case "BILLING":
      return <CreditCard size={size} />;

    case "NOTES":
      return <FileText size={size} />;

    default:
      return null;
  }
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ClientDetailsAdmin() {
  const navigate = useNavigate();

  const { clientCode: param } = useParams<{
    clientCode: string;
  }>();

  const clientCode = String(param ?? "")
    .trim()
    .toUpperCase();

  const [section, setSection] =
    useState<Section>("OVERVIEW");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [existing, setExisting] =
    useState<ClientDetailsRow | null>(null);

  const [form, setForm] =
    useState<ClientDetailsForm>(
      emptyForm(),
    );

  const [originalForm, setOriginalForm] =
    useState<ClientDetailsForm>(
      emptyForm(),
    );

  const dirty = useMemo(
    () =>
      JSON.stringify(form) !==
      JSON.stringify(originalForm),
    [form, originalForm],
  );

  const currentTimeZone =
    TIME_ZONE_OPTIONS.find(
      (x) => x.value === form.timeZone,
    );

  const workingDaysLabel =
    form.workingDays.length === 0
      ? "No working days selected"
      : form.workingDays
          .map(
            (value) =>
              DAYS.find(
                (day) => day.value === value,
              )?.label,
          )
          .filter(Boolean)
          .join(", ");

  function updateField<
    K extends keyof ClientDetailsForm,
  >(
    key: K,
    value: ClientDetailsForm[K],
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function load() {
    if (!clientCode) return;

    setLoading(true);

    try {
      const rows =
        await api<ClientDetailsRow[]>(
          "/client-details",
        );

      const row =
        rows.find(
          (x) =>
            x.clientCode.toUpperCase() ===
            clientCode,
        ) ?? null;

      setExisting(row);

      const nextForm = row
        ? toForm(row)
        : emptyForm();

      setForm(nextForm);
      setOriginalForm(nextForm);
    } catch (e: any) {
      toast.error(
        e?.message ||
          "Failed to load client details",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientCode]);

  useEffect(() => {
    const onBeforeUnload = (
      event: BeforeUnloadEvent,
    ) => {
      if (!dirty) return;

      event.preventDefault();
    };

    window.addEventListener(
      "beforeunload",
      onBeforeUnload,
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        onBeforeUnload,
      );
    };
  }, [dirty]);

  function toggleDay(day: number) {
    setForm((prev) => {
      const selected =
        prev.workingDays.includes(day);

      const next = selected
        ? prev.workingDays.filter(
            (x) => x !== day,
          )
        : [...prev.workingDays, day];

      return {
        ...prev,
        workingDays: next.sort(
          (a, b) => a - b,
        ),
      };
    });
  }

  function backToClients() {
    if (dirty) {
      const leave = window.confirm(
        "You have unsaved changes. Leave this client without saving?",
      );

      if (!leave) return;
    }

    navigate(
      "/manage-users?tab=clients",
    );
  }

  function validate() {
    if (!clientCode) {
      toast.error(
        "Client code is missing",
      );

      return false;
    }

    if (
      !isValidOptionalEmail(
        form.primaryContactEmail,
      )
    ) {
      toast.error(
        "Enter a valid primary contact email",
      );

      setSection("CONTACTS");

      return false;
    }

    if (
      !isValidOptionalEmail(
        form.secondaryContactEmail,
      )
    ) {
      toast.error(
        "Enter a valid secondary contact email",
      );

      setSection("CONTACTS");

      return false;
    }

    if (
      !isValidOptionalEmail(
        form.billingEmail,
      )
    ) {
      toast.error(
        "Enter a valid billing email",
      );

      setSection("BILLING");

      return false;
    }

    if (!form.timeZone) {
      toast.error(
        "Time zone is required",
      );

      setSection("SCHEDULE");

      return false;
    }

    const start = timeToMinutes(
      form.workdayStart,
    );

    const end = timeToMinutes(
      form.workdayEnd,
    );

    if (start >= end) {
      toast.error(
        "Workday end must be after workday start",
      );

      setSection("SCHEDULE");

      return false;
    }

    if (
      form.workingDays.length === 0
    ) {
      toast.error(
        "Select at least one working day",
      );

      setSection("SCHEDULE");

      return false;
    }

    if (
      form.workflowReminderIntervalMinutes <
      1
    ) {
      toast.error(
        "Reminder interval must be at least 1 minute",
      );

      setSection("SCHEDULE");

      return false;
    }

    if (
      form.workflowReminderMaxCount < 1 ||
      form.workflowReminderMaxCount > 10
    ) {
      toast.error(
        "Maximum reminders must be between 1 and 10",
      );

      setSection("SCHEDULE");

      return false;
    }

    return true;
  }

  function payload() {
    return {
      name:
        form.name.trim() || null,

      legalName:
        form.legalName.trim() || null,

      active:
        form.active,

      primaryContactName:
        form.primaryContactName.trim() ||
        null,

      primaryContactEmail:
        form.primaryContactEmail
          .trim()
          .toLowerCase() || null,

      primaryContactPhone:
        form.primaryContactPhone.trim() ||
        null,

      secondaryContactName:
        form.secondaryContactName.trim() ||
        null,

      secondaryContactEmail:
        form.secondaryContactEmail
          .trim()
          .toLowerCase() || null,

      secondaryContactPhone:
        form.secondaryContactPhone.trim() ||
        null,

      addressLine1:
        form.addressLine1.trim() || null,

      addressLine2:
        form.addressLine2.trim() || null,

      city:
        form.city.trim() || null,

      state:
        form.state
          .trim()
          .toUpperCase() || null,

      postalCode:
        form.postalCode.trim() || null,

      country:
        form.country.trim() || "USA",

      timeZone:
        form.timeZone,

      workdayStartMinutes:
        timeToMinutes(
          form.workdayStart,
        ),

      workdayEndMinutes:
        timeToMinutes(
          form.workdayEnd,
        ),

      workingDays:
        form.workingDays,

      workflowReminderEnabled:
        form.workflowReminderEnabled,

      workflowReminderIntervalMinutes:
        Number(
          form.workflowReminderIntervalMinutes,
        ),

      workflowReminderMaxCount:
        Number(
          form.workflowReminderMaxCount,
        ),

      billingContactName:
        form.billingContactName.trim() ||
        null,

      billingEmail:
        form.billingEmail
          .trim()
          .toLowerCase() || null,

      billingPhone:
        form.billingPhone.trim() || null,

      billingAddressLine1:
        form.billingAddressLine1.trim() ||
        null,

      billingAddressLine2:
        form.billingAddressLine2.trim() ||
        null,

      billingCity:
        form.billingCity.trim() || null,

      billingState:
        form.billingState
          .trim()
          .toUpperCase() || null,

      billingPostalCode:
        form.billingPostalCode.trim() ||
        null,

      billingCountry:
        form.billingCountry.trim() ||
        "USA",

      paymentTerms:
        form.paymentTerms.trim() || null,

      accountManager:
        form.accountManager.trim() || null,

      notes:
        form.notes.trim() || null,
    };
  }

  async function save() {
    if (!validate()) return;

    setSaving(true);

    try {
      let result: ClientDetailsRow;

      if (existing) {
        result =
          await api<ClientDetailsRow>(
            `/client-details/${encodeURIComponent(
              clientCode,
            )}`,
            {
              method: "PATCH",
              body: JSON.stringify(
                payload(),
              ),
            },
          );

        toast.success(
          "Client details saved",
        );
      } else {
        result =
          await api<ClientDetailsRow>(
            "/client-details",
            {
              method: "POST",

              body: JSON.stringify({
                clientCode,
                ...payload(),
              }),
            },
          );

        toast.success(
          "Client details created",
        );
      }

      const nextForm =
        toForm(result);

      setExisting(result);
      setForm(nextForm);
      setOriginalForm(nextForm);
    } catch (e: any) {
      toast.error(
        e?.message ||
          "Failed to save client details",
      );
    } finally {
      setSaving(false);
    }
  }

  /* =========================================================
     INVALID
  ========================================================= */

  if (!clientCode) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        Invalid client code.
      </div>
    );
  }

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50">
            <RefreshCw
              size={22}
              className="animate-spin text-indigo-600"
            />
          </div>

          <div className="mt-4 text-sm font-medium text-slate-700">
            Loading client details
          </div>

          <div className="mt-1 text-xs text-slate-500">
            Preparing {clientCode}...
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="space-y-5 pb-8 text-slate-900">
      {/* =====================================================
          PAGE BREADCRUMB / BACK
      ===================================================== */}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={backToClients}
          className="group inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white transition group-hover:border-slate-300 group-hover:bg-slate-50">
            <ArrowLeft size={15} />
          </span>

          Client Management
        </button>

        {dirty && (
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Unsaved changes
          </div>
        )}
      </div>

      {/* =====================================================
          HERO / CLIENT HEADER
      ===================================================== */}

      <div
        className={cx(
          card,
          "overflow-hidden bg-gradient-to-br from-white via-white to-indigo-50/70",
        )}
      >
        <div className="px-5 py-5 md:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              {/* Client avatar */}

              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold tracking-wide text-white shadow-sm">
                {clientCode.slice(0, 3)}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                    {form.name ||
                      form.legalName ||
                      clientCode}
                  </h1>

                  <span
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                      existing
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-amber-50 text-amber-700 ring-amber-200",
                    )}
                  >
                    {existing ? (
                      <BadgeCheck size={13} />
                    ) : (
                      <Settings2 size={12} />
                    )}

                    {existing
                      ? "Configured"
                      : "Setup required"}
                  </span>

                  <span
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                      form.active
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-rose-50 text-rose-700 ring-rose-200",
                    )}
                  >
                    <span
                      className={cx(
                        "h-1.5 w-1.5 rounded-full",
                        form.active
                          ? "bg-emerald-500"
                          : "bg-rose-500",
                      )}
                    />

                    {form.active
                      ? "Active"
                      : "Inactive"}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {clientCode}
                  </span>

                  {form.legalName && (
                    <>
                      <span className="text-slate-300">
                        •
                      </span>

                      <span>
                        {form.legalName}
                      </span>
                    </>
                  )}

                  {existing?.updatedAt && (
                    <>
                      <span className="text-slate-300">
                        •
                      </span>

                      <span>
                        Updated{" "}
                        {formatDate(
                          existing.updatedAt,
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Header actions */}

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
                <div>
                  <div className="text-xs font-semibold text-slate-700">
                    Active Client
                  </div>

                  <div className="text-[11px] text-slate-500">
                    Available for operations
                  </div>
                </div>

                <Toggle
                  checked={form.active}
                  onChange={(value) =>
                    updateField(
                      "active",
                      value,
                    )
                  }
                />
              </div>

              <button
                type="button"
                className={buttonPrimary}
                onClick={save}
                disabled={
                  saving ||
                  (existing !== null && !dirty)
                }
              >
                {saving ? (
                  <RefreshCw
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <Save size={16} />
                )}

                {saving
                  ? "Saving..."
                  : existing
                    ? "Save Changes"
                    : "Create Client"}
              </button>
            </div>
          </div>
        </div>

        {/* ===================================================
            MODERN SEGMENTED NAVIGATION
        =================================================== */}

        <div className="border-t border-slate-200/80 bg-white/70 px-3 py-2.5 backdrop-blur-sm">
          <div className="flex gap-1 overflow-x-auto">
            {SECTIONS.map((item) => {
              const selected =
                section === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() =>
                    setSection(item.value)
                  }
                  className={cx(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
                    selected
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <SectionIcon
                    section={item.value}
                    size={15}
                  />

                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* =====================================================
          OVERVIEW
      ===================================================== */}

      {section === "OVERVIEW" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Basic Info */}

          <div className={card}>
            <div className="border-b border-slate-100 px-5 py-4">
              <CardTitle
                icon={<Building2 size={17} />}
                title="Company Information"
                description="Core client identity and Omega account ownership."
              />
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <Field label="Client Code">
                <input
                  value={clientCode}
                  disabled
                  className={inputBase}
                />
              </Field>

              <Field label="Client Name">
                <input
                  value={form.name}
                  onChange={(e) =>
                    updateField(
                      "name",
                      e.target.value,
                    )
                  }
                  className={inputBase}
                  placeholder="e.g. JJL Laboratories"
                />
              </Field>

              <Field label="Legal Name">
                <input
                  value={form.legalName}
                  onChange={(e) =>
                    updateField(
                      "legalName",
                      e.target.value,
                    )
                  }
                  className={inputBase}
                  placeholder="Registered company name"
                />
              </Field>

              <Field label="Account Manager">
                <input
                  value={
                    form.accountManager
                  }
                  onChange={(e) =>
                    updateField(
                      "accountManager",
                      e.target.value,
                    )
                  }
                  className={inputBase}
                  placeholder="Omega team member"
                />
              </Field>
            </div>
          </div>

          {/* Address */}

          <div className={card}>
            <div className="border-b border-slate-100 px-5 py-4">
              <CardTitle
                icon={<MapPin size={17} />}
                title="Business Address"
                description="Primary business or laboratory address."
              />
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <Field
                label="Address Line 1"
                className="sm:col-span-2"
              >
                <input
                  className={inputBase}
                  value={
                    form.addressLine1
                  }
                  onChange={(e) =>
                    updateField(
                      "addressLine1",
                      e.target.value,
                    )
                  }
                  placeholder="Street address"
                />
              </Field>

              <Field
                label="Address Line 2"
                className="sm:col-span-2"
              >
                <input
                  className={inputBase}
                  value={
                    form.addressLine2
                  }
                  onChange={(e) =>
                    updateField(
                      "addressLine2",
                      e.target.value,
                    )
                  }
                  placeholder="Suite, building, floor"
                />
              </Field>

              <Field label="City">
                <input
                  className={inputBase}
                  value={form.city}
                  onChange={(e) =>
                    updateField(
                      "city",
                      e.target.value,
                    )
                  }
                />
              </Field>

              <Field label="State / Province">
                <input
                  className={inputBase}
                  value={form.state}
                  onChange={(e) =>
                    updateField(
                      "state",
                      e.target.value,
                    )
                  }
                />
              </Field>

              <Field label="ZIP / Postal Code">
                <input
                  className={inputBase}
                  value={
                    form.postalCode
                  }
                  onChange={(e) =>
                    updateField(
                      "postalCode",
                      e.target.value,
                    )
                  }
                />
              </Field>

              <Field label="Country">
                <input
                  className={inputBase}
                  value={form.country}
                  onChange={(e) =>
                    updateField(
                      "country",
                      e.target.value,
                    )
                  }
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          CONTACTS
      ===================================================== */}

      {section === "CONTACTS" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Primary */}

          <div className={card}>
            <div className="border-b border-slate-100 px-5 py-4">
              <CardTitle
                icon={
                  <UserRound size={17} />
                }
                title="Primary Contact"
                description="Main operational contact for this client."
              />
            </div>

            <div className="space-y-4 p-5">
              <Field label="Contact Name">
                <div className="relative">
                  <UserRound
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    className={cx(
                      inputBase,
                      "pl-9",
                    )}
                    placeholder="Full name"
                    value={
                      form.primaryContactName
                    }
                    onChange={(e) =>
                      updateField(
                        "primaryContactName",
                        e.target.value,
                      )
                    }
                  />
                </div>
              </Field>

              <Field label="Email">
                <div className="relative">
                  <Mail
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="email"
                    className={cx(
                      inputBase,
                      "pl-9",
                    )}
                    placeholder="name@company.com"
                    value={
                      form.primaryContactEmail
                    }
                    onChange={(e) =>
                      updateField(
                        "primaryContactEmail",
                        e.target.value,
                      )
                    }
                  />
                </div>
              </Field>

              <Field label="Phone">
                <div className="relative">
                  <Phone
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    className={cx(
                      inputBase,
                      "pl-9",
                    )}
                    placeholder="+1 (000) 000-0000"
                    value={
                      form.primaryContactPhone
                    }
                    onChange={(e) =>
                      updateField(
                        "primaryContactPhone",
                        e.target.value,
                      )
                    }
                  />
                </div>
              </Field>
            </div>
          </div>

          {/* Secondary */}

          <div className={card}>
            <div className="border-b border-slate-100 px-5 py-4">
              <CardTitle
                icon={
                  <ContactRound size={17} />
                }
                title="Secondary Contact"
                description="Backup contact when the primary contact is unavailable."
              />
            </div>

            <div className="space-y-4 p-5">
              <Field label="Contact Name">
                <div className="relative">
                  <UserRound
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    className={cx(
                      inputBase,
                      "pl-9",
                    )}
                    placeholder="Full name"
                    value={
                      form.secondaryContactName
                    }
                    onChange={(e) =>
                      updateField(
                        "secondaryContactName",
                        e.target.value,
                      )
                    }
                  />
                </div>
              </Field>

              <Field label="Email">
                <div className="relative">
                  <Mail
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="email"
                    className={cx(
                      inputBase,
                      "pl-9",
                    )}
                    placeholder="name@company.com"
                    value={
                      form.secondaryContactEmail
                    }
                    onChange={(e) =>
                      updateField(
                        "secondaryContactEmail",
                        e.target.value,
                      )
                    }
                  />
                </div>
              </Field>

              <Field label="Phone">
                <div className="relative">
                  <Phone
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    className={cx(
                      inputBase,
                      "pl-9",
                    )}
                    placeholder="+1 (000) 000-0000"
                    value={
                      form.secondaryContactPhone
                    }
                    onChange={(e) =>
                      updateField(
                        "secondaryContactPhone",
                        e.target.value,
                      )
                    }
                  />
                </div>
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          SCHEDULE & REMINDERS
      ===================================================== */}

      {section === "SCHEDULE" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Work Schedule */}

          <div className={card}>
            <div className="border-b border-slate-100 px-5 py-4">
              <CardTitle
                icon={
                  <CalendarDays size={17} />
                }
                title="Working Schedule"
                description="Defines when client-side reminder time is counted."
              />
            </div>

            <div className="space-y-5 p-5">
              <Field
                label="Time Zone"
                required
                hint={`Stored as ${form.timeZone}`}
              >
                <select
                  className={cx(
                    inputBase,
                    "cursor-pointer",
                  )}
                  value={form.timeZone}
                  onChange={(e) =>
                    updateField(
                      "timeZone",
                      e.target.value,
                    )
                  }
                >
                  {TIME_ZONE_OPTIONS.map(
                    (zone) => (
                      <option
                        key={zone.value}
                        value={zone.value}
                      >
                        {zone.label} —{" "}
                        {zone.description}
                      </option>
                    ),
                  )}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Workday Starts">
                  <input
                    type="time"
                    className={inputBase}
                    value={
                      form.workdayStart
                    }
                    onChange={(e) =>
                      updateField(
                        "workdayStart",
                        e.target.value,
                      )
                    }
                  />
                </Field>

                <Field label="Workday Ends">
                  <input
                    type="time"
                    className={inputBase}
                    value={form.workdayEnd}
                    onChange={(e) =>
                      updateField(
                        "workdayEnd",
                        e.target.value,
                      )
                    }
                  />
                </Field>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-slate-700">
                    Working Days
                  </label>

                  <span className="text-[11px] text-slate-400">
                    {workingDaysLabel}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {DAYS.map((day) => {
                    const selected =
                      form.workingDays.includes(
                        day.value,
                      );

                    return (
                      <button
                        key={day.value}
                        type="button"
                        title={day.full}
                        onClick={() =>
                          toggleDay(day.value)
                        }
                        className={cx(
                          "rounded-xl border px-2 py-2.5 text-xs font-semibold transition",
                          selected
                            ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800",
                        )}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <Clock3 size={14} />

                  Current schedule
                </div>

                <div className="mt-1.5 text-xs text-slate-500">
                  {workingDaysLabel} •{" "}
                  {form.workdayStart}–
                  {form.workdayEnd} •{" "}
                  {currentTimeZone?.label ??
                    form.timeZone}
                </div>
              </div>
            </div>
          </div>

          {/* Workflow Reminders */}

          <div className={card}>
            <div className="border-b border-slate-100 px-5 py-4">
              <CardTitle
                icon={
                  <BellRing size={17} />
                }
                title="Workflow Reminders"
                description="Automatically follow up while a workflow is still waiting for action."
              />
            </div>

            <div className="space-y-5 p-5">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Automated reminders
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Pause reminders automatically
                    once the report leaves the
                    pending status.
                  </div>
                </div>

                <Toggle
                  checked={
                    form.workflowReminderEnabled
                  }
                  onChange={(value) =>
                    updateField(
                      "workflowReminderEnabled",
                      value,
                    )
                  }
                />
              </div>

              <div
                className={cx(
                  "grid grid-cols-1 gap-3 sm:grid-cols-2",
                  !form.workflowReminderEnabled &&
                    "opacity-50",
                )}
              >
                <Field
                  label="Reminder Interval"
                  hint="Working minutes between successful reminders."
                >
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      disabled={
                        !form.workflowReminderEnabled
                      }
                      value={
                        form.workflowReminderIntervalMinutes
                      }
                      onChange={(e) =>
                        updateField(
                          "workflowReminderIntervalMinutes",
                          Math.max(
                            1,
                            Number(
                              e.target.value,
                            ) || 1,
                          ),
                        )
                      }
                      className={cx(
                        inputBase,
                        "pr-20",
                      )}
                    />

                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                      minutes
                    </span>
                  </div>
                </Field>

                <Field
                  label="Maximum Reminders"
                  hint="System maximum is 10."
                >
                  <input
                    type="number"
                    min={1}
                    max={10}
                    disabled={
                      !form.workflowReminderEnabled
                    }
                    value={
                      form.workflowReminderMaxCount
                    }
                    onChange={(e) =>
                      updateField(
                        "workflowReminderMaxCount",
                        Math.min(
                          10,
                          Math.max(
                            1,
                            Number(
                              e.target.value,
                            ) || 1,
                          ),
                        ),
                      )
                    }
                    className={inputBase}
                  />
                </Field>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Monitored statuses
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    "Correction Requested",
                    "Change Requested",
                    "Under Correction Update",
                    "Under Change Update",
                  ].map((label) => (
                    <div
                      key={label}
                      className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
                    >
                      <Check
                        size={13}
                        className="text-emerald-600"
                      />

                      {label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                    <Clock3 size={15} />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-indigo-900">
                      Business-hour aware
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-indigo-700">
                      Client-side actions use{" "}
                      <strong>
                        {currentTimeZone?.label ??
                          form.timeZone}
                      </strong>{" "}
                      and the working schedule configured
                      here. Lab-side actions continue to
                      use Omega's working schedule.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          BILLING
      ===================================================== */}

      {section === "BILLING" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          {/* Billing Contact */}

          <div className={cx(card, "xl:col-span-2")}>
            <div className="border-b border-slate-100 px-5 py-4">
              <CardTitle
                icon={
                  <CreditCard size={17} />
                }
                title="Billing Contact"
                description="Accounts payable or finance contact."
              />
            </div>

            <div className="space-y-4 p-5">
              <Field label="Contact Name">
                <input
                  className={inputBase}
                  value={
                    form.billingContactName
                  }
                  onChange={(e) =>
                    updateField(
                      "billingContactName",
                      e.target.value,
                    )
                  }
                  placeholder="Billing contact"
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  className={inputBase}
                  value={
                    form.billingEmail
                  }
                  onChange={(e) =>
                    updateField(
                      "billingEmail",
                      e.target.value,
                    )
                  }
                  placeholder="billing@company.com"
                />
              </Field>

              <Field label="Phone">
                <input
                  className={inputBase}
                  value={
                    form.billingPhone
                  }
                  onChange={(e) =>
                    updateField(
                      "billingPhone",
                      e.target.value,
                    )
                  }
                  placeholder="+1 (000) 000-0000"
                />
              </Field>

              <Field
                label="Payment Terms"
                hint="Examples: Net 30, Net 45, prepaid."
              >
                <input
                  className={inputBase}
                  value={
                    form.paymentTerms
                  }
                  onChange={(e) =>
                    updateField(
                      "paymentTerms",
                      e.target.value,
                    )
                  }
                  placeholder="Net 30"
                />
              </Field>
            </div>
          </div>

          {/* Billing Address */}

          <div className={cx(card, "xl:col-span-3")}>
            <div className="border-b border-slate-100 px-5 py-4">
              <CardTitle
                icon={<MapPin size={17} />}
                title="Billing Address"
                description="Address used for invoices and billing correspondence."
              />
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <Field
                label="Address Line 1"
                className="sm:col-span-2"
              >
                <input
                  className={inputBase}
                  value={
                    form.billingAddressLine1
                  }
                  onChange={(e) =>
                    updateField(
                      "billingAddressLine1",
                      e.target.value,
                    )
                  }
                />
              </Field>

              <Field
                label="Address Line 2"
                className="sm:col-span-2"
              >
                <input
                  className={inputBase}
                  value={
                    form.billingAddressLine2
                  }
                  onChange={(e) =>
                    updateField(
                      "billingAddressLine2",
                      e.target.value,
                    )
                  }
                />
              </Field>

              <Field label="City">
                <input
                  className={inputBase}
                  value={
                    form.billingCity
                  }
                  onChange={(e) =>
                    updateField(
                      "billingCity",
                      e.target.value,
                    )
                  }
                />
              </Field>

              <Field label="State / Province">
                <input
                  className={inputBase}
                  value={
                    form.billingState
                  }
                  onChange={(e) =>
                    updateField(
                      "billingState",
                      e.target.value,
                    )
                  }
                />
              </Field>

              <Field label="ZIP / Postal Code">
                <input
                  className={inputBase}
                  value={
                    form.billingPostalCode
                  }
                  onChange={(e) =>
                    updateField(
                      "billingPostalCode",
                      e.target.value,
                    )
                  }
                />
              </Field>

              <Field label="Country">
                <input
                  className={inputBase}
                  value={
                    form.billingCountry
                  }
                  onChange={(e) =>
                    updateField(
                      "billingCountry",
                      e.target.value,
                    )
                  }
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          NOTES
      ===================================================== */}

      {section === "NOTES" && (
        <div className={card}>
          <div className="border-b border-slate-100 px-5 py-4">
            <CardTitle
              icon={<FileText size={17} />}
              title="Internal Notes"
              description="Private Omega notes, preferences, agreements, and special instructions."
            />
          </div>

          <div className="p-5">
            <textarea
              value={form.notes}
              onChange={(e) =>
                updateField(
                  "notes",
                  e.target.value,
                )
              }
              className={cx(
                inputBase,
                "h-auto min-h-[280px] resize-y py-3 leading-relaxed",
              )}
              placeholder="Add internal notes about this client..."
            />

            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>
                Internal use only
              </span>

              <span>
                {form.notes.length.toLocaleString()}{" "}
                characters
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          MOBILE / BOTTOM SAVE BAR
      ===================================================== */}

      {dirty && (
        <div className="sticky bottom-4 z-30">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur">
            <div className="pl-2">
              <div className="text-xs font-semibold text-slate-900">
                Unsaved changes
              </div>

              <div className="text-[11px] text-slate-500">
                Save before leaving.
              </div>
            </div>

            <button
              type="button"
              className={buttonPrimary}
              onClick={save}
              disabled={saving}
            >
              {saving ? (
                <RefreshCw
                  size={15}
                  className="animate-spin"
                />
              ) : (
                <Save size={15} />
              )}

              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}