import { BrandLogo } from "@/components/brand-logo";
import { PoweredBy } from "@/components/powered-by";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mm-ambient mm-grain relative min-h-screen flex items-center justify-center px-6 py-12">
      <div className="relative z-10 w-full max-w-sm mm-fade-up">
        {/* Brand lockup */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="mb-5">
            <BrandLogo className="h-12 w-auto" />
          </div>
          <h1 className="mm-display text-6xl">
            Studio<span className="text-[#E8553A]">.</span>
          </h1>
          <p className="text-sm text-[#5E564F] mt-3 leading-relaxed max-w-[16rem]">
            On-brand marketing assets, generated and validated in seconds.
          </p>
        </div>

        {/* Form card */}
        <div className="mm-card rounded-2xl p-7">{children}</div>

        {/* Watermark */}
        <div className="flex justify-center mt-6">
          <PoweredBy />
        </div>
      </div>
    </div>
  );
}
