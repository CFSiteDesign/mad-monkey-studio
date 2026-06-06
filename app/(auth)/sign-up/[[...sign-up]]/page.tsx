import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <SignUp
      appearance={{
        elements: {
          rootBox: "w-full",
          card: "bg-[#242220] border border-[rgba(242,238,230,0.08)] shadow-none rounded-md w-full",
          headerTitle: "text-[#F2EEE6] font-light",
          headerSubtitle: "text-[#8C8278]",
          socialButtonsBlockButton: "border-[rgba(242,238,230,0.08)] text-[#F2EEE6] hover:bg-[#2C2A28]",
          dividerLine: "bg-[rgba(242,238,230,0.08)]",
          dividerText: "text-[#8C8278]",
          formFieldLabel: "text-[#8C8278] text-xs",
          formFieldInput: "bg-[#1C1A18] border-[rgba(242,238,230,0.12)] text-[#F2EEE6] focus:border-[#CC7A5C]",
          formButtonPrimary: "bg-[#CC7A5C] hover:bg-[#D4956D] text-[#F2EEE6] shadow-none",
          footerActionLink: "text-[#CC7A5C] hover:text-[#D4956D]",
        },
      }}
    />
  );
}
