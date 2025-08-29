

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod"; // <- optional but recommended
import { changeUserPassword } from "../../services/usersService";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";


type Role = "SYSTEMADMIN" | "ADMIN" | "FRONTDESK" | "MICRO" | "CHEMISTRY" | "QA" | "CLIENT";

const roleHomePath: Record<Role, string> = {
  ADMIN: "/adminDashboard",
  CLIENT: "/clientDashboard",
  SYSTEMADMIN: "/systemAdminDashboard",
  MICRO: "/microDashboard",
  CHEMISTRY: "/chemistryDashboard",
  QA: "/qaDashboard",
  FRONTDESK: "/frontdeskDashboard",
};

const schema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "Minimum 8 characters"),
  confirm: z.string().min(8, "Minimum 8 characters"),
}).refine(d => d.newPassword === d.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

type FormData = z.infer<typeof schema>;

export default function ChangePassword() {
  const { user } = useAuth();
  const nav = useNavigate();

  // visibility toggles
  const [show, setShow] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  if (!user) return <p>Please log in.</p>;

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema), // <- if you don't want zod, remove this line
    mode: "onSubmit",
  });

  const onSubmit = async (data: FormData) => {
    await changeUserPassword({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
    reset();
    alert("Password changed. You can continue.");
    // Use the current user's role for navigation
    nav(roleHomePath[user.role as Role] ?? "/home", { replace: true });

  };

  const fieldClass =
    "w-full border rounded-md p-2 pr-10 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]";

  return (
    <div className="max-w-sm mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-xl font-semibold mb-2">Set a New Password</h1>
      <p className="text-sm text-gray-600 mb-4">
        You must change your temporary password before continuing.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        {/* Current password */}
        <div className="relative">
          <input
            className={fieldClass}
            type={show.current ? "text" : "password"}
            placeholder="Current (temporary) password"
            autoComplete="current-password"
            {...register("currentPassword")}
          />
          <button
            type="button"
            aria-label={show.current ? "Hide current password" : "Show current password"}
            onClick={() => setShow(s => ({ ...s, current: !s.current }))}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-600"
          >
            {show.current ? "Hide" : "Show"}
          </button>
          {errors.currentPassword && (
            <p className="text-xs text-red-600 mt-1">{errors.currentPassword.message as string}</p>
          )}
        </div>

        {/* New password */}
        <div className="relative">
          <input
            className={fieldClass}
            type={show.next ? "text" : "password"}
            placeholder="New password (min 8 chars)"
            autoComplete="new-password"
            {...register("newPassword")}
          />
          <button
            type="button"
            aria-label={show.next ? "Hide new password" : "Show new password"}
            onClick={() => setShow(s => ({ ...s, next: !s.next }))}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-600"
          >
            {show.next ? "Hide" : "Show"}
          </button>
          {errors.newPassword && (
            <p className="text-xs text-red-600 mt-1">{errors.newPassword.message as string}</p>
          )}
        </div>

        {/* Confirm password */}
        <div className="relative">
          <input
            className={fieldClass}
            type={show.confirm ? "text" : "password"}
            placeholder="Confirm new password"
            autoComplete="new-password"
            {...register("confirm")}
          />
          <button
            type="button"
            aria-label={show.confirm ? "Hide confirm password" : "Show confirm password"}
            onClick={() => setShow(s => ({ ...s, confirm: !s.confirm }))}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-600"
          >
            {show.confirm ? "Hide" : "Show"}
          </button>
          {errors.confirm && (
            <p className="text-xs text-red-600 mt-1">{errors.confirm.message as string}</p>
          )}
        </div>

        <button
          disabled={isSubmitting}
          className="bg-[var(--brand)] text-white rounded-md px-4 py-2 disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Change Password"}
        </button>
      </form>
    </div>
  );
}

