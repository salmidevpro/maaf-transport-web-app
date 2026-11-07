import { BrandMark } from "@/components/brand-mark";

type AppPortalPage = "agent" | "admin" | "signup";

const links = [
  { id: "agent", label: "Agent login", href: "/agent/login?app=1" },
  { id: "admin", label: "Admin login", href: "/admin/login?app=1" },
  { id: "signup", label: "Become an agent", href: "/agent/signup?app=1" },
] as const;

export function AppPortalNavigation({ active }: { active: AppPortalPage }) {
  return <header className="app-portal-header">
    <a className="app-portal-brand" href="/agent/login?app=1" aria-label="MAAF app home">
      <BrandMark size={34}/>
      <span>maaf<span>.</span><small>TRANSPORT CONTROL</small></span>
    </a>
    <nav className="app-portal-links" aria-label="App portals">
      {links.map((link) => <a key={link.id} href={link.href} aria-current={active === link.id ? "page" : undefined}>{link.label}</a>)}
    </nav>
  </header>;
}
