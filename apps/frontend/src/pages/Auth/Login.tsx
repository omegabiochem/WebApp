// src/pages/Auth/Login.tsx
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "CHEMISTRY"
  | "QA"
  | "CLIENT";

const roleHomePath: Record<Role, string> = {
  ADMIN: "/adminDashboard",
  CLIENT: "/clientDashboard",
  SYSTEMADMIN: "/systemAdminDashboard",
  MICRO: "/microDashboard",
  CHEMISTRY: "/chemistryDashboard",
  QA: "/qaDashboard",
  FRONTDESK: "/frontdeskDashboard",
};

const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
type FormData = z.infer<typeof schema>;

export default function Login() {
  const { register, handleSubmit, formState:{ isSubmitting } } = useForm<FormData>();
  const { login } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (data: FormData) => {
    const { accessToken, user } = await api<{accessToken:string; user:{
      id:string; email:string; role:Role; name?:string; mustChangePassword?:boolean;
    }}>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });

    // set auth state
    login(accessToken, user);
    // console.log(accessToken)
    // console.log(user);

    // first-login flow
    if (user.mustChangePassword) {
      navigate("/auth/change-password", { replace: true });
      return;
    }

    // role-based home
    const dest = roleHomePath[user.role] ?? "/home";
    navigate(dest, { replace: true });

    // optional: toast instead of alert
    // alert("Logged in!");
  };

  return (
    <div className="max-w-sm mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <input className="border rounded-md p-2" placeholder="Email" {...register("email")} />
        <input className="border rounded-md p-2" type="password" placeholder="Password" {...register("password")} />
        <button disabled={isSubmitting} className="bg-[var(--brand)] text-white px-4 py-2 rounded-md">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
