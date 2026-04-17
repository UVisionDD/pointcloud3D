import { NavBar } from "@/components/navbar";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Placeholder — replace with your finalized ToS before launch.
        </p>
        <div className="mt-8 space-y-4 text-sm leading-6">
          <section>
            <h2 className="text-base font-semibold">1. Service</h2>
            <p>
              pointcloud3D (&ldquo;the Service&rdquo;) converts user-submitted
              photographs into 3D point clouds for use with inner-crystal laser
              engraving equipment. The Service is provided &ldquo;as is&rdquo;
              without warranty of any kind.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold">2. Content license</h2>
            <p>
              You retain ownership of the images you upload and the point
              clouds we produce for you. You grant us a limited license to
              process, store, and deliver the outputs to you. We do not use
              your photos to train models or share them with third parties.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold">3. Payments and refunds</h2>
            <p>
              Pay-as-you-go credits are non-refundable once a photo has been
              processed. Subscriptions can be cancelled at any time; cancelled
              subscriptions remain active until the end of the billing period.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold">4. Acceptable use</h2>
            <p>
              You agree not to upload images that you do not have rights to use,
              that depict minors inappropriately, or that are illegal in your
              jurisdiction. We may refuse service or remove content that
              violates these terms.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold">5. Liability</h2>
            <p>
              Our total liability for any claim is limited to the amounts you
              have paid us in the 12 months preceding the claim.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
