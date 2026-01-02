import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createUserByAdmin, type Role } from "../../services/usersService";
import Modal from "../../components/common/Modal";
import { useAuth } from "../../context/AuthContext";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Check, Copy } from "lucide-react";

const roles: Role[] = [
  "SYSTEMADMIN",
  "ADMIN",
  "FRONTDESK",
  "MICRO",
  "CHEMISTRY",
  "QA",
  "CLIENT",
];

const schema = z
  .object({
    email: z
      .string()
      .email("Invalid email address")
      .refine((val) => val.endsWith("@gmail.com"), {
        message: "Only Gmail addresses are allowed",
      }),
    name: z.string().optional(),
    role: z.enum(
      [
        "SYSTEMADMIN",
        "ADMIN",
        "FRONTDESK",
        "MICRO",
        "CHEMISTRY",
        "QA",
        "CLIENT",
      ],
      {
        message: "Role is required",
      }
    ),
    userId: z
      .string()
      .min(4, "User ID must be at least 4 chars")
      .max(20, "User ID max 20 chars")
      .regex(
        /^[a-z0-9._-]+$/,
        "Only lowercase a–z, 0–9, dot, underscore, hyphen"
      ),
    clientCode: z
      .string()
      .regex(/^[A-Z]{3}$/, "Client Code must be exactly 3 uppercase letters")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.role === "CLIENT" && !data.clientCode) {
        return false;
      }
      return true;
    },
    {
      message: "Client Code is required for CLIENT role",
      path: ["clientCode"], // 👈 validation error shows under clientCode
    }
  );
type FormData = z.infer<typeof schema>;

export default function CreateCredentials() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SYSTEMADMIN";

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
    watch,
  } = useForm<FormData>({ resolver: zodResolver(schema) });
  const [modalOpen, setModalOpen] = useState(false);
  const [createdEmail, setCreatedEmail] = useState("");
  const [createdUserId, setCreatedUserId] = useState<string | undefined>(
    undefined
  ); // ✅ new
  const [tempPassword, setTempPassword] = useState("");

  const [copiedField, setCopiedField] = useState<"password" | "userId" | null>(
    null
  );

  const copyToClipboard = async (
    text: string,
    field: "password" | "userId"
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
      toast.success("Password copied", {
        className:
          "bg-white text-slate-900 rounded-xl px-4 py-3 shadow-md ring-1 ring-black/5",
        duration: 1000,
      });
    } catch {
      toast.error("Copy failed");
    }
  };

  if (!user) return <p>Please log in.</p>;
  if (!isAdmin) return <p>You do not have access to this page.</p>;

  const onSubmit = async (data: FormData) => {
    const res = await createUserByAdmin(data); // will now accept userId too
    setCreatedEmail(res.user.email);
    setCreatedUserId(res.user.userId); // ✅ show chosen/assigned userId
    setTempPassword(res.tempPassword);
    setModalOpen(true);
    reset();
  };

  return (
    <>
      <h1 className="text-2xl font-semibold mb-4">Admin Dashboard</h1>

      <div className="bg-white rounded-xl shadow p-6 max-w-xl">
        <h2 className="font-semibold mb-3">Create Account</h2>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="grid grid-cols-1 gap-3"
        >
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              className="w-full border rounded-md p-2"
              {...register("email")}
              placeholder="user@lab.test"
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm mb-1">Name (optional)</label>
            <input
              className="w-full border rounded-md p-2"
              {...register("name")}
              placeholder="Jane Doe"
            />
          </div>

          {/* User ID */}
          <div>
            <label className="block text-sm mb-1">User ID</label>
            <input
              className="w-full border rounded-md p-2"
              {...register("userId")}
              placeholder="frontdesk01"
            />
            <p className="text-xs text-gray-500 mt-1">
              Required. 4–20 chars, lowercase a–z, 0–9, dot, underscore, hyphen.
            </p>
            {errors.userId && (
              <p className="text-red-500 text-xs mt-1">
                {errors.userId.message}
              </p>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm mb-1">Role</label>
            <select
              className="w-full border rounded-md p-2"
              {...register("role")}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {errors.role && (
              <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>
            )}
          </div>

          {/* Client Code (only if CLIENT) */}
          {watch("role") === "CLIENT" && (
            <div>
              <label className="block text-sm mb-1">Client Code</label>
              <input
                className="w-full border rounded-md p-2"
                {...register("clientCode")}
                placeholder="ABC"
              />
              <p className="text-xs text-gray-500 mt-1">
                Must be exactly 3 capital letters (e.g., OME).
              </p>
              {errors.clientCode && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.clientCode.message}
                </p>
              )}
            </div>
          )}

          <button
            disabled={isSubmitting}
            className="bg-[var(--brand)] text-white rounded-md px-4 py-2"
          >
            {isSubmitting ? "Creating..." : "Create Account"}
          </button>
        </form>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Account Created"
      >
        <p className="mb-2 text-sm text-gray-700">
          Give these credentials to the user securely:
        </p>
        <div className="bg-gray-50 border rounded-md p-3 text-sm">
          <div>
            <span className="font-semibold">Email:</span> {createdEmail}
          </div>

          <div className="mt-1 flex items-center gap-2">
            <span className="font-semibold">User ID:</span>

            <code>{createdUserId}</code>

            <button
              type="button"
              onClick={() => copyToClipboard(createdUserId ?? "", "userId")}
              className="text-gray-500 hover:text-gray-900"
              title="Copy User ID"
            >
              {copiedField === "userId" ? (
                <Check size={16} className="text-green-600" />
              ) : (
                <Copy size={16} />
              )}
            </button>
          </div>

          <div className="mt-1 flex items-center gap-2">
            <span className="font-semibold">Temporary password:</span>

            <code className="bg-white border rounded px-2 py-0.5">
              {tempPassword}
            </code>

            <button
              type="button"
              onClick={() => copyToClipboard(tempPassword, "password")}
              className="text-gray-500 hover:text-gray-900"
              title="Copy password"
            >
              {copiedField === "password" ? (
                <Check size={16} className="text-green-600" />
              ) : (
                <Copy size={16} />
              )}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {createdUserId
            ? "They can sign in with the User ID and temporary password, then they'll be forced to change the password."
            : "They'll receive an invite link to choose a User ID and set a new password."}
        </p>
        <div className="mt-4 text-right">
          <button
            className="px-3 py-1 rounded-md bg-gray-900 text-white"
            onClick={() => setModalOpen(false)}
          >
            Close
          </button>
        </div>
      </Modal>
    </>
  );
}
