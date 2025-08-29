// src/pages/Auth/Login.tsx
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "../../lib/api";
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
  userId: z.string().min(1),       // keep simple while debugging
  password: z.string().min(1),
});
type FormData = z.infer<typeof schema>;

export default function Login() {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormData>({
    defaultValues: { userId: "", password: "" },   // ✅ explicit defaults
  });
  const { login } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (data: FormData) => {
    // console.log("[LOGIN SUBMIT] sending", data);   // ✅ see what we send in DevTools Network
    // src/pages/Auth/Login.tsx
    const res = await api<{
      accessToken?: string;
      requiresPasswordReset?: boolean;
      user?: { id: string; email: string; role: Role; name?: string; mustChangePassword?: boolean };
    }>("/auth/login", { method: "POST", body: JSON.stringify(data) });

    // after POST /auth/login response:
    if (res.requiresPasswordReset) {
      if (res.accessToken && res.user) {
        login(res.accessToken, res.user);  // stores token so change-password is authorized
      }
      navigate("/auth/change-password", { replace: true });
      return;
    }


    if (!res.accessToken || !res.user) {
      alert("Login failed");
      return;
    }
    login(res.accessToken, res.user);
    navigate(roleHomePath[res.user.role] ?? "/home", { replace: true });

  };
  const field = "border rounded-md p-2";

  return (
    <div className="max-w-sm mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" autoComplete="on">
        <input
          className="border rounded-md p-2"
          id="userId"
          placeholder="User ID"
          autoComplete="username"
          {...register("userId", { required: true })}
        />

        <input
          className="border rounded-md p-2"
          id="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          {...register("password", { required: true })}
        />

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
