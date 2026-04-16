import SendForm from "@/components/send/SendForm";

export const metadata = {
  title: "Send USDT",
  description: "Send USDT securely on BNB Smart Chain",
};

export default function SendPage() {
  return (
    <main className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#1a1a1a] border border-gray-800 mb-4">
            <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="16" fill="#26A17B"/>
              <path d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658s2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06V14.07c3.88.173 6.775.85 6.775 1.657 0 .808-2.895 1.484-6.775 1.656zm0-3.59V11.5h5.414V8H8.664v3.5H14.01v2.29c-4.398.2-7.706 1.072-7.706 2.116 0 1.044 3.308 1.915 7.706 2.116v7.574h3.912v-7.578c4.39-.2 7.692-1.07 7.692-2.112 0-1.041-3.302-1.912-7.692-2.113z" fill="white"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Send USDT</h1>
          <p className="text-gray-500 text-sm mt-1">BNB Smart Chain (BEP-20)</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-800 bg-[#111111] p-6 shadow-2xl">
          <SendForm />
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-gray-700 mt-6">
          Secured by BNB Smart Chain · Network verification required
        </p>
      </div>
    </main>
  );
}
