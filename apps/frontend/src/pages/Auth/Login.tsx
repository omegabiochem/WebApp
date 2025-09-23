// src/pages/Auth/Login.tsx
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

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
  userId: z.string().min(1),
  password: z.string().min(1),
});
type FormData = z.infer<typeof schema>;

export default function Login() {
  const { register, handleSubmit, setError, formState: { isSubmitting, errors } } =
    useForm<FormData>({ defaultValues: { userId: "", password: "" } });

  const { login } = useAuth();
  const navigate = useNavigate();

  // banner message (success / error)
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const onSubmit = async (data: FormData) => {
    setBanner(null); // clear previous
    try {
      const res = await api<{
        accessToken?: string;
        requiresPasswordReset?: boolean;
        user?: { id: string; email: string; role: Role; name?: string; mustChangePassword?: boolean };
      }>("/auth/login", { method: "POST", body: JSON.stringify(data) });

      // password reset flow
      if (res.requiresPasswordReset) {
        if (res.accessToken && res.user) {
          login(res.accessToken, res.user);
        }
        setBanner({ type: "success", text: "Login successful. Please reset your password." });
        navigate("/auth/change-password", { replace: true });
        return;
      }

      // invalid response
      if (!res.accessToken || !res.user) {
        setBanner({ type: "error", text: "Invalid user ID or password." });
        // Also mark password field as error (optional):
        setError("password", { type: "server", message: "Invalid credentials" });
        return;
      }

      // success
      login(res.accessToken, res.user);
      setBanner({ type: "success", text: "Login successful!" });
      navigate(roleHomePath[res.user.role] ?? "/home", { replace: true });
    } catch (err: any) {
      // If your api() throws on non-2xx, handle status-based messages here
      const msg =
        (err?.status === 401 || err?.message?.includes("401"))
          ? "Invalid user ID or password."
          : "Unable to sign in. Please try again.";
      setBanner({ type: "error", text: msg });
      setError("password", { type: "server", message: msg });
    }
  };

  const field = "border rounded-md p-2";

  return (
    <div className="max-w-sm mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>

      {/* Inline banner */}
      {banner && (
        <div
          className={`mb-3 rounded-md px-3 py-2 text-sm ${
            banner.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
          role="alert"
          aria-live="polite"
        >
          {banner.text}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" autoComplete="on">
        <div className="flex flex-col gap-1">
          <input
            className={field}
            id="userId"
            placeholder="User ID"
            autoComplete="username"
            {...register("userId", { required: "User ID is required" })}
          />
          {errors.userId && <span className="text-xs text-red-600">{errors.userId.message}</span>}
        </div>

        <div className="flex flex-col gap-1">
          <input
            className={field}
            id="password"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            {...register("password", { required: "Password is required" })}
          />
          {errors.password && <span className="text-xs text-red-600">{errors.password.message}</span>}
        </div>

        <button disabled={isSubmitting} className="bg-[var(--brand)] text-white px-4 py-2 rounded-md">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}



// import { useForm } from "react-hook-form";
// import { z } from "zod";
// import { api } from "../../lib/api";
// import { useAuth } from "../../context/AuthContext";
// import { useNavigate } from "react-router-dom";

// type Role = "SYSTEMADMIN" | "ADMIN" | "FRONTDESK" | "MICRO" | "CHEMISTRY" | "QA" | "CLIENT";

// const roleHomePath: Record<Role, string> = {
//   ADMIN: "/adminDashboard",
//   CLIENT: "/clientDashboard",
//   SYSTEMADMIN: "/systemAdminDashboard",
//   MICRO: "/microDashboard",
//   CHEMISTRY: "/chemistryDashboard",
//   QA: "/qaDashboard",
//   FRONTDESK: "/frontdeskDashboard",
// };

// const schema = z.object({
//   userId: z.string().min(4).max(20).regex(/^[a-z0-9._-]+$/),
//   password: z.string().min(6),
// });
// type FormData = z.infer<typeof schema>;

// export default function Login() {
//   const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormData>();
//   const { login } = useAuth();
//   const navigate = useNavigate();

//   const onSubmit = async (data: FormData) => {
//     const res = await api<{
//       accessToken?: string;
//       requiresPasswordReset?: boolean;
//       user?: { id: string; email: string; role: Role; name?: string; mustChangePassword?: boolean };
//     }>("/auth/login", { method: "POST", body: JSON.stringify(data) });

//     if (res.requiresPasswordReset) {
//       // User was invited and must set credentials; they should have an invite email with token.
//       navigate("/auth/first-login");
//       return;
//     }

//     if (!res.accessToken || !res.user) {
//       alert("Login failed");
//       return;
//     }

//     login(res.accessToken, res.user);
//     const dest = roleHomePath[res.user.role] ?? "/home";
//     navigate(dest, { replace: true });
//   };

//   return (
//     <div className="max-w-sm mx-auto bg-white rounded-xl shadow p-6">
//       <h1 className="text-xl font-semibold mb-4">Sign in</h1>
//       <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
//         <input className="border rounded-md p-2" placeholder="User ID" {...register("userId")} />
//         <input className="border rounded-md p-2" type="password" placeholder="Password" {...register("password")} />
//         <button disabled={isSubmitting} className="bg-[var(--brand)] text-white px-4 py-2 rounded-md">
//           {isSubmitting ? "Signing in..." : "Sign in"}
//         </button>
//       </form>
//       <div className="text-xs text-gray-500 mt-3">
//         Forgot your User ID? Use the invite link from your email to set it on first login.
//       </div>
//     </div>
//   );
// }


// // src/pages/Auth/Login.tsx
// import { useForm } from "react-hook-form";
// import { z } from "zod";
// import { api } from "../../lib/api";
// import { useAuth } from "../../context/AuthContext";
// import { useNavigate } from "react-router-dom";

// type Role =
//   | "SYSTEMADMIN"
//   | "ADMIN"
//   | "FRONTDESK"
//   | "MICRO"
//   | "CHEMISTRY"
//   | "QA"
//   | "CLIENT";

// const roleHomePath: Record<Role, string> = {
//   ADMIN: "/adminDashboard",
//   CLIENT: "/clientDashboard",
//   SYSTEMADMIN: "/systemAdminDashboard",
//   MICRO: "/microDashboard",
//   CHEMISTRY: "/chemistryDashboard",
//   QA: "/qaDashboard",
//   FRONTDESK: "/frontdeskDashboard",
// };

// const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
// type FormData = z.infer<typeof schema>;

// export default function Login() {
//   const { register, handleSubmit, formState:{ isSubmitting } } = useForm<FormData>();
//   const { login } = useAuth();
//   const navigate = useNavigate();

//   const onSubmit = async (data: FormData) => {
//     const { accessToken, user } = await api<{accessToken:string; user:{
//       id:string; email:string; role:Role; name?:string; mustChangePassword?:boolean;
//     }}>("/auth/login", {
//       method: "POST",
//       body: JSON.stringify(data),
//     });

//     // set auth state
//     login(accessToken, user);
//     // console.log(accessToken)
//     // console.log(user);

//     // first-login flow
//     if (user.mustChangePassword) {
//       navigate("/auth/change-password", { replace: true });
//       return;
//     }

//     // role-based home
//     const dest = roleHomePath[user.role] ?? "/home";
//     navigate(dest, { replace: true });

//     // optional: toast instead of alert
//     // alert("Logged in!");
//   };

//   return (
//     <div className="max-w-sm mx-auto bg-white rounded-xl shadow p-6">
//       <h1 className="text-xl font-semibold mb-4">Sign in</h1>
//       <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
//         <input className="border rounded-md p-2" placeholder="Email" {...register("email")} />
//         <input className="border rounded-md p-2" type="password" placeholder="Password" {...register("password")} />
//         <button disabled={isSubmitting} className="bg-[var(--brand)] text-white px-4 py-2 rounded-md">
//           {isSubmitting ? "Signing in..." : "Sign in"}
//         </button>
//       </form>
//     </div>
//   );
// }
