import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createReport } from "../../services/reportsService";

export default function MicroMixReport() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { register, handleSubmit, formState:{ isSubmitting } } = useForm<any>({
    defaultValues: { client: "", testSop: "OM 05B" }
  });

  if (!user) return <p>Please log in.</p>;

  const onSubmit = async (data: any) => {
    const r = await createReport(data);
    nav(`/reports/${r.id}`);
  };

  return (
    <div className="max-w-2xl bg-white rounded-xl shadow p-6">
      <h1 className="text-xl font-semibold mb-4">New Lab Report</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="text-sm">Client</label>
          <input className="w-full border rounded-md p-2" {...register("client")} required />
        </div>
        <div>
          <label className="text-sm">Date Sent</label>
          <input type="date" className="w-full border rounded-md p-2" {...register("dateSent")} />
        </div>
        <div>
          <label className="text-sm">Test Type</label>
          <input className="w-full border rounded-md p-2" {...register("testType")} />
        </div>
        <div>
          <label className="text-sm">Sample Type</label>
          <input className="w-full border rounded-md p-2" {...register("sampleType")} />
        </div>
        <div>
          <label className="text-sm">Formula #</label>
          <input className="w-full border rounded-md p-2" {...register("formulaNo")} />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm">Description</label>
          <input className="w-full border rounded-md p-2" {...register("description")} />
        </div>
        <div>
          <label className="text-sm">Lot #</label>
          <input className="w-full border rounded-md p-2" {...register("lotNo")} />
        </div>
        <div>
          <label className="text-sm">Manufacture Date</label>
          <input type="date" className="w-full border rounded-md p-2" {...register("manufactureDate")} />
        </div>
        <div>
          <label className="text-sm">Test SOP #</label>
          <input className="w-full border rounded-md p-2" {...register("testSop")} />
        </div>
        <div>
          <label className="text-sm">Date Tested</label>
          <input type="date" className="w-full border rounded-md p-2" {...register("dateTested")} />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm">Preliminary Results</label>
          <input className="w-full border rounded-md p-2" {...register("preliminaryResults")} />
        </div>
        <div>
          <label className="text-sm">Preliminary Results Date</label>
          <input type="date" className="w-full border rounded-md p-2" {...register("preliminaryDate")} />
        </div>
        <div>
          <label className="text-sm">Date Completed</label>
          <input type="date" className="w-full border rounded-md p-2" {...register("dateCompleted")} />
        </div>
        <div className="md:col-span-2 text-right">
          <button disabled={isSubmitting} className="bg-[var(--brand)] text-white rounded-md px-4 py-2">
            {isSubmitting ? "Creating..." : "Create Report"}
          </button>
        </div>
      </form>
    </div>
  );
}
