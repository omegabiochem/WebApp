export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
      <h1 className="text-2xl font-semibold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-6">
        Effective Date: February 2026
      </p>

      <div className="space-y-4 text-sm leading-6 text-gray-800">
        <p>
          Omega Biochem Laboratories (“Omega Biochem,” “we,” “our,” or “us”) is
          committed to protecting your privacy. This Privacy Policy explains how
          we collect, use, and safeguard your information when you use our
          Laboratory Information Management System (LIMS) and related services.
        </p>

        <h2 className="text-lg font-semibold">1. Information We Collect</h2>
        <ul className="list-disc pl-5">
          <li>Name</li>
          <li>Email address</li>
          <li>Phone number</li>
          <li>Account login credentials</li>
          <li>Laboratory-related operational data entered into the system</li>
        </ul>

        <h2 className="text-lg font-semibold">
          2. How We Use Your Information
        </h2>
        <ul className="list-disc pl-5">
          <li>Account creation and management</li>
          <li>Secure authentication and login verification</li>
          <li>Sending one-time passcodes (OTP) for security purposes</li>
          <li>System notifications related to your account</li>
          <li>Regulatory, audit, and compliance requirements</li>
        </ul>

        <h2 className="text-lg font-semibold">3. SMS Messaging & OTP</h2>
        <ul className="list-disc pl-5">
          <li>SMS is used only for authentication and security purposes</li>
          <li>
            Messages are sent only when a user initiates a login/verification
            request
          </li>
          <li>
            Consent to receive SMS authentication messages is collected via an
            explicit checkbox during account registration.
          </li>
          <li>No marketing or promotional messages are sent</li>
          <li>
            Reply <b>STOP</b> to opt out, <b>HELP</b> for assistance
          </li>
          <li>Message and data rates may apply</li>
        </ul>

        <h2 className="text-lg font-semibold">4. Data Sharing</h2>
        <p>
          We do not sell, rent, or share personal information with third parties
          for marketing. We may share information with service providers needed
          to operate the platform, or if required by law.
        </p>

        <h2 className="text-lg font-semibold">5. Data Security</h2>
        <p>
          We use industry-standard safeguards such as encrypted transmission,
          role-based access controls, and audit logging.
        </p>

        <h2 className="text-lg font-semibold">6. Contact</h2>
        <p>Email: tech@omegabiochemlab.com</p>
      </div>
    </div>
  );
}
