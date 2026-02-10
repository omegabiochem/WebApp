export default function TermsAndConditions() {
  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-2xl font-semibold mb-2">Terms and Conditions</h1>
      <p className="text-sm text-gray-500 mb-6">Effective Date: February 2026</p>

      <div className="space-y-4 text-sm leading-6 text-gray-800">
        <h2 className="text-lg font-semibold">1. Program Description</h2>
        <p>
          Omega Biochem Laboratories provides a secure Laboratory Information
          Management System (LIMS). We use SMS only for authentication and
          security purposes, including one-time passcodes (OTP).
        </p>

        <h2 className="text-lg font-semibold">2. SMS Messaging & OTP</h2>
        <ul className="list-disc pl-5">
          <li>Messages are sent only when you initiate a login/verification request</li>
          <li>No marketing or promotional messages are sent</li>
          <li>Message frequency varies based on user actions</li>
          <li>Message and data rates may apply</li>
        </ul>

        <h2 className="text-lg font-semibold">3. Opt-Out and Support</h2>
        <p>
          <b>Reply STOP</b> to opt out. <b>Reply HELP</b> for assistance. Opting out
          may prevent secure login via SMS OTP.
        </p>

        <h2 className="text-lg font-semibold">4. Privacy Policy</h2>
        <p>
          Your use is also governed by our Privacy Policy at{" "}
          <span className="underline">/privacy-policy</span>.
        </p>

        <h2 className="text-lg font-semibold">5. Contact</h2>
        <p>Email: tech@omegabiochemlab.com</p>
      </div>
    </div>
  );
}