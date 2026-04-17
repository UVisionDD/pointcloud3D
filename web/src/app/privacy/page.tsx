import { NavBar } from "@/components/navbar";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Placeholder — replace with your finalized policy before launch.
        </p>
        <div className="mt-8 space-y-4 text-sm leading-6">
          <section>
            <h2 className="text-base font-semibold">Data we collect</h2>
            <p>
              Account information (email, name, auth provider) via Clerk.
              Billing records via Stripe. The photos you upload and the point
              clouds we generate, stored in Cloudflare R2.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold">How we use it</h2>
            <p>
              Solely to provide the Service — processing your photos, delivering
              exports, and handling billing. We do not sell your data. We do
              not train models on your photos.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold">Retention</h2>
            <p>
              Source photos and exports are retained while you have an active
              account. You can request deletion at any time by contacting
              support — deletion propagates to R2 within 30 days.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold">Contact</h2>
            <p>
              For privacy requests, email privacy@pointcloud3d.com.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
