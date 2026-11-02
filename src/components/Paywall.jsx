// src/components/Paywall.jsx
export default function Paywall() {
  return (
    <div className="max-w-xl mx-auto mt-24 p-8 border rounded-lg bg-white shadow-sm">
      <h1 className="text-2xl font-bold mb-2">Meeting Maker Intent Radar is a paid feature</h1>
      <p className="text-gray-600 mb-6">
        Subscribe to unlock lead discovery, Excel export, and (with a paid
        Meeting Maker plan) send leads directly to your Meeting Maker BDR agents.
      </p>
      <a
        href="https://www.meetingmaker.tech/pricing"
        className="inline-block px-5 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
      >
        Subscribe
      </a>
    </div>
  );
}