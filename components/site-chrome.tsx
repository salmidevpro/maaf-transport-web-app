import { PortalDropdown } from "@/components/portal-login-dropdown";
import { BrandMark } from "@/components/brand-mark";
import { MobileNavigation } from "@/components/mobile-navigation";

const items = [
  { key: "security", label: "How it works", href: "/security" },
  { key: "agent-signup", label: "Become an agent", href: "/agent/signup" },
];

export function SiteHeader({ active }: { active?: string }) {
  return <header className="site-header">
    <a className="site-brand" href="/" aria-label="MAAF home"><span className="site-brand-mark"><BrandMark size={38}/></span><span className="site-brand-name">maaf<span>.</span><small>TRANSPORT CONTROL</small></span></a>
    <nav className="site-nav" aria-label="Main navigation">{items.map((item) => <a key={item.key} className={item.key === "agent-signup" ? "site-nav-agent-link" : undefined} href={item.href} aria-current={active === item.key ? "page" : undefined}>{item.label}</a>)}</nav>
    <MobileNavigation items={items} active={active}/>
    <PortalDropdown label="Portals" variant="header" />
  </header>;
}

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-footer-main">
      <div className="footer-brand-column">
        <a className="site-brand footer-brand" href="/" aria-label="MAAF Transport Control home"><span className="site-brand-mark"><BrandMark size={38}/></span><span className="site-brand-name">maaf<span>.</span><small>TRANSPORT CONTROL</small></span></a>
        <p>QR trip card production, checkpoint verification and clear operations oversight for transport teams.</p>
      </div>
      <nav className="footer-link-column" aria-label="Learn about MAAF"><h2>Explore</h2><a href="/security">How it works</a><a href="/agent/signup">Become an agent</a></nav>
      <nav className="footer-link-column" aria-label="Portal sign in"><h2>Portals</h2><a href="/agent/login">Agent Portal</a><a href="/admin/login">Admin Portal</a></nav>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} MAAF Transport Control</span></div>
  </footer>;
}
