import { NavBar } from "@/components/navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NavBar active="studio" />
      <main className="flex-1">{children}</main>
    </>
  );
}
