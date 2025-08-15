export default function Dashboard() {
    return (
      <>
        <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-white p-4 shadow">Samples Received</div>
          <div className="rounded-xl bg-white p-4 shadow">Pending Reviews</div>
          <div className="rounded-xl bg-white p-4 shadow">Calibrations Due</div>
        </div>
      </>
    );
  }
  