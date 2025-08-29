import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "../../lib/api";
import { useNavigate, useSearchParams } from "react-router-dom";

const schema = z.object({
  inviteToken: z.string().min(10),
  userId: z.string().min(4).max(20).regex(/^[a-z0-9._-]+$/),
  newPassword: z.string().min(8),
  confirm: z.string().min(8),
}).refine((d) => d.newPassword === d.confirm, {
  message: "Passwords do not match",
  path: ["confirm"],
});

type FormData = z.infer<typeof schema>;

export default function FirstLogin() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const {
    register, handleSubmit, formState: { errors, isSubmitting }, setValue
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  // prefill from invite link (?token=...)
  const tokenFromUrl = params.get("token") || "";
  if (tokenFromUrl) setValue("inviteToken", tokenFromUrl);

  const onSubmit = async (data: FormData) => {
    const res = await api<{ ok: boolean; user?: any }>(
      "/auth/first-set-credentials",
      { method: "POST", body: JSON.stringify(data) }
    );
    if (res.ok) {
      alert("User ID & password set. You can now sign in with your User ID.");
      nav("/auth/login");
    }
  };

  const field = "w-full border rounded-md p-2";

  return (
    <div className="max-w-sm mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-xl font-semibold mb-2">First Login</h1>
      <p className="text-sm text-gray-600 mb-4">
        Set your User ID and choose a new password to activate your account.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <input className={field} placeholder="Invite token" {...register("inviteToken")} />
        {errors.inviteToken && <p className="text-xs text-red-600">{errors.inviteToken.message as string}</p>}

        <input className={field} placeholder="Choose a User ID (lowercase)" {...register("userId")} />
        {errors.userId && <p className="text-xs text-red-600">{errors.userId.message as string}</p>}

        <input className={field} type="password" placeholder="New password" {...register("newPassword")} />
        {errors.newPassword && <p className="text-xs text-red-600">{errors.newPassword.message as string}</p>}

        <input className={field} type="password" placeholder="Confirm password" {...register("confirm")} />
        {errors.confirm && <p className="text-xs text-red-600">{errors.confirm.message as string}</p>}

        <button disabled={isSubmitting} className="bg-[var(--brand)] text-white rounded-md px-4 py-2">
          {isSubmitting ? "Saving..." : "Activate Account"}
        </button>
      </form>
    </div>
  );
}
