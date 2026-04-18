import SendForm from "@/components/send/SendForm";

export const metadata = {
  title: "Send USDT",
  description: "Send USDT securely on BNB Smart Chain",
};

export default function SendPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center px-5">
      <div className="w-full max-w-[420px] flex-1 flex flex-col py-10">
        <SendForm />
      </div>
    </main>
  );
}
