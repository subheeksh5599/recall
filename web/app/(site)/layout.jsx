import "@/styles/landing/site-0.css";
import "@/styles/landing/site-1.css";
import "@/styles/landing/site-2.css";
import "@/styles/landing/site-3.css";
import "@/styles/landing/site.css";

export const metadata = {
  title: "RECALL · The order book snipers can't front-run",
  description: "An order book on Monad where trades wait one block, cancels don't, and a cancel only jumps the queue when a signed price proves the quote went stale.",
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23e42b0c'/%3E%3Ctext x='16' y='23' text-anchor='middle' font-family='sans-serif' font-size='19' fill='white'%3ER%3C/text%3E%3C/svg%3E" },
};

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 5, viewportFit: "cover" };

export default function SiteLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="telegraf_7def588b-module__vCGdiW__variable moderngothic_55326dc6-module__2n363q__variable">{children}</body>
    </html>
  );
}
