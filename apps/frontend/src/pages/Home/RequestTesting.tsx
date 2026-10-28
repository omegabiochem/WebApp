import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../../lib/api";


type Data = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  testingTypes: string[];
  productType: string;
  sampleCount: string;
  requirements: string;
  turnaround: "STANDARD" | "URGENT" | "DISCUSS";
  consent: boolean;
  website: string;
};

const TESTS = [
  { key: "Microbiology", label: "Microbiology" },
  { key: "Chemistry", label: "Chemistry" },
  { key: "Sterility", label: "Sterility" },
  { key: "APE", label: "Antimicrobial Preservative Efficacy (APE)" },
  { key: "Other", label: "Other / Not sure" },
];

const initial: Data = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  testingTypes: [],
  productType: "",
  sampleCount: "",
  requirements: "",
  turnaround: "STANDARD",
  consent: false,
  website: "",
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "block text-sm font-semibold text-slate-700";

export default function RequestTesting() {
  const [data, setData] = useState<Data>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const update = (patch: Partial<Data>) =>
    setData((old) => ({ ...old, ...patch }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (!data.testingTypes.length) {
      setError("Select at least one testing type.");
      return;
    }
    if (!data.consent) {
      setError("Please consent to being contacted about this request.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL.replace(/\/$/, "")}/public/testing-inquiries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            sampleCount: data.sampleCount
              ? Number(data.sampleCount)
              : undefined,
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = Array.isArray(result.message)
          ? result.message.join("; ")
          : result.message;
        throw new Error(
          typeof msg === "string"
            ? msg
            : "Unable to send the inquiry. Please try again.",
        );
      }
      setReference(result.reference || "Submitted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send inquiry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl pb-20">
      <div className="relative overflow-hidden rounded-[32px] border border-blue-200 bg-white px-6 py-12 shadow-sm sm:px-10 lg:px-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-100/70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-cyan-100/60 blur-3xl" />
        <div className="relative">
          <Link
            to="/"
            className="text-sm font-semibold text-[var(--brand)] hover:underline"
          >
            ← Back to Home
          </Link>
          <div className="mt-6 flex items-center gap-4">
            <img
              src="/logo.svg"
              alt="Omega BioChem"
              className="h-14 w-14 rounded-xl bg-blue-50 p-2"
            />
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
                Omega BioChem Laboratories
              </div>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Request Laboratory Testing
              </h1>
            </div>
          </div>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
            Share your company details and testing requirements. Our laboratory
            team will review your inquiry and contact you to discuss available
            services and next steps.
          </p>
        </div>
      </div>

      {reference ? (
        <section className="mt-6 rounded-[28px] border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <div className="text-4xl">✓</div>
          <h2 className="mt-3 text-2xl font-bold text-slate-950">
            Testing inquiry received
          </h2>
          <p className="mt-3 text-slate-600">
            Thank you. Our laboratory team will review your inquiry and contact
            you.
          </p>
          <p className="mt-4 text-sm text-slate-500">Your reference number</p>
          <div className="mt-1 text-xl font-bold text-[var(--brand)]">
            {reference}
          </div>
          <Link
            to="/"
            className="mt-7 inline-block rounded-xl bg-[var(--brand)] px-7 py-3 text-sm font-bold text-white"
          >
            Return to Home
          </Link>
        </section>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-slate-950">
              01 · Company & Contact Information
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>
                Company name *
                <input
                  className={fieldClass}
                  value={data.companyName}
                  onChange={(e) => update({ companyName: e.target.value })}
                  maxLength={150}
                  required
                />
              </label>
              <label className={labelClass}>
                Contact name *
                <input
                  className={fieldClass}
                  value={data.contactName}
                  onChange={(e) => update({ contactName: e.target.value })}
                  maxLength={150}
                  required
                />
              </label>
              <label className={labelClass}>
                Email address *
                <input
                  className={fieldClass}
                  type="email"
                  value={data.email}
                  onChange={(e) => update({ email: e.target.value })}
                  maxLength={254}
                  required
                />
              </label>
              <label className={labelClass}>
                Phone number
                <input
                  className={fieldClass}
                  type="tel"
                  value={data.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  maxLength={40}
                />
              </label>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-slate-950">
              02 · Testing Requirements
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Choose all that apply.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {TESTS.map((test) => (
                <label
                  key={test.key}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-700"
                    checked={data.testingTypes.includes(test.key)}
                    onChange={(e) =>
                      update({
                        testingTypes: e.target.checked
                          ? [...data.testingTypes, test.key]
                          : data.testingTypes.filter((x) => x !== test.key),
                      })
                    }
                  />
                  {test.label}
                </label>
              ))}
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>
                Product / sample type
                <input
                  className={fieldClass}
                  placeholder="e.g. Cosmetic cream, water, raw material"
                  value={data.productType}
                  onChange={(e) => update({ productType: e.target.value })}
                  maxLength={200}
                />
              </label>
              <label className={labelClass}>
                Number of samples
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  placeholder="e.g. 10"
                  value={data.sampleCount}
                  onChange={(e) => update({ sampleCount: e.target.value })}
                />
              </label>
            </div>
            <label className={`${labelClass} mt-5`}>
              Detailed testing requirements *
              <textarea
                className={`${fieldClass} min-h-[150px] resize-y`}
                placeholder="Please describe the tests, product details, specifications or standards, sample quantities, and other requirements."
                value={data.requirements}
                minLength={10}
                maxLength={4000}
                onChange={(e) => update({ requirements: e.target.value })}
                required
              />
            </label>
            <fieldset className="mt-5">
              <legend className={labelClass}>Preferred turnaround time</legend>
              <div className="mt-3 flex flex-wrap gap-4">
                {(
                  [
                    ["STANDARD", "Standard"],
                    ["URGENT", "Urgent / expedited"],
                    ["DISCUSS", "Need to discuss"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      type="radio"
                      name="turnaround"
                      checked={data.turnaround === key}
                      onChange={() => update({ turnaround: key })}
                      className="accent-blue-700"
                    />{" "}
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
              <input
                type="checkbox"
                checked={data.consent}
                onChange={(e) => update({ consent: e.target.checked })}
                className="mt-1 h-4 w-4 shrink-0 accent-blue-700"
                required
              />
              <span>
                I agree that Omega BioChem Laboratories may contact me using the
                details provided about this testing inquiry. I understand this
                is an inquiry, not an accepted laboratory submission. *
              </span>
            </label>
            <div
              aria-hidden="true"
              className="absolute -left-[9999px]"
              tabIndex={-1}
            >
              <label>
                Website{" "}
                <input
                  autoComplete="off"
                  tabIndex={-1}
                  value={data.website}
                  onChange={(e) => update({ website: e.target.value })}
                />
              </label>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[var(--brand)] px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-900/10 transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              {loading ? "Submitting inquiry…" : "Submit Testing Inquiry →"}
            </button>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Please do not include passwords or sensitive patient information.
              Our team will contact you about next steps.
            </p>
          </section>
        </form>
      )}
    </div>
  );
}
