import "@/styles/console.css";

export const metadata = {
  title: "RECALL · Console",
  description: "Trade on the RECALL order book on Monad testnet: post, take, cancel with a signed price, settle, and run the sniper race against both books.",
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%23e42b0c'/%3E%3Crect x='5' y='6' width='9' height='3' rx='1.5' fill='white'/%3E%3Crect x='5' y='15' width='14' height='3' rx='1.5' fill='white' opacity='.55'/%3E%3Cpath d='M15.5 7.5h3.5v5' stroke='white' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E" },
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function ConsoleLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
