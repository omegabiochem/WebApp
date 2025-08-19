// // src/pages/admin/AdminDashboard.tsx
// import { useState } from "react";
// import UsersPanel from "./AdminUserPanel";
// import RolesPanel from "./AdminRolespPanel";

// const TABS = [
//   { key: "users", label: "Users" },
//   { key: "roles", label: "Roles & Permissions" },
//   // Add more: Catalog, Audit, Settings…
// ] as const;

// export default function AdminDashboard() {
//   const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("users");

//   return (
//     <div className="space-y-6">
//       <header className="flex items-center justify-between">
//         <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
//       </header>

//       <div className="flex gap-2 border-b">
//         {TABS.map((t) => (
//           <button
//             key={t.key}
//             onClick={() => setTab(t.key)}
//             className={`px-3 py-2 border-b-2 -mb-px ${
//               tab === t.key
//                 ? "border-[var(--brand)] text-[var(--brand)]"
//                 : "border-transparent text-gray-500 hover:text-gray-800"
//             }`}
//           >
//             {t.label}
//           </button>
//         ))}
//       </div>

//       <section>
//         {tab === "users" && <UsersPanel />}
//         {tab === "roles" && <RolesPanel />}
//       </section>
//     </div>
//   );
// }



  

  // src/pages/Home/index.tsx
  export default function AdminDashboard() {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <h1 className="text-4xl font-bold text-[var(--brand)]">
          Welcome to Admin
        </h1>
      </div>
    );
  }
  