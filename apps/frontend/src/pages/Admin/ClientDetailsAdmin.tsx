import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useNavigate, useParams } from "react-router-dom";

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
  Copy,
  CreditCard,
  FileText,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Save,
  Settings2,
  UserCheck,
  UserRound,
  UsersRound,
  UserX,
} from "lucide-react";

import { api } from "../../lib/api";
import {
  fetchUsers,
  forceUserSignout,
  resetUserPassword,
  setUserActive,
  setUserClientCode,
  setUserEmail,
  setUserName,
  type UserRow,
} from "../../services/usersService";
import Modal from "../../components/common/Modal";
import { socket } from "../../lib/socket";

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
  | "USERS"
  | "SCHEDULE"
  | "BILLING"
  | "NOTES";

/* =========================================================
   STYLES
========================================================= */

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const card = "rounded-2xl border border-slate-200/80 bg-white shadow-sm";

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

const buttonOutline = cx(
  buttonBase,
  "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 focus:ring-slate-300/30",
);

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

const US_STATE_OPTIONS = [
  { value: "", label: "Select state" },
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },

  // District / Territories
  { value: "DC", label: "District of Columbia" },
  { value: "PR", label: "Puerto Rico" },
  { value: "GU", label: "Guam" },
  { value: "VI", label: "U.S. Virgin Islands" },
  { value: "AS", label: "American Samoa" },
  { value: "MP", label: "Northern Mariana Islands" },
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
    value: "USERS",
    label: "Users",
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

function minutesToTime(value: number | null | undefined) {
  const total =
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(1439, Math.max(0, value))
      : 540;

  const hour = Math.floor(total / 60);
  const minute = total % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
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

function toForm(row: ClientDetailsRow): ClientDetailsForm {
  return {
    name: row.name ?? "",
    legalName: row.legalName ?? "",
    active: row.active ?? true,

    primaryContactName: row.primaryContactName ?? "",

    primaryContactEmail: row.primaryContactEmail ?? "",

    primaryContactPhone: row.primaryContactPhone ?? "",

    secondaryContactName: row.secondaryContactName ?? "",

    secondaryContactEmail: row.secondaryContactEmail ?? "",

    secondaryContactPhone: row.secondaryContactPhone ?? "",

    addressLine1: row.addressLine1 ?? "",

    addressLine2: row.addressLine2 ?? "",

    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postalCode ?? "",
    country: row.country ?? "USA",

    timeZone: row.timeZone || "America/New_York",

    workdayStart: minutesToTime(row.workdayStartMinutes),

    workdayEnd: minutesToTime(row.workdayEndMinutes),

    workingDays:
      row.workingDays?.length > 0
        ? [...row.workingDays].sort((a, b) => a - b)
        : [1, 2, 3, 4, 5],

    workflowReminderEnabled: row.workflowReminderEnabled ?? true,

    workflowReminderIntervalMinutes: row.workflowReminderIntervalMinutes ?? 60,

    workflowReminderMaxCount: row.workflowReminderMaxCount ?? 10,

    billingContactName: row.billingContactName ?? "",

    billingEmail: row.billingEmail ?? "",

    billingPhone: row.billingPhone ?? "",

    billingAddressLine1: row.billingAddressLine1 ?? "",

    billingAddressLine2: row.billingAddressLine2 ?? "",

    billingCity: row.billingCity ?? "",

    billingState: row.billingState ?? "",

    billingPostalCode: row.billingPostalCode ?? "",

    billingCountry: row.billingCountry ?? "USA",

    paymentTerms: row.paymentTerms ?? "",

    accountManager: row.accountManager ?? "",

    notes: row.notes ?? "",
  };
}

function formatDate(value?: string | null) {
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

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
        <label className="text-xs font-medium text-slate-700">{label}</label>

        {required && <span className="text-rose-500">*</span>}
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
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>

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
        checked ? "bg-indigo-600" : "bg-slate-300",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cx(
          "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
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
    case "USERS":
      return <UsersRound size={size} />;

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

  const [section, setSection] = useState<Section>("OVERVIEW");

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [existing, setExisting] = useState<ClientDetailsRow | null>(null);

  const [form, setForm] = useState<ClientDetailsForm>(emptyForm());

  const [clientUsers, setClientUsers] = useState<UserRow[]>([]);

  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [usersLoading, setUsersLoading] = useState(false);

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);

  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserClientCode, setEditUserClientCode] = useState("");
  const [editUserActive, setEditUserActive] = useState(true);

  const [userSaving, setUserSaving] = useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [passwordUserLabel, setPasswordUserLabel] = useState("");
  const [passwordCopied, setPasswordCopied] = useState(false);

  const [originalForm, setOriginalForm] =
    useState<ClientDetailsForm>(emptyForm());

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(originalForm),
    [form, originalForm],
  );

  const currentTimeZone = TIME_ZONE_OPTIONS.find(
    (x) => x.value === form.timeZone,
  );

  const workingDaysLabel =
    form.workingDays.length === 0
      ? "No working days selected"
      : form.workingDays
          .map((value) => DAYS.find((day) => day.value === value)?.label)
          .filter(Boolean)
          .join(", ");

  function updateField<K extends keyof ClientDetailsForm>(
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
      const rows = await api<ClientDetailsRow[]>("/client-details");

      const row =
        rows.find((x) => x.clientCode.toUpperCase() === clientCode) ?? null;

      setExisting(row);

      const nextForm = row ? toForm(row) : emptyForm();

      setForm(nextForm);
      setOriginalForm(nextForm);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load client details");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadClientUsers();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientCode]);

  useEffect(() => {
    const applySnapshot = (response?: { onlineUserIds?: string[] }) => {
      setOnlineUserIds(new Set(response?.onlineUserIds ?? []));
    };

    const requestPresence = () => {
      socket.emit(
        "presence:get",
        {},
        (response: { onlineUserIds?: string[] }) => {
          applySnapshot(response);
        },
      );
    };

    const onPresenceChanged = (payload: {
      userId?: string;
      online?: boolean;
    }) => {
      if (!payload?.userId) {
        return;
      }

      setOnlineUserIds((previous) => {
        const next = new Set(previous);

        if (payload.online) {
          next.add(payload.userId!);
        } else {
          next.delete(payload.userId!);
        }

        return next;
      });
    };

    socket.on("presence:changed", onPresenceChanged);

    socket.on("connect", requestPresence);

    if (socket.connected) {
      requestPresence();
    }

    return () => {
      socket.off("presence:changed", onPresenceChanged);

      socket.off("connect", requestPresence);
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;

      event.preventDefault();
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);

  function toggleDay(day: number) {
    setForm((prev) => {
      const selected = prev.workingDays.includes(day);

      const next = selected
        ? prev.workingDays.filter((x) => x !== day)
        : [...prev.workingDays, day];

      return {
        ...prev,
        workingDays: next.sort((a, b) => a - b),
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

    navigate("/manage-users?tab=clients");
  }

  function validate() {
    if (!clientCode) {
      toast.error("Client code is missing");

      return false;
    }

    if (!isValidOptionalEmail(form.primaryContactEmail)) {
      toast.error("Enter a valid primary contact email");

      setSection("CONTACTS");

      return false;
    }

    if (!isValidOptionalEmail(form.secondaryContactEmail)) {
      toast.error("Enter a valid secondary contact email");

      setSection("CONTACTS");

      return false;
    }

    if (!isValidOptionalEmail(form.billingEmail)) {
      toast.error("Enter a valid billing email");

      setSection("BILLING");

      return false;
    }

    if (!form.timeZone) {
      toast.error("Time zone is required");

      setSection("SCHEDULE");

      return false;
    }

    const start = timeToMinutes(form.workdayStart);

    const end = timeToMinutes(form.workdayEnd);

    if (start >= end) {
      toast.error("Workday end must be after workday start");

      setSection("SCHEDULE");

      return false;
    }

    if (form.workingDays.length === 0) {
      toast.error("Select at least one working day");

      setSection("SCHEDULE");

      return false;
    }

    if (form.workflowReminderIntervalMinutes < 1) {
      toast.error("Reminder interval must be at least 1 minute");

      setSection("SCHEDULE");

      return false;
    }

    if (
      form.workflowReminderMaxCount < 1 ||
      form.workflowReminderMaxCount > 10
    ) {
      toast.error("Maximum reminders must be between 1 and 10");

      setSection("SCHEDULE");

      return false;
    }

    return true;
  }

  async function loadClientUsers() {
    if (!clientCode) return;

    setUsersLoading(true);

    try {
      const res = await fetchUsers({
        q: "",
        role: "CLIENT",
        active: "ALL",
        page: 1,
        pageSize: 500,
      });

      const matchingUsers = res.items.filter(
        (user) =>
          String(user.clientCode ?? "")
            .trim()
            .toUpperCase() === clientCode,
      );

      setClientUsers(matchingUsers);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load client users");
    } finally {
      setUsersLoading(false);
    }
  }

  function openUserEditor(user: UserRow) {
    setSelectedUser(user);

    setEditUserName(user.name ?? "");
    setEditUserEmail(user.email ?? "");

    setEditUserClientCode(user.clientCode ?? "");

    setEditUserActive(user.active);

    setUserModalOpen(true);
  }

  async function saveUser() {
    if (!selectedUser) return;

    const nextName = editUserName.trim() || null;

    const nextEmail = editUserEmail.trim().toLowerCase();

    const nextClientCode = editUserClientCode.trim().toUpperCase();

    if (!nextEmail) {
      toast.error("Email is required");
      return;
    }

    if (!isValidOptionalEmail(nextEmail)) {
      toast.error("Enter a valid email");
      return;
    }

    if (!nextClientCode) {
      toast.error("Client Code is required");
      return;
    }

    if (!/^[A-Z]{3}$/.test(nextClientCode)) {
      toast.error("Client Code must be exactly 3 uppercase letters");
      return;
    }

    setUserSaving(true);

    try {
      // Name
      if ((selectedUser.name ?? null) !== nextName) {
        await setUserName(selectedUser.id, nextName);
      }

      // Email
      if (selectedUser.email.toLowerCase() !== nextEmail) {
        await setUserEmail(selectedUser.id, nextEmail);
      }

      // Client Code
      if ((selectedUser.clientCode ?? "").toUpperCase() !== nextClientCode) {
        await setUserClientCode(selectedUser.id, nextClientCode);
      }

      // Active / Disabled
      if (selectedUser.active !== editUserActive) {
        await setUserActive(selectedUser.id, editUserActive);
      }

      toast.success("User updated");

      setUserModalOpen(false);
      setSelectedUser(null);

      await loadClientUsers();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update user");
    } finally {
      setUserSaving(false);
    }
  }

  async function resetClientUserPassword(user: UserRow) {
    try {
      const res = await resetUserPassword(user.id);

      setTemporaryPassword(res.tempPassword);

      setPasswordUserLabel(`${user.name ?? "User"} • ${user.email}`);

      setPasswordCopied(false);

      // Close edit modal first
      setUserModalOpen(false);

      // Then show password modal
      setPasswordModalOpen(true);

      toast.success("Temporary password generated");
    } catch (e: any) {
      toast.error(e?.message || "Password reset failed");
    }
  }

  async function copyTemporaryPassword() {
    if (!temporaryPassword) {
      toast.error("No temporary password available");
      return;
    }

    try {
      await navigator.clipboard.writeText(temporaryPassword);

      setPasswordCopied(true);

      setTimeout(() => {
        setPasswordCopied(false);
      }, 1200);

      toast.success("Password copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function forceClientUserSignout(user: UserRow) {
    const confirmed = window.confirm(`Force sign out ${user.email}?`);

    if (!confirmed) return;

    try {
      await forceUserSignout(user.id);

      toast.success("User signed out");

      await loadClientUsers();
    } catch (e: any) {
      toast.error(e?.message || "Force signout failed");
    }
  }

  function payload() {
    return {
      name: form.name.trim() || null,

      legalName: form.legalName.trim() || null,

      active: form.active,

      primaryContactName: form.primaryContactName.trim() || null,

      primaryContactEmail:
        form.primaryContactEmail.trim().toLowerCase() || null,

      primaryContactPhone: form.primaryContactPhone.trim() || null,

      secondaryContactName: form.secondaryContactName.trim() || null,

      secondaryContactEmail:
        form.secondaryContactEmail.trim().toLowerCase() || null,

      secondaryContactPhone: form.secondaryContactPhone.trim() || null,

      addressLine1: form.addressLine1.trim() || null,

      addressLine2: form.addressLine2.trim() || null,

      city: form.city.trim() || null,

      state: form.state.trim().toUpperCase() || null,

      postalCode: form.postalCode.trim() || null,

      country: form.country.trim() || "USA",

      timeZone: form.timeZone,

      workdayStartMinutes: timeToMinutes(form.workdayStart),

      workdayEndMinutes: timeToMinutes(form.workdayEnd),

      workingDays: form.workingDays,

      workflowReminderEnabled: form.workflowReminderEnabled,

      workflowReminderIntervalMinutes: Number(
        form.workflowReminderIntervalMinutes,
      ),

      workflowReminderMaxCount: Number(form.workflowReminderMaxCount),

      billingContactName: form.billingContactName.trim() || null,

      billingEmail: form.billingEmail.trim().toLowerCase() || null,

      billingPhone: form.billingPhone.trim() || null,

      billingAddressLine1: form.billingAddressLine1.trim() || null,

      billingAddressLine2: form.billingAddressLine2.trim() || null,

      billingCity: form.billingCity.trim() || null,

      billingState: form.billingState.trim().toUpperCase() || null,

      billingPostalCode: form.billingPostalCode.trim() || null,

      billingCountry: form.billingCountry.trim() || "USA",

      paymentTerms: form.paymentTerms.trim() || null,

      accountManager: form.accountManager.trim() || null,

      notes: form.notes.trim() || null,
    };
  }

  async function save() {
    if (!validate()) return;

    setSaving(true);

    try {
      let result: ClientDetailsRow;

      if (existing) {
        result = await api<ClientDetailsRow>(
          `/client-details/${encodeURIComponent(clientCode)}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload()),
          },
        );

        toast.success("Client details saved");
      } else {
        result = await api<ClientDetailsRow>("/client-details", {
          method: "POST",

          body: JSON.stringify({
            clientCode,
            ...payload(),
          }),
        });

        toast.success("Client details created");
      }

      const previousClientActive = existing?.active;

      const nextForm = toForm(result);

      setExisting(result);
      setForm(nextForm);
      setOriginalForm(nextForm);

      /*
       * Immediately update the visual user statuses
       * when Active Client changed.
       */
      if (
        previousClientActive !== undefined &&
        previousClientActive !== result.active
      ) {
        setClientUsers((prev) =>
          prev.map((user) => ({
            ...user,
            active: result.active,
          })),
        );
      }

      /*
       * Then confirm against backend.
       */
      await loadClientUsers();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save client details");
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
            <RefreshCw size={22} className="animate-spin text-indigo-600" />
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
                    {form.name || form.legalName || clientCode}
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

                    {existing ? "Configured" : "Setup required"}
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
                        form.active ? "bg-emerald-500" : "bg-rose-500",
                      )}
                    />

                    {form.active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {clientCode}
                  </span>

                  {form.legalName && (
                    <>
                      <span className="text-slate-300">•</span>

                      <span>{form.legalName}</span>
                    </>
                  )}

                  {existing?.updatedAt && (
                    <>
                      <span className="text-slate-300">•</span>

                      <span>Updated {formatDate(existing.updatedAt)}</span>
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
                    {form.active
                      ? "Client users can access Omega LIMS"
                      : "Saving will disable and sign out all client users"}
                  </div>
                </div>

                <Toggle
                  checked={form.active}
                  onChange={(value) => updateField("active", value)}
                />
              </div>

              <button
                type="button"
                className={buttonPrimary}
                onClick={save}
                disabled={saving || (existing !== null && !dirty)}
              >
                {saving ? (
                  <RefreshCw size={16} className="animate-spin" />
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
              const selected = section === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSection(item.value)}
                  className={cx(
                    "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
                    selected
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <SectionIcon section={item.value} size={15} />

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
              <Field
                label="Client Code"
                hint="Unique code assigned to this client."
              >
                <input value={clientCode} disabled className={inputBase} />
              </Field>

              <Field label="Client Name">
                <input
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className={inputBase}
                  placeholder="e.g. ABC Laboratories"
                />
              </Field>

              <Field label="Legal Name">
                <input
                  value={form.legalName}
                  onChange={(e) => updateField("legalName", e.target.value)}
                  className={inputBase}
                  placeholder="Registered company name"
                />
              </Field>

              <Field label="Account Manager">
                <input
                  value={form.accountManager}
                  onChange={(e) =>
                    updateField("accountManager", e.target.value)
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
              <Field label="Address Line 1" className="sm:col-span-2">
                <input
                  className={inputBase}
                  value={form.addressLine1}
                  onChange={(e) => updateField("addressLine1", e.target.value)}
                  placeholder="Street address"
                />
              </Field>

              <Field label="Address Line 2" className="sm:col-span-2">
                <input
                  className={inputBase}
                  value={form.addressLine2}
                  onChange={(e) => updateField("addressLine2", e.target.value)}
                  placeholder="Suite, building, floor"
                />
              </Field>

              <Field label="City">
                <input
                  className={inputBase}
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                />
              </Field>

              <Field label="State">
                <select
                  className={cx(inputBase, "cursor-pointer")}
                  value={form.state}
                  onChange={(e) => updateField("state", e.target.value)}
                >
                  {US_STATE_OPTIONS.map((state) => (
                    <option key={state.value || "EMPTY"} value={state.value}>
                      {state.value
                        ? `${state.label} (${state.value})`
                        : state.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="ZIP / Postal Code">
                <input
                  className={inputBase}
                  value={form.postalCode}
                  onChange={(e) => updateField("postalCode", e.target.value)}
                />
              </Field>

              <Field label="Country">
                <input
                  className={inputBase}
                  value={form.country}
                  onChange={(e) => updateField("country", e.target.value)}
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
                icon={<UserRound size={17} />}
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
                    className={cx(inputBase, "pl-9")}
                    placeholder="Full name"
                    value={form.primaryContactName}
                    onChange={(e) =>
                      updateField("primaryContactName", e.target.value)
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
                    className={cx(inputBase, "pl-9")}
                    placeholder="name@company.com"
                    value={form.primaryContactEmail}
                    onChange={(e) =>
                      updateField("primaryContactEmail", e.target.value)
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
                    className={cx(inputBase, "pl-9")}
                    placeholder="+1 (000) 000-0000"
                    value={form.primaryContactPhone}
                    onChange={(e) =>
                      updateField("primaryContactPhone", e.target.value)
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
                icon={<ContactRound size={17} />}
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
                    className={cx(inputBase, "pl-9")}
                    placeholder="Full name"
                    value={form.secondaryContactName}
                    onChange={(e) =>
                      updateField("secondaryContactName", e.target.value)
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
                    className={cx(inputBase, "pl-9")}
                    placeholder="name@company.com"
                    value={form.secondaryContactEmail}
                    onChange={(e) =>
                      updateField("secondaryContactEmail", e.target.value)
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
                    className={cx(inputBase, "pl-9")}
                    placeholder="+1 (000) 000-0000"
                    value={form.secondaryContactPhone}
                    onChange={(e) =>
                      updateField("secondaryContactPhone", e.target.value)
                    }
                  />
                </div>
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
    USERS
===================================================== */}

      {section === "USERS" && (
        <div className="space-y-4">
          {/* Summary */}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {/* Total Users */}

            <div className={cx(card, "p-4")}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Total Users
                  </div>

                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    {clientUsers.length}
                  </div>
                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <UsersRound size={18} />
                </div>
              </div>
            </div>

            {/* Online */}

            <div className={cx(card, "p-4")}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Online Now
                  </div>

                  <div className="mt-1 text-2xl font-bold text-emerald-600">
                    {
                      clientUsers.filter((user) => onlineUserIds.has(user.id))
                        .length
                    }
                  </div>
                </div>

                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <UserCheck size={18} />

                  <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                </div>
              </div>
            </div>

            {/* Active */}

            <div className={cx(card, "p-4")}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Active Users
                  </div>

                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    {clientUsers.filter((u) => u.active).length}
                  </div>
                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <UserCheck size={18} />
                </div>
              </div>
            </div>

            {/* Disabled */}

            <div className={cx(card, "p-4")}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Disabled
                  </div>

                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    {clientUsers.filter((u) => !u.active).length}
                  </div>
                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <UserX size={18} />
                </div>
              </div>
            </div>
          </div>

          {/* User list */}

          <div className={card}>
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle
                icon={<UsersRound size={17} />}
                title={`Client Users — ${clientCode}`}
                description="Users assigned to this client account."
              />

              <button
                type="button"
                onClick={loadClientUsers}
                disabled={usersLoading}
                className={buttonOutline}
              >
                <RefreshCw
                  size={15}
                  className={usersLoading ? "animate-spin" : ""}
                />
                Refresh
              </button>
            </div>

            {usersLoading ? (
              <div className="flex min-h-[220px] items-center justify-center">
                <div className="text-center">
                  <RefreshCw
                    size={22}
                    className="mx-auto animate-spin text-indigo-600"
                  />

                  <div className="mt-3 text-sm text-slate-500">
                    Loading users...
                  </div>
                </div>
              </div>
            ) : clientUsers.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <UsersRound size={20} />
                </div>

                <div className="mt-4 font-semibold text-slate-900">
                  No users assigned
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  No CLIENT users are currently assigned to {clientCode}.
                </div>
              </div>
            ) : (
              <>
                {/* Desktop */}

                <div className="hidden lg:block">
                  <div className="grid grid-cols-[2fr_1.2fr_0.8fr_0.8fr_1fr_1fr_0.7fr] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <div>User</div>
                    <div>User ID</div>
                    <div>Status</div>
                    <div>Presence</div>
                    <div>Last Login</div>
                    <div>Last Activity</div>
                    <div className="text-right">Action</div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {clientUsers.map((user) => (
                      <div
                        key={user.id}
                        className="grid grid-cols-[2fr_1.2fr_0.8fr_0.8fr_1fr_1fr_0.7fr] gap-4 items-center px-5 py-4 transition hover:bg-slate-50/70"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {user.name || "Unnamed User"}
                          </div>

                          <div className="mt-0.5 text-xs text-slate-500 truncate">
                            {user.email}
                          </div>

                          {user.mustChangePassword && (
                            <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                              Must change password
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-slate-600">
                          {user.userId ?? "—"}
                        </div>

                        <div>
                          <span
                            className={cx(
                              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                              user.active
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : "bg-rose-50 text-rose-700 ring-rose-200",
                            )}
                          >
                            <span
                              className={cx(
                                "h-1.5 w-1.5 rounded-full",
                                user.active ? "bg-emerald-500" : "bg-rose-500",
                              )}
                            />

                            {user.active ? "Active" : "Disabled"}
                          </span>
                        </div>

                        <div>
                          {onlineUserIds.has(user.id) ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />

                                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                              </span>
                              Online
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                              <span className="h-2 w-2 rounded-full bg-slate-300" />
                              Offline
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-500">
                          {formatDate(user.lastLoginAt)}
                        </div>

                        <div className="text-xs text-slate-500">
                          {formatDate(user.lastActivityAt)}
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => openUserEditor(user)}
                            className={buttonOutline}
                          >
                            <Pencil size={14} />
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mobile */}

                <div className="divide-y divide-slate-100 lg:hidden">
                  {clientUsers.map((user) => (
                    <div key={user.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">
                            {user.name || "Unnamed User"}
                          </div>

                          <div className="mt-1 text-sm text-slate-500 break-all">
                            {user.email}
                          </div>

                          <div className="mt-1 text-xs text-slate-400">
                            User ID: {user.userId ?? "—"}
                          </div>
                        </div>

                        <span
                          className={cx(
                            "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ring-1",
                            user.active
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-rose-50 text-rose-700 ring-rose-200",
                          )}
                        >
                          {user.active ? "Active" : "Disabled"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-slate-400">Last Login</div>

                          <div className="mt-1 text-slate-700">
                            {formatDate(user.lastLoginAt)}
                          </div>
                        </div>

                        <div>
                          <div className="text-slate-400">Last Activity</div>

                          <div className="mt-1 text-slate-700">
                            {formatDate(user.lastActivityAt)}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={cx(buttonOutline, "mt-4 w-full")}
                        onClick={() => openUserEditor(user)}
                      >
                        <Pencil size={14} />
                        Edit User
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
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
                icon={<CalendarDays size={17} />}
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
                  className={cx(inputBase, "cursor-pointer")}
                  value={form.timeZone}
                  onChange={(e) => updateField("timeZone", e.target.value)}
                >
                  {TIME_ZONE_OPTIONS.map((zone) => (
                    <option key={zone.value} value={zone.value}>
                      {zone.label} — {zone.description}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Workday Starts">
                  <input
                    type="time"
                    className={inputBase}
                    value={form.workdayStart}
                    onChange={(e) =>
                      updateField("workdayStart", e.target.value)
                    }
                  />
                </Field>

                <Field label="Workday Ends">
                  <input
                    type="time"
                    className={inputBase}
                    value={form.workdayEnd}
                    onChange={(e) => updateField("workdayEnd", e.target.value)}
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
                    const selected = form.workingDays.includes(day.value);

                    return (
                      <button
                        key={day.value}
                        type="button"
                        title={day.full}
                        onClick={() => toggleDay(day.value)}
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
                  {workingDaysLabel} • {form.workdayStart}–{form.workdayEnd} •{" "}
                  {currentTimeZone?.label ?? form.timeZone}
                </div>
              </div>
            </div>
          </div>

          {/* Workflow Reminders */}

          <div className={card}>
            <div className="border-b border-slate-100 px-5 py-4">
              <CardTitle
                icon={<BellRing size={17} />}
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
                    Pause reminders automatically once the report leaves the
                    pending status.
                  </div>
                </div>

                <Toggle
                  checked={form.workflowReminderEnabled}
                  onChange={(value) =>
                    updateField("workflowReminderEnabled", value)
                  }
                />
              </div>

              <div
                className={cx(
                  "grid grid-cols-1 gap-3 sm:grid-cols-2",
                  !form.workflowReminderEnabled && "opacity-50",
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
                      disabled={!form.workflowReminderEnabled}
                      value={form.workflowReminderIntervalMinutes}
                      onChange={(e) =>
                        updateField(
                          "workflowReminderIntervalMinutes",
                          Math.max(1, Number(e.target.value) || 1),
                        )
                      }
                      className={cx(inputBase, "pr-20")}
                    />

                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                      minutes
                    </span>
                  </div>
                </Field>

                <Field label="Maximum Reminders" hint="System maximum is 10.">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    disabled={!form.workflowReminderEnabled}
                    value={form.workflowReminderMaxCount}
                    onChange={(e) =>
                      updateField(
                        "workflowReminderMaxCount",
                        Math.min(10, Math.max(1, Number(e.target.value) || 1)),
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
                      <Check size={13} className="text-emerald-600" />

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
                      <strong>{currentTimeZone?.label ?? form.timeZone}</strong>{" "}
                      and the working schedule configured here. Lab-side actions
                      continue to use Omega's working schedule.
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
                icon={<CreditCard size={17} />}
                title="Billing Contact"
                description="Accounts payable or finance contact."
              />
            </div>

            <div className="space-y-4 p-5">
              <Field label="Contact Name">
                <input
                  className={inputBase}
                  value={form.billingContactName}
                  onChange={(e) =>
                    updateField("billingContactName", e.target.value)
                  }
                  placeholder="Billing contact"
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  className={inputBase}
                  value={form.billingEmail}
                  onChange={(e) => updateField("billingEmail", e.target.value)}
                  placeholder="billing@company.com"
                />
              </Field>

              <Field label="Phone">
                <input
                  className={inputBase}
                  value={form.billingPhone}
                  onChange={(e) => updateField("billingPhone", e.target.value)}
                  placeholder="+1 (000) 000-0000"
                />
              </Field>

              <Field
                label="Payment Terms"
                hint="Examples: Net 30, Net 45, prepaid."
              >
                <input
                  className={inputBase}
                  value={form.paymentTerms}
                  onChange={(e) => updateField("paymentTerms", e.target.value)}
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
              <Field label="Address Line 1" className="sm:col-span-2">
                <input
                  className={inputBase}
                  value={form.billingAddressLine1}
                  onChange={(e) =>
                    updateField("billingAddressLine1", e.target.value)
                  }
                />
              </Field>

              <Field label="Address Line 2" className="sm:col-span-2">
                <input
                  className={inputBase}
                  value={form.billingAddressLine2}
                  onChange={(e) =>
                    updateField("billingAddressLine2", e.target.value)
                  }
                />
              </Field>

              <Field label="City">
                <input
                  className={inputBase}
                  value={form.billingCity}
                  onChange={(e) => updateField("billingCity", e.target.value)}
                />
              </Field>

              <Field label="State">
                <select
                  className={cx(inputBase, "cursor-pointer")}
                  value={form.billingState}
                  onChange={(e) => updateField("billingState", e.target.value)}
                >
                  {US_STATE_OPTIONS.map((state) => (
                    <option key={state.value || "EMPTY"} value={state.value}>
                      {state.value
                        ? `${state.label} (${state.value})`
                        : state.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="ZIP / Postal Code">
                <input
                  className={inputBase}
                  value={form.billingPostalCode}
                  onChange={(e) =>
                    updateField("billingPostalCode", e.target.value)
                  }
                />
              </Field>

              <Field label="Country">
                <input
                  className={inputBase}
                  value={form.billingCountry}
                  onChange={(e) =>
                    updateField("billingCountry", e.target.value)
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
              onChange={(e) => updateField("notes", e.target.value)}
              className={cx(
                inputBase,
                "h-auto min-h-[280px] resize-y py-3 leading-relaxed",
              )}
              placeholder="Add internal notes about this client..."
            />

            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>Internal use only</span>

              <span>{form.notes.length.toLocaleString()} characters</span>
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
                <RefreshCw size={15} className="animate-spin" />
              ) : (
                <Save size={15} />
              )}
              Save
            </button>
          </div>
        </div>
      )}

      <Modal
        open={userModalOpen}
        onClose={() => {
          setUserModalOpen(false);
          setSelectedUser(null);
        }}
        title="Edit Client User"
      >
        {!selectedUser ? null : (
          <div className="space-y-5">
            {/* User summary */}

            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <UserRound size={19} />
              </div>

              <div className="min-w-0">
                <div className="font-semibold text-slate-900">
                  {selectedUser.name || "Unnamed User"}
                </div>

                <div className="text-sm text-slate-500 truncate">
                  {selectedUser.email}
                </div>

                <div className="mt-0.5 text-xs text-slate-400">
                  {selectedUser.userId ?? "No User ID"} • {clientCode}
                </div>
              </div>
            </div>

            {/* Fields */}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input
                  className={inputBase}
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  className={inputBase}
                  value={editUserEmail}
                  onChange={(e) => setEditUserEmail(e.target.value)}
                />
              </Field>

              <Field label="User ID">
                <input
                  disabled
                  className={inputBase}
                  value={selectedUser.userId ?? ""}
                />
              </Field>

              <Field
                label="Client Code"
                hint={
                  editUserClientCode !==
                  String(selectedUser.clientCode ?? "").toUpperCase()
                    ? `This user will be moved from ${
                        selectedUser.clientCode ?? clientCode
                      } to ${editUserClientCode || "another client"}.`
                    : "Client currently assigned to this user."
                }
              >
                <input
                  className={cx(
                    inputBase,
                    editUserClientCode !==
                      String(selectedUser.clientCode ?? "").toUpperCase() &&
                      "border-amber-300 bg-amber-50/40 focus:border-amber-400 focus:ring-amber-500/10",
                  )}
                  value={editUserClientCode}
                  maxLength={3}
                  onChange={(e) => {
                    const cleaned = e.target.value
                      .replace(/[^a-zA-Z]/g, "")
                      .toUpperCase()
                      .slice(0, 3);

                    setEditUserClientCode(cleaned);
                  }}
                  placeholder="ABC"
                />
              </Field>
            </div>

            {/* Status */}

            <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Account Status
                </div>

                <div className="mt-1 text-xs text-slate-500">
                  Disabled users cannot log in.
                </div>
              </div>

              <Toggle checked={editUserActive} onChange={setEditUserActive} />
            </div>

            {/* Security */}

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Security Actions
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className={buttonOutline}
                  onClick={() => resetClientUserPassword(selectedUser)}
                >
                  <KeyRound size={15} />
                  Reset Password
                </button>

                <button
                  type="button"
                  className={cx(
                    buttonOutline,
                    "text-rose-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700",
                  )}
                  onClick={() => forceClientUserSignout(selectedUser)}
                >
                  <LogOut size={15} />
                  Force Signout
                </button>
              </div>
            </div>

            {/* Footer */}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                className={buttonOutline}
                onClick={() => {
                  setUserModalOpen(false);
                  setSelectedUser(null);
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className={buttonPrimary}
                disabled={userSaving}
                onClick={saveUser}
              >
                {userSaving ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <Save size={15} />
                )}

                {userSaving ? "Saving..." : "Save User"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title="Temporary Password"
      >
        <div className="space-y-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Password reset successful
            </div>

            <div className="mt-1 text-sm text-slate-500">
              {passwordUserLabel}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Temporary Password
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <code className="break-all text-base font-semibold text-slate-900">
                {temporaryPassword}
              </code>

              <button
                type="button"
                className={buttonOutline}
                onClick={copyTemporaryPassword}
              >
                {passwordCopied ? (
                  <>
                    <Check size={14} className="text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="text-xs leading-relaxed text-slate-500">
            The user will be required to follow your existing password-change
            policy when they next log in.
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className={buttonPrimary}
              onClick={() => setPasswordModalOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
