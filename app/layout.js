import "./globals.css";

export const metadata = {
  title: "Refund Runner — AI agent that fights for your refunds",
  description:
    "Tell one AI agent what went wrong. It scans your PayPal activity, writes the claim, and queues the dispute — money back, minus the phone calls.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
