export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-1">
          <p className="text-xs tracking-[0.2em] uppercase text-[#CC7A5C] font-medium">
            Mad Monkey
          </p>
          <h1
            className="text-4xl font-light text-[#F2EEE6]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Studio
          </h1>
        </div>
        {children}
      </div>
    </div>
  );
}
